import { Anchor, Box, Menu, Stack, Text } from "@mantine/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, HttpError, setUnauthorizedHandler } from "./api";
import { getToken, setToken } from "./lib/auth";
import {
  BOTTOM_CLEARANCE,
  MODE_SWITCH_TOP,
  MODE_SWITCH_TOP_FALLBACK,
  PAGE_GUTTER,
} from "./themes/layout";
import LoginPage from "./pages/LoginPage";
import FirstSetup from "./pages/FirstSetup";
import { loadThemeColors, useThemes } from "./lib/themeColors";
import { useThemeEditor } from "./lib/themeEditor";
import ThemeEditor from "./components/theme/ThemeEditor";
import { THEME_INTERFACE_GAP, themePanelWidth } from "./components/theme/ThemePanel";
import ViewPage from "./pages/ViewPage";
import NotificationsDrawer from "./components/notifications/NotificationsDrawer";
import CardDrawer from "./components/board/CardDrawer";
import type { SourceTask } from "./components/board/TaskDestination";
import { accessSource, requestSource, workstationSource, projectSource } from "./lib/task";
import { notifications } from "@mantine/notifications";
import {
  IconCheck,
  IconEye,
  IconFileExport,
  IconFileImport,
  IconLayoutDashboard,
  IconSettings,
  IconStack2,
  IconTrash,
} from "@tabler/icons-react";
import { RED } from "./themes/colors";
import {
  DEFAULT_SUPPORT_STATUS,
  RESOURCES,
  canUse,
  emptyFollows,
  inContext,
  isDeclaredAssetKind,
  isM365Change,
  isNotification,
  m365Event,
} from "@milo/shared";
import { RightsProvider, canFrom } from "./lib/rights";
import { errorMessage, notifyError } from "./lib/errors";
import { EditingContext } from "./lib/editing";
import { addressTarget, noteInAddress } from "./lib/follow";
import { requestOpening } from "./lib/searchSources";
import type { Target } from "./lib/follow";
import ManagedDeviceAssetDrawer from "./components/managed-device-assets/ManagedDeviceAssetDrawer";
import { announceDeclaredAssets } from "./lib/declaredAssets";
import SupportRequestDrawer from "./components/support/SupportRequestDrawer";
import PreferencesModal from "./components/settings/PreferencesModal";
import { CopyPasteContext } from "./components/ui/CopyPasteActions";
import type { Clipboard } from "./components/ui/CopyPasteActions";
import type { AccountSlot } from "./components/ui/AccountControls";
import DeleteConfirmModal from "./components/ui/DeleteConfirmModal";
import MoveOrCopyProjectModal from "./components/project/MoveOrCopyProjectModal";
import type { ProjectAction } from "./components/project/MoveOrCopyProjectModal";
import ProjectDrawer from "./components/project/ProjectDrawer";
import ViewSwitch from "./components/ui/ViewSwitch";
import ShareViewModal from "./components/ui/ShareViewModal";
import ShortcutsHelp from "./components/ui/ShortcutsHelp";
import LayoutModal from "./components/ui/LayoutModal";
import PointMenu, { menuPosition, type PointMenuPosition } from "./components/ui/PointMenu";
import KonamiCode from "./components/ui/KonamiCode";
import { placeInterface, clearPage } from "./lib/interfaceFall";
import { loadTitleStyles } from "./lib/titleStyles";
import { rememberDeletion, useUndoShortcut } from "./lib/undo";
import SettingsModal from "./components/settings/SettingsModal";
import EmptyPanel from "./components/ui/EmptyPanel";
import type {
  ManagedDeviceAsset,
  AuthResult,
  Board,
  BoardInput,
  BoardWidget,
  Category,
  FeedMessage,
  FollowKind,
  Follows,
  Id,
  IndicatorSection,
  Label,
  MilestoneType,
  Notification as FollowNotification,
  Project,
  ProjectLabel,
  PublicUser,
  Resource,
  ResourceVersions,
  SearchResult,
  SupportRequest,
  TaskList,
  View,
} from "@milo/shared";

/**
 * A list that was read, along with the selection it answers: the view
 * for boards, the board for what it contains. So we know at render
 * time whether what we hold still concerns what is displayed — a reset
 * through an effect would come too late.
 */
interface LoadedFor<T> {
  /** The view or board that was used to read it. */
  key: string;
  items: T[];
}

/** The widget types a board carries, by their prefix: what needs reading for them. */
const withPrefix = (widgets: BoardWidget[], prefix: string) =>
  widgets.some((w) => w.type.startsWith(`${prefix}.`));

/**
 * The items of a context, or all of them (null); "null" while they aren't
 * read. An item belongs to it when it carries the label of that name in its
 * list's context group (shared, contexts.ts).
 */
const ofContext = <T extends { list_key: string; labels: { group_id: Id; name: string }[] }>(
  items: T[] | null,
  context: string | null,
  groups: Record<string, Id[]>,
): T[] | null =>
  items && context !== null
    ? items.filter((e) => inContext(e.labels, groups[e.list_key], context))
    : items;

/**
 * What a notification opens. A board's structure — a list, a label — opens
 * the board, as an Access-mode item does; a setting, nothing here: the
 * settings open (`openNotification`).
 */
const notificationTarget = (notice: FollowNotification): Target | null =>
  notice.kind === "settings"
    ? null
    : notice.kind === "board"
      ? { kind: "access", id: notice.target_id }
      : { kind: notice.kind, id: notice.target_id };

export default function App() {
  // ⌘Z undoes the last deletion of a widget, a section, a board or a view.
  useUndoShortcut();
  const [user, setUser] = useState<PublicUser | null>(null);
  // The themes' colors, read once signed in. Subscribed: a color changed in
  // the editor, or another theme chosen, redraws the widgets whose default
  // colors follow it.
  useThemes();
  useEffect(() => {
    if (user) loadThemeColors();
  }, [user]);
  const [authChecked, setAuthChecked] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  // Microsoft sign-in is possible: the Entra application is configured.
  const [entraReady, setEntraReady] = useState(false);
  // The Entra application or the sending address is missing: the "admin"
  // account goes through the first setup before the Settings.
  const [firstSetup, setFirstSetup] = useState(false);
  // Once the first setup is validated, the Settings open on the
  // Administration tab: the administrators come next.
  const [setupDone, setSetupDone] = useState(false);
  // The error a Microsoft sign-in return brought.
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // The milestone types from the settings: a project picks one.
  const [milestoneTypes, setMilestoneTypes] = useState<MilestoneType[]>([]);
  const [users, setUsers] = useState<PublicUser[]>([]);

  // The views, in the order the account arranged them, and the open one.
  const [views, setViews] = useState<View[] | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);
  // The opening view applies once, when the session opens.
  const appliedView = useRef<number | null>(null);
  // The opening board, until the boards of its view are read.
  const openingBoard = useRef<{ view: string; board: string } | null>(null);
  // A link — the address, a notification — has led to a board: the opening
  // view and board must not take its place.
  const linkedTo = useRef(false);
  // The open view's boards, and the one that is open.
  const [boardsRead, setBoardsRead] = useState<LoadedFor<Board> | null>(null);
  const [boardId, setBoardId] = useState<string | null>(null);
  // What the open board carries: its sections, its widgets.
  const [sectionsRead, setSectionsRead] = useState<LoadedFor<IndicatorSection> | null>(null);
  const [loadedWidgets, setWidgetsRead] = useState<LoadedFor<BoardWidget> | null>(null);
  // Its data: its projects, its lists, the requests and workstations of its
  // company. Each carries the board that was used to read it.
  const [readProjects, setProjectsRead] = useState<LoadedFor<Project> | null>(null);
  // The actor accounts of at least one project of the board: the only ones the
  // "Acteurs" filter offers.
  const [projectActorIds, setProjectActorIds] = useState<number[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [readProjectLabels, setProjectLabelsRead] = useState<LoadedFor<ProjectLabel> | null>(null);
  const [loadedTaskLists, setTaskListsRead] = useState<LoadedFor<TaskList> | null>(null);
  const [labelsRead, setLabelsRead] = useState<LoadedFor<Label> | null>(null);
  const [supportRead, setSupportRead] = useState<LoadedFor<SupportRequest> | null>(null);
  const [managedDeviceAssetsRead, setManagedDeviceAssetsRead] =
    useState<LoadedFor<ManagedDeviceAsset> | null>(null);

  // "Modifier l'interface" applies to the whole application: all
  // boards, all views. It only lives in this window, which opens
  // outside edit mode; I or a right click on the background toggle it.
  // Only for whoever has the right to modify the interface in their
  // workspace (Accès); importing and exporting a layout has its own.
  const [isEditing, setIsEditing] = useState(false);
  const canEditInterface = Boolean(user?.application.interface);
  const canMoveLayout = Boolean(user?.application.layout);
  // The right-click menu on the application background, and the window
  // for exporting or importing the open board's layout.
  const background = useRef<HTMLDivElement>(null);
  const [backgroundMenu, setBackgroundMenu] = useState<PointMenuPosition | null>(null);
  const [layout, setLayout] = useState<"export" | "import" | null>(null);

  // The project list filters.
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [actorFilter, setActorFilter] = useState("all");

  // The account's rights. The server checks them; here, they hide what one
  // doesn't see and remove what one can't do.
  const can = useMemo(() => canFrom(user?.rights ?? {}), [user]);
  // Organizing the shared views and boards requires the right to modify the
  // layout, and being able to use at least one widget type (like the server,
  // lib/rights.ts).
  const canArrange = canEditInterface && Object.values(user?.widgets ?? {}).some(canUse);

  // Reads in progress. An empty screen is a conclusion: it is never drawn
  // during a read.
  const [reads, setReads] = useState(0);
  const loading = reads > 0;

  // Right after sign-in, the page stays blank during the reads, then
  // the interface settles in piece by piece. The reads chain together: we
  // wait for them to go quiet for a moment — and never more than a few
  // seconds, so as not to leave the page empty.
  const [entry, setEntered] = useState(false);
  useEffect(() => {
    if (!entry || loading) return;
    const t = setTimeout(() => {
      setEntered(false);
      placeInterface();
    }, 600);
    return () => clearTimeout(t);
  }, [entry, loading]);
  useEffect(() => {
    if (!entry) return;
    const t = setTimeout(() => {
      setEntered(false);
      placeInterface();
    }, 4000);
    return () => clearTimeout(t);
  }, [entry]);
  const read = useCallback(async <T,>(reading: () => Promise<T>): Promise<T> => {
    setReads((n) => n + 1);
    try {
      return await reading();
    } finally {
      setReads((n) => n - 1);
    }
  }, []);

  const boards = boardsRead?.key === viewId ? boardsRead.items : null;
  // Outside interface editing, what the account hid does not show.
  const shownViews = useMemo(
    () => views && (isEditing ? views : views.filter((v) => !v.is_hidden)),
    [views, isEditing],
  );
  const shownBoards = useMemo(
    () => boards && (isEditing ? boards : boards.filter((b) => !b.is_hidden)),
    [boards, isEditing],
  );
  const board = boards?.find((b) => String(b.id) === boardId) ?? null;
  // Nothing to arrange without a view or a board: the interface is not
  // modified there — an editing already under way can still be ended.
  const hasBoard = Boolean(viewId) && (boards?.length ?? 0) > 0;
  const toggleEdit = () => {
    if (canEditInterface) setIsEditing((before) => !before && hasBoard);
  };
  const sections = sectionsRead?.key === boardId ? sectionsRead.items : null;
  const widgets = useMemo(
    () => (loadedWidgets?.key === boardId ? loadedWidgets.items : []),
    [loadedWidgets, boardId],
  );
  const projects = readProjects?.key === boardId ? readProjects.items : null;
  const projectLabels = readProjectLabels?.key === boardId ? readProjectLabels.items : [];
  const taskLists = loadedTaskLists?.key === boardId ? loadedTaskLists.items : null;
  const labels = labelsRead?.key === boardId ? labelsRead.items : [];
  const supportRequests = supportRead?.key === boardId ? supportRead.items : null;
  const assets = managedDeviceAssetsRead?.key === boardId ? managedDeviceAssetsRead.items : null;

  // What the open board's widgets ask to read.
  const projectsNeed = withPrefix(widgets, "project");
  const tasksNeed = withPrefix(widgets, "task");
  const supportNeed = withPrefix(widgets, "support");
  const managedDeviceAssetsNeed = withPrefix(widgets, "managed_device_asset");
  // The context this account views in the open board — a label name —, or
  // null for all; and the context group of each of its lists.
  const selectedContext = board?.context ?? null;
  const contexts = useMemo(() => board?.contexts ?? [], [board?.contexts]);
  const contextGroups = useMemo(() => board?.context_groups ?? {}, [board?.context_groups]);
  // The cards of the chosen context; the separators, which decide for everyone,
  // stay. Kept from one render to the next: the task board forgets its
  // provisional order when its lists change.
  const visibleTasks = useMemo(
    () =>
      taskLists && selectedContext !== null
        ? taskLists.map((l) => ({
            ...l,
            cards: l.cards.filter(
              (c) =>
                c.kind === "separator" ||
                inContext(c.labels, contextGroups[l.list_key], selectedContext),
            ),
          }))
        : taskLists,
    [taskLists, selectedContext, contextGroups],
  );
  // The projects, requests and workstations of the chosen context, filtered here:
  // the page read them for the whole board.
  const viewedProjects = useMemo(
    () => ofContext(projects, selectedContext, contextGroups),
    [projects, selectedContext, contextGroups],
  );
  const visibleRequests = useMemo(
    () => ofContext(supportRequests, selectedContext, contextGroups),
    [supportRequests, selectedContext, contextGroups],
  );
  const viewedWorkstations = useMemo(
    () => ofContext(assets, selectedContext, contextGroups),
    [assets, selectedContext, contextGroups],
  );

  const [drawerOpened, setDrawerOpened] = useState(false);
  /** The list widget from which a project or request is added; empty otherwise. */
  const [addTargetList, setNewListName] = useState("");
  // The board whose categories are managed, and the milestone types window.
  // The labels and categories copied from a board widget's "Actions" menu,
  // waiting to be pasted into another.
  const [clipboard, setClipboard] = useState<Clipboard>({});
  const [pastes, setPastes] = useState(0);
  const [managedDeviceAssetDrawerOpened, setManagedDeviceAssetDrawerOpened] = useState(false);
  const [openedManagedDeviceAsset, setOpenedManagedDeviceAsset] =
    useState<ManagedDeviceAsset | null>(null);
  const [supportDrawerOpened, setSupportDrawerOpened] = useState(false);
  const [editedSupportRequest, setEditedSupportRequest] = useState<SupportRequest | null>(null);
  // The subject of a request created from a link; "null" for a request
  // created from a request list, which starts empty.
  const [accessRequestSubject, setAccessRequestSubject] = useState<string | null>(null);
  const [settingsOpened, setSettingsOpened] = useState(false);
  const themeEditorOn = useThemeEditor();
  const [preferencesOpened, setPreferencesOpened] = useState(false);
  // The notifications drawer, and what makes it re-read.
  const [notificationsOpened, setNotificationsOpened] = useState(false);
  const [notificationsRevision, setNotificationsRevision] = useState(0);
  // "Créer une tâche" from another item: where it starts from.
  const [sourceTask, setSourceTask] = useState<SourceTask | null>(null);
  // Last known data version, to detect changes
  // made by someone else.
  const knownVersions = useRef<ResourceVersions | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [follows, setFollows] = useState<Follows>(emptyFollows());
  // Card designated by the URL, waiting for its board to be read.
  const [cardToOpen, setCardToOpen] = useState<number | null>(null);
  // Card whose drawer is open: it is the one the URL carries.
  const [displayedCard, setDisplayedCard] = useState<number | null>(null);
  const [movedProject, setMovedProject] = useState<{
    project: Project;
    mode: ProjectAction;
  } | null>(null);
  const [deletedProject, setDeletedProject] = useState<Project | null>(null);

  // --- Session ---------------------------------------------------------------

  // Checks the session at startup.
  useEffect(() => {
    // True on returning from a Microsoft sign-in: the interface will be built
    // before the user's eyes, as after a password sign-in.
    let connection = false;
    const check = async () => {
      // The return from Microsoft carries the session, or the error, in the
      // URL fragment: we read it, then erase it from the address
      // bar — a token has no business in the history.
      const returnParams = new URLSearchParams(window.location.hash.slice(1));
      if (returnParams.has("token") || returnParams.has("auth_error")) {
        const token = returnParams.get("token");
        if (token) setToken(token);
        connection = Boolean(token);
        setConnectionError(returnParams.get("auth_error"));
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
      }

      // Only a server refusal closes the session. A restarting server
      // or a dropped network says nothing about the token: we keep it and retry.
      for (;;) {
        try {
          const { needs_setup, entra, first_setup } = await api.getSetupState();
          setEntraReady(entra);
          setFirstSetup(first_setup);
          if (needs_setup) {
            setNeedsSetup(true);
          } else if (getToken()) {
            const account = await api.me();
            setUser(account);
            // The "admin" account only sees Settings: no build-up.
            if (connection && !account.system) {
              clearPage();
              setEntered(true);
            }
          }
          break;
        } catch (error) {
          if (error instanceof HttpError && error.status === 401) {
            setToken(null);
            break;
          }
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
      setAuthChecked(true);
    };
    check();
  }, []);

  // No browser menu on right click. Our own context menus
  // always open.
  useEffect(() => {
    const block = (e: MouseEvent) => e.preventDefault();
    document.addEventListener("contextmenu", block);
    return () => document.removeEventListener("contextmenu", block);
  }, []);

  // Session refused by the server: back to the sign-in screen.
  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
  }, []);

  const handleAuthenticated = ({ token, user: account }: AuthResult) => {
    setToken(token);
    setUser(account);
    setNeedsSetup(false);
    // The "admin" account only sees Settings: no build-up.
    if (account.system) return;
    // The interface will be built before the user's eyes, once loaded.
    clearPage();
    setEntered(true);
  };

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch {
      /* session already invalid on the server side */
    }
    // Entra may have been connected meanwhile — by the "admin" account,
    // from Settings: the sign-in screen then offers Microsoft first.
    try {
      const state = await api.getSetupState();
      setEntraReady(state.entra);
      setFirstSetup(state.first_setup);
    } catch {
      /* the sign-in screen keeps what it knew */
    }
    setToken(null);
    setUser(null);
    setProjectsRead(null);
  };

  // --- Reads -------------------------------------------------------------------

  const loadLookups = useCallback(async () => {
    const [nextUsers, nextMilestoneTypes] = await Promise.all([
      api.getUsers(),
      api.getMilestoneTypes(),
    ]);
    setUsers(nextUsers);
    setMilestoneTypes(nextMilestoneTypes);
  }, []);

  const loadViews = useCallback(async () => {
    setViews(await read(() => api.getViews()));
  }, [read]);

  const loadBoards = useCallback(async () => {
    // Without an open view, there are no boards to read: they stay
    // unknown, not "none".
    if (!viewId) return setBoardsRead(null);
    const items = await read(() => api.getBoards(viewId));
    setBoardsRead({ key: viewId, items });
  }, [viewId, read]);

  // The open board's sections and widgets, in one go.
  const loadWidgets = useCallback(async () => {
    if (!boardId) {
      setSectionsRead(null);
      setWidgetsRead(null);
      return;
    }
    const [s, w] = await read(() =>
      Promise.all([api.boardSections(boardId).all(), api.getBoardWidgets(boardId)]),
    );
    setSectionsRead({ key: boardId, items: s });
    setWidgetsRead({ key: boardId, items: w });
  }, [boardId, read]);

  // The board's projects, of all its contexts: the chosen context
  // filters them here (viewedProjects), without asking the server for anything — changing it
  // is immediate. The same goes for requests and workstations.
  const loadProjects = useCallback(async () => {
    if (!boardId || !projectsNeed) return setProjectsRead(null);
    const data = await read(() =>
      api.getProjects({
        board: boardId,
        category: categoryFilter,
        status: statusFilter,
        actor: actorFilter,
      }),
    );
    setProjectsRead({ key: boardId, items: data });
  }, [boardId, projectsNeed, categoryFilter, statusFilter, actorFilter, read]);

  // The actors offered by the "Acteurs" filter: those of the projects of the
  // chosen context. Read separately, they don't delay the list.
  const loadProjectActors = useCallback(async () => {
    if (!boardId || !projectsNeed) return setProjectActorIds([]);
    setProjectActorIds(await api.getProjectActorIds({ board: boardId, context: selectedContext }));
  }, [boardId, projectsNeed, selectedContext]);

  // Categories belong to the open board.
  const loadCategories = useCallback(async () => {
    if (!boardId || !projectsNeed) return setCategories([]);
    setCategories(await api.getCategories(boardId));
  }, [boardId, projectsNeed]);

  // The project labels and the card labels, specific to the board.
  // Called with a "patch", they apply it in place, asking
  // the server for nothing: a recolored label shows immediately.
  const loadProjectLabels = useCallback(
    async (patch?: { id: number; data: Partial<ProjectLabel> }) => {
      if (patch) {
        setProjectLabelsRead((l) =>
          l
            ? {
                ...l,
                items: l.items.map((e) => (e.id === patch.id ? { ...e, ...patch.data } : e)),
              }
            : l,
        );
        return;
      }
      if (!boardId || !projectsNeed) return setProjectLabelsRead(null);
      setProjectLabelsRead({
        key: boardId,
        items: await api.getProjectLabels(boardId),
      });
    },
    [boardId, projectsNeed],
  );

  const loadLabels = useCallback(
    async (patch?: { id: number; data: Partial<Label> }) => {
      if (patch) {
        setLabelsRead((l) =>
          l
            ? {
                ...l,
                items: l.items.map((e) => (e.id === patch.id ? { ...e, ...patch.data } : e)),
              }
            : l,
        );
        return;
      }
      if (!boardId || !tasksNeed) return setLabelsRead(null);
      setLabelsRead({ key: boardId, items: await api.getLabels(boardId) });
    },
    [boardId, tasksNeed],
  );

  const loadTaskLists = useCallback(async () => {
    if (!boardId || !tasksNeed) return setTaskListsRead(null);
    const items = await read(() => api.getTaskLists(boardId));
    setTaskListsRead({ key: boardId, items });
  }, [boardId, tasksNeed, read]);

  // The board's requests, of the chosen context — all of them, whatever their
  // status.
  const loadSupportRequests = useCallback(async () => {
    if (!boardId || !supportNeed) return setSupportRead(null);
    const items = await read(() => api.getSupportRequests(Number(boardId)));
    setSupportRead({ key: boardId, items });
  }, [boardId, supportNeed, read]);

  // The board's workstations, of the chosen context.
  const loadManagedDeviceAssets = useCallback(async () => {
    if (!boardId || !managedDeviceAssetsNeed) return setManagedDeviceAssetsRead(null);
    const items = await read(() => api.getManagedDeviceAssets(Number(boardId)));
    setManagedDeviceAssetsRead({ key: boardId, items });
  }, [boardId, managedDeviceAssetsNeed, read]);

  useEffect(() => {
    if (user) loadLookups();
  }, [user, loadLookups]);

  useEffect(() => {
    if (!user) return;
    // A follow that can't be read prevents nothing from working.
    api
      .getFollows()
      .then(setFollows)
      .catch(() => setFollows(emptyFollows()));
  }, [user]);

  useEffect(() => {
    if (user) loadViews().catch(() => {});
  }, [user, loadViews]);
  useEffect(() => {
    if (user) loadBoards().catch(() => {});
  }, [user, loadBoards]);
  useEffect(() => {
    if (user) loadWidgets().catch(() => {});
  }, [user, loadWidgets]);
  useEffect(() => {
    if (user) loadProjects().catch(() => {});
  }, [user, loadProjects]);

  useEffect(() => {
    if (user) loadProjectActors().catch(() => {});
  }, [user, loadProjectActors]);
  useEffect(() => {
    if (user) loadCategories().catch(() => {});
  }, [user, loadCategories]);
  useEffect(() => {
    if (user) loadProjectLabels().catch(() => {});
  }, [user, loadProjectLabels]);
  useEffect(() => {
    if (user) loadTaskLists().catch(() => {});
  }, [user, loadTaskLists]);
  useEffect(() => {
    if (user) loadLabels().catch(() => {});
  }, [user, loadLabels]);
  useEffect(() => {
    if (user) loadSupportRequests().catch(() => {});
  }, [user, loadSupportRequests]);
  useEffect(() => {
    if (user) loadManagedDeviceAssets().catch(() => {});
  }, [user, loadManagedDeviceAssets]);

  // A board that shows requests opens with a mailbox poll,
  // without waiting for the one the server does on its own. What it brings
  // arrives through the event stream.
  useEffect(() => {
    if (user && supportNeed) api.syncSupportMail().catch(() => {});
  }, [user, supportNeed, boardId]);

  // The opening view and board, once the session is open: the account's, or
  // failing that the first. They belong to its opening workspace: in another
  // one, the first.
  useEffect(() => {
    if (!user || !shownViews || appliedView.current === user.id) return;
    appliedView.current = user.id;
    if (linkedTo.current) {
      linkedTo.current = false;
      return;
    }
    const inOpening =
      user.default_workspace === null ||
      user.default_workspace === user.workspace;
    const desiredView =
      (inOpening &&
        shownViews.find((v) => String(v.id) === user.default_view)) ||
      shownViews[0];
    if (!desiredView) return;
    setViewId(String(desiredView.id));
    if (inOpening && user.default_board)
      openingBoard.current = {
        view: String(desiredView.id),
        board: user.default_board,
      };
  }, [user, shownViews]);

  // The open view must be shown: deleting it — or hiding it, once interface
  // editing is left — goes back to the first.
  useEffect(() => {
    if (!shownViews || appliedView.current === null) return;
    if (!shownViews.some((v) => String(v.id) === viewId))
      setViewId(shownViews[0] ? String(shownViews[0].id) : null);
  }, [shownViews, viewId]);

  // The open board must be shown in the view: changing view, deleting a
  // board or hiding it goes back to the first in the list.
  useEffect(() => {
    if (!shownBoards) return;
    // The opening board, once its view's boards are there; another view
    // opened in the meantime forgets it.
    const opening = openingBoard.current;
    if (opening && opening.view !== viewId) openingBoard.current = null;
    else if (opening && String(shownBoards[0]?.view_id) === opening.view) {
      openingBoard.current = null;
      if (shownBoards.some((b) => String(b.id) === opening.board))
        return setBoardId(opening.board);
    }
    const first = shownBoards[0];
    if (!first) return setBoardId(null);
    if (!shownBoards.some((b) => String(b.id) === boardId)) setBoardId(String(first.id));
  }, [shownBoards, boardId, viewId]);

  // A filter can point to a category or an actor that has just
  // disappeared.
  useEffect(() => {
    if (
      categoryFilter !== "all" &&
      categories.length &&
      !categories.some((c) => String(c.id) === categoryFilter)
    ) {
      setCategoryFilter("all");
    }
  }, [categories, categoryFilter]);
  useEffect(() => {
    if (actorFilter !== "all" && users.length && !users.some((u) => String(u.id) === actorFilter)) {
      setActorFilter("all");
    }
  }, [users, actorFilter]);

  /**
   * Follow or stop following. The server returns the whole list, which replaces
   * ours.
   */
  const toggleFollow = useCallback(
    async (kind: FollowKind, id: number) => {
      const following = follows[kind].includes(id);
      try {
        setFollows(following ? await api.unfollow(kind, id) : await api.follow(kind, id));
      } catch {
        /* the server refused: the checkbox stays in the state it knows */
      }
    },
    [follows],
  );

  /**
   * Show a view and a board, in place of the opening ones if they are not
   * applied yet.
   */
  const showBoard = useCallback((view: Id, board: Id) => {
    linkedTo.current = true;
    openingBoard.current = null;
    setViewId(String(view));
    setBoardId(String(board));
  }, []);

  /** Go to a board, wherever it is: its view first. */
  const goToBoard = useCallback(
    async (id: Id) => {
      const board = await api.getBoard(id);
      showBoard(board.view_id, board.id);
    },
    [showBoard],
  );

  /**
   * Opens the designated item, whether it comes from the URL, a notification or
   * the search. A request and a workstation open in place; a project,
   * a card and a widget lead first to their board.
   */
  const openTarget = useCallback(
    async (target: Target) => {
      try {
        if (target.kind === "support") {
          setEditedSupportRequest(await api.getSupportRequest(target.id));
          setSupportDrawerOpened(true);
        } else if (target.kind === "managed_device_asset") {
          setOpenedManagedDeviceAsset(await api.getManagedDeviceAsset(target.id));
          setManagedDeviceAssetDrawerOpened(true);
        } else if (target.kind === "project") {
          const project = await api.getProject(target.id);
          await goToBoard(project.board_id);
          setSelectedProjectId(target.id);
          setDrawerOpened(true);
        } else if (target.kind === "access") {
          await goToBoard(target.id);
        } else {
          // A card: the board will open it, once its lists are read.
          const or = await api.getCardLocation(target.id);
          showBoard(or.view_id, or.board_id);
          setCardToOpen(target.id);
        }
      } catch {
        /* item deleted in the meantime, or made private: there is nothing to open */
      }
    },
    [goToBoard, showBoard],
  );

  /**
   * What the search found: a link, an appointment, an article directly opens
   * its URL; an e-mail, in its widget's reader, on its board.
   */
  const openSearch = useCallback(
    async (result: SearchResult) => {
      // A declared asset opens in its widget, on its board, as an e-mail.
      if (result.kind === "mail" || isDeclaredAssetKind(result.kind)) {
        if (result.item) requestOpening(result.id, result.item);
        if (result.board_id) return openTarget({ kind: "access", id: result.board_id });
        return;
      }
      if (result.kind !== "access" && result.kind !== "appointment" && result.kind !== "article") {
        return openTarget({ kind: result.kind, id: result.id });
      }
      if (result.url) {
        window.open(result.url, "_blank", "noopener");
        return;
      }
      if (result.board_id) return openTarget({ kind: "access", id: result.board_id });
    },
    [openTarget],
  );

  // Préférences › Notifications: when off, notifications no longer show
  // on screen — they still go into the drawer. The account carries the
  // setting, and is replaced when the preferences are saved.
  const toastsEnabled = useRef(true);
  toastsEnabled.current = user?.notification_settings.toasts ?? true;

  // And only for whoever has the right to them in their workspace (Accès).
  const screenRight = useRef(false);
  screenRight.current = Boolean(user?.notifications.screen);

  /** What is seen when a followed item changes, by someone else. */
  /** Opens what a notification is about: its item, its board, or the settings. */
  const openNotification = useCallback(
    (notice: FollowNotification) => {
      const target = notificationTarget(notice);
      if (target) void openTarget(target);
      else if (user?.settings.view) setSettingsOpened(true);
    },
    [openTarget, user?.settings.view],
  );

  const showNotification = useCallback(
    (notice: FollowNotification) => {
      if (!toastsEnabled.current || !screenRight.current) return;
      notifications.show({
        id: notice.id,
        title: notice.title,
        icon: notice.deleted ? <IconTrash size={18} /> : <IconEye size={18} />,
        color: notice.deleted ? RED : "teal",
        autoClose: 10000,
        message: (
          <Stack gap={4}>
            <Text size="sm">
              {notice.author} {notice.message}
            </Text>
            {!notice.deleted && (
              <Anchor
                size="sm"
                onClick={() => {
                  notifications.hide(notice.id);
                  openNotification(notice);
                }}
              >
                Ouvrir
              </Anchor>
            )}
          </Stack>
        ),
      });
    },
    [openNotification],
  );

  // Event stream: the server pushes its counters as soon as a write
  // happens, and the client only re-reads the affected datasets. The
  // stream is consumed with `fetch`, `EventSource` not accepting headers.
  useEffect(() => {
    if (!user) return undefined;

    let stopped = false;
    let controller: AbortController | undefined;

    const readers: Record<Resource, () => void | Promise<void>> = {
      lookups: loadLookups,
      views: loadViews,
      boards: loadBoards,
      "board-widgets": loadWidgets,
      categories: loadCategories,
      projects: async () => {
        await Promise.all([loadProjects(), loadProjectActors()]);
      },
      "task-lists": loadTaskLists,
      labels: () => loadLabels(),
      "project-labels": () => loadProjectLabels(),
      "support-requests": loadSupportRequests,
      // Support labels are read in a request's drawer, which
      // re-reads them when it opens.
      "support-labels": () => {},
      "managed-device-assets": loadManagedDeviceAssets,
      // The declared asset lists read their own: they re-read on this.
      "unmanaged-device-assets": () => announceDeclaredAssets("unmanaged_device_asset"),
      "application-assets": () => announceDeclaredAssets("application_asset"),
      "title-styles": loadTitleStyles,
    };

    const apply = async (message: FeedMessage) => {
      if (isNotification(message)) {
        showNotification(message.notification);
        setNotificationsRevision((r) => r + 1);
        return;
      }
      // What a Mail or Calendar widget reads has changed: the widgets reread.
      if (isM365Change(message)) {
        window.dispatchEvent(new Event(m365Event(message.m365)));
        return;
      }
      const { versions } = message;
      // First message: the counters serve as a reference, with nothing re-read.
      const known = knownVersions.current;
      knownVersions.current = versions;
      if (known === null) return;
      const moved = RESOURCES.filter((r) => versions[r] !== known[r]);
      await Promise.all(moved.map((r) => readers[r]()));
    };

    const listen = async () => {
      while (!stopped) {
        try {
          controller = new AbortController();
          const response = await fetch("/api/events", {
            headers: { Authorization: `Bearer ${getToken()}` },
            signal: controller.signal,
          });
          if (!response.ok || !response.body) throw new Error("flux indisponible");
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          while (!stopped) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            // Events are separated by a blank line.
            const chunks = buffer.split("\n\n");
            buffer = chunks.pop() ?? "";
            for (const chunk of chunks) {
              const row = chunk.split("\n").find((l) => l.startsWith("data:"));
              if (!row) continue; // keep-alive comment
              let message: FeedMessage;
              try {
                message = JSON.parse(row.slice(5)) as FeedMessage;
              } catch {
                continue;
              }
              await apply(message);
            }
          }
        } catch {
          /* connection lost: retry after a short pause */
        }
        // What changed during the outage is unknown: the first message
        // of the resumed stream will serve as the new reference.
        knownVersions.current = null;
        if (!stopped) await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    };

    listen();
    return () => {
      stopped = true;
      controller?.abort();
    };
  }, [
    user,
    loadLookups,
    loadViews,
    loadBoards,
    loadWidgets,
    loadCategories,
    loadProjects,
    loadTaskLists,
    loadLabels,
    loadProjectLabels,
    loadSupportRequests,
    loadManagedDeviceAssets,
    showNotification,
  ]);

  // --- Actions -----------------------------------------------------------------

  // A setting refused by the server: the menu closed, the reason is given
  // in a notification.
  const reportRejection = (e: unknown) => notifyError(errorMessage(e), "Modification refusée");

  /** Write, report a refusal, then re-read no matter what. */
  const write = async (writing: () => Promise<unknown>, reload: () => Promise<unknown>) => {
    try {
      await writing();
    } catch (e) {
      reportRejection(e);
    } finally {
      await reload();
    }
  };

  const changeView = useCallback((id: string) => {
    setViewId(id);
    setBoardId(null);
  }, []);

  // The view and board just created: their name goes straight into
  // edit mode, as soon as they appear.
  const [viewToRename, setViewToRename] = useState<number | null>(null);
  const [boardToRename, setBoardToRename] = useState<number | null>(null);
  // The view and board just created, until their name is validated (or the
  // creation undone): their empty screen — "Aucun tableau", "Aucune
  // section" — waits for it.
  const [namingView, setNamingView] = useState<Id | null>(null);
  const [namingBoard, setNamingBoard] = useState<Id | null>(null);

  // The views' "+" immediately creates "Nouvelle vue", with its first
  // board, and opens it: its name is then typed in place. Escape there
  // undoes the addition — the view goes away, the one open before comes back.
  const newView = useRef<{
    id: Id;
    view: string | null;
    board: string | null;
  } | null>(null);
  const createView = async (): Promise<Id | null> => {
    try {
      const view = await api.createView("Nouvelle vue");
      newView.current = { id: view.id, view: viewId, board: boardId };
      await loadViews();
      setViewId(String(view.id));
      setBoardId(null);
      setNamingView(view.id);
      setViewToRename(view.id);
      return view.id;
    } catch (e) {
      reportRejection(e);
      return null;
    }
  };

  // "Créer une vue", from the empty screen: interface editing, and the new
  // view straight into name entry. Escape there undoes it all — the view goes
  // away, editing ends, the empty screen comes back.
  const firstView = useRef<Id | null>(null);
  const createFirstView = async () => {
    if (canEditInterface) setIsEditing(true);
    firstView.current = await createView();
  };
  const endViewRename = (id: Id, abandoned: boolean) => {
    setNamingView((naming) => (naming === id ? null : naming));
    const created = newView.current?.id === id ? newView.current : null;
    if (created) newView.current = null;
    const first = id === firstView.current;
    if (first) firstView.current = null;
    if (!abandoned || !created) return;
    if (first) setIsEditing(false);
    setViewId(created.view);
    setBoardId(created.board);
    void write(() => api.deleteView(id), loadViews);
  };

  const viewOf = (id: Id) => views?.find((v) => v.id === id);
  // A view's boards are added by its owner: those it is shared with only see
  // what was shared.
  const ownsOpenView = Boolean(viewId && viewOf(Number(viewId))?.is_owner);
  // The view whose "Partager" window is open.
  const [sharedView, setSharedView] = useState<View | null>(null);

  // A board added with "+": Escape on its name undoes the addition — the
  // board goes away, the one open before comes back.
  const newBoard = useRef<{ id: Id; board: string | null } | null>(null);
  const addBoard = async (): Promise<Id | null> => {
    if (!viewId) return null;
    try {
      // "Nouveau tableau", opened immediately: its name is typed in place.
      const created = await api.createBoard(viewId, "Nouveau tableau");
      newBoard.current = { id: created.id, board: boardId };
      await loadBoards();
      setBoardId(String(created.id));
      setNamingBoard(created.id);
      setBoardToRename(created.id);
      return created.id;
    } catch (e) {
      reportRejection(e);
      return null;
    }
  };

  // "Créer un tableau", from an empty view: like "Créer une vue" — interface
  // editing, the board straight into name entry, and Escape undoes it all.
  const firstBoard = useRef<Id | null>(null);
  const createFirstBoard = async () => {
    if (canEditInterface) setIsEditing(true);
    firstBoard.current = await addBoard();
  };
  const endBoardRename = (id: Id, abandoned: boolean) => {
    setNamingBoard((naming) => (naming === id ? null : naming));
    const created = newBoard.current?.id === id ? newBoard.current : null;
    if (created) newBoard.current = null;
    const first = id === firstBoard.current;
    if (first) firstBoard.current = null;
    if (!abandoned || !created) return;
    if (first) setIsEditing(false);
    setBoardId(created.board);
    void write(() => api.deleteBoard(id), loadBoards);
  };

  /** The board as the server just returned it, in its place. */
  const setBoard = (next: Board) =>
    setBoardsRead((before) =>
      before
        ? {
            ...before,
            items: before.items.map((b) => (b.id === next.id ? next : b)),
          }
        : before,
    );

  // The context viewed in the open board: chosen for oneself, it is
  // seen at once and found again on the next visit.
  const changeContext = (value: string | null) => {
    if (!board) return;
    setBoard({ ...board, context: value });
    void write(() => api.selectContext(board.id, value), loadBoards);
  };

  // The contexts are the labels of the board's context group: whoever
  // organizes the interface chooses that group, and renames "Tous les
  // contextes". A board shared read-only keeps them as they are.
  const changeable = board && board.access !== "read" && canArrange ? board : null;
  const writeBoard = (data: BoardInput) =>
    changeable
      ? write(
          async () => setBoard(await api.updateBoard(changeable.id, data)),
          async () => {
            await loadBoards();
          },
        )
      : Promise.resolve();
  const renameAllContexts = changeable
    ? (name: string) => writeBoard({ all_contexts_label: name })
    : undefined;
  const changeContextGroup = changeable
    ? (name: string | null) => writeBoard({ context_group: name ?? "" })
    : undefined;

  // A project, a request: added from a list widget, they are the
  // widget's own (lib/lists.ts); without a designated widget, the server gives them to the
  // board's first.
  const handleOpenNewProject = useCallback((listKey = "") => {
    setNewListName(listKey);
    setSelectedProjectId(null);
    setDrawerOpened(true);
  }, []);

  const openNewSupportRequest = useCallback((listKey = "") => {
    setNewListName(listKey);
    setAccessRequestSubject(null);
    setEditedSupportRequest(null);
    setSupportDrawerOpened(true);
  }, []);

  // Keyboard shortcuts: Tab cycles through the views, Option/Alt + Tab the
  // view's boards, N creates a project or a request, C cycles through the
  // board's contexts, I enters or leaves interface
  // editing.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Never during text entry. Mantine's dropdowns
      // are <input readonly>: shortcuts always work there.
      const el = document.activeElement as HTMLElement | null;
      const textInput =
        el &&
        (el.tagName === "TEXTAREA" ||
          el.isContentEditable ||
          (el.tagName === "INPUT" && !(el as HTMLInputElement).readOnly));
      if (textInput) return;

      if (event.code === "Tab" && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
        // A modal or drawer is open (Mantine marks both aria-modal): leave
        // Tab to the browser's focus navigation.
        if (document.querySelector('[aria-modal="true"]')) return;
        event.preventDefault();
        const list = event.altKey
          ? (shownBoards ?? []).map((b) => String(b.id))
          : (shownViews ?? []).map((v) => String(v.id));
        if (!list.length) return;
        const current = event.altKey ? boardId : viewId;
        const next = list[(list.indexOf(current ?? "") + 1) % list.length]!;
        if (event.altKey) setBoardId(next);
        else changeView(next);
        return;
      }

      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;

      if (event.code === "KeyN") {
        if (widgets.some((w) => w.type === "project.list") && can("projects", "create")) {
          event.preventDefault();
          handleOpenNewProject();
        } else if (widgets.some((w) => w.type === "support.list") && can("support", "create")) {
          event.preventDefault();
          openNewSupportRequest();
        }
        return;
      }

      if (event.code === "KeyI") {
        event.preventDefault();
        toggleEdit();
        return;
      }

      if (event.code === "KeyC" && contexts.length > 0) {
        event.preventDefault();
        const values = [null, ...contexts];
        changeContext(values[(values.indexOf(selectedContext) + 1) % values.length] ?? null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  /**
   * What the URL designated on arrival, opened once the session is open.
   */
  const readAddress = useRef(false);
  useEffect(() => {
    if (!user || readAddress.current) return;
    readAddress.current = true;
    const target = addressTarget();
    if (target) openTarget(target);
  }, [user, openTarget]);

  // The URL follows what is open, so a reload finds it again — once it has
  // been read: before the session opens, nothing is open, and the link
  // would be wiped before it could be followed.
  useEffect(() => {
    if (!readAddress.current) return;
    if (drawerOpened && selectedProjectId) {
      noteInAddress({ kind: "project", id: selectedProjectId });
    } else if (displayedCard) {
      noteInAddress({ kind: "card", id: displayedCard });
    } else {
      noteInAddress(null);
    }
  }, [drawerOpened, selectedProjectId, displayedCard]);

  /** The board reports the open card: the URL follows it, the request is served. */
  const handleCardOpened = useCallback((id: number | null) => {
    setDisplayedCard(id);
    setCardToOpen(null);
  }, []);

  const handleOpenProject = (project: Project) => {
    setSelectedProjectId(project.id);
    setDrawerOpened(true);
  };

  // The copy stays in the original's board, under "… (copie)", and
  // opens immediately.
  const duplicateProject = async (project: Project) => {
    try {
      const projectCopy = await api.copyProject(project.id, {
        name: `${project.name} (copie)`,
      });
      handleOpenProject(projectCopy);
    } finally {
      await loadProjects();
    }
  };

  const handleCloseDrawer = () => {
    setDrawerOpened(false);
    setSelectedProjectId(null);
  };

  const handleSaved = () => {
    handleCloseDrawer();
    loadProjects();
  };

  const deleteProject = async () => {
    const project = deletedProject;
    setDeletedProject(null);
    if (!project) return;
    try {
      await api.deleteProject(project.id);
    } finally {
      await loadProjects();
    }
  };

  // From a link: the request takes its title as its subject, and is born
  // "Nouveau", in the board's chosen context.
  const openSupportRequestFromLink = (widget: BoardWidget) => {
    if (!board) return;
    setAccessRequestSubject(accessSource(widget, board.id).title);
    setEditedSupportRequest(null);
    setSupportDrawerOpened(true);
  };

  // From a workstation: the request takes its name as its subject.
  const openSupportRequestFromManagedDeviceAsset = (workstation: ManagedDeviceAsset) => {
    setAccessRequestSubject(workstationSource(workstation).title);
    setEditedSupportRequest(null);
    setSupportDrawerOpened(true);
  };

  if (!authChecked) return null;
  if (!user)
    return (
      <LoginPage
        needsSetup={needsSetup}
        entra={entraReady}
        initialError={connectionError}
        onAuthenticated={handleAuthenticated}
      />
    );

  // The "admin" account is only for settings: it sees nothing else — and
  // first, as long as Entra is not set up, the first setup.
  if (user.system && firstSetup)
    return (
      <FirstSetup
        onDone={() => {
          setFirstSetup(false);
          setEntraReady(true);
          setSetupDone(true);
        }}
        onLogout={() => void handleLogout()}
      />
    );
  if (user.system)
    return (
      <SettingsModal
        opened
        onClose={handleLogout}
        standalone
        canEdit
        user={user}
        onUserChange={setUser}
        initialTab={setupDone ? "administration" : undefined}
        entraConnected={setupDone}
      />
    );

  // No workspace: only an empty screen, which leads whoever can create one
  // to the Settings' Workspaces tab. Once they have one, the interface
  // follows.
  if (user.workspaces.length === 0) {
    const canManage = user.settings.view && user.workspace_rights.view;
    return (
      <Stack h="100vh" align="center" justify="center" gap="md">
        <EmptyPanel
          icon={IconStack2}
          fill={false}
          message={
            canManage
              ? "Aucun workspace pour le moment"
              : "Aucun workspace ne vous est encore ouvert"
          }
          {...(canManage
            ? {
                actionLabel: "Ouvrir le paramétrage",
                actionIcon: IconSettings,
                onAction: () => setSettingsOpened(true),
              }
            : null)}
        />
        <Anchor size="sm" c="dimmed" onClick={() => void handleLogout()}>
          Se déconnecter
        </Anchor>
        <SettingsModal
          opened={settingsOpened}
          onClose={() => setSettingsOpened(false)}
          canEdit={user.settings.update}
          user={user}
          onUserChange={setUser}
          initialTab="workspaces"
        />
      </Stack>
    );
  }

  // The open board's contexts, and the account.
  const account: AccountSlot = {
    contexts: board
      ? {
          items: contexts,
          all: board.all_contexts_label,
          value: selectedContext,
          onChange: changeContext,
          // Outside edit mode, the contexts are only chosen; in edit mode, the
          // list chooses their group instead.
          onRenameAll: isEditing ? renameAllContexts : undefined,
          group: board.context_group,
          groupOptions: board.context_group_options,
          sections: board.context_sections,
          onChangeGroup: isEditing ? changeContextGroup : undefined,
        }
      : undefined,
    onOpenSettings: () => setSettingsOpened(true),
    user,
    onLogout: handleLogout,
    onOpenPreferences: () => setPreferencesOpened(true),
    onOpenNotifications: () => setNotificationsOpened(true),
    onSearchOpen: openSearch,
  };

  // The open board's layout can be changed by whoever can organize boards,
  // unless it was shared with them read-only.
  const arrangeable = Boolean(board) && canArrange && board?.access !== "read";
  // The open board is frozen: outside interface editing, or for lack of the
  // right to change its layout.
  const frozen = boardId ? !isEditing || !arrangeable : true;
  // Outside edit mode, the tabs are frozen too: neither boards nor
  // views can be dragged or added.
  const tabsLocked = !isEditing;
  // The open board's structure is replaced by an import: one must be
  // able to touch it, as to edit it.
  const editableLayout = arrangeable;
  // The boards as this window shows them: its lock is its own.
  const displayedBoards =
    shownBoards?.map((b) => ({
      ...b,
      is_locked: isEditing ? (0 as const) : (1 as const),
    })) ?? null;
  const createTask = can("tasks", "create");
  // The request is born in the open board: without a "Demandes de
  // support" widget to show it, it isn't offered.
  const createRequest =
    can("support", "create") && widgets.some((w) => w.type === "support.list");
  const boardNameOf = (id: Id) => boards?.find((b) => b.id === id)?.name;
  // The theme editor's panels, for whoever may change the themes: it was
  // turned on in this browser, possibly by another account.
  const themeEditor =
    themeEditorOn && user.settings.update && user.administration.themes.includes("access");

  return (
    <RightsProvider
      rights={user.rights}
      widgets={user.widgets}
      canEditSettings={user.settings.update}
      canEditTemplates={user.administration.templates.includes("access")}
    >
      <EditingContext.Provider value={isEditing}>
          {/* The clipboard of labels and categories, which the "Actions"
            menu of a widget drawer fills and empties in another. */}
          <CopyPasteContext.Provider
            value={{
              board: board && { id: board.id, name: board.name },
              clipboard,
              onCopy: (key, copy) => setClipboard((before) => ({ ...before, [key]: copy })),
              pastes,
            onPasted: (key) => {
              setClipboard(({ [key]: _pasted, ...rest }) => rest);
              setPastes((n) => n + 1);
            },
            }}
          >
            <Stack
              ref={background}
              gap={0}
              h="100vh"
              // The theme editor's interface panel is docked on the right. The
              // transform makes this the frame of what is fixed in the
              // interface — the logo, "Ajouter un widget", the scrollbar —:
              // their corner moves with it.
              mr={themeEditor ? themePanelWidth("interface") + THEME_INTERFACE_GAP : 0}
              style={themeEditor ? { transform: "translateZ(0)" } : undefined}
              // The right click on the background: what no element — tab, widget,
              // section, row — took for its own menu. An input keeps
              // the browser's, for copy and paste; a window or a
              // drawer, rendered outside the page, don't open it.
              onContextMenu={(e) => {
                const target = e.target as HTMLElement;
                if (e.defaultPrevented || !background.current?.contains(target)) return;
                if (target.closest("input, textarea, [contenteditable='true']")) return;
                // Nothing to offer without either right (layout moves need edit
                // mode), nor, without a view or a board, outside edit mode.
                const canToggle = canEditInterface && (isEditing || hasBoard);
                if (!canToggle && !(canMoveLayout && board && isEditing)) return;
                setBackgroundMenu(menuPosition(e));
              }}
            >
              {/* The view's tab row is the first line of the screen. */}
              <Box
                pt={PAGE_GUTTER}
                px={PAGE_GUTTER}
                w="100%"
                style={{
                  flex: 1,
                  minHeight: 0,
                  display: "flex",
                  flexDirection: "column",
                  // The content stops 20px above the view selector, placed at
                  // the bottom left over the page. It publishes its
                  // height itself.
                  paddingBottom: `calc(var(${MODE_SWITCH_TOP}, ${MODE_SWITCH_TOP_FALLBACK}px) + ${BOTTOM_CLEARANCE}px)`,
                }}
              >
                {/* Without any view, the page stays — its row carries the account —,
                    with the prompt to create one in place of the boards. */}
                {(viewId || shownViews?.length === 0) && (
                  <ViewPage
                    noView={!viewId}
                    namingView={namingView !== null && String(namingView) === viewId}
                    namingBoard={namingBoard !== null && String(namingBoard) === boardId}
                    onCreateView={user.structure.views.create ? createFirstView : undefined}
                    boards={displayedBoards ?? (viewId ? null : [])}
                    boardId={boardId}
                    onBoardChange={setBoardId}
                    // Outside edit mode, no board "+" nor view "+" (tabsLocked).
                    onAddBoard={
                      user.structure.boards.create && ownsOpenView && !tabsLocked
                        ? () => void addBoard()
                        : undefined
                    }
                    onCreateFirstBoard={
                      user.structure.boards.create && ownsOpenView
                        ? () => void createFirstBoard()
                        : undefined
                    }
                    onRenameEnded={endBoardRename}
                    toRename={boardToRename}
                    onRenameOpened={() => setBoardToRename(null)}
                    // Rename, delete: in edit mode only — each tab then
                    // keeps what its access allows (BoardTabs).
                    onRenameBoard={
                      canArrange && isEditing
                        ? (id, name) => write(() => api.updateBoard(id, { name }), loadBoards)
                        : undefined
                    }
                    onDeleteBoard={
                      user.structure.boards.delete && isEditing
                        ? async (id) => {
                            // The last one gone, nothing is left to arrange:
                            // editing ends.
                            const last = (boards?.length ?? 0) <= 1;
                            await write(
                              async () =>
                                rememberDeletion(await api.deleteBoard(id), "Tableau supprimé", {
                                  reload: loadBoards,
                                }),
                              loadBoards,
                            );
                            if (last) setIsEditing(false);
                          }
                        : undefined
                    }
                    onToggleBoardHidden={
                      isEditing
                        ? (id, hidden) => write(() => api.hideBoard(id, hidden), loadBoards)
                        : undefined
                    }
                    onReorderBoards={
                      tabsLocked || !viewId
                        ? undefined
                        : (ids) => write(() => api.reorderBoards(viewId, ids), loadBoards)
                    }
                    sections={sections}
                    widgets={widgets}
                    onWidgetsChanged={loadWidgets}
                    locked={frozen}
                    // Switching to edit mode only makes sense for whoever can touch the
                    // structure they are viewing: without the right, nothing is offered.
                    onUnlock={boardId && arrangeable ? () => setIsEditing(true) : undefined}
                    data={{
                      requests: visibleRequests ?? [],
                      projects: viewedProjects ?? [],
                      lists: visibleTasks ?? [],
                      managedDeviceAssets: viewedWorkstations ?? [],
                      userId: user.id,
                    }}
                    projects={{
                      projects: viewedProjects,
                      loading: loading,
                      onRowClick: handleOpenProject,
                      onMoveProject: (project, mode) => setMovedProject({ project, mode }),
                      onDuplicateProject: (project) => void duplicateProject(project),
                      onDeleteProject: setDeletedProject,
                      onCreateTask: (project) =>
                        setSourceTask(projectSource(project, boardNameOf(project.board_id))),
                      onAddProject: can("projects", "create") ? handleOpenNewProject : undefined,
                      followedIds: follows.project,
                      onToggleFollow: (project) => toggleFollow("project", project.id),
                      categories,
                      categoryFilter,
                      onCategoryFilterChange: setCategoryFilter,
                      statusFilter,
                      onStatusFilterChange: setStatusFilter,
                      // The selected actor stays offered even if they no longer have a project.
                      users: users.filter(
                        (u) => projectActorIds.includes(u.id) || String(u.id) === actorFilter,
                      ),
                      actorFilter,
                      onActorFilterChange: setActorFilter,
                    }}
                    tasks={{
                      boardId,
                      boards: displayedBoards ?? [],
                      lists: visibleTasks ?? [],
                      loading: loading,
                      onListsChanged: loadTaskLists,
                      labels,
                      users,
                      onLabelsChanged: loadLabels,
                      follows,
                      onToggleFollow: toggleFollow,
                      cardToOpen,
                      onCardOpened: handleCardOpened,
                    }}
                    support={{
                      requests: visibleRequests,
                      loading: loading,
                      users,
                      onOpenRequest: (request) => {
                        setEditedSupportRequest(request);
                        setSupportDrawerOpened(true);
                      },
                      onAddRequest: can("support", "create") ? openNewSupportRequest : undefined,
                      onCreateTask: createTask
                        ? (request) => setSourceTask(requestSource(request))
                        : undefined,
                      onRequestsChanged: loadSupportRequests,
                      followedIds: follows.support,
                      onToggleFollow: (request) => toggleFollow("support", request.id),
                    }}
                    managedDeviceAssets={{
                      managedDeviceAssets: viewedWorkstations,
                      loading: loading,
                      onOpenManagedDeviceAsset: (workstation) => {
                        setOpenedManagedDeviceAsset(workstation);
                        setManagedDeviceAssetDrawerOpened(true);
                      },
                      onCreateTask: createTask
                        ? (workstation) => setSourceTask(workstationSource(workstation))
                        : undefined,
                      onCreateSupportRequest: createRequest
                        ? openSupportRequestFromManagedDeviceAsset
                        : undefined,
                    }}
                    onCreateTaskFromLink={
                      createTask && board
                        ? (widget) => setSourceTask(accessSource(widget, board.id, board.name))
                        : undefined
                    }
                    onCreateSupportFromLink={
                      createRequest ? openSupportRequestFromLink : undefined
                    }
                    loading={loading}
                    account={account}
                  />
                )}
              </Box>

              {backgroundMenu && (
                <PointMenu position={backgroundMenu} onClose={() => setBackgroundMenu(null)}>
                  {canEditInterface && (isEditing || hasBoard) && (
                    <Menu.Item
                      leftSection={
                        isEditing ? <IconCheck size={16} /> : <IconLayoutDashboard size={16} />
                      }
                      onClick={toggleEdit}
                    >
                      {isEditing ? "Terminer la modification" : "Modifier l’interface"}
                    </Menu.Item>
                  )}
                  {board && canMoveLayout && isEditing && (
                    <>
                      {canEditInterface && <Menu.Divider />}
                      <Menu.Item
                        leftSection={<IconFileExport size={16} />}
                        disabled={!sections?.length}
                        onClick={() => setLayout("export")}
                      >
                        Exporter la disposition
                      </Menu.Item>
                      <Menu.Item
                        leftSection={<IconFileImport size={16} />}
                        disabled={!editableLayout}
                        onClick={() => setLayout("import")}
                      >
                        Importer la disposition
                      </Menu.Item>
                    </>
                  )}
                </PointMenu>
              )}

              <LayoutModal
                mode={layout}
                onClose={() => setLayout(null)}
                sections={sections ?? []}
                widgets={widgets}
                onImport={async (received) => {
                  if (!board) return;
                  try {
                    const done = await api.boardSections(board.id).importSections(received);
                    const notes = [
                      done.discarded > 0 &&
                        `${done.discarded} widget${done.discarded > 1 ? "s" : ""} écarté${done.discarded > 1 ? "s" : ""}`,
                      done.keptCount > 0 &&
                        `${done.keptCount} widget${done.keptCount > 1 ? "s" : ""} hors de vos droits conservé${done.keptCount > 1 ? "s" : ""}`,
                    ].filter(Boolean);
                    notifications.show({
                      title: "Disposition importée",
                      color: "teal",
                      message: `${done.placed} widget${done.placed > 1 ? "s" : ""} posé${done.placed > 1 ? "s" : ""}${notes.length ? ` · ${notes.join(" · ")}` : ""}.`,
                    });
                  } finally {
                    await loadWidgets();
                    await Promise.all([
                      loadProjects(),
                      loadTaskLists(),
                      loadSupportRequests(),
                      loadManagedDeviceAssets(),
                    ]);
                  }
                }}
              />

              <ManagedDeviceAssetDrawer
                opened={managedDeviceAssetDrawerOpened}
                onClose={() => setManagedDeviceAssetDrawerOpened(false)}
                asset={openedManagedDeviceAsset}
              />

              <SupportRequestDrawer
                opened={supportDrawerOpened}
                onClose={() => setSupportDrawerOpened(false)}
                request={editedSupportRequest}
                // The context being viewed: a new request receives its label.
                context={selectedContext}
                boardId={board?.id ?? null}
                listKey={addTargetList}
                defaultStatus={DEFAULT_SUPPORT_STATUS}
                defaultSubject={accessRequestSubject ?? ""}
                assignCurrentUser={accessRequestSubject === null}
                users={users}
                currentUser={user}
                // The drawer closes itself after a creation; an
                // update leaves it open.
                onSaved={loadSupportRequests}
                onDeleted={async () => {
                  setSupportDrawerOpened(false);
                  await loadSupportRequests();
                }}
                following={
                  editedSupportRequest !== null && follows.support.includes(editedSupportRequest.id)
                }
                onToggleFollow={() => {
                  if (editedSupportRequest) toggleFollow("support", editedSupportRequest.id);
                }}
              />

              <ProjectDrawer
                opened={drawerOpened}
                onClose={handleCloseDrawer}
                projectId={selectedProjectId}
                boardId={boardId}
                categories={categories}
                // The context being viewed: a new project receives its label.
                context={selectedContext}
                listKey={addTargetList}
                milestoneTypes={milestoneTypes}
                users={users}
                labels={projectLabels}
                boards={boards ?? []}
                currentUser={user}
                onCategoriesChanged={loadCategories}
                onLabelsChanged={loadProjectLabels}
                onSaved={handleSaved}
                onDeleted={handleSaved}
                following={selectedProjectId !== null && follows.project.includes(selectedProjectId)}
                onToggleFollow={() => {
                  if (selectedProjectId !== null) toggleFollow("project", selectedProjectId);
                }}
              />

              <MoveOrCopyProjectModal
                opened={movedProject !== null}
                onClose={() => setMovedProject(null)}
                mode={movedProject?.mode}
                project={movedProject?.project ?? null}
                boards={boards ?? []}
                onMoved={async () => {
                  setMovedProject(null);
                  await loadProjects();
                }}
              />

              <DeleteConfirmModal
                opened={deletedProject !== null}
                onClose={() => setDeletedProject(null)}
                onConfirm={deleteProject}
                title="Supprimer le projet"
                message={
                  <>
                    Voulez-vous vraiment supprimer « {deletedProject?.name} » ? Ses commentaires
                    seront supprimés. Cette action est irréversible.
                  </>
                }
              />

              <ViewSwitch
                views={shownViews ?? []}
                value={viewId}
                onChange={changeView}
                onReorder={
                  tabsLocked ? undefined : (ids) => write(() => api.reorderViews(ids), loadViews)
                }
                onCreate={
                  user.structure.views.create && !tabsLocked ? () => void createView() : undefined
                }
                toRename={viewToRename}
                onRenameOpened={() => setViewToRename(null)}
                onRenameEnded={endViewRename}
                // Rename, delete: in edit mode only. Sharing is not the
                // interface: it is offered at any time. All three only for
                // one's own views (ViewSwitch).
                onRename={
                  canArrange && isEditing
                    ? (id, name) => write(() => api.updateView(id, { name }), loadViews)
                    : undefined
                }
                onShare={setSharedView}
                onToggleHidden={
                  isEditing
                    ? (view) => write(() => api.hideView(view.id, !view.is_hidden), loadViews)
                    : undefined
                }
                onDelete={
                  user.structure.views.delete && isEditing
                    ? async (id) => {
                        // The last one gone, nothing is left to arrange:
                        // editing ends.
                        const last = (views?.length ?? 0) <= 1;
                        await write(
                          async () =>
                            rememberDeletion(await api.deleteView(id), "Vue supprimée", {
                              reload: loadViews,
                            }),
                          loadViews,
                        );
                        if (last) setIsEditing(false);
                      }
                    : undefined
                }
              />
              <ShareViewModal view={sharedView} onClose={() => setSharedView(null)} />
              <ShortcutsHelp
                projects={widgets.some((w) => w.type === "project.list")}
                requests={widgets.some((w) => w.type === "support.list")}
                contexts={contexts.length > 0}
                // Those the Tab shortcuts go through.
                views={(shownViews?.length ?? 0) > 1}
                boards={(shownBoards?.length ?? 0) > 1}
                board={(shownBoards?.length ?? 0) > 0}
              />
              <KonamiCode
                isEditing={isEditing}
                onLeaveEditing={() => setIsEditing(false)}
              />

              {/* "Créer une tâche": a blank card record, which chooses where
                it goes. We stay where we are; the notification leads to the task. */}
              <CardDrawer
                opened={sourceTask !== null}
                onClose={() => setSourceTask(null)}
                card={null}
                source={sourceTask}
                // From a link, the task is born without a member: we flag it without
                // taking it on.
                currentUserId={sourceTask?.kind === "access" ? undefined : user?.id}
                labels={[]}
                users={users}
                boardId={null}
                onLabelsChanged={() => {}}
                onSaved={() => {}}
                followed={false}
                onToggleFollow={() => {}}
                onCreated={(id) =>
                  notifications.show({
                    title: "Tâche créée",
                    color: "teal",
                    autoClose: 6000,
                    message: (
                      <Anchor size="sm" onClick={() => void openTarget({ kind: "card", id })}>
                        Ouvrir la tâche
                      </Anchor>
                    ),
                  })
                }
              />

              <NotificationsDrawer
                opened={notificationsOpened}
                onClose={() => setNotificationsOpened(false)}
                revision={notificationsRevision}
                onOpen={(notification) => {
                  if (notification.deleted) return;
                  setNotificationsOpened(false);
                  openNotification(notification);
                }}
              />

              <PreferencesModal
                opened={preferencesOpened}
                onClose={() => setPreferencesOpened(false)}
                user={user}
                onUpdated={(updated) => {
                  setUser(updated);
                  // The name also appears in the actors and the user list.
                  loadLookups();
                  loadProjects();
                }}
              />

              <SettingsModal
                opened={settingsOpened}
                onClose={() => setSettingsOpened(false)}
                canEdit={user.settings.update}
                user={user}
                onUserChange={setUser}
              />
            </Stack>

            {/* Out of the interface: its transform would hold the panels in it. */}
            {themeEditor && <ThemeEditor canEdit />}
          </CopyPasteContext.Provider>
      </EditingContext.Provider>
    </RightsProvider>
  );
}
