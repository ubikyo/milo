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
import type { TacheSource } from "./components/board/TaskDestination";
import { sourceAcces, sourceDemande, sourcePoste, sourceProjet } from "./lib/tache";
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
import { DEFAULT_SUPPORT_STATUS, RESOURCES, emptyFollows, estNotification } from "@milo/shared";
import { DroitsProvider, peutAvec } from "./lib/droits";
import { messageErreur, notifierErreur } from "./lib/errors";
import { ReferencesContext } from "./lib/references";
import { EditionContext } from "./lib/edition";
import { cibleDeLAdresse, noterDansLAdresse } from "./lib/suivi";
import type { Cible } from "./lib/suivi";
import AssetDrawer from "./components/assets/AssetDrawer";
import SupportRequestDrawer from "./components/support/SupportRequestDrawer";
import PreferencesModal from "./components/settings/PreferencesModal";
import CopyToBoardModal from "./components/ui/CopyToBoardModal";
import { CopierCollerContext } from "./components/ui/ActionsCopierColler";
import type { PressePapiers } from "./components/ui/ActionsCopierColler";
import type { AccountSlot } from "./components/ui/AccountControls";
import DeleteConfirmModal from "./components/ui/DeleteConfirmModal";
import MoveOrCopyProjectModal from "./components/project/MoveOrCopyProjectModal";
import type { ProjectAction } from "./components/project/MoveOrCopyProjectModal";
import ProjectDrawer from "./components/project/ProjectDrawer";
import ViewSwitch from "./components/ui/ViewSwitch";
import ShortcutsHelp from "./components/ui/ShortcutsHelp";
import DispositionModal from "./components/ui/DispositionModal";
import PointMenu, { positionDuMenu, type PointMenuPosition } from "./components/ui/PointMenu";
import CodeKonami from "./components/ui/CodeKonami";
import SettingsModal from "./components/settings/SettingsModal";
import type {
  Asset,
  AuthResult,
  Board,
  BoardWidget,
  Category,
  FluxMessage,
  FollowKind,
  Follows,
  Id,
  IndicatorSection,
  Label,
  MilestoneType,
  Notification as NotificationSuivi,
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
interface LuPour<T> {
  /** La vue ou le tableau qui a servi à la lire. */
  cle: string;
  items: T[];
}

/** Les types de widgets qu'un tableau porte, par leur préfixe : ce qu'il faut lire pour eux. */
const avecPrefixe = (widgets: BoardWidget[], prefixe: string) =>
  widgets.some((w) => w.type.startsWith(`${prefixe}.`));

/** Les éléments d'un contexte, ou tous (« all ») ; « null » tant qu'ils ne sont pas lus. */
const duContexte = <T extends { context_id: Id | null }>(
  elements: T[] | null,
  contexte: string,
): T[] | null =>
  elements && contexte !== "all"
    ? elements.filter((e) => String(e.context_id) === contexte)
    : elements;

export default function App() {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  // La connexion par Microsoft est possible : l'application Entra est renseignée.
  const [entraPret, setEntraPret] = useState(false);
  // Ce que le retour d'une connexion Microsoft a apporté comme erreur.
  const [erreurConnexion, setErreurConnexion] = useState<string | null>(null);

  // Les types de jalons des réglages : un projet en choisit un.
  const [milestoneTypes, setMilestoneTypes] = useState<MilestoneType[]>([]);
  const [users, setUsers] = useState<PublicUser[]>([]);

  // Les vues, dans l'ordre que le compte a rangé, et celle qui est ouverte.
  const [views, setViews] = useState<View[] | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);
  // La vue d'ouverture s'applique une fois, à l'ouverture de la session.
  const vueAppliquee = useRef<number | null>(null);
  // Les tableaux de la vue ouverte, et celui qui est ouvert.
  const [boardsLus, setBoardsLus] = useState<LuPour<Board> | null>(null);
  const [boardId, setBoardId] = useState<string | null>(null);
  // Ce que le tableau ouvert porte : ses sections, ses widgets.
  const [sectionsLues, setSectionsLues] = useState<LuPour<IndicatorSection> | null>(null);
  const [widgetsLus, setWidgetsLus] = useState<LuPour<BoardWidget> | null>(null);
  // Ses données : ses projets, ses listes, les demandes et les postes de sa
  // société. Chacune porte le tableau qui a servi à la lire.
  const [projectsLus, setProjectsLus] = useState<LuPour<Project> | null>(null);
  // Les comptes acteurs d'au moins un projet du tableau : les seuls que le
  // filtre « Acteurs » propose.
  const [projectActorIds, setProjectActorIds] = useState<number[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [projectLabelsLues, setProjectLabelsLues] = useState<LuPour<ProjectLabel> | null>(null);
  const [taskListsLues, setTaskListsLues] = useState<LuPour<TaskList> | null>(null);
  const [labelsLues, setLabelsLues] = useState<LuPour<Label> | null>(null);
  const [supportLues, setSupportLues] = useState<LuPour<SupportRequest> | null>(null);
  const [assetsLus, setAssetsLus] = useState<LuPour<Asset> | null>(null);

  // « Modifier l'interface » vaut pour toute l'application : tous les
  // tableaux, toutes les vues. Il ne vit que dans cette fenêtre, qui s'ouvre
  // hors modification ; I ou le clic droit sur le fond le basculent.
  const [enModification, setEnModification] = useState(false);
  const basculerModification = () => setEnModification((avant) => !avant);
  // Le menu du clic droit sur le fond de l'application, et la fenêtre
  // d'export ou d'import de la disposition du tableau ouvert.
  const fond = useRef<HTMLDivElement>(null);
  const [menuFond, setMenuFond] = useState<PointMenuPosition | null>(null);
  const [disposition, setDisposition] = useState<"export" | "import" | null>(null);

  // Les filtres de la liste des projets.
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [actorFilter, setActorFilter] = useState("all");

  // Les droits du compte. Le serveur les vérifie ; ici, ils taisent ce qu'on
  // ne voit pas et retirent ce qu'on ne peut pas faire.
  const peut = useMemo(() => peutAvec(user?.rights ?? {}), [user]);
  // Organiser les vues et les tableaux partagés demande de pouvoir modifier
  // au moins un type de widget (comme le serveur, lib/droits.ts).
  const peutOrganiser = Object.values(user?.widgets ?? {}).some((a) => a === "update");

  // Lectures en cours. Un écran vide est une conclusion : on ne la tire
  // jamais pendant une lecture.
  const [lectures, setLectures] = useState(0);
  const chargement = lectures > 0;
  const lire = useCallback(async <T,>(lecture: () => Promise<T>): Promise<T> => {
    setLectures((n) => n + 1);
    try {
      return await lecture();
    } finally {
      setLectures((n) => n - 1);
    }
  }, []);

  const boards = boardsLus?.cle === viewId ? boardsLus.items : null;
  const board = boards?.find((b) => String(b.id) === boardId) ?? null;
  const sections = sectionsLues?.cle === boardId ? sectionsLues.items : null;
  const widgets = useMemo(
    () => (widgetsLus?.cle === boardId ? widgetsLus.items : []),
    [widgetsLus, boardId],
  );
  const projects = projectsLus?.cle === boardId ? projectsLus.items : null;
  const projectLabels = projectLabelsLues?.cle === boardId ? projectLabelsLues.items : [];
  const taskLists = taskListsLues?.cle === boardId ? taskListsLues.items : null;
  const labels = labelsLues?.cle === boardId ? labelsLues.items : [];
  const supportRequests = supportLues?.cle === boardId ? supportLues.items : null;
  const assets = assetsLus?.cle === boardId ? assetsLus.items : null;

  // Ce que les widgets du tableau ouvert demandent à lire.
  const besoinProjets = avecPrefixe(widgets, "project");
  const besoinTaches = avecPrefixe(widgets, "task");
  const besoinSupport = avecPrefixe(widgets, "support");
  const besoinAssets = avecPrefixe(widgets, "asset");
  // Le contexte que ce compte regarde dans le tableau ouvert, ou « all ».
  const contexteChoisi = board?.context_id ? String(board.context_id) : "all";
  const contextes = board?.contexts ?? [];
  // Les cartes du contexte choisi ; les séparateurs, qui tranchent pour tous,
  // restent. Gardé d'un rendu à l'autre : le tableau des tâches oublie son
  // ordre provisoire quand ses listes changent.
  const tachesVues = useMemo(
    () =>
      taskLists && contexteChoisi !== "all"
        ? taskLists.map((l) => ({
            ...l,
            cards: l.cards.filter(
              (c) => c.kind === "separator" || String(c.context_id) === contexteChoisi,
            ),
          }))
        : taskLists,
    [taskLists, contexteChoisi],
  );
  // Les projets, les demandes et les postes du contexte choisi, filtrés ici :
  // la page les a lus pour tout le tableau.
  const projetsVus = useMemo(
    () => duContexte(projects, contexteChoisi),
    [projects, contexteChoisi],
  );
  const demandesVues = useMemo(
    () => duContexte(supportRequests, contexteChoisi),
    [supportRequests, contexteChoisi],
  );
  const postesVus = useMemo(() => duContexte(assets, contexteChoisi), [assets, contexteChoisi]);

  const [drawerOpened, setDrawerOpened] = useState(false);
  /** Le widget de liste d'où l'on ajoute un projet ou une demande ; vide sinon. */
  const [listeDeLAjout, setListeDeLAjout] = useState("");
  // Le tableau dont on gère les catégories, et la fenêtre des types de jalons.
  // Le tableau dont on copie les contextes vers un autre, depuis le menu de
  // son onglet.
  const [copieContextes, setCopieContextes] = useState<Id | null>(null);
  // Les étiquettes et les catégories copiées depuis le menu « Actions » du
  // widget d'un tableau, en attente d'être collées dans un autre.
  const [pressePapiers, setPressePapiers] = useState<PressePapiers>({});
  const [collages, setCollages] = useState(0);
  const [assetDrawerOpened, setAssetDrawerOpened] = useState(false);
  const [openedAsset, setOpenedAsset] = useState<Asset | null>(null);
  const [supportDrawerOpened, setSupportDrawerOpened] = useState(false);
  const [editedSupportRequest, setEditedSupportRequest] = useState<SupportRequest | null>(null);
  // L'objet d'une demande créée depuis un lien ; « null » pour une demande
  // créée depuis une liste de demandes, qui part vide.
  const [objetDemandeAcces, setObjetDemandeAcces] = useState<string | null>(null);
  const [settingsOpened, setSettingsOpened] = useState(false);
  const [preferencesOpened, setPreferencesOpened] = useState(false);
  // Le tiroir des notifications, et ce qui le fait se relire.
  const [notificationsOpened, setNotificationsOpened] = useState(false);
  const [notificationsRevision, setNotificationsRevision] = useState(0);
  // « Créer une tâche » depuis un autre élément : d'où elle part.
  const [tacheSource, setTacheSource] = useState<TacheSource | null>(null);
  // Dernière version de données connue, pour détecter les modifications
  // faites par quelqu'un d'autre.
  const versionsConnues = useRef<ResourceVersions | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [follows, setFollows] = useState<Follows>(emptyFollows());
  // Carte désignée par l'adresse, en attente que son tableau soit lu.
  const [carteAOuvrir, setCarteAOuvrir] = useState<number | null>(null);
  // Carte dont le tiroir est ouvert : c'est elle que l'adresse porte.
  const [carteAffichee, setCarteAffichee] = useState<number | null>(null);
  const [movedProject, setMovedProject] = useState<{
    project: Project;
    mode: ProjectAction;
  } | null>(null);
  const [deletedProject, setDeletedProject] = useState<Project | null>(null);

  // --- Session ---------------------------------------------------------------

  // Vérifie la session au démarrage.
  useEffect(() => {
    const check = async () => {
      // Le retour de Microsoft porte la session, ou l'erreur, dans le
      // fragment de l'adresse : on le lit, puis on l'efface de la barre
      // d'adresse — un jeton n'a rien à faire dans l'historique.
      const retour = new URLSearchParams(window.location.hash.slice(1));
      if (retour.has("token") || retour.has("auth_error")) {
        const jeton = retour.get("token");
        if (jeton) setToken(jeton);
        setErreurConnexion(retour.get("auth_error"));
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
      }

      // Seul un refus du serveur ferme la session. Un serveur qui redémarre
      // ou un réseau coupé ne dit rien du jeton : on le garde et on réessaie.
      for (;;) {
        try {
          const { needs_setup, entra } = await api.getSetupState();
          setEntraPret(entra);
          if (needs_setup) {
            setNeedsSetup(true);
          } else if (getToken()) {
            setUser(await api.me());
          }
          break;
        } catch (erreur) {
          if (erreur instanceof HttpError && erreur.status === 401) {
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
    const racine = document.documentElement;
    if (debug) {
      racine.setAttribute("data-milo-debug", "");
      return () => racine.removeAttribute("data-milo-debug");
    }
    const bloquer = (e: MouseEvent) => e.preventDefault();
    document.addEventListener("contextmenu", bloquer);
    return () => document.removeEventListener("contextmenu", bloquer);
  }, [debug]);

  // Session refusée par le serveur : retour à l'écran de connexion.
  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
  }, []);

  const handleAuthenticated = ({ token, user: account }: AuthResult) => {
    setToken(token);
    setUser(account);
    setNeedsSetup(false);
  };

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch {
      /* session déjà invalide côté serveur */
    }
    setToken(null);
    setUser(null);
    setProjectsLus(null);
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
    setViews(await lire(() => api.getViews()));
  }, [lire]);

  const loadBoards = useCallback(async () => {
    // Sans vue ouverte, il n'y a pas de tableaux à lire : ils restent
    // inconnus, et non « aucun ».
    if (!viewId) return setBoardsLus(null);
    const items = await lire(() => api.getBoards(viewId));
    setBoardsLus({ cle: viewId, items });
  }, [viewId, lire]);

  // Les sections et les widgets du tableau ouvert, d'un coup.
  const loadWidgets = useCallback(async () => {
    if (!boardId) {
      setSectionsLues(null);
      setWidgetsLus(null);
      return;
    }
    const [s, w] = await lire(() =>
      Promise.all([api.boardSections(boardId).all(), api.getBoardWidgets(boardId)]),
    );
    setSectionsLues({ cle: boardId, items: s });
    setWidgetsLus({ cle: boardId, items: w });
  }, [boardId, lire]);

  // Les projets du tableau, de tous ses contextes : le contexte choisi les
  // filtre ici (projetsVus), sans rien redemander au serveur — en changer
  // est immédiat. Il en va de même des demandes et des postes.
  const loadProjects = useCallback(async () => {
    if (!boardId || !besoinProjets) return setProjectsLus(null);
    const data = await lire(() =>
      api.getProjects({
        board: boardId,
        category: categoryFilter,
        status: statusFilter,
        actor: actorFilter,
      }),
    );
    setProjectsLus({ cle: boardId, items: data });
  }, [boardId, besoinProjets, categoryFilter, statusFilter, actorFilter, lire]);

  // Les acteurs que propose le filtre « Acteurs » : ceux des projets du
  // contexte choisi. Lus à part, ils ne retardent pas la liste.
  const loadActeursDesProjets = useCallback(async () => {
    if (!boardId || !besoinProjets) return setProjectActorIds([]);
    setProjectActorIds(await api.getProjectActorIds({ board: boardId, context: contexteChoisi }));
  }, [boardId, besoinProjets, contexteChoisi]);

  // Les catégories sont propres au tableau ouvert.
  const loadCategories = useCallback(async () => {
    if (!boardId || !besoinProjets) return setCategories([]);
    setCategories(await api.getCategories(boardId));
  }, [boardId, besoinProjets]);

  // Les étiquettes des projets et celles des cartes, propres au tableau.
  // Appelées avec un « patch », elles l'appliquent sur place, sans rien
  // demander au serveur : une étiquette recolorée se voit aussitôt.
  const loadProjectLabels = useCallback(
    async (patch?: { id: number; data: Partial<ProjectLabel> }) => {
      if (patch) {
        setProjectLabelsLues((l) =>
          l
            ? {
                ...l,
                items: l.items.map((e) => (e.id === patch.id ? { ...e, ...patch.data } : e)),
              }
            : l,
        );
        return;
      }
      if (!boardId || !besoinProjets) return setProjectLabelsLues(null);
      setProjectLabelsLues({
        cle: boardId,
        items: await api.getProjectLabels(boardId),
      });
    },
    [boardId, besoinProjets],
  );

  const loadLabels = useCallback(
    async (patch?: { id: number; data: Partial<Label> }) => {
      if (patch) {
        setLabelsLues((l) =>
          l
            ? {
                ...l,
                items: l.items.map((e) => (e.id === patch.id ? { ...e, ...patch.data } : e)),
              }
            : l,
        );
        return;
      }
      if (!boardId || !besoinTaches) return setLabelsLues(null);
      setLabelsLues({ cle: boardId, items: await api.getLabels(boardId) });
    },
    [boardId, besoinTaches],
  );

  const loadTaskLists = useCallback(async () => {
    if (!boardId || !besoinTaches) return setTaskListsLues(null);
    const items = await lire(() => api.getTaskLists(boardId));
    setTaskListsLues({ cle: boardId, items });
  }, [boardId, besoinTaches, lire]);

  // Les demandes du tableau, du contexte choisi — toutes, quel que soit leur
  // statut.
  const loadSupportRequests = useCallback(async () => {
    if (!boardId || !besoinSupport) return setSupportLues(null);
    const items = await lire(() => api.getSupportRequests(Number(boardId), "all"));
    setSupportLues({ cle: boardId, items });
  }, [boardId, besoinSupport, lire]);

  // Les postes du tableau, du contexte choisi.
  const loadAssets = useCallback(async () => {
    if (!boardId || !besoinAssets) return setAssetsLus(null);
    const items = await lire(() => api.getAssets(Number(boardId), "all"));
    setAssetsLus({ cle: boardId, items });
  }, [boardId, besoinAssets, lire]);

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
    if (user) loadActeursDesProjets().catch(() => {});
  }, [user, loadActeursDesProjets]);
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
    if (user && besoinSupport) api.syncSupportMail().catch(() => {});
  }, [user, besoinSupport, boardId]);

  // La vue d'ouverture, une fois la session ouverte : celle du compte, à
  // défaut la première.
  useEffect(() => {
    if (!user || !views || vueAppliquee.current === user.id) return;
    vueAppliquee.current = user.id;
    const voulue = views.find((v) => String(v.id) === user.default_view) ?? views[0];
    if (voulue) setViewId(String(voulue.id));
  }, [user, views]);

  // La vue ouverte doit exister : en supprimer une ramène sur la première.
  useEffect(() => {
    if (!views || vueAppliquee.current === null) return;
    if (!views.some((v) => String(v.id) === viewId))
      setViewId(views[0] ? String(views[0].id) : null);
  }, [views, viewId]);

  // Le tableau ouvert doit exister dans la vue : changer de vue, ou supprimer
  // un tableau, ramène sur le premier de la liste.
  useEffect(() => {
    if (!boards) return;
    const premier = boards[0];
    if (!premier) return setBoardId(null);
    if (!boards.some((b) => String(b.id) === boardId)) setBoardId(String(premier.id));
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
  const basculerSuivi = useCallback(
    async (kind: FollowKind, id: number) => {
      const suivi = follows[kind].includes(id);
      try {
        setFollows(suivi ? await api.unfollow(kind, id) : await api.follow(kind, id));
      } catch {
        /* le serveur a refusé : la case reste dans l'état qu'il connaît */
      }
    },
    [follows],
  );

  /** Se placer sur un tableau, où qu'il soit : sa vue d'abord. */
  const allerAuTableau = useCallback(async (id: Id) => {
    const tableau = await api.getBoard(id);
    setViewId(String(tableau.view_id));
    setBoardId(String(tableau.id));
  }, []);

  /**
   * Ouvre l'élément désigné, qu'il vienne de l'adresse, d'une notification ou
   * de la recherche. Une demande et un poste s'ouvrent sur place ; un projet,
   * une carte et un widget mènent d'abord à leur tableau.
   */
  const ouvrirCible = useCallback(
    async (cible: Cible) => {
      try {
        if (cible.kind === "support") {
          setEditedSupportRequest(await api.getSupportRequest(cible.id));
          setSupportDrawerOpened(true);
        } else if (cible.kind === "asset") {
          setOpenedAsset(await api.getAsset(cible.id));
          setAssetDrawerOpened(true);
        } else if (cible.kind === "project") {
          const projet = await api.getProject(cible.id);
          await allerAuTableau(projet.board_id);
          setSelectedProjectId(cible.id);
          setDrawerOpened(true);
        } else if (cible.kind === "access") {
          await allerAuTableau(cible.id);
        } else {
          // Une carte : c'est le tableau qui l'ouvrira, une fois ses listes lues.
          const ou = await api.getCardLocation(cible.id);
          setViewId(String(ou.view_id));
          setBoardId(String(ou.board_id));
          setCarteAOuvrir(cible.id);
        }
      } catch {
        /* élément supprimé entre-temps, ou devenu privé : il n'y a rien à ouvrir */
      }
    },
    [allerAuTableau],
  );

  /** Ce que la recherche a trouvé : un lien ouvre directement son adresse. */
  const ouvrirRecherche = useCallback(
    async (resultat: SearchResult) => {
      if (resultat.kind !== "access") return ouvrirCible({ kind: resultat.kind, id: resultat.id });
      if (resultat.url) {
        window.open(resultat.url, "_blank", "noopener");
        return;
      }
      if (resultat.board_id) return ouvrirCible({ kind: "access", id: resultat.board_id });
    },
    [ouvrirCible],
  );

  /** Ce qu'on voit quand un élément suivi change, chez quelqu'un d'autre. */
  const montrerNotification = useCallback(
    (avis: NotificationSuivi) => {
      notifications.show({
        id: avis.id,
        title: avis.title,
        icon: avis.deleted ? <IconTrash size={18} /> : <IconEye size={18} />,
        color: avis.deleted ? RED : "teal",
        autoClose: 10000,
        message: (
          <Stack gap={4}>
            <Text size="sm">
              {avis.author} {avis.message}
            </Text>
            {!avis.deleted && (
              <Anchor
                size="sm"
                onClick={() => {
                  notifications.hide(avis.id);
                  ouvrirCible({ kind: avis.kind, id: avis.target_id });
                }}
              >
                Ouvrir
              </Anchor>
            )}
          </Stack>
        ),
      });
    },
    [ouvrirCible],
  );

  // Flux d'événements : le serveur pousse ses compteurs dès qu'une écriture a
  // lieu, et le client ne relit que les jeux de données concernés. On consomme
  // le flux avec `fetch`, `EventSource` n'acceptant pas d'en-tête.
  useEffect(() => {
    if (!user) return undefined;

    let arrete = false;
    let controleur: AbortController | undefined;

    const lecteurs: Record<Resource, () => void | Promise<void>> = {
      lookups: loadLookups,
      views: loadViews,
      boards: loadBoards,
      "board-widgets": loadWidgets,
      categories: loadCategories,
      projects: async () => {
        await Promise.all([loadProjects(), loadActeursDesProjets()]);
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

    const appliquer = async (message: FluxMessage) => {
      if (estNotification(message)) {
        montrerNotification(message.notification);
        setNotificationsRevision((r) => r + 1);
        return;
      }
      const { versions } = message;
      // Premier message : les compteurs servent de référence, sans rien relire.
      const connues = versionsConnues.current;
      versionsConnues.current = versions;
      if (connues === null) return;
      const bouges = RESOURCES.filter((r) => versions[r] !== connues[r]);
      await Promise.all(bouges.map((r) => lecteurs[r]()));
    };

    const ecouter = async () => {
      while (!arrete) {
        try {
          controleur = new AbortController();
          const reponse = await fetch("/api/events", {
            headers: { Authorization: `Bearer ${getToken()}` },
            signal: controleur.signal,
          });
          if (!reponse.ok || !reponse.body) throw new Error("flux indisponible");
          const lecteur = reponse.body.getReader();
          const decodeur = new TextDecoder();
          let tampon = "";
          while (!arrete) {
            const { done, value } = await lecteur.read();
            if (done) break;
            tampon += decodeur.decode(value, { stream: true });
            // Les événements sont séparés par une ligne vide.
            const morceaux = tampon.split("\n\n");
            tampon = morceaux.pop() ?? "";
            for (const morceau of morceaux) {
              const ligne = morceau.split("\n").find((l) => l.startsWith("data:"));
              if (!ligne) continue; // commentaire de maintien de connexion
              let message: FluxMessage;
              try {
                message = JSON.parse(ligne.slice(5)) as FluxMessage;
              } catch {
                continue;
              }
              await appliquer(message);
            }
          }
        } catch {
          /* connexion perdue : nouvelle tentative après une courte pause */
        }
        // Ce qui a changé pendant la coupure est inconnu : le premier message
        // du flux repris servira de nouvelle référence.
        versionsConnues.current = null;
        if (!arrete) await new Promise((resoudre) => setTimeout(resoudre, 2000));
      }
    };

    ecouter();
    return () => {
      arrete = true;
      controleur?.abort();
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
    montrerNotification,
  ]);

  // --- Gestes ------------------------------------------------------------------

  // Un réglage refusé par le serveur : le menu s'est refermé, la raison se dit
  // en notification.
  const signalerRefus = (e: unknown) => notifierErreur(messageErreur(e), "Modification refusée");

  /** Écrire, signaler un refus, puis relire quoi qu'il arrive. */
  const ecrire = async (ecriture: () => Promise<unknown>, relire: () => Promise<unknown>) => {
    try {
      await ecriture();
    } catch (e) {
      signalerRefus(e);
    } finally {
      await relire();
    }
  };

  const changerDeVue = useCallback((id: string) => {
    setViewId(id);
    setBoardId(null);
  }, []);

  // La vue et le tableau qu'on vient de créer : leur nom passe aussitôt en
  // saisie, dès qu'ils paraissent.
  const [vueARenommer, setVueARenommer] = useState<number | null>(null);
  const [tableauARenommer, setTableauARenommer] = useState<number | null>(null);

  // Le « + » des vues crée aussitôt « Nouvelle vue », avec son premier
  // tableau, et l'ouvre : son nom se tape ensuite sur place.
  const creerVue = async () => {
    try {
      const { view, board: premier } = await api.createView("Nouvelle vue");
      await loadViews();
      setViewId(String(view.id));
      setBoardId(String(premier.id));
      setVueARenommer(view.id);
    } catch (e) {
      signalerRefus(e);
    }
  };

  const vueDe = (id: Id) => views?.find((v) => v.id === id);

  const addBoard = async () => {
    if (!viewId) return;
    try {
      // « Nouveau tableau », ouvert aussitôt : son nom se tape sur place.
      const cree = await api.createBoard(viewId, "Nouveau tableau");
      await loadBoards();
      setBoardId(String(cree.id));
      setTableauARenommer(cree.id);
    } catch (e) {
      signalerRefus(e);
    }
  };

  const boardDe = (id: Id) => boards?.find((b) => b.id === id);

  /** Le tableau tel que le serveur vient de le rendre, à sa place. */
  const poserTableau = (suivant: Board) =>
    setBoardsLus((avant) =>
      avant
        ? {
            ...avant,
            items: avant.items.map((b) => (b.id === suivant.id ? suivant : b)),
          }
        : avant,
    );

  // Le contexte qu'on regarde dans le tableau ouvert : choisi pour soi, il se
  // voit aussitôt et se retrouve à la prochaine visite.
  const changerContexte = (valeur: string) => {
    if (!board) return;
    const contextId = valeur === "all" ? null : Number(valeur);
    poserTableau({ ...board, context_id: contextId });
    void ecrire(() => api.selectContext(board.id, contextId), loadBoards);
  };

  // Les contextes du tableau ouvert : chaque écriture rend le tableau à jour.
  const ecrireContextes = (ecriture: () => Promise<Board>) =>
    ecrire(
      async () => poserTableau(await ecriture()),
      async () => {
        await loadBoards();
      },
    );
  const gestionDesContextes =
    board && peutOrganiser
      ? {
          onAdd: (name: string) => ecrireContextes(() => api.addContext(board.id, name)),
          onRename: (id: Id, name: string) => ecrireContextes(() => api.renameContext(id, name)),
          onRenameAll: (name: string) =>
            ecrireContextes(() => api.updateBoard(board.id, { all_contexts_label: name })),
          onDelete: async (id: Id) => {
            await ecrireContextes(() => api.deleteContext(id));
            await Promise.all([
              loadProjects(),
              loadTaskLists(),
              loadSupportRequests(),
              loadAssets(),
            ]);
          },
          onReorder: (ids: Id[]) => {
            poserTableau({
              ...board,
              contexts: ids
                .map((id) => board.contexts.find((c) => c.id === id))
                .filter((c): c is NonNullable<typeof c> => Boolean(c)),
            });
            return ecrireContextes(() => api.reorderContexts(board.id, ids));
          },
        }
      : undefined;

  // « Hérité » d'un tableau : le décocher (confirmé par le menu) part d'une
  // copie de sa structure partagée, le recocher efface la sienne.
  const basculerHerite = async (id: Id) => {
    const tableau = boardDe(id);
    if (!tableau) return;
    await ecrire(
      () => api.boardSections(id).setLayout(tableau.inherited === false),
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
    setListeDeLAjout(listKey);
    setSelectedProjectId(null);
    setDrawerOpened(true);
  }, []);

  const openNewSupportRequest = useCallback((listKey = "") => {
    setListeDeLAjout(listKey);
    setObjetDemandeAcces(null);
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
      const saisieDeTexte =
        el &&
        (el.tagName === "TEXTAREA" ||
          el.isContentEditable ||
          (el.tagName === "INPUT" && !(el as HTMLInputElement).readOnly));
      if (saisieDeTexte) return;

      if (event.code === "Tab" && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
        event.preventDefault();
        const liste = event.altKey
          ? (boards ?? []).map((b) => String(b.id))
          : (views ?? []).map((v) => String(v.id));
        if (!liste.length) return;
        const courant = event.altKey ? boardId : viewId;
        const suivant = liste[(liste.indexOf(courant ?? "") + 1) % liste.length]!;
        if (event.altKey) setBoardId(suivant);
        else changerDeVue(suivant);
        return;
      }

      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;

      if (event.code === "KeyN") {
        if (widgets.some((w) => w.type === "project.list") && peut("projects", "create")) {
          event.preventDefault();
          handleOpenNewProject();
        } else if (widgets.some((w) => w.type === "support.list") && peut("support", "create")) {
          event.preventDefault();
          openNewSupportRequest();
        }
        return;
      }

      if (event.code === "KeyI") {
        event.preventDefault();
        basculerModification();
        return;
      }

      if (event.code === "KeyS" && board) {
        event.preventDefault();
        const valeurs = ["all", ...contextes.map((c) => String(c.id))];
        changerContexte(valeurs[(valeurs.indexOf(contexteChoisi) + 1) % valeurs.length]!);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  /**
   * Ce que l'adresse désignait à l'arrivée, ouvert une fois la session ouverte.
   */
  const adresseLue = useRef(false);
  useEffect(() => {
    if (!user || adresseLue.current) return;
    adresseLue.current = true;
    const cible = cibleDeLAdresse();
    if (cible) ouvrirCible(cible);
  }, [user, ouvrirCible]);

  // L'adresse suit ce qui est ouvert, pour qu'un rechargement le retrouve.
  useEffect(() => {
    if (drawerOpened && selectedProjectId) {
      noterDansLAdresse({ kind: "project", id: selectedProjectId });
    } else if (carteAffichee) {
      noterDansLAdresse({ kind: "card", id: carteAffichee });
    } else {
      noterDansLAdresse(null);
    }
  }, [drawerOpened, selectedProjectId, carteAffichee]);

  /** Le tableau rapporte la carte ouverte : l'adresse la suit, la demande est servie. */
  const handleCarteOuverte = useCallback((id: number | null) => {
    setCarteAffichee(id);
    setCarteAOuvrir(null);
  }, []);

  const handleOpenProject = (project: Project) => {
    setSelectedProjectId(project.id);
    setDrawerOpened(true);
  };

  // La copie reste dans le tableau de l'original, sous « … (copie) », et
  // s'ouvre aussitôt.
  const duplicateProject = async (project: Project) => {
    try {
      const copieProjet = await api.copyProject(project.id, {
        name: `${project.name} (copie)`,
      });
      handleOpenProject(copieProjet);
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
    const projet = deletedProject;
    setDeletedProject(null);
    if (!projet) return;
    try {
      await api.deleteProject(projet.id);
    } finally {
      await loadProjects();
    }
  };

  // Depuis un lien : la demande prend son titre pour objet, et naît
  // « Nouveau », dans le contexte choisi du tableau.
  const openSupportRequestFromLink = (widget: BoardWidget) => {
    if (!board) return;
    setObjetDemandeAcces(sourceAcces(widget, board.id).title);
    setEditedSupportRequest(null);
    setSupportDrawerOpened(true);
  };

  // Depuis un poste : la demande prend son nom pour objet.
  const openSupportRequestFromAsset = (poste: Asset) => {
    setObjetDemandeAcces(sourcePoste(poste).title);
    setEditedSupportRequest(null);
    setSupportDrawerOpened(true);
  };

  if (!authChecked) return null;
  if (!user)
    return (
      <LoginPage
        needsSetup={needsSetup}
        entra={entraPret}
        initialError={erreurConnexion}
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
    contextes: board
      ? {
          items: contextes,
          tous: board.all_contexts_label,
          value: contexteChoisi,
          onChange: changerContexte,
          // Hors modification, le tableau garde ses contextes : on les choisit
          // seulement, sans les ajouter, renommer, ranger ni supprimer.
          gestion: enModification ? gestionDesContextes : undefined,
        }
      : undefined,
    onOpenSettings: () => setSettingsOpened(true),
    user,
    onLogout: handleLogout,
    onOpenPreferences: () => setPreferencesOpened(true),
    onOpenNotifications: () => setNotificationsOpened(true),
    onSearchOpen: ouvrirRecherche,
  };

  // Le tableau ouvert est figé : hors modification de l'interface, ou — sur sa
  // structure partagée — faute de pouvoir l'organiser. Sa propre structure
  // (« Hérité » décoché) n'est qu'à soi.
  const herite = board?.inherited !== false;
  const fige = boardId ? !enModification || (herite && !peutOrganiser) : true;
  // Hors modification, les onglets sont figés aussi : ni les tableaux ni les
  // vues ne se glissent, ni ne s'ajoutent.
  const ongletsFiges = !enModification;
  // La structure du tableau ouvert se remplace par un import : il faut
  // pouvoir y toucher, comme pour la modifier.
  const dispositionModifiable = Boolean(board) && !(herite && !peutOrganiser);
  // Les tableaux tels que cette fenêtre les montre : leur verrou est le sien.
  const tableauxAffiches =
    boards?.map((b) => ({
      ...b,
      is_locked: enModification ? (0 as const) : (1 as const),
    })) ?? null;
  const creerTache = peut("tasks", "create");
  // La demande naît dans le tableau ouvert : sans widget « Demandes de
  // support » pour la montrer, on ne la propose pas.
  const creerDemande =
    peut("support", "create") && widgets.some((w) => w.type === "support.list");
  const nomDuTableau = (id: Id) => boards?.find((b) => b.id === id)?.name;

  return (
    <DroitsProvider rights={user.rights} widgets={user.widgets} parametrage={user.settings.update}>
      <EditionContext.Provider value={enModification}>
        <ReferencesContext.Provider
          value={{
            contexts: contextes,
            assetTags: [...new Set((assets ?? []).map((a) => a.tag).filter(Boolean))].sort(),
          }}
        >
          {/* Le presse-papiers des étiquettes et des catégories, que le menu
            « Actions » du tiroir d'un widget remplit et vide dans un autre. */}
          <CopierCollerContext.Provider
            value={{
              board: board && { id: board.id, name: board.name },
              pressePapiers,
              onCopier: (cle, copie) => setPressePapiers((avant) => ({ ...avant, [cle]: copie })),
              collages,
              onColle: () => setCollages((n) => n + 1),
            }}
          >
            <Stack
              ref={fond}
              gap={0}
              h="100vh"
              // Le clic droit sur le fond : ce qu'aucun élément — onglet, widget,
              // section, ligne — n'a pris pour son propre menu. Une saisie garde
              // celui du navigateur, pour copier et coller ; une fenêtre ou un
              // tiroir, portés hors de la page, ne l'ouvrent pas.
              onContextMenu={(e) => {
                const cible = e.target as HTMLElement;
                if (e.defaultPrevented || !fond.current?.contains(cible)) return;
                if (cible.closest("input, textarea, [contenteditable='true']")) return;
                setMenuFond(positionDuMenu(e));
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
                    boards={tableauxAffiches}
                    boardId={boardId}
                    onBoardChange={setBoardId}
                    // Hors modification, ni « + » de tableau, ni de vue (ongletsFiges).
                    onAddBoard={peutOrganiser && !ongletsFiges ? addBoard : undefined}
                    aRenommer={tableauARenommer}
                    onRenommageOuvert={() => setTableauARenommer(null)}
                    // Renommer, supprimer, rendre privé ou hérité : en
                    // modification seulement.
                    onRenameBoard={
                      peutOrganiser && enModification
                        ? (id, name) => ecrire(() => api.updateBoard(id, { name }), loadBoards)
                        : undefined
                    }
                    onDeleteBoard={
                      peutOrganiser && enModification
                        ? (id) => ecrire(() => api.deleteBoard(id), loadBoards)
                        : undefined
                    }
                    onReorderBoards={
                      ongletsFiges
                        ? undefined
                        : (ids) => ecrire(() => api.reorderBoards(viewId, ids), loadBoards)
                    }
                    onTogglePrivateBoard={
                      peutOrganiser && enModification
                        ? (id) =>
                            ecrire(
                              () =>
                                api.updateBoard(id, {
                                  is_private: !boardDe(id)?.is_private,
                                }),
                              loadBoards,
                            )
                        : undefined
                    }
                    onToggleBoardInherited={enModification ? basculerHerite : undefined}
                    // Les contextes sont la structure commune du tableau : les
                    // copier demande de pouvoir organiser, et le mode édition —
                    // comme les ajouter ou les renommer.
                    onCopyContexts={peutOrganiser && enModification ? setCopieContextes : undefined}
                    sections={sections}
                    widgets={widgets}
                    onWidgetsChanged={loadWidgets}
                    locked={fige}
                    // Passer en modification n'a de sens que pour qui peut toucher à la
                    // structure qu'il regarde : faute de droit, rien ne se propose.
                    onUnlock={
                      boardId && !(herite && !peutOrganiser)
                        ? () => setEnModification(true)
                        : undefined
                    }
                    donnees={{
                      requests: demandesVues ?? [],
                      projects: projetsVus ?? [],
                      lists: tachesVues ?? [],
                      assets: postesVus ?? [],
                      userId: user.id,
                    }}
                    projets={{
                      projects: projetsVus,
                      loading: chargement,
                      onRowClick: handleOpenProject,
                      onMoveProject: (project, mode) => setMovedProject({ project, mode }),
                      onDuplicateProject: (project) => void duplicateProject(project),
                      onDeleteProject: setDeletedProject,
                      onCreateTask: (projet) =>
                        setTacheSource(sourceProjet(projet, nomDuTableau(projet.board_id))),
                      onAddProject: peut("projects", "create") ? handleOpenNewProject : undefined,
                      followedIds: follows.project,
                      onToggleFollow: (projet) => basculerSuivi("project", projet.id),
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
                    taches={{
                      boardId,
                      boards: tableauxAffiches ?? [],
                      lists: tachesVues ?? [],
                      loading: chargement,
                      onListsChanged: loadTaskLists,
                      labels,
                      users,
                      onLabelsChanged: loadLabels,
                      follows,
                      onToggleFollow: basculerSuivi,
                      carteAOuvrir,
                      onCarteOuverte: handleCarteOuverte,
                    }}
                    support={{
                      requests: demandesVues,
                      loading: chargement,
                      users,
                      onOpenRequest: (demande) => {
                        setEditedSupportRequest(demande);
                        setSupportDrawerOpened(true);
                      },
                      onAddRequest: peut("support", "create") ? openNewSupportRequest : undefined,
                      onCreateTask: creerTache
                        ? (demande) => setTacheSource(sourceDemande(demande))
                        : undefined,
                      onRequestsChanged: loadSupportRequests,
                      followedIds: follows.support,
                      onToggleFollow: (demande) => basculerSuivi("support", demande.id),
                    }}
                    assets={{
                      assets: postesVus,
                      loading: chargement,
                      onOpenAsset: (poste) => {
                        setOpenedAsset(poste);
                        setAssetDrawerOpened(true);
                      },
                      onCreateTask: creerTache
                        ? (poste) => setTacheSource(sourcePoste(poste))
                        : undefined,
                      onCreateSupportRequest: creerDemande
                        ? openSupportRequestFromAsset
                        : undefined,
                    }}
                    onCreateTaskFromLink={
                      creerTache && board
                        ? (widget) => setTacheSource(sourceAcces(widget, board.id, board.name))
                        : undefined
                    }
                    onCreateSupportFromLink={
                      creerDemande ? openSupportRequestFromLink : undefined
                    }
                    loading={chargement}
                    account={account}
                  />
                )}
              </Box>

              {menuFond && (
                <PointMenu position={menuFond} onClose={() => setMenuFond(null)}>
                  <Menu.Item
                    leftSection={
                      enModification ? <IconCheck size={16} /> : <IconLayoutDashboard size={16} />
                    }
                    onClick={basculerModification}
                  >
                    {enModification ? "Terminer la modification" : "Modifier l’interface"}
                  </Menu.Item>
                  {board && (
                    <>
                      <Menu.Divider />
                      <Menu.Item
                        leftSection={<IconFileExport size={16} />}
                        disabled={!sections?.length}
                        onClick={() => setDisposition("export")}
                      >
                        Exporter la disposition
                      </Menu.Item>
                      <Menu.Item
                        leftSection={<IconFileImport size={16} />}
                        disabled={!dispositionModifiable}
                        onClick={() => setDisposition("import")}
                      >
                        Importer la disposition
                      </Menu.Item>
                    </>
                  )}
                </PointMenu>
              )}

              <DispositionModal
                mode={disposition}
                onClose={() => setDisposition(null)}
                sections={sections ?? []}
                widgets={widgets}
                onImport={async (recue) => {
                  if (!board) return;
                  try {
                    const fait = await api.boardSections(board.id).importer(recue);
                    const notes = [
                      fait.ecartes > 0 &&
                        `${fait.ecartes} widget${fait.ecartes > 1 ? "s" : ""} écarté${fait.ecartes > 1 ? "s" : ""}`,
                      fait.gardes > 0 &&
                        `${fait.gardes} widget${fait.gardes > 1 ? "s" : ""} hors de vos droits conservé${fait.gardes > 1 ? "s" : ""}`,
                    ].filter(Boolean);
                    notifications.show({
                      title: "Disposition importée",
                      color: "teal",
                      message: `${fait.poses} widget${fait.poses > 1 ? "s" : ""} posé${fait.poses > 1 ? "s" : ""}${notes.length ? ` · ${notes.join(" · ")}` : ""}.`,
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

              {copieContextes !== null && (
                <CopyToBoardModal
                  opened
                  onClose={() => setCopieContextes(null)}
                  chose="contexts"
                  sourceId={copieContextes}
                  viewId={viewId}
                  onCopy={(cible, remplacer, renommer) =>
                    api.copyContexts(copieContextes, cible, remplacer, renommer)
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
                contexts={contextes}
                contextId={
                  contexteChoisi !== "all" ? contexteChoisi : String(contextes[0]?.id ?? "")
                }
                boardId={board?.id ?? null}
                listKey={listeDeLAjout}
                defaultStatus={DEFAULT_SUPPORT_STATUS}
                defaultSubject={objetDemandeAcces ?? ""}
                assignCurrentUser={objetDemandeAcces === null}
                users={users}
                currentUser={user}
                onSaved={async () => {
                  setSupportDrawerOpened(false);
                  await loadSupportRequests();
                }}
                onDeleted={async () => {
                  setSupportDrawerOpened(false);
                  await loadSupportRequests();
                }}
                suivi={
                  editedSupportRequest !== null && follows.support.includes(editedSupportRequest.id)
                }
                onToggleFollow={() => {
                  if (editedSupportRequest) basculerSuivi("support", editedSupportRequest.id);
                }}
              />

              <ProjectDrawer
                opened={drawerOpened}
                onClose={handleCloseDrawer}
                projectId={selectedProjectId}
                boardId={boardId}
                categories={categories}
                contexts={contextes}
                contextId={
                  contexteChoisi !== "all" ? contexteChoisi : String(contextes[0]?.id ?? "")
                }
                listKey={listeDeLAjout}
                milestoneTypes={milestoneTypes}
                users={users}
                labels={projectLabels}
                boards={boards ?? []}
                currentUser={user}
                onCategoriesChanged={loadCategories}
                onLabelsChanged={loadProjectLabels}
                onSaved={handleSaved}
                onDeleted={handleSaved}
                suivi={selectedProjectId !== null && follows.project.includes(selectedProjectId)}
                onToggleFollow={() => {
                  if (selectedProjectId !== null) basculerSuivi("project", selectedProjectId);
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
                onChange={changerDeVue}
                onReorder={
                  ongletsFiges ? undefined : (ids) => ecrire(() => api.reorderViews(ids), loadViews)
                }
                onCreate={peutOrganiser && !ongletsFiges ? creerVue : undefined}
                aRenommer={vueARenommer}
                onRenommageOuvert={() => setVueARenommer(null)}
                // Renommer, supprimer, rendre privée : en modification seulement.
                onRename={
                  peutOrganiser && enModification
                    ? (id, name) => ecrire(() => api.updateView(id, { name }), loadViews)
                    : undefined
                }
                onTogglePrivate={
                  peutOrganiser && enModification
                    ? (id) =>
                        ecrire(
                          () =>
                            api.updateView(id, {
                              is_private: !vueDe(id)?.is_private,
                            }),
                          loadViews,
                        )
                    : undefined
                }
                onDelete={
                  peutOrganiser && enModification
                    ? (id) => ecrire(() => api.deleteView(id), loadViews)
                    : undefined
                }
              />
              <ShortcutsHelp
                projets={widgets.some((w) => w.type === "project.list")}
                demandes={widgets.some((w) => w.type === "support.list")}
              />
              <CodeKonami />

              {/* « Créer une tâche » : la fiche d'une carte, vide, qui choisit où
                elle va. On reste où l'on est ; la notification mène à la tâche. */}
              <CardDrawer
                opened={tacheSource !== null}
                onClose={() => setTacheSource(null)}
                card={null}
                source={tacheSource}
                // Depuis un lien, la tâche naît sans membre : on la signale sans
                // s'en charger.
                currentUserId={tacheSource?.kind === "access" ? undefined : user?.id}
                labels={[]}
                users={users}
                boardId={null}
                onLabelsChanged={() => {}}
                onSaved={() => {}}
                suivie={false}
                onToggleFollow={() => {}}
                onCreated={(id) =>
                  notifications.show({
                    title: "Tâche créée",
                    color: "teal",
                    autoClose: 6000,
                    message: (
                      <Anchor size="sm" onClick={() => void ouvrirCible({ kind: "card", id })}>
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
                  void ouvrirCible({
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
          </CopierCollerContext.Provider>
        </ReferencesContext.Provider>
      </EditionContext.Provider>
    </DroitsProvider>
  );
}
