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
  IconTrash,
} from "@tabler/icons-react";
import { RED } from "./themes/colors";
import { DEFAULT_SUPPORT_STATUS, RESOURCES, emptyFollows, isNotification } from "@milo/shared";
import { RightsProvider, canFrom } from "./lib/rights";
import { errorMessage, notifyError } from "./lib/errors";
import { ReferencesContext } from "./lib/references";
import { EditingContext } from "./lib/editing";
import { addressTarget, noteInAddress } from "./lib/follow";
import type { Target } from "./lib/follow";
import AssetDrawer from "./components/assets/AssetDrawer";
import SupportRequestDrawer from "./components/support/SupportRequestDrawer";
import PreferencesModal from "./components/settings/PreferencesModal";
import CopyToBoardModal from "./components/ui/CopyToBoardModal";
import { CopyPasteContext } from "./components/ui/CopyPasteActions";
import type { Clipboard } from "./components/ui/CopyPasteActions";
import type { AccountSlot } from "./components/ui/AccountControls";
import DeleteConfirmModal from "./components/ui/DeleteConfirmModal";
import MoveOrCopyProjectModal from "./components/project/MoveOrCopyProjectModal";
import type { ProjectAction } from "./components/project/MoveOrCopyProjectModal";
import ProjectDrawer from "./components/project/ProjectDrawer";
import ViewSwitch from "./components/ui/ViewSwitch";
import ShortcutsHelp from "./components/ui/ShortcutsHelp";
import LayoutModal from "./components/ui/LayoutModal";
import PointMenu, { menuPosition, type PointMenuPosition } from "./components/ui/PointMenu";
import KonamiCode from "./components/ui/KonamiCode";
import { placeInterface, clearPage } from "./lib/interfaceFall";
import SettingsModal from "./components/settings/SettingsModal";
import type {
  Asset,
  AuthResult,
  Board,
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

/** The items of a context, or all of them ("all"); "null" while they aren't read. */
const inContext = <T extends { context_id: Id | null }>(
  items: T[] | null,
  context: string,
): T[] | null =>
  items && context !== "all"
    ? items.filter((e) => String(e.context_id) === context)
    : items;

export default function App() {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  // Microsoft sign-in is possible: the Entra application is configured.
  const [entraReady, setEntraReady] = useState(false);
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
  const [assetsRead, setAssetsRead] = useState<LoadedFor<Asset> | null>(null);

  // "Modifier l'interface" applies to the whole application: all
  // boards, all views. It only lives in this window, which opens
  // outside edit mode; I or a right click on the background toggle it.
  const [isEditing, setIsEditing] = useState(false);
  const toggleEdit = () => setIsEditing((before) => !before);
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
  // Organizing the shared views and boards requires being able to edit
  // at least one widget type (like the server, lib/rights.ts).
  const canArrange = Object.values(user?.widgets ?? {}).some((a) => a === "update");

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
  const board = boards?.find((b) => String(b.id) === boardId) ?? null;
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
  const assets = assetsRead?.key === boardId ? assetsRead.items : null;

  // What the open board's widgets ask to read.
  const projectsNeed = withPrefix(widgets, "project");
  const tasksNeed = withPrefix(widgets, "task");
  const supportNeed = withPrefix(widgets, "support");
  const assetsNeed = withPrefix(widgets, "asset");
  // The context this account views in the open board, or "all".
  const selectedContext = board?.context_id ? String(board.context_id) : "all";
  const contexts = board?.contexts ?? [];
  // The cards of the chosen context; the separators, which decide for everyone,
  // stay. Kept from one render to the next: the task board forgets its
  // provisional order when its lists change.
  const visibleTasks = useMemo(
    () =>
      taskLists && selectedContext !== "all"
        ? taskLists.map((l) => ({
            ...l,
            cards: l.cards.filter(
              (c) => c.kind === "separator" || String(c.context_id) === selectedContext,
            ),
          }))
        : taskLists,
    [taskLists, selectedContext],
  );
  // The projects, requests and workstations of the chosen context, filtered here:
  // the page read them for the whole board.
  const viewedProjects = useMemo(
    () => inContext(projects, selectedContext),
    [projects, selectedContext],
  );
  const visibleRequests = useMemo(
    () => inContext(supportRequests, selectedContext),
    [supportRequests, selectedContext],
  );
  const viewedWorkstations = useMemo(() => inContext(assets, selectedContext), [assets, selectedContext]);

  const [drawerOpened, setDrawerOpened] = useState(false);
  /** The list widget from which a project or request is added; empty otherwise. */
  const [addTargetList, setNewListName] = useState("");
  // The board whose categories are managed, and the milestone types window.
  // The board whose contexts are copied to another, from its tab's
  // menu.
  const [contextsCopy, setCopiedContexts] = useState<Id | null>(null);
  // The labels and categories copied from a board widget's "Actions" menu,
  // waiting to be pasted into another.
  const [clipboard, setClipboard] = useState<Clipboard>({});
  const [pastes, setPastes] = useState(0);
  const [assetDrawerOpened, setAssetDrawerOpened] = useState(false);
  const [openedAsset, setOpenedAsset] = useState<Asset | null>(null);
  const [supportDrawerOpened, setSupportDrawerOpened] = useState(false);
  const [editedSupportRequest, setEditedSupportRequest] = useState<SupportRequest | null>(null);
  // The subject of a request created from a link; "null" for a request
  // created from a request list, which starts empty.
  const [accessRequestSubject, setAccessRequestSubject] = useState<string | null>(null);
  const [settingsOpened, setSettingsOpened] = useState(false);
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
          const { needs_setup, entra } = await api.getSetupState();
          setEntraReady(entra);
          if (needs_setup) {
            setNeedsSetup(true);
          } else if (getToken()) {
            setUser(await api.me());
            if (connection) {
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

  // Debug (Paramétrage › Développeur): outside Debug, neither text selection nor
  // the browser menu on right click. Our own context menus
  // always open.
  const [debug, setDebug] = useState(false);
  useEffect(() => {
    if (!user) return;
    api
      .getDeveloperSettings()
      .then((r) => setDebug(r.debug))
      .catch(() => setDebug(false));
  }, [user]);
  useEffect(() => {
    const root = document.documentElement;
    if (debug) {
      root.setAttribute("data-milo-debug", "");
      return () => root.removeAttribute("data-milo-debug");
    }
    const block = (e: MouseEvent) => e.preventDefault();
    document.addEventListener("contextmenu", block);
    return () => document.removeEventListener("contextmenu", block);
  }, [debug]);

  // Session refused by the server: back to the sign-in screen.
  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
  }, []);

  const handleAuthenticated = ({ token, user: account }: AuthResult) => {
    setToken(token);
    setUser(account);
    setNeedsSetup(false);
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
    const items = await read(() => api.getSupportRequests(Number(boardId), "all"));
    setSupportRead({ key: boardId, items });
  }, [boardId, supportNeed, read]);

  // The board's workstations, of the chosen context.
  const loadAssets = useCallback(async () => {
    if (!boardId || !assetsNeed) return setAssetsRead(null);
    const items = await read(() => api.getAssets(Number(boardId), "all"));
    setAssetsRead({ key: boardId, items });
  }, [boardId, assetsNeed, read]);

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
    if (user) loadAssets().catch(() => {});
  }, [user, loadAssets]);

  // A board that shows requests opens with a mailbox poll,
  // without waiting for the one the server does on its own. What it brings
  // arrives through the event stream.
  useEffect(() => {
    if (user && supportNeed) api.syncSupportMail().catch(() => {});
  }, [user, supportNeed, boardId]);

  // The opening view, once the session is open: the account's, or
  // failing that the first.
  useEffect(() => {
    if (!user || !views || appliedView.current === user.id) return;
    appliedView.current = user.id;
    const desiredView = views.find((v) => String(v.id) === user.default_view) ?? views[0];
    if (desiredView) setViewId(String(desiredView.id));
  }, [user, views]);

  // The open view must exist: deleting one goes back to the first.
  useEffect(() => {
    if (!views || appliedView.current === null) return;
    if (!views.some((v) => String(v.id) === viewId))
      setViewId(views[0] ? String(views[0].id) : null);
  }, [views, viewId]);

  // The open board must exist in the view: changing view, or deleting
  // a board, goes back to the first in the list.
  useEffect(() => {
    if (!boards) return;
    const first = boards[0];
    if (!first) return setBoardId(null);
    if (!boards.some((b) => String(b.id) === boardId)) setBoardId(String(first.id));
  }, [boards, boardId]);

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

  /** Go to a board, wherever it is: its view first. */
  const goToBoard = useCallback(async (id: Id) => {
    const board = await api.getBoard(id);
    setViewId(String(board.view_id));
    setBoardId(String(board.id));
  }, []);

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
        } else if (target.kind === "asset") {
          setOpenedAsset(await api.getAsset(target.id));
          setAssetDrawerOpened(true);
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
          setViewId(String(or.view_id));
          setBoardId(String(or.board_id));
          setCardToOpen(target.id);
        }
      } catch {
        /* item deleted in the meantime, or made private: there is nothing to open */
      }
    },
    [goToBoard],
  );

  /** What the search found: a link directly opens its URL. */
  const openSearch = useCallback(
    async (result: SearchResult) => {
      if (result.kind !== "access") return openTarget({ kind: result.kind, id: result.id });
      if (result.url) {
        window.open(result.url, "_blank", "noopener");
        return;
      }
      if (result.board_id) return openTarget({ kind: "access", id: result.board_id });
    },
    [openTarget],
  );

  // Paramétrage › Notifications: when off, notifications no longer show
  // on screen — they still go into the drawer. Re-read on each
  // close of the Paramétrage, where the setting may have changed.
  const toastsEnabled = useRef(true);
  useEffect(() => {
    if (!user || settingsOpened) return;
    api
      .getNotificationSettings()
      .then((r) => (toastsEnabled.current = r.toasts))
      .catch(() => undefined);
  }, [user, settingsOpened]);

  /** What is seen when a followed item changes, by someone else. */
  const showNotification = useCallback(
    (notice: FollowNotification) => {
      if (!toastsEnabled.current) return;
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
                  openTarget({ kind: notice.kind, id: notice.target_id });
                }}
              >
                Ouvrir
              </Anchor>
            )}
          </Stack>
        ),
      });
    },
    [openTarget],
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
      assets: loadAssets,
    };

    const apply = async (message: FeedMessage) => {
      if (isNotification(message)) {
        showNotification(message.notification);
        setNotificationsRevision((r) => r + 1);
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
    loadAssets,
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

  // The views' "+" immediately creates "Nouvelle vue", with its first
  // board, and opens it: its name is then typed in place.
  const createView = async () => {
    try {
      const { view, board: first } = await api.createView("Nouvelle vue");
      await loadViews();
      setViewId(String(view.id));
      setBoardId(String(first.id));
      setViewToRename(view.id);
    } catch (e) {
      reportRejection(e);
    }
  };

  const viewOf = (id: Id) => views?.find((v) => v.id === id);

  const addBoard = async () => {
    if (!viewId) return;
    try {
      // "Nouveau tableau", opened immediately: its name is typed in place.
      const created = await api.createBoard(viewId, "Nouveau tableau");
      await loadBoards();
      setBoardId(String(created.id));
      setBoardToRename(created.id);
    } catch (e) {
      reportRejection(e);
    }
  };

  const boardOf = (id: Id) => boards?.find((b) => b.id === id);

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
  const changeContext = (value: string) => {
    if (!board) return;
    const contextId = value === "all" ? null : Number(value);
    setBoard({ ...board, context_id: contextId });
    void write(() => api.selectContext(board.id, contextId), loadBoards);
  };

  // The open board's contexts: each write returns the updated board.
  const writeContexts = (writing: () => Promise<Board>) =>
    write(
      async () => setBoard(await writing()),
      async () => {
        await loadBoards();
      },
    );
  const contextManagement =
    board && canArrange
      ? {
          onAdd: (name: string) => writeContexts(() => api.addContext(board.id, name)),
          onRename: (id: Id, name: string) => writeContexts(() => api.renameContext(id, name)),
          onRenameAll: (name: string) =>
            writeContexts(() => api.updateBoard(board.id, { all_contexts_label: name })),
          onDelete: async (id: Id) => {
            await writeContexts(() => api.deleteContext(id));
            await Promise.all([
              loadProjects(),
              loadTaskLists(),
              loadSupportRequests(),
              loadAssets(),
            ]);
          },
          onReorder: (ids: Id[]) => {
            setBoard({
              ...board,
              contexts: ids
                .map((id) => board.contexts.find((c) => c.id === id))
                .filter((c): c is NonNullable<typeof c> => Boolean(c)),
            });
            return writeContexts(() => api.reorderContexts(board.id, ids));
          },
        }
      : undefined;

  // A board's "Hérité": unticking it (confirmed by the menu) starts from a
  // copy of its shared structure, re-ticking it erases its own.
  const toggleInherited = async (id: Id) => {
    const board = boardOf(id);
    if (!board) return;
    await write(
      () => api.boardSections(id).setLayout(board.inherited === false),
      async () => {
        await loadBoards();
        if (String(id) === boardId) await loadWidgets();
      },
    );
  };

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
  // view's boards, N creates a project or a request, S cycles through the
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
        event.preventDefault();
        const list = event.altKey
          ? (boards ?? []).map((b) => String(b.id))
          : (views ?? []).map((v) => String(v.id));
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

      if (event.code === "KeyS" && board) {
        event.preventDefault();
        const values = ["all", ...contexts.map((c) => String(c.id))];
        changeContext(values[(values.indexOf(selectedContext) + 1) % values.length]!);
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

  // The URL follows what is open, so a reload finds it again.
  useEffect(() => {
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
  const openSupportRequestFromAsset = (workstation: Asset) => {
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

  // The "admin" account is only for settings: it sees nothing else.
  if (user.system)
    return (
      <SettingsModal
        opened
        onClose={handleLogout}
        standalone
        canEdit
        debug={debug}
        onDebugChange={setDebug}
        user={user}
        onUserChange={setUser}
      />
    );

  // The open board's contexts, and the account.
  const account: AccountSlot = {
    contexts: board
      ? {
          items: contexts,
          all: board.all_contexts_label,
          value: selectedContext,
          onChange: changeContext,
          // Outside edit mode, the board keeps its contexts: they are only chosen,
          // not added, renamed, ordered or deleted.
          management: isEditing ? contextManagement : undefined,
        }
      : undefined,
    onOpenSettings: () => setSettingsOpened(true),
    user,
    onLogout: handleLogout,
    onOpenPreferences: () => setPreferencesOpened(true),
    onOpenNotifications: () => setNotificationsOpened(true),
    onSearchOpen: openSearch,
  };

  // The open board is frozen: outside interface editing, or — on its
  // shared structure — for lack of the right to organize it. Its own structure
  // ("Hérité" unticked) is only one's own.
  const inherits = board?.inherited !== false;
  const frozen = boardId ? !isEditing || (inherits && !canArrange) : true;
  // Outside edit mode, the tabs are frozen too: neither boards nor
  // views can be dragged or added.
  const tabsLocked = !isEditing;
  // The open board's structure is replaced by an import: one must be
  // able to touch it, as to edit it.
  const editableLayout = Boolean(board) && !(inherits && !canArrange);
  // The boards as this window shows them: its lock is its own.
  const displayedBoards =
    boards?.map((b) => ({
      ...b,
      is_locked: isEditing ? (0 as const) : (1 as const),
    })) ?? null;
  const createTask = can("tasks", "create");
  // The request is born in the open board: without a "Demandes de
  // support" widget to show it, it isn't offered.
  const createRequest =
    can("support", "create") && widgets.some((w) => w.type === "support.list");
  const boardNameOf = (id: Id) => boards?.find((b) => b.id === id)?.name;

  return (
    <RightsProvider rights={user.rights} widgets={user.widgets} canEditSettings={user.settings.update}>
      <EditingContext.Provider value={isEditing}>
        <ReferencesContext.Provider
          value={{
            contexts: contexts,
            assetTags: [...new Set((assets ?? []).map((a) => a.tag).filter(Boolean))].sort(),
          }}
        >
          {/* The clipboard of labels and categories, which the "Actions"
            menu of a widget drawer fills and empties in another. */}
          <CopyPasteContext.Provider
            value={{
              board: board && { id: board.id, name: board.name },
              clipboard,
              onCopy: (key, copy) => setClipboard((before) => ({ ...before, [key]: copy })),
              pastes,
              onPasted: () => setPastes((n) => n + 1),
            }}
          >
            <Stack
              ref={background}
              gap={0}
              h="100vh"
              // The right click on the background: what no element — tab, widget,
              // section, row — took for its own menu. An input keeps
              // the browser's, for copy and paste; a window or a
              // drawer, rendered outside the page, don't open it.
              onContextMenu={(e) => {
                const target = e.target as HTMLElement;
                if (e.defaultPrevented || !background.current?.contains(target)) return;
                if (target.closest("input, textarea, [contenteditable='true']")) return;
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
                {viewId && (
                  <ViewPage
                    boards={displayedBoards}
                    boardId={boardId}
                    onBoardChange={setBoardId}
                    // Outside edit mode, no board "+" nor view "+" (tabsLocked).
                    onAddBoard={canArrange && !tabsLocked ? addBoard : undefined}
                    toRename={boardToRename}
                    onRenameOpened={() => setBoardToRename(null)}
                    // Rename, delete, make private or inherited: in
                    // edit mode only.
                    onRenameBoard={
                      canArrange && isEditing
                        ? (id, name) => write(() => api.updateBoard(id, { name }), loadBoards)
                        : undefined
                    }
                    onDeleteBoard={
                      canArrange && isEditing
                        ? (id) => write(() => api.deleteBoard(id), loadBoards)
                        : undefined
                    }
                    onReorderBoards={
                      tabsLocked
                        ? undefined
                        : (ids) => write(() => api.reorderBoards(viewId, ids), loadBoards)
                    }
                    onTogglePrivateBoard={
                      canArrange && isEditing
                        ? (id) =>
                            write(
                              () =>
                                api.updateBoard(id, {
                                  is_private: !boardOf(id)?.is_private,
                                }),
                              loadBoards,
                            )
                        : undefined
                    }
                    onToggleBoardInherited={isEditing ? toggleInherited : undefined}
                    // Contexts are the board's common structure: copying
                    // them requires being able to organize, and edit mode —
                    // like adding or renaming them.
                    onCopyContexts={canArrange && isEditing ? setCopiedContexts : undefined}
                    sections={sections}
                    widgets={widgets}
                    onWidgetsChanged={loadWidgets}
                    locked={frozen}
                    // Switching to edit mode only makes sense for whoever can touch the
                    // structure they are viewing: without the right, nothing is offered.
                    onUnlock={
                      boardId && !(inherits && !canArrange)
                        ? () => setIsEditing(true)
                        : undefined
                    }
                    data={{
                      requests: visibleRequests ?? [],
                      projects: viewedProjects ?? [],
                      lists: visibleTasks ?? [],
                      assets: viewedWorkstations ?? [],
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
                    assets={{
                      assets: viewedWorkstations,
                      loading: loading,
                      onOpenAsset: (workstation) => {
                        setOpenedAsset(workstation);
                        setAssetDrawerOpened(true);
                      },
                      onCreateTask: createTask
                        ? (workstation) => setSourceTask(workstationSource(workstation))
                        : undefined,
                      onCreateSupportRequest: createRequest
                        ? openSupportRequestFromAsset
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
                  <Menu.Item
                    leftSection={
                      isEditing ? <IconCheck size={16} /> : <IconLayoutDashboard size={16} />
                    }
                    onClick={toggleEdit}
                  >
                    {isEditing ? "Terminer la modification" : "Modifier l’interface"}
                  </Menu.Item>
                  {board && (
                    <>
                      <Menu.Divider />
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
                      loadAssets(),
                    ]);
                  }
                }}
              />

              {contextsCopy !== null && (
                <CopyToBoardModal
                  opened
                  onClose={() => setCopiedContexts(null)}
                  item="contexts"
                  sourceId={contextsCopy}
                  viewId={viewId}
                  onCopy={(target, replaceExisting, rename) =>
                    api.copyContexts(contextsCopy, target, replaceExisting, rename)
                  }
                />
              )}

              <AssetDrawer
                opened={assetDrawerOpened}
                onClose={() => setAssetDrawerOpened(false)}
                asset={openedAsset}
              />

              <SupportRequestDrawer
                opened={supportDrawerOpened}
                onClose={() => setSupportDrawerOpened(false)}
                request={editedSupportRequest}
                // The context offered at creation: the one being viewed, or the
                // board's first.
                contexts={contexts}
                contextId={
                  selectedContext !== "all" ? selectedContext : String(contexts[0]?.id ?? "")
                }
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
                contexts={contexts}
                contextId={
                  selectedContext !== "all" ? selectedContext : String(contexts[0]?.id ?? "")
                }
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
                views={views ?? []}
                value={viewId}
                onChange={changeView}
                onReorder={
                  tabsLocked ? undefined : (ids) => write(() => api.reorderViews(ids), loadViews)
                }
                onCreate={canArrange && !tabsLocked ? createView : undefined}
                toRename={viewToRename}
                onRenameOpened={() => setViewToRename(null)}
                // Rename, delete, make private: in edit mode only.
                onRename={
                  canArrange && isEditing
                    ? (id, name) => write(() => api.updateView(id, { name }), loadViews)
                    : undefined
                }
                onTogglePrivate={
                  canArrange && isEditing
                    ? (id) =>
                        write(
                          () =>
                            api.updateView(id, {
                              is_private: !viewOf(id)?.is_private,
                            }),
                          loadViews,
                        )
                    : undefined
                }
                onDelete={
                  canArrange && isEditing
                    ? (id) => write(() => api.deleteView(id), loadViews)
                    : undefined
                }
              />
              <ShortcutsHelp
                projects={widgets.some((w) => w.type === "project.list")}
                requests={widgets.some((w) => w.type === "support.list")}
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
                  void openTarget({
                    kind: notification.kind,
                    id: notification.target_id,
                  });
                }}
              />

              <PreferencesModal
                opened={preferencesOpened}
                onClose={() => setPreferencesOpened(false)}
                user={user}
                views={views ?? []}
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
                debug={debug}
                onDebugChange={setDebug}
                user={user}
                onUserChange={setUser}
              />
            </Stack>
          </CopyPasteContext.Provider>
        </ReferencesContext.Provider>
      </EditingContext.Provider>
    </RightsProvider>
  );
}
