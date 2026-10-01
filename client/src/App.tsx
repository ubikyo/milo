import { Anchor, Box, Stack, Text } from "@mantine/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, setUnauthorizedHandler } from "./api";
import { getToken, setToken } from "./lib/auth";
import {
  BOTTOM_CLEARANCE,
  MODE_SWITCH_TOP,
  MODE_SWITCH_TOP_FALLBACK,
  PAGE_GUTTER,
} from "./themes/layout";
import LoginPage from "./pages/LoginPage";
import AccessPage from "./pages/AccessPage";
import NotificationsDrawer from "./components/notifications/NotificationsDrawer";
import CardDrawer from "./components/board/CardDrawer";
import type { TacheSource } from "./components/board/TaskDestination";
import { sourceAcces, sourceDemande, sourcePoste, sourceProjet } from "./lib/tache";
import AssetsPage from "./pages/AssetsPage";
import ProjectsPage from "./pages/ProjectsPage";
import SupportPage, { statutDeLOnglet } from "./pages/SupportPage";
import TasksPage from "./pages/TasksPage";
import { notifications } from "@mantine/notifications";
import { IconEye, IconTrash } from "@tabler/icons-react";
import { RED } from "./themes/colors";
import {
  DEFAULT_MODE,
  DEFAULT_SUPPORT_STATUS,
  MODES,
  RESOURCES,
  emptyFollows,
  emptyTabOrders,
  estNotification,
} from "@milo/shared";
import { societeDuNom } from "./lib/societe";
import { cibleDeLAdresse, noterDansLAdresse } from "./lib/suivi";
import { widgetDe } from "./widgets";
import type { AccessWidget } from "./widgets";
import type { Cible } from "./lib/suivi";
import AccessCategoryDrawer from "./components/access/AccessCategoryDrawer";
import AssetDrawer from "./components/assets/AssetDrawer";
import SupportRequestDrawer from "./components/support/SupportRequestDrawer";
import AccessBlockDrawer from "./components/access/AccessBlockDrawer";
import SectionDrawer from "./components/ui/SectionDrawer";
import WidgetPickerModal from "./components/ui/WidgetPickerModal";
import PreferencesModal from "./components/settings/PreferencesModal";
import BoardDrawer from "./components/board/BoardDrawer";
import type { AccountSlot } from "./components/ui/AccountControls";
import DeleteConfirmModal from "./components/ui/DeleteConfirmModal";
import MoveOrCopyProjectModal from "./components/project/MoveOrCopyProjectModal";
import type { ProjectAction } from "./components/project/MoveOrCopyProjectModal";
import ProjectBoardDrawer from "./components/project/ProjectBoardDrawer";
import ProjectDrawer from "./components/project/ProjectDrawer";
import ModeSwitch from "./components/ui/ModeSwitch";
import ShortcutsHelp from "./components/ui/ShortcutsHelp";
import SettingsModal from "./components/settings/SettingsModal";
import type {
  AccessBlock,
  AccessBlockType,
  AccessCategory,
  AccessSection,
  Asset,
  AssetIndicator,
  ProjectIndicator,
  TaskIndicator,
  IndicatorSection,
  AuthResult,
  Board,
  Category,
  Company,
  MilestoneType,
  Label,
  Mode,
  Project,
  ProjectBoard,
  ProjectLabel,
  PublicUser,
  FollowKind,
  Follows,
  Id,
  FluxMessage,
  Notification as NotificationSuivi,
  Resource,
  ResourceVersions,
  SupportIndicator,
  SupportRequest,
  TabOrderMode,
  TabOrders,
  TaskList,
  SearchResult,
} from "@milo/shared";

/**
 * Une liste lue, accompagnée de la sélection à laquelle elle répond : la
 * société pour les tableaux, le tableau pour les listes et les projets. On
 * sait donc dès le rendu si ce qu'on a en main concerne encore ce qui est
 * affiché — une remise à zéro par effet arriverait trop tard.
 */
interface LuPour<T> {
  /** La société ou le tableau qui a servi à la lire. */
  cle: string;
  items: T[];
}

export default function App() {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  // La connexion par Microsoft est possible : l'application Entra est renseignée.
  const [entraPret, setEntraPret] = useState(false);
  // Ce que le retour d'une connexion Microsoft a apporté comme erreur.
  const [erreurConnexion, setErreurConnexion] = useState<string | null>(null);

  const [categories, setCategories] = useState<Category[]>([]);
  // Les catégories du mode Accès : elles ne dépendent ni d'une société ni d'un
  // tableau, ce sont les onglets du mode.
  const [accessCategories, setAccessCategories] = useState<
    AccessCategory[] | null
  >(null);
  const [accessCategoryId, setAccessCategoryId] = useState<string | null>(null);
  // Les sections — les colonnes — de la catégorie ouverte. Comme ailleurs,
  // elles portent la catégorie qui a servi à les lire : celles d'une autre ne
  // valent pas pour celle-ci.
  const [accessSectionsLues, setAccessSectionsLues] =
    useState<LuPour<AccessSection> | null>(null);
  // Ce que les colonnes portent, lu d'un coup pour la catégorie ouverte.
  const [accessBlocsLus, setAccessBlocsLus] =
    useState<LuPour<AccessBlock> | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  // Les types de jalons des réglages : un projet en choisit un.
  const [milestoneTypes, setMilestoneTypes] = useState<MilestoneType[]>([]);
  const [users, setUsers] = useState<PublicUser[]>([]);
  // Chaque liste lue porte la sélection à laquelle elle répond : la société
  // pour les tableaux, le tableau pour les listes et les projets. On sait donc
  // dès le rendu si ce qu'on a en main concerne encore ce qui est affiché —
  // une remise à zéro par effet arriverait trop tard, elle ne s'exécute
  // qu'après l'affichage et l'écran vide du tableau précédent apparaîtrait le
  // temps d'une image.
  //
  // La liste dérivée vaut « null » tant qu'elle n'a pas été lue pour la
  // sélection courante, et « [] » quand elle est vide pour de bon.
  const [boardsLus, setBoardsLus] = useState<LuPour<Board> | null>(null);
  // Identifiant du tableau ouvert, en chaîne : c'est la valeur de l'onglet.
  const [boardId, setBoardId] = useState<string | null>(null);
  // Tableaux du mode Projet : ils ne dépendent d'aucune société.
  const [projectBoards, setProjectBoards] = useState<ProjectBoard[] | null>(
    null,
  );
  const [projectBoardId, setProjectBoardId] = useState<string | null>(null);
  const [taskListsLues, setTaskListsLues] = useState<LuPour<TaskList> | null>(
    null,
  );
  const [labelsLues, setLabelsLues] = useState<LuPour<Label> | null>(null);
  // Les étiquettes du mode Projet, lues de la même façon que celles des
  // cartes, mais rattachées au tableau de projets ouvert.
  const [projectLabelsLues, setProjectLabelsLues] =
    useState<LuPour<ProjectLabel> | null>(null);
  // Les demandes du mode Support et leurs étiquettes : les unes comme les
  // autres pendent à la société choisie dans l'entête.
  const [supportLues, setSupportLues] = useState<LuPour<SupportRequest> | null>(
    null,
  );
  // Les postes du mode Assets. Ils suivent la société choisie, « toutes »
  // comprise : contrairement au support, la liste a un sens sans société — un
  // poste dont le tag ne désigne rien n'apparaît que là.
  const [assetsLus, setAssetsLus] = useState<LuPour<Asset> | null>(null);
  /** L'ordre des onglets fixes (statuts du support, familles d'assets). */
  const [tabOrders, setTabOrders] = useState<TabOrders>(emptyTabOrders);
  const [supportIndicatorSections, setSupportIndicatorSections] = useState<
    IndicatorSection[] | null
  >(null);
  const [supportIndicators, setSupportIndicators] = useState<SupportIndicator[]>([]);
  const [supportIndicatorsLocked, setSupportIndicatorsLocked] = useState(false);
  const [assetIndicatorSections, setAssetIndicatorSections] = useState<
    IndicatorSection[] | null
  >(null);
  const [assetIndicators, setAssetIndicators] = useState<AssetIndicator[]>([]);
  const [assetIndicatorsLocked, setAssetIndicatorsLocked] = useState(false);
  // Les sections des modes Projet et Tâche, communes à tous les tableaux.
  const [projectIndicatorSections, setProjectIndicatorSections] = useState<
    IndicatorSection[] | null
  >(null);
  const [projectIndicators, setProjectIndicators] = useState<ProjectIndicator[]>([]);
  const [projectIndicatorsLocked, setProjectIndicatorsLocked] = useState(false);
  const [taskIndicatorSections, setTaskIndicatorSections] = useState<IndicatorSection[] | null>(
    null,
  );
  const [taskIndicators, setTaskIndicators] = useState<TaskIndicator[]>([]);
  const [taskIndicatorsLocked, setTaskIndicatorsLocked] = useState(false);
  // « projects » ou « tasks ».
  const [mode, setMode] = useState<Mode>(DEFAULT_MODE);
  // Le mode d'ouverture est un réglage du compte : il s'applique une fois, à
  // l'ouverture de la session, et non aux changements de mode qui suivent.
  const modeApplique = useRef<number | null>(null);
  const [projectsLus, setProjectsLus] = useState<LuPour<Project> | null>(null);
  // Les comptes acteurs d'au moins un projet du tableau : les seuls que le
  // filtre « Acteurs » propose. Relus avec les projets, qu'un acteur ajouté
  // ou retiré y paraisse aussitôt.
  const [projectActorIds, setProjectActorIds] = useState<number[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("all");
  // « Toutes les sociétés » par défaut ; le mode Tâche impose ensuite une
  // société précise.
  const [companyFilter, setCompanyFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [actorFilter, setActorFilter] = useState("all");

  // Lectures en cours, par vue. Un écran vide est une conclusion : on ne la
  // tire jamais pendant une lecture, on n'affiche rien en attendant. Un
  // compteur et non un booléen, car deux lectures se chevauchent (les tableaux
  // puis leur contenu).
  const [lecturesTaches, setLecturesTaches] = useState(0);
  const [lecturesProjets, setLecturesProjets] = useState(0);
  const [lecturesAcces, setLecturesAcces] = useState(0);
  const [lecturesSupport, setLecturesSupport] = useState(0);
  const [lecturesAssets, setLecturesAssets] = useState(0);
  const chargementTaches = lecturesTaches > 0;
  const chargementProjets = lecturesProjets > 0;
  const chargementAcces = lecturesAcces > 0;
  const chargementSupport = lecturesSupport > 0;
  const chargementAssets = lecturesAssets > 0;

  const boards = boardsLus?.cle === companyFilter ? boardsLus.items : null;
  const taskLists = taskListsLues?.cle === boardId ? taskListsLues.items : null;
  // Les étiquettes d'un autre tableau ne valent pas pour celui-ci : tant que
  // les siennes ne sont pas lues, il n'en a aucune.
  const labels = labelsLues?.cle === boardId ? labelsLues.items : [];
  const projectLabels =
    projectLabelsLues?.cle === projectBoardId ? projectLabelsLues.items : [];
  const projects =
    projectsLus?.cle === projectBoardId ? projectsLus.items : null;
  // Les demandes d'une autre société ne valent pas pour celle-ci : tant que les
  // siennes ne sont pas lues, elles restent inconnues.
  const supportRequests =
    supportLues?.cle === companyFilter ? supportLues.items : null;
  const assets = assetsLus?.cle === companyFilter ? assetsLus.items : null;
  const accessSections =
    accessSectionsLues?.cle === accessCategoryId
      ? accessSectionsLues.items
      : null;
  const accessBlocks =
    accessBlocsLus?.cle === accessCategoryId ? accessBlocsLus.items : [];

  const [drawerOpened, setDrawerOpened] = useState(false);
  // Tiroir des tableaux : « null » à la création, le tableau visé sinon.
  const [boardDrawerOpened, setBoardDrawerOpened] = useState(false);
  const [editedBoard, setEditedBoard] = useState<Board | null>(null);
  const [projectBoardDrawerOpened, setProjectBoardDrawerOpened] =
    useState(false);
  const [editedProjectBoard, setEditedProjectBoard] =
    useState<ProjectBoard | null>(null);
  // Tiroir d'une demande de support : « null » à la création, la demande visée
  // sinon. L'onglet ouvert dit le statut que prend une demande créée là.
  // Le poste ouvert. Rien ne s'y modifie : le tiroir lit, et se referme.
  const [assetDrawerOpened, setAssetDrawerOpened] = useState(false);
  const [openedAsset, setOpenedAsset] = useState<Asset | null>(null);
  const [supportDrawerOpened, setSupportDrawerOpened] = useState(false);
  const [editedSupportRequest, setEditedSupportRequest] =
    useState<SupportRequest | null>(null);
  const [supportStatusTab, setSupportStatusTab] = useState("all");
  // L'objet d'une demande créée depuis un lien du mode Accès ; « null » pour
  // une demande créée depuis le mode Support, qui part vide.
  const [objetDemandeAcces, setObjetDemandeAcces] = useState<string | null>(null);
  // La société qu'on devine au nom de la catégorie d'accès ; « null » quand
  // rien ne s'impose, et la proposition habituelle reprend la main.
  const [societeDemandeAcces, setSocieteDemandeAcces] = useState<string | null>(null);
  // Tiroir des catégories d'accès : « null » à la création, la catégorie visée sinon.
  const [accessDrawerOpened, setAccessDrawerOpened] = useState(false);
  const [editedAccessCategory, setEditedAccessCategory] =
    useState<AccessCategory | null>(null);
  // Tiroir des sections : même règle, « null » à la création.
  const [sectionDrawerOpened, setSectionDrawerOpened] = useState(false);
  const [editedAccessSection, setEditedAccessSection] =
    useState<AccessSection | null>(null);
  const [sectionInsertAt, setSectionInsertAt] = useState<number | null>(null);
  // La section dont la zone en pointillé vient d'être cliquée : c'est elle qui
  // accueillera l'élément choisi dans la boîte.
  const [sectionPourBloc, setSectionPourBloc] = useState<AccessSection | null>(
    null,
  );
  // Tiroir d'un élément : celui qu'on vient de créer, ou celui qu'on rouvre.
  const [editedAccessBlock, setEditedAccessBlock] =
    useState<AccessBlock | null>(null);
  const [settingsOpened, setSettingsOpened] = useState(false);
  const [preferencesOpened, setPreferencesOpened] = useState(false);
  // Le tiroir des notifications, et ce qui le fait se relire : chaque
  // notification reçue fait avancer le compteur.
  const [notificationsOpened, setNotificationsOpened] = useState(false);
  const [notificationsRevision, setNotificationsRevision] = useState(0);
  // « Créer une tâche », depuis le menu contextuel d'un autre mode : l'élément
  // d'où elle part, ou « null » quand la fenêtre est fermée.
  const [tacheSource, setTacheSource] = useState<TacheSource | null>(null);
  // Dernière version de données connue, pour détecter les modifications
  // faites par quelqu'un d'autre.
  const versionsConnues = useRef<ResourceVersions | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(
    null,
  );
  // Ce que la personne suit. Chaque écriture rend la liste entière : elle se
  // lit une fois à l'ouverture de la session, puis suit les clics.
  const [follows, setFollows] = useState<Follows>(emptyFollows());
  // Carte désignée par l'adresse, en attente que son tableau soit lu : c'est
  // le tableau qui l'ouvrira, lui seul la connaît (TaskBoard).
  const [carteAOuvrir, setCarteAOuvrir] = useState<number | null>(null);
  // Carte dont le tiroir est ouvert, telle que le tableau la rapporte : c'est
  // elle que l'adresse porte.
  const [carteAffichee, setCarteAffichee] = useState<number | null>(null);
  // Projet visé par le menu de sa ligne : déplacement ou copie, ou suppression.
  const [movedProject, setMovedProject] = useState<{
    project: Project;
    mode: ProjectAction;
  } | null>(null);
  const [deletedProject, setDeletedProject] = useState<Project | null>(null);

  const loadProjects = useCallback(async () => {
    // Sans tableau ouvert, il n'y a rien à montrer : on ne demande pas au
    // serveur la totalité des projets, et la liste reste inconnue plutôt que
    // vide, sinon l'écran « aucun projet » apparaîtrait le temps du chargement.
    if (!projectBoardId) {
      setProjectsLus(null);
      setLoaded(true);
      return;
    }
    setLecturesProjets((n) => n + 1);
    try {
      const [data, acteurs] = await Promise.all([
        api.getProjects({
          board: projectBoardId,
          category: categoryFilter,
          company: companyFilter,
          status: statusFilter,
          actor: actorFilter,
        }),
        api.getProjectActorIds({ board: projectBoardId, company: companyFilter }),
      ]);
      setProjectsLus({ cle: projectBoardId, items: data });
      setProjectActorIds(acteurs);
    } finally {
      setLecturesProjets((n) => n - 1);
      setLoaded(true);
    }
  }, [
    projectBoardId,
    categoryFilter,
    companyFilter,
    statusFilter,
    actorFilter,
  ]);

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
        window.history.replaceState(
          null,
          "",
          window.location.pathname + window.location.search,
        );
      }

      try {
        const { needs_setup, entra } = await api.getSetupState();
        setEntraPret(entra);
        if (needs_setup) {
          setNeedsSetup(true);
        } else if (getToken()) {
          setUser(await api.me());
        }
      } catch {
        setToken(null);
      } finally {
        setAuthChecked(true);
      }
    };
    check();
  }, []);

  // Debug (Paramétrage › Développeur) : hors Debug, ni sélection du texte
  // (assets/styles/no-select.css) ni menu du navigateur au clic droit. Nos
  // propres menus contextuels, eux, s'ouvrent toujours : React les reçoit
  // avant que le document n'annule celui du navigateur. Avant la connexion,
  // le réglage n'est pas lu : l'interface s'en tient au défaut, éteint.
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
    setLoaded(false);
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
    setLoaded(false);
  };

  const loadLookups = useCallback(async () => {
    const [nextCompanies, nextUsers, nextMilestoneTypes] = await Promise.all([
      api.getCompanies(),
      api.getUsers(),
      api.getMilestoneTypes(),
    ]);
    setCompanies(nextCompanies);
    setUsers(nextUsers);
    setMilestoneTypes(nextMilestoneTypes);
  }, []);

  const loadAccessCategories = useCallback(async () => {
    setLecturesAcces((n) => n + 1);
    try {
      setAccessCategories(await api.getAccessCategories());
    } finally {
      setLecturesAcces((n) => n - 1);
    }
  }, []);

  // Les sections appartiennent à la catégorie ouverte : sans elle, il n'y a
  // rien à lire, et la liste reste inconnue plutôt que vide.
  const loadAccessSections = useCallback(async () => {
    if (!accessCategoryId) return setAccessSectionsLues(null);
    setLecturesAcces((n) => n + 1);
    try {
      const items = await api.getAccessSections(accessCategoryId);
      setAccessSectionsLues({ cle: accessCategoryId, items });
    } finally {
      setLecturesAcces((n) => n - 1);
    }
  }, [accessCategoryId]);

  // Les demandes de la société choisie : toutes, quel que soit leur statut.
  // Ce sont les onglets qui les rangent, et ils comptent ce que chacun montre.
  const loadSupportRequests = useCallback(async () => {
    // Sans société précise, il n'y a rien à lire : les demandes restent
    // inconnues, et non « aucune ».
    // « toutes » comprise : le serveur rend alors les demandes de toutes les
    // sociétés, et c'est la vue d'ouverture du mode.
    if (!companyFilter) return setSupportLues(null);
    setLecturesSupport((n) => n + 1);
    try {
      setSupportLues({
        cle: companyFilter,
        items: await api.getSupportRequests(companyFilter),
      });
    } finally {
      setLecturesSupport((n) => n - 1);
    }
  }, [companyFilter]);

  // Les postes, pour la société choisie. « Toutes » les montre tous : c'est la
  // seule façon de voir ceux qu'aucun tag ne rattache à une société.
  const loadAssets = useCallback(async () => {
    setLecturesAssets((n) => n + 1);
    try {
      setAssetsLus({
        cle: companyFilter,
        items: await api.getAssets(companyFilter),
      });
    } finally {
      setLecturesAssets((n) => n - 1);
    }
  }, [companyFilter]);

  // Les indicateurs du panneau des statistiques du Support : communs à toutes
  // les sociétés, ils se lisent une fois et se calculent sur la société choisie.
  const loadSupportIndicators = useCallback(async () => {
    const [sections, indicateurs, { locked }] = await Promise.all([
      api.supportIndicatorSections.all(),
      api.getSupportIndicators(),
      api.getSupportIndicatorsLock(),
    ]);
    setSupportIndicatorSections(sections);
    setSupportIndicators(indicateurs);
    setSupportIndicatorsLocked(locked);
  }, []);

  // Relu même en cas de refus : le menu montre alors ce qui est.
  const toggleSupportIndicatorsLock = async () => {
    try {
      await api.setSupportIndicatorsLock(!supportIndicatorsLocked);
    } finally {
      await loadSupportIndicators();
    }
  };

  // Ceux du panneau des Assets, de même : lus une fois, calculés sur les
  // postes de la société choisie.
  const loadAssetIndicators = useCallback(async () => {
    const [sections, indicateurs, { locked }] = await Promise.all([
      api.assetIndicatorSections.all(),
      api.getAssetIndicators(),
      api.getAssetIndicatorsLock(),
    ]);
    setAssetIndicatorSections(sections);
    setAssetIndicators(indicateurs);
    setAssetIndicatorsLocked(locked);
  }, []);


  const toggleAssetIndicatorsLock = async () => {
    try {
      await api.setAssetIndicatorsLock(!assetIndicatorsLocked);
    } finally {
      await loadAssetIndicators();
    }
  };

  // Les sections des modes Projet et Tâche, de même : lues une fois, leurs
  // widgets se calculent sur le tableau ouvert.
  const loadProjectIndicators = useCallback(async () => {
    const [sections, indicateurs, { locked }] = await Promise.all([
      api.projectIndicatorSections.all(),
      api.getProjectIndicators(),
      api.getProjectIndicatorsLock(),
    ]);
    setProjectIndicatorSections(sections);
    setProjectIndicators(indicateurs);
    setProjectIndicatorsLocked(locked);
  }, []);

  const toggleProjectIndicatorsLock = async () => {
    try {
      await api.setProjectIndicatorsLock(!projectIndicatorsLocked);
    } finally {
      await loadProjectIndicators();
    }
  };

  const loadTaskIndicators = useCallback(async () => {
    const [sections, indicateurs, { locked }] = await Promise.all([
      api.taskIndicatorSections.all(),
      api.getTaskIndicators(),
      api.getTaskIndicatorsLock(),
    ]);
    setTaskIndicatorSections(sections);
    setTaskIndicators(indicateurs);
    setTaskIndicatorsLocked(locked);
  }, []);

  const toggleTaskIndicatorsLock = async () => {
    try {
      await api.setTaskIndicatorsLock(!taskIndicatorsLocked);
    } finally {
      await loadTaskIndicators();
    }
  };

  const loadTabOrders = useCallback(async () => {
    setTabOrders(await api.getTabOrders());
  }, []);

  /** Le nouvel ordre des onglets d'un mode : montré aussitôt, puis rangé. */
  const reorderTabs = useCallback(async (tabMode: TabOrderMode, values: string[]) => {
    setTabOrders(await api.reorderTabs(tabMode, values));
  }, []);

  // Les éléments de toutes les colonnes de la catégorie ouverte, en une fois.
  const loadAccessBlocks = useCallback(async () => {
    if (!accessCategoryId) return setAccessBlocsLus(null);
    setLecturesAcces((n) => n + 1);
    try {
      const items = await api.getAccessBlocks(accessCategoryId);
      setAccessBlocsLus({ cle: accessCategoryId, items });
    } finally {
      setLecturesAcces((n) => n - 1);
    }
  }, [accessCategoryId]);

  const loadProjectBoards = useCallback(async () => {
    setLecturesProjets((n) => n + 1);
    try {
      setProjectBoards(await api.getProjectBoards());
    } finally {
      setLecturesProjets((n) => n - 1);
    }
  }, []);

  // Les catégories sont propres au tableau de projets ouvert.
  const loadCategories = useCallback(async () => {
    if (!projectBoardId) return setCategories([]);
    setCategories(await api.getCategories(projectBoardId));
  }, [projectBoardId]);

  useEffect(() => {
    if (user) loadLookups();
  }, [user, loadLookups]);

  useEffect(() => {
    if (!user) return;
    // Un suivi qui ne se lit pas n'empêche rien de fonctionner : les menus
    // montreront simplement la case décochée.
    api
      .getFollows()
      .then(setFollows)
      .catch(() => setFollows(emptyFollows()));
  }, [user]);

  useEffect(() => {
    if (user) loadProjects();
  }, [user, loadProjects]);

  useEffect(() => {
    if (user) loadProjectBoards();
  }, [user, loadProjectBoards]);

  useEffect(() => {
    if (user) loadAccessCategories();
  }, [user, loadAccessCategories]);

  useEffect(() => {
    if (user) loadSupportRequests();
  }, [user, loadSupportRequests]);

  // Le mode Support s'ouvre sur une relève des boîtes, sans attendre celle que
  // le serveur fait de lui-même toutes les cinq minutes. Ce qu'elle apporte
  // arrive par le flux d'événements ; un échec ne dit rien ici, le serveur le
  // consigne.
  useEffect(() => {
    if (user && mode === "support") api.syncSupportMail().catch(() => {});
  }, [user, mode]);

  useEffect(() => {
    if (user) loadAssets();
  }, [user, loadAssets]);

  useEffect(() => {
    if (user) loadTabOrders().catch(() => {});
  }, [user, loadTabOrders]);

  useEffect(() => {
    if (user) loadSupportIndicators().catch(() => {});
  }, [user, loadSupportIndicators]);

  useEffect(() => {
    if (user) loadAssetIndicators().catch(() => {});
  }, [user, loadAssetIndicators]);

  useEffect(() => {
    if (user) loadProjectIndicators().catch(() => {});
  }, [user, loadProjectIndicators]);

  useEffect(() => {
    if (user) loadTaskIndicators().catch(() => {});
  }, [user, loadTaskIndicators]);

  useEffect(() => {
    if (user) loadAccessSections();
  }, [user, loadAccessSections]);

  useEffect(() => {
    if (user) loadAccessBlocks();
  }, [user, loadAccessBlocks]);

  // La catégorie d'accès ouverte doit exister : en supprimer une ramène sur la
  // première de la liste.
  useEffect(() => {
    if (!accessCategories) return;
    const premiere = accessCategories[0];
    if (!premiere) return setAccessCategoryId(null);
    if (!accessCategories.some((c) => String(c.id) === accessCategoryId)) {
      setAccessCategoryId(String(premiere.id));
    }
  }, [accessCategories, accessCategoryId]);

  // Le tableau de projets ouvert doit exister : en supprimer un ramène sur le
  // premier de la liste.
  useEffect(() => {
    if (!projectBoards) return;
    const premier = projectBoards[0];
    if (!premier) return setProjectBoardId(null);
    if (!projectBoards.some((b) => String(b.id) === projectBoardId)) {
      setProjectBoardId(String(premier.id));
    }
  }, [projectBoards, projectBoardId]);

  useEffect(() => {
    if (user) loadCategories();
  }, [user, loadCategories]);

  // Un filtre peut pointer vers une société/catégorie qui vient d'être supprimée.
  useEffect(() => {
    if (!companies.length) return;
    const connue = companies.some((c) => String(c.id) === companyFilter);

    // En mode Tâche, « toutes » n'a pas de sens : une liste appartient à un
    // tableau, qui appartient à une société. On retient la première.
    if (mode === "tasks" && !connue && companies[0]) {
      setCompanyFilter(String(companies[0].id));
      return;
    }
    // Partout ailleurs, une société supprimée renvoie sur « toutes » — la vue
    // par laquelle ces modes s'ouvrent.
    if (mode !== "access" && !connue && companyFilter !== "all") {
      setCompanyFilter("all");
    }
  }, [companies, companyFilter, mode]);

  const loadBoards = useCallback(async () => {
    // Sans société précise, il n'y a pas de tableaux à lire : ils restent
    // inconnus, et non « aucun ». Le mode Tâche choisit aussitôt une société,
    // le temps que « Aucun tableau » n'a pas à s'afficher.
    if (!companyFilter || companyFilter === "all") return setBoardsLus(null);
    setLecturesTaches((n) => n + 1);
    try {
      setBoardsLus({
        cle: companyFilter,
        items: await api.getBoards(companyFilter),
      });
    } finally {
      setLecturesTaches((n) => n - 1);
    }
  }, [companyFilter]);

  useEffect(() => {
    if (user) loadBoards();
  }, [user, loadBoards]);

  // Le tableau ouvert doit exister dans la société courante : changer de
  // société, ou supprimer un tableau, ramène sur le premier de la liste.
  useEffect(() => {
    if (!boards) return;
    const premier = boards[0];
    if (!premier) return setBoardId(null);
    if (!boards.some((b) => String(b.id) === boardId))
      setBoardId(String(premier.id));
  }, [boards, boardId]);

  // Les étiquettes appartiennent au tableau ouvert : elles se lisent avec ses
  // listes, et servent au tiroir du tableau comme à celui d'une carte.
  // Appelée sans rien, elle relit les étiquettes du tableau. Appelée avec un
  // « patch », elle se contente de l'appliquer sur place, sans rien demander au
  // serveur : une étiquette recolorée se voit aussitôt sur les cartes, et la
  // relecture qui suit ne fait que confirmer.
  const loadLabels = useCallback(
    async (patch?: { id: number; data: Partial<Label> }) => {
      if (patch) {
        setLabelsLues((l) =>
          l
            ? {
                ...l,
                items: l.items.map((e) =>
                  e.id === patch.id ? { ...e, ...patch.data } : e,
                ),
              }
            : l,
        );
        return;
      }
      if (!boardId) return setLabelsLues(null);
      setLabelsLues({ cle: boardId, items: await api.getLabels(boardId) });
    },
    [boardId],
  );

  useEffect(() => {
    if (user) loadLabels();
  }, [user, loadLabels]);

  // Les étiquettes du mode Projet : mêmes règles que celles des cartes, sur le
  // tableau de projets ouvert.
  const loadProjectLabels = useCallback(
    async (patch?: { id: number; data: Partial<ProjectLabel> }) => {
      if (patch) {
        setProjectLabelsLues((l) =>
          l
            ? {
                ...l,
                items: l.items.map((e) =>
                  e.id === patch.id ? { ...e, ...patch.data } : e,
                ),
              }
            : l,
        );
        return;
      }
      if (!projectBoardId) return setProjectLabelsLues(null);
      setProjectLabelsLues({
        cle: projectBoardId,
        items: await api.getProjectLabels(projectBoardId),
      });
    },
    [projectBoardId],
  );

  useEffect(() => {
    if (user) loadProjectLabels();
  }, [user, loadProjectLabels]);

  const loadTaskLists = useCallback(async () => {
    // Sans tableau ouvert, il n'y a pas de listes à lire : elles restent
    // inconnues, et non « aucune ». C'est ce cas qui faisait apparaître
    // « Aucune liste » au premier passage en mode Tâche.
    if (!boardId) return setTaskListsLues(null);
    setLecturesTaches((n) => n + 1);
    try {
      setTaskListsLues({
        cle: boardId,
        items: await api.getTaskLists(boardId),
      });
    } finally {
      setLecturesTaches((n) => n - 1);
    }
  }, [boardId]);

  useEffect(() => {
    if (user) loadTaskLists();
  }, [user, loadTaskLists]);

  /**
   * Suivre ou cesser de suivre. Le serveur rend la liste entière, qui remplace
   * la nôtre : pas de va-et-vient optimiste à défaire en cas de refus, le clic
   * est trop rare pour que l'attente se voie.
   */
  const basculerSuivi = useCallback(
    async (kind: FollowKind, id: number) => {
      const suivi = follows[kind].includes(id);
      try {
        setFollows(
          suivi ? await api.unfollow(kind, id) : await api.follow(kind, id),
        );
      } catch {
        /* le serveur a refusé : la case reste dans l'état qu'il connaît */
      }
    },
    [follows],
  );

  /**
   * Ouvre l'élément désigné, qu'il vienne de l'adresse ou d'une notification.
   * Un projet s'ouvre sur place — son tiroir lit sa fiche lui-même. Une carte
   * demande d'abord de savoir où elle vit : on se place sur sa société et son
   * tableau, et c'est le tableau qui l'ouvrira une fois ses listes lues.
   */
  const ouvrirCible = useCallback(async (cible: Cible) => {
    // Une demande de support s'ouvre dans le mode Support, sur toutes les
    // sociétés : elle y est à coup sûr, quelle que soit la sienne.
    if (cible.kind === "support") {
      try {
        const demande = await api.getSupportRequest(cible.id);
        setMode("support");
        setCompanyFilter("all");
        setEditedSupportRequest(demande);
        setSupportDrawerOpened(true);
      } catch {
        /* demande supprimée entre-temps : il n'y a rien à ouvrir */
      }
      return;
    }
    if (cible.kind === "project") {
      setMode("projects");
      setSelectedProjectId(cible.id);
      setDrawerOpened(true);
      return;
    }
    // Un élément du mode Accès n'a pas de fiche : c'est sa catégorie qui
    // s'ouvre.
    if (cible.kind === "access") {
      setMode("access");
      setAccessCategoryId(String(cible.id));
      return;
    }
    if (cible.kind === "asset") {
      try {
        const poste = await api.getAsset(cible.id);
        setMode("assets");
        setCompanyFilter("all");
        setOpenedAsset(poste);
        setAssetDrawerOpened(true);
      } catch {
        /* poste supprimé entre-temps : il n'y a rien à ouvrir */
      }
      return;
    }

    try {
      const ou = await api.getCardLocation(cible.id);
      setMode("tasks");
      setCompanyFilter(String(ou.company_id));
      setBoardId(String(ou.board_id));
      setCarteAOuvrir(cible.id);
    } catch {
      /* carte supprimée, ou tableau devenu privé : il n'y a rien à ouvrir */
    }
  }, []);

  /**
   * Ouvre ce que la recherche a trouvé, par le même chemin que les
   * notifications et les adresses. Un lien du mode Accès, lui, ouvre
   * directement son adresse.
   */
  const ouvrirRecherche = useCallback(
    async (resultat: SearchResult) => {
      if (resultat.kind !== "access") {
        return ouvrirCible({ kind: resultat.kind, id: resultat.id });
      }
      if (resultat.url) {
        window.open(resultat.url, "_blank", "noopener");
        return;
      }
      if (resultat.category_id) return ouvrirCible({ kind: "access", id: resultat.category_id });
    },
    [ouvrirCible],
  );

  /**
   * Ce qu'on voit quand un élément suivi change. Le serveur n'envoie rien pour
   * ses propres gestes : tout ce qui arrive ici vient de quelqu'un d'autre, et
   * il n'y a donc rien à filtrer.
   */
  const montrerNotification = useCallback(
    (avis: NotificationSuivi) => {
      // Un élément supprimé n'a plus rien à ouvrir : la notification ne fait
      // que le dire, marquée d'une corbeille.
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
    if (
      actorFilter !== "all" &&
      users.length &&
      !users.some((u) => String(u.id) === actorFilter)
    ) {
      setActorFilter("all");
    }
  }, [users, actorFilter]);

  // Flux d'événements : le serveur pousse ses compteurs dès qu'une écriture a
  // lieu, le rechargement est donc immédiat. On consomme le flux avec `fetch`
  // et non `EventSource`, qui n'accepte pas d'en-tête d'authentification.
  //
  // Chaque écriture nomme ce qu'elle a touché, et le client ne relit que les
  // jeux de données concernés. Avant, le moindre changement, chez n'importe
  // qui, relançait les huit lectures — renommer une étiquette rechargeait les
  // projets, les sociétés et les comptes.
  useEffect(() => {
    if (!user) return undefined;

    let arrete = false;
    let controleur: AbortController | undefined;

    // Ce qu'il faut relire quand telle ressource bouge.
    const lecteurs: Record<Resource, () => void | Promise<void>> = {
      lookups: loadLookups,
      "project-boards": loadProjectBoards,
      categories: loadCategories,
      projects: loadProjects,
      boards: loadBoards,
      "task-lists": loadTaskLists,
      labels: () => loadLabels(),
      "project-labels": () => loadProjectLabels(),
      "access-categories": loadAccessCategories,
      "access-sections": loadAccessSections,
      "access-blocks": loadAccessBlocks,
      assets: loadAssets,
      "asset-indicators": loadAssetIndicators,
      "project-indicators": loadProjectIndicators,
      "task-indicators": loadTaskIndicators,
      "support-requests": loadSupportRequests,
      // Rien à relire ici : les étiquettes du support se lisent dans le tiroir
      // d'une demande, pour la société qu'elle porte, et non pour celle de la
      // liste déroulante. Le tiroir les relit à son ouverture.
      "support-labels": () => {},
      "support-indicators": loadSupportIndicators,
      "tab-orders": loadTabOrders,
    };

    const appliquer = async (message: FluxMessage) => {
      // Deux sortes de messages circulent : les compteurs de version, qui
      // s'adressent à tout le monde, et les notifications de suivi, qui ne
      // s'adressent qu'à nous.
      if (estNotification(message)) {
        montrerNotification(message.notification);
        setNotificationsRevision((r) => r + 1);
        return;
      }

      const { versions } = message;
      // Premier message : les compteurs servent de référence, sans rien
      // relire — ce qui est affiché vient d'être lu.
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
          if (!reponse.ok || !reponse.body)
            throw new Error("flux indisponible");

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
              const ligne = morceau
                .split("\n")
                .find((l) => l.startsWith("data:"));
              if (!ligne) continue; // commentaire de maintien de connexion

              // Le « try » ne couvre que la lecture du message : un message
              // illisible s'ignore. Ce qu'on en fait ensuite, non — une erreur
              // de rendu ou de rechargement doit se voir dans la console
              // plutôt que de disparaître avec le message qui l'a causée.
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
        // Ce qui a changé pendant la coupure est inconnu : les compteurs sont
        // oubliés, et le premier message du flux repris servira de nouvelle
        // référence.
        versionsConnues.current = null;
        if (!arrete)
          await new Promise((resoudre) => setTimeout(resoudre, 2000));
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
    loadProjectBoards,
    loadCategories,
    loadProjects,
    loadBoards,
    loadTaskLists,
    loadLabels,
    loadProjectLabels,
    loadAccessCategories,
    loadAccessSections,
    loadAccessBlocks,
    loadAssets,
    loadSupportRequests,
    loadSupportIndicators,
    loadAssetIndicators,
    loadProjectIndicators,
    loadTaskIndicators,
    loadTabOrders,
    montrerNotification,
  ]);

  // Projets, Support et Assets s'ouvrent sur « Toutes les sociétés » : on y
  // arrive pour voir l'ensemble, et on resserre ensuite. Seul le mode Tâche
  // fait l'inverse — ses listes appartiennent à une société précise, et il
  // garde celle où on était.
  const changeMode = useCallback((suivant: Mode) => {
    setMode(suivant);
    if (suivant !== "tasks" && suivant !== "access") setCompanyFilter("all");
  }, []);

  useEffect(() => {
    if (!user || modeApplique.current === user.id) return;
    modeApplique.current = user.id;
    changeMode(user.default_mode || DEFAULT_MODE);
  }, [user, changeMode]);

  const handleOpenNewProject = useCallback(() => {
    setSelectedProjectId(null);
    setDrawerOpened(true);
  }, []);

  const openNewSupportRequest = useCallback(() => {
    setObjetDemandeAcces(null);
    setSocieteDemandeAcces(null);
    setEditedSupportRequest(null);
    setSupportDrawerOpened(true);
  }, []);

  // Raccourcis clavier : Tab fait le tour des modes, Option/Alt + Tab fait
  // défiler les tableaux du mode courant, N nouveau projet ou nouvelle demande
  // de support, S fait défiler le filtre société.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Jamais pendant une saisie de texte : ni vol de frappe, ni navigation
      // clavier cassée dans les formulaires. En revanche les listes
      // déroulantes de Mantine sont des <input readonly> : elles ne reçoivent
      // aucune frappe, les raccourcis doivent continuer d'y fonctionner.
      const el = document.activeElement as HTMLElement | null;
      const saisieDeTexte =
        el &&
        (el.tagName === "TEXTAREA" ||
          el.isContentEditable ||
          (el.tagName === "INPUT" && !(el as HTMLInputElement).readOnly));
      if (saisieDeTexte) return;
      // Tab est traité avant le filtre des modificateurs : c'est le seul
      // raccourci qui en accepte un, Option/Alt, pour changer de tableau.
      if (
        event.code === "Tab" &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey
      ) {
        event.preventDefault();

        if (!event.altKey) {
          const i = MODES.findIndex((m) => m.value === mode);
          const suivant = MODES[(i + 1) % MODES.length];
          if (suivant) changeMode(suivant.value);
          return;
        }

        // Tableau suivant du mode ouvert, en boucle sur le premier. Les
        // tableaux valent « null » tant qu'ils n'ont pas été lus.
        const tableaux = mode === "projects" ? projectBoards : boards;
        if (!tableaux?.length) return;
        const courant = mode === "projects" ? projectBoardId : boardId;
        const i = tableaux.findIndex((b) => String(b.id) === courant);
        const suivant = tableaux[(i + 1) % tableaux.length];
        if (!suivant) return;
        const cible = String(suivant.id);
        if (mode === "projects") setProjectBoardId(cible);
        else setBoardId(cible);
        return;
      }

      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
        return;

      // N crée selon le mode : un projet en mode Projet, une demande en mode
      // Support ; rien ailleurs.
      if (event.code === "KeyN") {
        if (mode === "projects") {
          event.preventDefault();
          handleOpenNewProject();
        } else if (mode === "support") {
          event.preventDefault();
          openNewSupportRequest();
        }
        return;
      }

      // Passage à la société suivante.
      const suivante = (courante: string, valeurs: string[]): string => {
        if (valeurs.length === 0) return courante;
        const i = valeurs.indexOf(courante);
        return valeurs[(i + 1) % valeurs.length] ?? courante;
      };

      if (event.code === "KeyS") {
        event.preventDefault();
        setCompanyFilter((c) =>
          suivante(c, [
            ...(mode === "projects" || mode === "assets" ? ["all"] : []),
            ...companies.map((x) => String(x.id)),
          ]),
        );
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    handleOpenNewProject,
    openNewSupportRequest,
    companies,
    mode,
    changeMode,
    boards,
    boardId,
    projectBoards,
    projectBoardId,
  ]);

  /**
   * Ce que l'adresse désignait à l'arrivée, ouvert une fois la session ouverte.
   * Une seule fois : ensuite c'est l'application qui écrit l'adresse, et la
   * relire ferait rouvrir ce qu'on vient de fermer.
   */
  const adresseLue = useRef(false);
  useEffect(() => {
    if (!user || adresseLue.current) return;
    adresseLue.current = true;
    const cible = cibleDeLAdresse();
    if (cible) ouvrirCible(cible);
  }, [user, ouvrirCible]);

  // L'adresse suit ce qui est ouvert, pour qu'un rechargement le retrouve et
  // qu'on puisse envoyer le lien à quelqu'un.
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
  // s'ouvre aussitôt : on la reprend comme base d'un autre projet.
  const duplicateProject = async (project: Project) => {
    try {
      const copie = await api.copyProject(project.id, { name: `${project.name} (copie)` });
      handleOpenProject(copie);
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

  const handleProjectMoved = async () => {
    setMovedProject(null);
    await loadProjects();
  };

  // La confirmation a déjà été donnée dans la modale ; le rechargement a lieu
  // même en cas de refus du serveur, pour que la liste dise ce qui existe.
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

  const handleSettingsChanged = async () => {
    await loadLookups();
    await loadProjects();
  };

  // Sans rang, la section va au bout ; le « + » entre deux colonnes en
  // donne un.
  const openNewAccessSection = (index?: number) => {
    setEditedAccessSection(null);
    setSectionInsertAt(index ?? null);
    setSectionDrawerOpened(true);
  };

  const openEditAccessSection = (section: AccessSection) => {
    setEditedAccessSection(section);
    setSectionInsertAt(null);
    setSectionDrawerOpened(true);
  };

  /** Supprimée depuis le clic droit : la page a déjà posé la question. */
  const deleteAccessSection = async (section: AccessSection) => {
    try {
      await api.deleteAccessSection(section.id);
    } finally {
      await loadAccessSections();
      await loadAccessBlocks();
    }
  };

  /**
   * Dupliquée depuis le clic droit : la copie, avec ses éléments, se pose à
   * droite de l'original. Rien ne s'ouvre — le tiroir d'une colonne ne règle
   * que sa largeur ; c'est ce qu'elle porte qu'on reprend.
   */
  const duplicateAccessSection = async (section: AccessSection) => {
    try {
      await api.duplicateAccessSection(section.id);
    } finally {
      await loadAccessSections();
      await loadAccessBlocks();
    }
  };

  /** Le nouvel ordre des colonnes, posé par leur poignée. */
  const reorderAccessSections = async (ids: number[]) => {
    if (!accessCategoryId) return;
    try {
      const items = await api.reorderAccessSections(Number(accessCategoryId), ids);
      setAccessSectionsLues({ cle: accessCategoryId, items });
    } catch {
      await loadAccessSections();
    }
  };

  // La zone en pointillé d'une colonne : elle ouvre la boîte de choix, et
  // c'est le widget choisi qui dit ce que l'élément sera.
  const openWidgetPicker = (section: AccessSection) =>
    setSectionPourBloc(section);

  /**
   * Le widget choisi : l'élément est créé aussitôt avec la configuration que
   * le widget donne par défaut, puis son tiroir s'ouvre pour la régler. Sans
   * cela, il faudrait un tiroir qui crée et un autre qui modifie.
   */
  const handleWidgetChoisi = async (widget: AccessWidget) => {
    const section = sectionPourBloc;
    setSectionPourBloc(null);
    if (!section) return;
    const bloc = await api.createAccessBlock({
      section_id: section.id,
      type: widget.type,
      config: widget.defaultConfig,
    });
    await loadAccessBlocks();
    // Un widget qui se modifie sur place — le titre d'une catégorie — n'ouvre
    // rien : il paraît dans la colonne, et un double-clic le nomme.
    if (!widget.inlineEdit) setEditedAccessBlock(bloc);
  };

  /**
   * Un élément modifié depuis la colonne même — le titre d'une catégorie, qui
   * se saisit là où il se lit. Rien d'ouvert à refermer : on écrit, on relit.
   */
  const changeAccessBlockConfig = async (
    bloc: AccessBlock,
    config: Record<string, unknown>,
  ) => {
    await api.updateAccessBlock(bloc.id, { config });
    await loadAccessBlocks();
  };

  /** Le nouvel ordre d'une colonne, tel que le glisser vient de le poser. */
  const reorderAccessBlocks = async (sectionId: number, ids: number[]) => {
    // Le serveur rend toute la catégorie rangée : on la prend telle quelle
    // plutôt que de relire.
    const items = await api.reorderAccessBlocks({ section_id: sectionId, ids });
    if (accessCategoryId) setAccessBlocsLus({ cle: accessCategoryId, items });
  };

  /** Supprimé depuis le clic droit : la page a déjà posé la question. */
  const deleteAccessBlock = async (bloc: AccessBlock) => {
    try {
      await api.deleteAccessBlock(bloc.id);
    } finally {
      await loadAccessBlocks();
    }
  };

  /**
   * Dupliqué depuis le clic droit : la copie se pose sous l'original et son
   * tiroir s'ouvre, comme à la création — sauf pour un widget qui se modifie
   * sur place.
   */
  const duplicateAccessBlock = async (bloc: AccessBlock) => {
    try {
      const copie = await api.duplicateAccessBlock(bloc.id);
      if (!widgetDe(copie.type)?.inlineEdit) setEditedAccessBlock(copie);
    } finally {
      await loadAccessBlocks();
    }
  };

  /** Une catégorie devient sous-catégorie, et l'inverse : le titre reste. */
  const convertAccessBlock = async (bloc: AccessBlock, type: AccessBlockType) => {
    try {
      await api.updateAccessBlock(bloc.id, { type });
    } finally {
      await loadAccessBlocks();
    }
  };

  const handleAccessBlockSaved = async () => {
    setEditedAccessBlock(null);
    await loadAccessBlocks();
  };

  const handleAccessSectionSaved = async () => {
    setSectionDrawerOpened(false);
    await loadAccessSections();
  };

  const openNewAccessCategory = () => {
    setEditedAccessCategory(null);
    setAccessDrawerOpened(true);
  };

  // L'onglet visé par le clic droit, pas forcément l'onglet ouvert.
  // Verrouiller ou déverrouiller depuis le menu de l'onglet, sans ouvrir le
  // tiroir. Relu même en cas de refus : l'onglet montre alors ce qui est.
  const toggleAccessCategoryLock = async (id: Id) => {
    const categorie = accessCategories?.find((c) => c.id === id);
    if (!categorie) return;
    try {
      await api.updateAccessCategory(id, { is_locked: !categorie.is_locked });
    } finally {
      await loadAccessCategories();
    }
  };

  const toggleBoardLock = async (id: Id) => {
    const tableau = boards?.find((b) => b.id === id);
    if (!tableau) return;
    try {
      await api.updateBoard(id, { is_locked: !tableau.is_locked });
    } finally {
      await loadBoards();
    }
  };

  // Renommer depuis l'onglet, au double clic, sans ouvrir le tiroir. Relu même
  // en cas de refus : l'onglet montre alors le nom qui est le sien.
  const renameAccessCategory = async (id: Id, name: string) => {
    try {
      await api.updateAccessCategory(id, { name });
    } finally {
      await loadAccessCategories();
    }
  };

  const renameBoard = async (id: Id, name: string) => {
    try {
      await api.updateBoard(id, { name });
    } finally {
      await loadBoards();
    }
  };

  const renameProjectBoard = async (id: Id, name: string) => {
    try {
      await api.updateProjectBoard(id, { name });
    } finally {
      await loadProjectBoards();
    }
  };

  const openEditAccessCategory = (id: Id) => {
    setEditedAccessCategory(accessCategories?.find((c) => c.id === id) ?? null);
    setAccessDrawerOpened(true);
  };

  // Une catégorie enregistrée devient la catégorie ouverte : on vient de la
  // créer ou de la renommer, c'est celle que l'on regarde.
  const handleAccessCategorySaved = async (categorie: AccessCategory) => {
    setAccessDrawerOpened(false);
    await loadAccessCategories();
    setAccessCategoryId(String(categorie.id));
  };

  const handleAccessCategoryDeleted = async () => {
    setAccessDrawerOpened(false);
    await loadAccessCategories();
  };

  // Suppression demandée depuis le menu contextuel des onglets : la
  // confirmation a déjà été donnée dans la modale. Le rechargement a lieu même
  // en cas de refus du serveur : les onglets montrent alors ce qui existe
  // encore.
  // L'ordre des onglets est celui de tout le monde : il part au serveur, qui
  // le range, et la liste est relue derrière — comme après une suppression.
  const reorderAccessCategories = async (ids: Id[]) => {
    try {
      await api.reorderAccessCategories(ids);
    } finally {
      await loadAccessCategories();
    }
  };

  const deleteAccessCategory = async (id: Id) => {
    try {
      await api.deleteAccessCategory(id);
    } finally {
      await loadAccessCategories();
    }
  };

  // Une demande créée depuis un onglet en prend le statut ; depuis « Tous »,
  // elle s'ouvre « Nouveau ».
  const openAsset = (poste: Asset) => {
    setOpenedAsset(poste);
    setAssetDrawerOpened(true);
  };

  // Depuis un lien du mode Accès : la demande prend son titre pour objet, et
  // naît « Nouveau » — l'onglet laissé ouvert en Support n'a rien à y dire.
  // La société se devine au nom de la catégorie, quand il en désigne une.
  const openSupportRequestFromAccess = (bloc: AccessBlock) => {
    const categorie = accessCategories?.find((c) => String(c.id) === String(accessCategoryId));
    const societe = categorie ? societeDuNom(categorie.name, companies) : null;
    setObjetDemandeAcces(sourceAcces(bloc, Number(accessCategoryId)).title);
    setSocieteDemandeAcces(societe ? String(societe.id) : null);
    setEditedSupportRequest(null);
    setSupportDrawerOpened(true);
  };

  const openSupportRequest = (demande: SupportRequest) => {
    setEditedSupportRequest(demande);
    setSupportDrawerOpened(true);
  };

  const handleSupportRequestSaved = async () => {
    setSupportDrawerOpened(false);
    await loadSupportRequests();
  };

  const openNewProjectBoard = () => {
    setEditedProjectBoard(null);
    setProjectBoardDrawerOpened(true);
  };

  const openEditProjectBoard = (id: Id) => {
    setEditedProjectBoard(projectBoards?.find((b) => b.id === id) ?? null);
    setProjectBoardDrawerOpened(true);
  };

  const handleProjectBoardSaved = async (board: ProjectBoard) => {
    setProjectBoardDrawerOpened(false);
    await loadProjectBoards();
    setProjectBoardId(String(board.id));
  };

  const handleProjectBoardDeleted = async () => {
    setProjectBoardDrawerOpened(false);
    await loadProjectBoards();
  };

  // Suppressions demandées depuis le menu contextuel des onglets : la
  // confirmation a déjà été donnée dans la modale. Le rechargement a lieu même
  // en cas de refus du serveur : les onglets montrent alors ce qui existe
  // encore, l'onglet visé compris.
  const reorderProjectBoards = async (ids: Id[]) => {
    try {
      await api.reorderProjectBoards(ids);
    } finally {
      await loadProjectBoards();
    }
  };

  const deleteProjectBoard = async (id: Id) => {
    try {
      await api.deleteProjectBoard(id);
    } finally {
      await loadProjectBoards();
    }
  };

  // Les tableaux du mode Tâche se rangent société par société : sans société
  // précise, la rangée est vide et il n'y a rien à ranger.
  const reorderBoards = async (ids: Id[]) => {
    if (!companyFilter || companyFilter === "all") return;
    try {
      await api.reorderBoards(companyFilter, ids);
    } finally {
      await loadBoards();
    }
  };

  const deleteBoard = async (id: Id) => {
    try {
      await api.deleteBoard(id);
    } finally {
      await loadBoards();
    }
  };

  const openNewBoard = () => {
    setEditedBoard(null);
    setBoardDrawerOpened(true);
  };

  const openEditBoard = (id: Id) => {
    setEditedBoard(boards?.find((b) => b.id === id) ?? null);
    setBoardDrawerOpened(true);
  };

  // Un tableau enregistré devient le tableau ouvert : on vient de le créer ou
  // de le renommer, c'est celui que l'on regarde.
  const handleBoardSaved = async (board: Board) => {
    setBoardDrawerOpened(false);
    await loadBoards();
    setBoardId(String(board.id));
  };

  const handleBoardDeleted = async () => {
    setBoardDrawerOpened(false);
    await loadBoards();
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
        companies={companies}
        milestoneTypes={milestoneTypes}
        onDataChanged={handleSettingsChanged}
        debug={debug}
        onDebugChange={setDebug}
      />
    );

  // La société et le compte : les mêmes dans tous les modes. Ce ne sont pas
  // des éléments tout montés mais ce qu'il faut pour les monter — la rangée
  // (ModeBar) y glisse le menu « Actions » du mode, entre les deux.
  const account: AccountSlot = {
    companies,
    companyFilter,
    onCompanyFilterChange: setCompanyFilter,
    onOpenSettings: () => setSettingsOpened(true),
    user,
    onLogout: handleLogout,
    onOpenPreferences: () => setPreferencesOpened(true),
    onOpenNotifications: () => setNotificationsOpened(true),
    mode,
    onSearchOpen: ouvrirRecherche,
  };

  return (
    <Stack gap={0} h="100vh">
      {/* Contenu resserré : moitié moins d'espace que les 100px d'origine, et
          le même en haut que sur les côtés. La rangée d'onglets de chaque mode
          est désormais la première ligne de l'écran, l'entête qui la
          surmontait n'existe plus. */}
      <Box
        pt={PAGE_GUTTER}
        px={PAGE_GUTTER}
        w="100%"
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          // Le contenu s'arrête 20px au-dessus du sélecteur de mode, qui est
          // posé en bas à gauche par-dessus la page. Sa hauteur n'est pas
          // écrite ici : c'est lui qui la publie.
          paddingBottom: `calc(var(${MODE_SWITCH_TOP}, ${MODE_SWITCH_TOP_FALLBACK}px) + ${BOTTOM_CLEARANCE}px)`,
        }}
      >
        {mode === "access" && (
          <AccessPage
            categories={accessCategories}
            categoryId={accessCategoryId}
            onCategoryChange={setAccessCategoryId}
            onAddCategory={openNewAccessCategory}
            onEditCategory={openEditAccessCategory}
            onRenameCategory={renameAccessCategory}
            onDeleteCategory={deleteAccessCategory}
            onReorderCategories={reorderAccessCategories}
            onToggleCategoryLock={toggleAccessCategoryLock}
            sections={accessSections}
            onAddSection={openNewAccessSection}
            onEditSection={openEditAccessSection}
            onDuplicateSection={duplicateAccessSection}
            onDeleteSection={deleteAccessSection}
            onReorderSections={reorderAccessSections}
            blocks={accessBlocks}
            onAddBlock={openWidgetPicker}
            onEditBlock={setEditedAccessBlock}
            onChangeBlockConfig={changeAccessBlockConfig}
            onReorderBlocks={reorderAccessBlocks}
            onDuplicateBlock={duplicateAccessBlock}
            onDeleteBlock={deleteAccessBlock}
            onCreateTask={(bloc) =>
              accessCategoryId &&
              setTacheSource(
                sourceAcces(
                  bloc,
                  Number(accessCategoryId),
                  accessCategories?.find((c) => String(c.id) === accessCategoryId)?.name,
                ),
              )
            }
            onCreateSupportRequest={openSupportRequestFromAccess}
            onConvertBlock={convertAccessBlock}
            loading={chargementAcces}
            account={account}
          />
        )}
        {mode === "support" && (
          <SupportPage
            requests={supportRequests}
            statusTab={supportStatusTab}
            onStatusTabChange={setSupportStatusTab}
            onOpenRequest={openSupportRequest}
            onCreateTask={(demande) => setTacheSource(sourceDemande(demande))}
            onAddRequest={openNewSupportRequest}
            users={users}
            onRequestsChanged={loadSupportRequests}
            hasCompany={companyFilter !== ""}
            loading={chargementSupport}
            tabOrder={tabOrders.support}
            onReorderTabs={(values) => reorderTabs("support", values)}
            account={account}
            followedIds={follows.support}
            onToggleFollow={(demande) => basculerSuivi("support", demande.id)}
            indicatorSections={supportIndicatorSections}
            indicators={supportIndicators}
            onIndicatorsChanged={loadSupportIndicators}
            indicatorsLocked={supportIndicatorsLocked}
            onToggleIndicatorsLock={toggleSupportIndicatorsLock}
          />
        )}

        {mode === "assets" && (
          <AssetsPage
            assets={assets}
            onOpenAsset={openAsset}
            onCreateTask={(poste) => setTacheSource(sourcePoste(poste))}
            loading={chargementAssets}
            tabOrder={tabOrders.assets}
            onReorderTabs={(values) => reorderTabs("assets", values)}
            account={account}
            indicatorSections={assetIndicatorSections}
            indicators={assetIndicators}
            onIndicatorsChanged={loadAssetIndicators}
            indicatorsLocked={assetIndicatorsLocked}
            onToggleIndicatorsLock={toggleAssetIndicatorsLock}
          />
        )}

        {loaded && mode === "tasks" && (
          <TasksPage
            boards={boards}
            boardId={boardId}
            onBoardChange={setBoardId}
            onAddBoard={openNewBoard}
            onEditBoard={openEditBoard}
            onRenameBoard={renameBoard}
            onDeleteBoard={deleteBoard}
            onReorderBoards={reorderBoards}
            onToggleBoardLock={toggleBoardLock}
            lists={taskLists}
            onListsChanged={loadTaskLists}
            labels={labels}
            users={users}
            onLabelsChanged={loadLabels}
            loading={chargementTaches}
            follows={follows}
            onToggleFollow={basculerSuivi}
            carteAOuvrir={carteAOuvrir}
            onCarteOuverte={handleCarteOuverte}
            account={account}
            indicatorSections={taskIndicatorSections}
            indicators={taskIndicators}
            onIndicatorsChanged={loadTaskIndicators}
            indicatorsLocked={taskIndicatorsLocked}
            onToggleIndicatorsLock={toggleTaskIndicatorsLock}
          />
        )}

        {loaded && mode === "projects" && (
          <ProjectsPage
            boards={projectBoards}
            boardId={projectBoardId}
            onBoardChange={setProjectBoardId}
            onAddBoard={openNewProjectBoard}
            onEditBoard={openEditProjectBoard}
            onRenameBoard={renameProjectBoard}
            onDeleteBoard={deleteProjectBoard}
            onReorderBoards={reorderProjectBoards}
            projects={projects}
            filters={{
              categories,
              categoryFilter,
              onCategoryFilterChange: setCategoryFilter,
              statusFilter,
              onStatusFilterChange: setStatusFilter,
              // L'acteur retenu reste proposé même s'il n'a plus de projet :
              // sinon le filtre porterait un nom qu'on ne voit plus.
              users: users.filter(
                (u) => projectActorIds.includes(u.id) || String(u.id) === actorFilter,
              ),
              actorFilter,
              onActorFilterChange: setActorFilter,
            }}
            onRowClick={handleOpenProject}
            onMoveProject={(project, mode) =>
              setMovedProject({ project, mode })
            }
            onDuplicateProject={(project) => void duplicateProject(project)}
            onDeleteProject={setDeletedProject}
            onCreateTask={(projet) =>
              setTacheSource(
                sourceProjet(projet, projectBoards?.find((b) => b.id === projet.board_id)?.name),
              )
            }
            onAddProject={handleOpenNewProject}
            followedIds={follows.project}
            onToggleFollow={(projet) => basculerSuivi("project", projet.id)}
            loading={chargementProjets}
            account={account}
            indicatorSections={projectIndicatorSections}
            indicators={projectIndicators}
            onIndicatorsChanged={loadProjectIndicators}
            indicatorsLocked={projectIndicatorsLocked}
            onToggleIndicatorsLock={toggleProjectIndicatorsLock}
          />
        )}
      </Box>

      <BoardDrawer
        opened={boardDrawerOpened}
        onClose={() => setBoardDrawerOpened(false)}
        board={editedBoard}
        companyId={companyFilter}
        onSaved={handleBoardSaved}
        onDeleted={handleBoardDeleted}
      />

      <AccessCategoryDrawer
        opened={accessDrawerOpened}
        onClose={() => setAccessDrawerOpened(false)}
        category={editedAccessCategory}
        onSaved={handleAccessCategorySaved}
        onDeleted={handleAccessCategoryDeleted}
      />

      <WidgetPickerModal
        opened={sectionPourBloc !== null}
        onClose={() => setSectionPourBloc(null)}
        onChoose={handleWidgetChoisi}
      />

      <AccessBlockDrawer
        opened={editedAccessBlock !== null}
        onClose={() => setEditedAccessBlock(null)}
        block={editedAccessBlock}
        blocks={accessBlocks}
        onSaved={handleAccessBlockSaved}
        onDeleted={handleAccessBlockSaved}
      />

      <SectionDrawer
        opened={sectionDrawerOpened}
        onClose={() => setSectionDrawerOpened(false)}
        section={editedAccessSection}
        onSave={async (largeur) => {
          if (editedAccessSection) {
            await api.updateAccessSection(editedAccessSection.id, largeur);
          } else {
            await api.createAccessSection({
              category_id: Number(accessCategoryId),
              ...largeur,
              ...(sectionInsertAt !== null ? { index: sectionInsertAt } : {}),
            });
          }
          await handleAccessSectionSaved();
        }}
        onDelete={async () => {
          if (editedAccessSection) await api.deleteAccessSection(editedAccessSection.id);
          await handleAccessSectionSaved();
        }}
      />

      <AssetDrawer
        opened={assetDrawerOpened}
        onClose={() => setAssetDrawerOpened(false)}
        asset={openedAsset}
      />

      <SupportRequestDrawer
        opened={supportDrawerOpened}
        onClose={() => setSupportDrawerOpened(false)}
        request={editedSupportRequest}
        // La société proposée à la création : celle qui est choisie, ou la
        // première de la liste quand elle est sur « toutes ».
        companyId={
          societeDemandeAcces ??
          (companyFilter !== "all" ? companyFilter : String(companies[0]?.id ?? ""))
        }
        companies={companies}
        defaultStatus={
          objetDemandeAcces === null ? statutDeLOnglet(supportStatusTab) : DEFAULT_SUPPORT_STATUS
        }
        defaultSubject={objetDemandeAcces ?? ""}
        assignCurrentUser={objetDemandeAcces === null}
        users={users}
        currentUser={user}
        onSaved={handleSupportRequestSaved}
        onDeleted={handleSupportRequestSaved}
        suivi={
          editedSupportRequest !== null &&
          follows.support.includes(editedSupportRequest.id)
        }
        onToggleFollow={() => {
          if (editedSupportRequest) basculerSuivi("support", editedSupportRequest.id);
        }}
      />

      <ProjectBoardDrawer
        opened={projectBoardDrawerOpened}
        onClose={() => setProjectBoardDrawerOpened(false)}
        board={editedProjectBoard}
        categories={categories}
        onCategoriesChanged={loadCategories}
        onSaved={handleProjectBoardSaved}
        onDeleted={handleProjectBoardDeleted}
      />

      <ProjectDrawer
        opened={drawerOpened}
        onClose={handleCloseDrawer}
        projectId={selectedProjectId}
        boardId={projectBoardId}
        categories={categories}
        companies={companies}
        milestoneTypes={milestoneTypes}
        users={users}
        labels={projectLabels}
        boards={projectBoards ?? []}
        currentUser={user}
        onCategoriesChanged={loadCategories}
        onLabelsChanged={loadProjectLabels}
        onSaved={handleSaved}
        onDeleted={handleSaved}
        suivi={
          selectedProjectId !== null &&
          follows.project.includes(selectedProjectId)
        }
        onToggleFollow={() => {
          if (selectedProjectId !== null)
            basculerSuivi("project", selectedProjectId);
        }}
      />

      <MoveOrCopyProjectModal
        opened={movedProject !== null}
        onClose={() => setMovedProject(null)}
        mode={movedProject?.mode}
        project={movedProject?.project ?? null}
        boards={projectBoards ?? []}
        onMoved={handleProjectMoved}
      />

      <DeleteConfirmModal
        opened={deletedProject !== null}
        onClose={() => setDeletedProject(null)}
        onConfirm={deleteProject}
        title="Supprimer le projet"
        message={
          <>
            Voulez-vous vraiment supprimer « {deletedProject?.name} » ? Ses
            commentaires seront supprimés. Cette action est irréversible.
          </>
        }
      />

      <ModeSwitch mode={mode} onModeChange={changeMode} />
      <ShortcutsHelp mode={mode} />

      {/* « Créer une tâche » : la fiche d'une carte, vide, qui choisit où
          elle va. On reste où l'on est ; la notification mène à la tâche. */}
      <CardDrawer
        opened={tacheSource !== null}
        onClose={() => setTacheSource(null)}
        card={null}
        source={tacheSource}
        // Depuis le mode Accès, la tâche naît sans membre : on la signale
        // sans s'en charger.
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
          void ouvrirCible({ kind: notification.kind, id: notification.target_id });
        }}
      />

      <PreferencesModal
        opened={preferencesOpened}
        onClose={() => setPreferencesOpened(false)}
        user={user}
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
        companies={companies}
        milestoneTypes={milestoneTypes}
        canEdit={user.settings.update}
        onDataChanged={handleSettingsChanged}
        debug={debug}
        onDebugChange={setDebug}
      />
    </Stack>
  );
}
