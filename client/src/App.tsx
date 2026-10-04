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
 * Une liste lue, accompagnée de la sélection à laquelle elle répond : la vue
 * pour les tableaux, le tableau pour ce qu'il contient. On sait donc dès le
 * rendu si ce qu'on a en main concerne encore ce qui est affiché — une remise
 * à zéro par effet arriverait trop tard.
 */
interface LoadedFor<T> {
  /** La vue ou le tableau qui a servi à la lire. */
  key: string;
  items: T[];
}

/** Les types de widgets qu'un tableau porte, par leur préfixe : ce qu'il faut lire pour eux. */
const withPrefix = (widgets: BoardWidget[], prefix: string) =>
  widgets.some((w) => w.type.startsWith(`${prefix}.`));

/** Les éléments d'un contexte, ou tous (« all ») ; « null » tant qu'ils ne sont pas lus. */
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
  // La connexion par Microsoft est possible : l'application Entra est renseignée.
  const [entraReady, setEntraReady] = useState(false);
  // Ce que le retour d'une connexion Microsoft a apporté comme erreur.
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // Les types de jalons des réglages : un projet en choisit un.
  const [milestoneTypes, setMilestoneTypes] = useState<MilestoneType[]>([]);
  const [users, setUsers] = useState<PublicUser[]>([]);

  // Les vues, dans l'ordre que le compte a rangé, et celle qui est ouverte.
  const [views, setViews] = useState<View[] | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);
  // La vue d'ouverture s'applique une fois, à l'ouverture de la session.
  const appliedView = useRef<number | null>(null);
  // Les tableaux de la vue ouverte, et celui qui est ouvert.
  const [boardsRead, setBoardsRead] = useState<LoadedFor<Board> | null>(null);
  const [boardId, setBoardId] = useState<string | null>(null);
  // Ce que le tableau ouvert porte : ses sections, ses widgets.
  const [sectionsRead, setSectionsRead] = useState<LoadedFor<IndicatorSection> | null>(null);
  const [loadedWidgets, setWidgetsRead] = useState<LoadedFor<BoardWidget> | null>(null);
  // Ses données : ses projets, ses listes, les demandes et les postes de sa
  // société. Chacune porte le tableau qui a servi à la lire.
  const [readProjects, setProjectsRead] = useState<LoadedFor<Project> | null>(null);
  // Les comptes acteurs d'au moins un projet du tableau : les seuls que le
  // filtre « Acteurs » propose.
  const [projectActorIds, setProjectActorIds] = useState<number[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [readProjectLabels, setProjectLabelsRead] = useState<LoadedFor<ProjectLabel> | null>(null);
  const [loadedTaskLists, setTaskListsRead] = useState<LoadedFor<TaskList> | null>(null);
  const [labelsRead, setLabelsRead] = useState<LoadedFor<Label> | null>(null);
  const [supportRead, setSupportRead] = useState<LoadedFor<SupportRequest> | null>(null);
  const [assetsRead, setAssetsRead] = useState<LoadedFor<Asset> | null>(null);

  // « Modifier l'interface » vaut pour toute l'application : tous les
  // tableaux, toutes les vues. Il ne vit que dans cette fenêtre, qui s'ouvre
  // hors modification ; I ou le clic droit sur le fond le basculent.
  const [isEditing, setIsEditing] = useState(false);
  const toggleEdit = () => setIsEditing((before) => !before);
  // Le menu du clic droit sur le fond de l'application, et la fenêtre
  // d'export ou d'import de la disposition du tableau ouvert.
  const background = useRef<HTMLDivElement>(null);
  const [backgroundMenu, setBackgroundMenu] = useState<PointMenuPosition | null>(null);
  const [layout, setLayout] = useState<"export" | "import" | null>(null);

  // Les filtres de la liste des projets.
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [actorFilter, setActorFilter] = useState("all");

  // Les droits du compte. Le serveur les vérifie ; ici, ils taisent ce qu'on
  // ne voit pas et retirent ce qu'on ne peut pas faire.
  const can = useMemo(() => canFrom(user?.rights ?? {}), [user]);
  // Organiser les vues et les tableaux partagés demande de pouvoir modifier
  // au moins un type de widget (comme le serveur, lib/droits.ts).
  const canArrange = Object.values(user?.widgets ?? {}).some((a) => a === "update");

  // Lectures en cours. Un écran vide est une conclusion : on ne la tire
  // jamais pendant une lecture.
  const [reads, setReads] = useState(0);
  const loading = reads > 0;

  // Juste après la connexion, la page reste vierge le temps des lectures, puis
  // l'interface s'y pose morceau par morceau. Les lectures s'enchaînent : on
  // attend qu'elles se taisent un instant — et jamais plus de quelques
  // secondes, pour ne pas laisser la page vide.
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

  // Ce que les widgets du tableau ouvert demandent à lire.
  const projectsNeed = withPrefix(widgets, "project");
  const tasksNeed = withPrefix(widgets, "task");
  const supportNeed = withPrefix(widgets, "support");
  const assetsNeed = withPrefix(widgets, "asset");
  // Le contexte que ce compte regarde dans le tableau ouvert, ou « all ».
  const selectedContext = board?.context_id ? String(board.context_id) : "all";
  const contexts = board?.contexts ?? [];
  // Les cartes du contexte choisi ; les séparateurs, qui tranchent pour tous,
  // restent. Gardé d'un rendu à l'autre : le tableau des tâches oublie son
  // ordre provisoire quand ses listes changent.
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
  // Les projets, les demandes et les postes du contexte choisi, filtrés ici :
  // la page les a lus pour tout le tableau.
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
  /** Le widget de liste d'où l'on ajoute un projet ou une demande ; vide sinon. */
  const [addTargetList, setNewListName] = useState("");
  // Le tableau dont on gère les catégories, et la fenêtre des types de jalons.
  // Le tableau dont on copie les contextes vers un autre, depuis le menu de
  // son onglet.
  const [contextsCopy, setCopiedContexts] = useState<Id | null>(null);
  // Les étiquettes et les catégories copiées depuis le menu « Actions » du
  // widget d'un tableau, en attente d'être collées dans un autre.
  const [clipboard, setClipboard] = useState<Clipboard>({});
  const [pastes, setPastes] = useState(0);
  const [assetDrawerOpened, setAssetDrawerOpened] = useState(false);
  const [openedAsset, setOpenedAsset] = useState<Asset | null>(null);
  const [supportDrawerOpened, setSupportDrawerOpened] = useState(false);
  const [editedSupportRequest, setEditedSupportRequest] = useState<SupportRequest | null>(null);
  // L'objet d'une demande créée depuis un lien ; « null » pour une demande
  // créée depuis une liste de demandes, qui part vide.
  const [accessRequestSubject, setAccessRequestSubject] = useState<string | null>(null);
  const [settingsOpened, setSettingsOpened] = useState(false);
  const [preferencesOpened, setPreferencesOpened] = useState(false);
  // Le tiroir des notifications, et ce qui le fait se relire.
  const [notificationsOpened, setNotificationsOpened] = useState(false);
  const [notificationsRevision, setNotificationsRevision] = useState(0);
  // « Créer une tâche » depuis un autre élément : d'où elle part.
  const [sourceTask, setSourceTask] = useState<SourceTask | null>(null);
  // Dernière version de données connue, pour détecter les modifications
  // faites par quelqu'un d'autre.
  const knownVersions = useRef<ResourceVersions | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [follows, setFollows] = useState<Follows>(emptyFollows());
  // Carte désignée par l'adresse, en attente que son tableau soit lu.
  const [cardToOpen, setCardToOpen] = useState<number | null>(null);
  // Carte dont le tiroir est ouvert : c'est elle que l'adresse porte.
  const [displayedCard, setDisplayedCard] = useState<number | null>(null);
  const [movedProject, setMovedProject] = useState<{
    project: Project;
    mode: ProjectAction;
  } | null>(null);
  const [deletedProject, setDeletedProject] = useState<Project | null>(null);

  // --- Session ---------------------------------------------------------------

  // Vérifie la session au démarrage.
  useEffect(() => {
    // Vrai au retour d'une connexion Microsoft : l'interface s'y construira
    // sous les yeux, comme après une connexion par mot de passe.
    let connection = false;
    const check = async () => {
      // Le retour de Microsoft porte la session, ou l'erreur, dans le
      // fragment de l'adresse : on le lit, puis on l'efface de la barre
      // d'adresse — un jeton n'a rien à faire dans l'historique.
      const returnParams = new URLSearchParams(window.location.hash.slice(1));
      if (returnParams.has("token") || returnParams.has("auth_error")) {
        const token = returnParams.get("token");
        if (token) setToken(token);
        connection = Boolean(token);
        setConnectionError(returnParams.get("auth_error"));
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
      }

      // Seul un refus du serveur ferme la session. Un serveur qui redémarre
      // ou un réseau coupé ne dit rien du jeton : on le garde et on réessaie.
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

  // Debug (Paramétrage › Développeur) : hors Debug, ni sélection du texte ni
  // menu du navigateur au clic droit. Nos propres menus contextuels, eux,
  // s'ouvrent toujours.
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

  // Session refusée par le serveur : retour à l'écran de connexion.
  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
  }, []);

  const handleAuthenticated = ({ token, user: account }: AuthResult) => {
    setToken(token);
    setUser(account);
    setNeedsSetup(false);
    // L'interface se construira sous les yeux, une fois chargée.
    clearPage();
    setEntered(true);
  };

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch {
      /* session déjà invalide côté serveur */
    }
    setToken(null);
    setUser(null);
    setProjectsRead(null);
  };

  // --- Lectures ----------------------------------------------------------------

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
    // Sans vue ouverte, il n'y a pas de tableaux à lire : ils restent
    // inconnus, et non « aucun ».
    if (!viewId) return setBoardsRead(null);
    const items = await read(() => api.getBoards(viewId));
    setBoardsRead({ key: viewId, items });
  }, [viewId, read]);

  // Les sections et les widgets du tableau ouvert, d'un coup.
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

  // Les projets du tableau, de tous ses contextes : le contexte choisi les
  // filtre ici (projetsVus), sans rien redemander au serveur — en changer
  // est immédiat. Il en va de même des demandes et des postes.
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

  // Les acteurs que propose le filtre « Acteurs » : ceux des projets du
  // contexte choisi. Lus à part, ils ne retardent pas la liste.
  const loadProjectActors = useCallback(async () => {
    if (!boardId || !projectsNeed) return setProjectActorIds([]);
    setProjectActorIds(await api.getProjectActorIds({ board: boardId, context: selectedContext }));
  }, [boardId, projectsNeed, selectedContext]);

  // Les catégories sont propres au tableau ouvert.
  const loadCategories = useCallback(async () => {
    if (!boardId || !projectsNeed) return setCategories([]);
    setCategories(await api.getCategories(boardId));
  }, [boardId, projectsNeed]);

  // Les étiquettes des projets et celles des cartes, propres au tableau.
  // Appelées avec un « patch », elles l'appliquent sur place, sans rien
  // demander au serveur : une étiquette recolorée se voit aussitôt.
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

  // Les demandes du tableau, du contexte choisi — toutes, quel que soit leur
  // statut.
  const loadSupportRequests = useCallback(async () => {
    if (!boardId || !supportNeed) return setSupportRead(null);
    const items = await read(() => api.getSupportRequests(Number(boardId), "all"));
    setSupportRead({ key: boardId, items });
  }, [boardId, supportNeed, read]);

  // Les postes du tableau, du contexte choisi.
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
    // Un suivi qui ne se lit pas n'empêche rien de fonctionner.
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

  // Un tableau qui montre des demandes s'ouvre sur une relève des boîtes,
  // sans attendre celle que le serveur fait de lui-même. Ce qu'elle apporte
  // arrive par le flux d'événements.
  useEffect(() => {
    if (user && supportNeed) api.syncSupportMail().catch(() => {});
  }, [user, supportNeed, boardId]);

  // La vue d'ouverture, une fois la session ouverte : celle du compte, à
  // défaut la première.
  useEffect(() => {
    if (!user || !views || appliedView.current === user.id) return;
    appliedView.current = user.id;
    const desiredView = views.find((v) => String(v.id) === user.default_view) ?? views[0];
    if (desiredView) setViewId(String(desiredView.id));
  }, [user, views]);

  // La vue ouverte doit exister : en supprimer une ramène sur la première.
  useEffect(() => {
    if (!views || appliedView.current === null) return;
    if (!views.some((v) => String(v.id) === viewId))
      setViewId(views[0] ? String(views[0].id) : null);
  }, [views, viewId]);

  // Le tableau ouvert doit exister dans la vue : changer de vue, ou supprimer
  // un tableau, ramène sur le premier de la liste.
  useEffect(() => {
    if (!boards) return;
    const first = boards[0];
    if (!first) return setBoardId(null);
    if (!boards.some((b) => String(b.id) === boardId)) setBoardId(String(first.id));
  }, [boards, boardId]);

  // Un filtre peut pointer vers une catégorie ou un acteur qui vient de
  // disparaître.
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
   * Suivre ou cesser de suivre. Le serveur rend la liste entière, qui remplace
   * la nôtre.
   */
  const toggleFollow = useCallback(
    async (kind: FollowKind, id: number) => {
      const following = follows[kind].includes(id);
      try {
        setFollows(following ? await api.unfollow(kind, id) : await api.follow(kind, id));
      } catch {
        /* le serveur a refusé : la case reste dans l'état qu'il connaît */
      }
    },
    [follows],
  );

  /** Se placer sur un tableau, où qu'il soit : sa vue d'abord. */
  const goToBoard = useCallback(async (id: Id) => {
    const board = await api.getBoard(id);
    setViewId(String(board.view_id));
    setBoardId(String(board.id));
  }, []);

  /**
   * Ouvre l'élément désigné, qu'il vienne de l'adresse, d'une notification ou
   * de la recherche. Une demande et un poste s'ouvrent sur place ; un projet,
   * une carte et un widget mènent d'abord à leur tableau.
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
          // Une carte : c'est le tableau qui l'ouvrira, une fois ses listes lues.
          const or = await api.getCardLocation(target.id);
          setViewId(String(or.view_id));
          setBoardId(String(or.board_id));
          setCardToOpen(target.id);
        }
      } catch {
        /* élément supprimé entre-temps, ou devenu privé : il n'y a rien à ouvrir */
      }
    },
    [goToBoard],
  );

  /** Ce que la recherche a trouvé : un lien ouvre directement son adresse. */
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

  // Paramétrage › Notifications : éteintes, les notifications ne passent plus
  // à l'écran — elles se rangent toujours dans le tiroir. Relu à chaque
  // fermeture du Paramétrage, où le réglage a pu changer.
  const toastsEnabled = useRef(true);
  useEffect(() => {
    if (!user || settingsOpened) return;
    api
      .getNotificationSettings()
      .then((r) => (toastsEnabled.current = r.toasts))
      .catch(() => undefined);
  }, [user, settingsOpened]);

  /** Ce qu'on voit quand un élément suivi change, chez quelqu'un d'autre. */
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

  // Flux d'événements : le serveur pousse ses compteurs dès qu'une écriture a
  // lieu, et le client ne relit que les jeux de données concernés. On consomme
  // le flux avec `fetch`, `EventSource` n'acceptant pas d'en-tête.
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
      // Les étiquettes du support se lisent dans le tiroir d'une demande, qui
      // les relit à son ouverture.
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
      // Premier message : les compteurs servent de référence, sans rien relire.
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
            // Les événements sont séparés par une ligne vide.
            const chunks = buffer.split("\n\n");
            buffer = chunks.pop() ?? "";
            for (const chunk of chunks) {
              const row = chunk.split("\n").find((l) => l.startsWith("data:"));
              if (!row) continue; // commentaire de maintien de connexion
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
          /* connexion perdue : nouvelle tentative après une courte pause */
        }
        // Ce qui a changé pendant la coupure est inconnu : le premier message
        // du flux repris servira de nouvelle référence.
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

  // --- Gestes ------------------------------------------------------------------

  // Un réglage refusé par le serveur : le menu s'est refermé, la raison se dit
  // en notification.
  const reportRejection = (e: unknown) => notifyError(errorMessage(e), "Modification refusée");

  /** Écrire, signaler un refus, puis relire quoi qu'il arrive. */
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

  // La vue et le tableau qu'on vient de créer : leur nom passe aussitôt en
  // saisie, dès qu'ils paraissent.
  const [viewToRename, setViewToRename] = useState<number | null>(null);
  const [boardToRename, setBoardToRename] = useState<number | null>(null);

  // Le « + » des vues crée aussitôt « Nouvelle vue », avec son premier
  // tableau, et l'ouvre : son nom se tape ensuite sur place.
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
      // « Nouveau tableau », ouvert aussitôt : son nom se tape sur place.
      const created = await api.createBoard(viewId, "Nouveau tableau");
      await loadBoards();
      setBoardId(String(created.id));
      setBoardToRename(created.id);
    } catch (e) {
      reportRejection(e);
    }
  };

  const boardOf = (id: Id) => boards?.find((b) => b.id === id);

  /** Le tableau tel que le serveur vient de le rendre, à sa place. */
  const setBoard = (next: Board) =>
    setBoardsRead((before) =>
      before
        ? {
            ...before,
            items: before.items.map((b) => (b.id === next.id ? next : b)),
          }
        : before,
    );

  // Le contexte qu'on regarde dans le tableau ouvert : choisi pour soi, il se
  // voit aussitôt et se retrouve à la prochaine visite.
  const changeContext = (value: string) => {
    if (!board) return;
    const contextId = value === "all" ? null : Number(value);
    setBoard({ ...board, context_id: contextId });
    void write(() => api.selectContext(board.id, contextId), loadBoards);
  };

  // Les contextes du tableau ouvert : chaque écriture rend le tableau à jour.
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

  // « Hérité » d'un tableau : le décocher (confirmé par le menu) part d'une
  // copie de sa structure partagée, le recocher efface la sienne.
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

  // Un projet, une demande : ajoutés depuis un widget de liste, ils sont les
  // siens (lib/listes.ts) ; sans widget désigné, le serveur les donne au
  // premier du tableau.
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

  // Raccourcis clavier : Tab fait le tour des vues, Option/Alt + Tab celui des
  // tableaux de la vue, N crée un projet ou une demande, S fait défiler les
  // contextes du tableau, I entre dans la modification de
  // l'interface ou en sort.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Jamais pendant une saisie de texte. Les listes déroulantes de Mantine
      // sont des <input readonly> : les raccourcis y fonctionnent toujours.
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
   * Ce que l'adresse désignait à l'arrivée, ouvert une fois la session ouverte.
   */
  const readAddress = useRef(false);
  useEffect(() => {
    if (!user || readAddress.current) return;
    readAddress.current = true;
    const target = addressTarget();
    if (target) openTarget(target);
  }, [user, openTarget]);

  // L'adresse suit ce qui est ouvert, pour qu'un rechargement le retrouve.
  useEffect(() => {
    if (drawerOpened && selectedProjectId) {
      noteInAddress({ kind: "project", id: selectedProjectId });
    } else if (displayedCard) {
      noteInAddress({ kind: "card", id: displayedCard });
    } else {
      noteInAddress(null);
    }
  }, [drawerOpened, selectedProjectId, displayedCard]);

  /** Le tableau rapporte la carte ouverte : l'adresse la suit, la demande est servie. */
  const handleCardOpened = useCallback((id: number | null) => {
    setDisplayedCard(id);
    setCardToOpen(null);
  }, []);

  const handleOpenProject = (project: Project) => {
    setSelectedProjectId(project.id);
    setDrawerOpened(true);
  };

  // La copie reste dans le tableau de l'original, sous « … (copie) », et
  // s'ouvre aussitôt.
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

  // Depuis un lien : la demande prend son titre pour objet, et naît
  // « Nouveau », dans le contexte choisi du tableau.
  const openSupportRequestFromLink = (widget: BoardWidget) => {
    if (!board) return;
    setAccessRequestSubject(accessSource(widget, board.id).title);
    setEditedSupportRequest(null);
    setSupportDrawerOpened(true);
  };

  // Depuis un poste : la demande prend son nom pour objet.
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

  // Le compte « admin » ne sert qu'au paramétrage : il ne voit que lui.
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

  // Les contextes du tableau ouvert, et le compte.
  const account: AccountSlot = {
    contexts: board
      ? {
          items: contexts,
          all: board.all_contexts_label,
          value: selectedContext,
          onChange: changeContext,
          // Hors modification, le tableau garde ses contextes : on les choisit
          // seulement, sans les ajouter, renommer, ranger ni supprimer.
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

  // Le tableau ouvert est figé : hors modification de l'interface, ou — sur sa
  // structure partagée — faute de pouvoir l'organiser. Sa propre structure
  // (« Hérité » décoché) n'est qu'à soi.
  const inherits = board?.inherited !== false;
  const frozen = boardId ? !isEditing || (inherits && !canArrange) : true;
  // Hors modification, les onglets sont figés aussi : ni les tableaux ni les
  // vues ne se glissent, ni ne s'ajoutent.
  const tabsLocked = !isEditing;
  // La structure du tableau ouvert se remplace par un import : il faut
  // pouvoir y toucher, comme pour la modifier.
  const editableLayout = Boolean(board) && !(inherits && !canArrange);
  // Les tableaux tels que cette fenêtre les montre : leur verrou est le sien.
  const displayedBoards =
    boards?.map((b) => ({
      ...b,
      is_locked: isEditing ? (0 as const) : (1 as const),
    })) ?? null;
  const createTask = can("tasks", "create");
  // La demande naît dans le tableau ouvert : sans widget « Demandes de
  // support » pour la montrer, on ne la propose pas.
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
          {/* Le presse-papiers des étiquettes et des catégories, que le menu
            « Actions » du tiroir d'un widget remplit et vide dans un autre. */}
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
              // Le clic droit sur le fond : ce qu'aucun élément — onglet, widget,
              // section, ligne — n'a pris pour son propre menu. Une saisie garde
              // celui du navigateur, pour copier et coller ; une fenêtre ou un
              // tiroir, portés hors de la page, ne l'ouvrent pas.
              onContextMenu={(e) => {
                const target = e.target as HTMLElement;
                if (e.defaultPrevented || !background.current?.contains(target)) return;
                if (target.closest("input, textarea, [contenteditable='true']")) return;
                setBackgroundMenu(menuPosition(e));
              }}
            >
              {/* La rangée d'onglets de la vue est la première ligne de l'écran. */}
              <Box
                pt={PAGE_GUTTER}
                px={PAGE_GUTTER}
                w="100%"
                style={{
                  flex: 1,
                  minHeight: 0,
                  display: "flex",
                  flexDirection: "column",
                  // Le contenu s'arrête 20px au-dessus du sélecteur de vues, posé en
                  // bas à gauche par-dessus la page. Sa hauteur, c'est lui qui la
                  // publie.
                  paddingBottom: `calc(var(${MODE_SWITCH_TOP}, ${MODE_SWITCH_TOP_FALLBACK}px) + ${BOTTOM_CLEARANCE}px)`,
                }}
              >
                {viewId && (
                  <ViewPage
                    boards={displayedBoards}
                    boardId={boardId}
                    onBoardChange={setBoardId}
                    // Hors modification, ni « + » de tableau, ni de vue (ongletsFiges).
                    onAddBoard={canArrange && !tabsLocked ? addBoard : undefined}
                    toRename={boardToRename}
                    onRenameOpened={() => setBoardToRename(null)}
                    // Renommer, supprimer, rendre privé ou hérité : en
                    // modification seulement.
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
                    // Les contextes sont la structure commune du tableau : les
                    // copier demande de pouvoir organiser, et le mode édition —
                    // comme les ajouter ou les renommer.
                    onCopyContexts={canArrange && isEditing ? setCopiedContexts : undefined}
                    sections={sections}
                    widgets={widgets}
                    onWidgetsChanged={loadWidgets}
                    locked={frozen}
                    // Passer en modification n'a de sens que pour qui peut toucher à la
                    // structure qu'il regarde : faute de droit, rien ne se propose.
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
                      // L'acteur retenu reste proposé même s'il n'a plus de projet.
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
                // Le contexte proposé à la création : celui qu'on regarde, ou le
                // premier du tableau.
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
                // Le tiroir se ferme lui-même après une création ; une mise à
                // jour le laisse ouvert.
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
                // Renommer, supprimer, rendre privée : en modification seulement.
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

              {/* « Créer une tâche » : la fiche d'une carte, vide, qui choisit où
                elle va. On reste où l'on est ; la notification mène à la tâche. */}
              <CardDrawer
                opened={sourceTask !== null}
                onClose={() => setSourceTask(null)}
                card={null}
                source={sourceTask}
                // Depuis un lien, la tâche naît sans membre : on la signale sans
                // s'en charger.
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
                  // Le nom apparaît aussi dans les acteurs et la liste des utilisateurs.
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
