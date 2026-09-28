import { Anchor, Box, Stack, Text } from "@mantine/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, setUnauthorizedHandler } from "./api";
import { getToken, setToken } from "./lib/auth";
import LoginPage from "./pages/LoginPage";
import AccessPage from "./pages/AccessPage";
import AssetsPage from "./pages/AssetsPage";
import ProjectsPage from "./pages/ProjectsPage";
import SupportPage, { statutDeLOnglet } from "./pages/SupportPage";
import TasksPage from "./pages/TasksPage";
import { notifications } from "@mantine/notifications";
import { IconEye } from "@tabler/icons-react";
import { DEFAULT_MODE, MODES, RESOURCES, emptyFollows, estNotification } from "@milo/shared";
import { cibleDeLAdresse, noterDansLAdresse } from "./lib/suivi";
import type { AccessPlugin } from "./plugins";
import type { Cible } from "./lib/suivi";
import AccessCategoryDrawer from "./components/access/AccessCategoryDrawer";
import SupportRequestDrawer from "./components/support/SupportRequestDrawer";
import AccessBlockDrawer from "./components/access/AccessBlockDrawer";
import AccessSectionDrawer from "./components/access/AccessSectionDrawer";
import PluginPickerModal from "./components/access/PluginPickerModal";
import PreferencesModal from "./components/settings/PreferencesModal";
import BoardDrawer from "./components/board/BoardDrawer";
import Header from "./components/ui/Header";
import DeleteConfirmModal from "./components/ui/DeleteConfirmModal";
import MoveOrCopyProjectModal from "./components/project/MoveOrCopyProjectModal";
import ProjectBoardDrawer from "./components/project/ProjectBoardDrawer";
import ProjectDrawer from "./components/project/ProjectDrawer";
import ModeSwitch from "./components/ui/ModeSwitch";
import ShortcutsHelp from "./components/ui/ShortcutsHelp";
import SettingsModal from "./components/settings/SettingsModal";
import type {
  AccessBlock,
  AccessCategory,
  AccessSection,
  AuthResult,
  Board,
  Category,
  Company,
  Label,
  Mode,
  Project,
  ProjectBoard,
  ProjectLabel,
  PublicUser,
  FollowKind,
  Follows,
  FluxMessage,
  Notification as NotificationSuivi,
  Resource,
  ResourceVersions,
  SupportLabel,
  SupportRequest,
  TaskList,
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

  const [categories, setCategories] = useState<Category[]>([]);
  // Les catégories du mode Accès : elles ne dépendent ni d'une société ni d'un
  // tableau, ce sont les onglets du mode.
  const [accessCategories, setAccessCategories] = useState<AccessCategory[] | null>(null);
  const [accessCategoryId, setAccessCategoryId] = useState<string | null>(null);
  // Les sections — les colonnes — de la catégorie ouverte. Comme ailleurs,
  // elles portent la catégorie qui a servi à les lire : celles d'une autre ne
  // valent pas pour celle-ci.
  const [accessSectionsLues, setAccessSectionsLues] = useState<LuPour<AccessSection> | null>(null);
  // Ce que les colonnes portent, lu d'un coup pour la catégorie ouverte.
  const [accessBlocsLus, setAccessBlocsLus] = useState<LuPour<AccessBlock> | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
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
  const [projectBoards, setProjectBoards] = useState<ProjectBoard[] | null>(null);
  const [projectBoardId, setProjectBoardId] = useState<string | null>(null);
  const [taskListsLues, setTaskListsLues] = useState<LuPour<TaskList> | null>(null);
  const [labelsLues, setLabelsLues] = useState<LuPour<Label> | null>(null);
  // Les étiquettes du mode Projet, lues de la même façon que celles des
  // cartes, mais rattachées au tableau de projets ouvert.
  const [projectLabelsLues, setProjectLabelsLues] = useState<LuPour<ProjectLabel> | null>(null);
  // Les demandes du mode Support et leurs étiquettes : les unes comme les
  // autres pendent à la société choisie dans l'entête.
  const [supportLues, setSupportLues] = useState<LuPour<SupportRequest> | null>(null);
  const [supportLabelsLues, setSupportLabelsLues] = useState<LuPour<SupportLabel> | null>(null);
  // « projects » ou « tasks ».
  const [mode, setMode] = useState<Mode>(DEFAULT_MODE);
  // Le mode d'ouverture est un réglage du compte : il s'applique une fois, à
  // l'ouverture de la session, et non aux changements de mode qui suivent.
  const modeApplique = useRef<number | null>(null);
  const [projectsLus, setProjectsLus] = useState<LuPour<Project> | null>(null);
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
  const chargementTaches = lecturesTaches > 0;
  const chargementProjets = lecturesProjets > 0;
  const chargementAcces = lecturesAcces > 0;
  const chargementSupport = lecturesSupport > 0;

  const boards = boardsLus?.cle === companyFilter ? boardsLus.items : null;
  const taskLists = taskListsLues?.cle === boardId ? taskListsLues.items : null;
  // Les étiquettes d'un autre tableau ne valent pas pour celui-ci : tant que
  // les siennes ne sont pas lues, il n'en a aucune.
  const labels = labelsLues?.cle === boardId ? labelsLues.items : [];
  const projectLabels =
    projectLabelsLues?.cle === projectBoardId ? projectLabelsLues.items : [];
  const projects = projectsLus?.cle === projectBoardId ? projectsLus.items : null;
  // Les demandes d'une autre société ne valent pas pour celle-ci : tant que les
  // siennes ne sont pas lues, elles restent inconnues.
  const supportRequests = supportLues?.cle === companyFilter ? supportLues.items : null;
  const supportLabels = supportLabelsLues?.cle === companyFilter ? supportLabelsLues.items : [];
  const accessSections =
    accessSectionsLues?.cle === accessCategoryId ? accessSectionsLues.items : null;
  const accessBlocks = accessBlocsLus?.cle === accessCategoryId ? accessBlocsLus.items : [];

  const [drawerOpened, setDrawerOpened] = useState(false);
  // Tiroir des tableaux : « null » à la création, le tableau visé sinon.
  const [boardDrawerOpened, setBoardDrawerOpened] = useState(false);
  const [editedBoard, setEditedBoard] = useState<Board | null>(null);
  const [projectBoardDrawerOpened, setProjectBoardDrawerOpened] =
    useState(false);
  const [editedProjectBoard, setEditedProjectBoard] = useState<ProjectBoard | null>(null);
  // Tiroir d'une demande de support : « null » à la création, la demande visée
  // sinon. L'onglet ouvert dit le statut que prend une demande créée là.
  const [supportDrawerOpened, setSupportDrawerOpened] = useState(false);
  const [editedSupportRequest, setEditedSupportRequest] = useState<SupportRequest | null>(null);
  const [supportStatusTab, setSupportStatusTab] = useState("all");
  // Tiroir des catégories d'accès : « null » à la création, la catégorie visée sinon.
  const [accessDrawerOpened, setAccessDrawerOpened] = useState(false);
  const [editedAccessCategory, setEditedAccessCategory] = useState<AccessCategory | null>(null);
  // Tiroir des sections : même règle, « null » à la création.
  const [sectionDrawerOpened, setSectionDrawerOpened] = useState(false);
  const [editedAccessSection, setEditedAccessSection] = useState<AccessSection | null>(null);
  // La section dont la zone en pointillé vient d'être cliquée : c'est elle qui
  // accueillera l'élément choisi dans la boîte.
  const [sectionPourBloc, setSectionPourBloc] = useState<AccessSection | null>(null);
  // Tiroir d'un élément : celui qu'on vient de créer, ou celui qu'on rouvre.
  const [editedAccessBlock, setEditedAccessBlock] = useState<AccessBlock | null>(null);
  const [settingsOpened, setSettingsOpened] = useState(false);
  const [preferencesOpened, setPreferencesOpened] = useState(false);
  // Dernière version de données connue, pour détecter les modifications
  // faites par quelqu'un d'autre.
  const versionsConnues = useRef<ResourceVersions | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  // Ce que la personne suit. Chaque écriture rend la liste entière : elle se
  // lit une fois à l'ouverture de la session, puis suit les clics.
  const [follows, setFollows] = useState<Follows>(emptyFollows());
  // Carte désignée par l'adresse, en attente que son tableau soit lu : c'est
  // le tableau qui l'ouvrira, lui seul la connaît (TaskBoard).
  const [carteAOuvrir, setCarteAOuvrir] = useState<number | null>(null);
  // Carte dont le tiroir est ouvert, telle que le tableau la rapporte : c'est
  // elle que l'adresse porte.
  const [carteAffichee, setCarteAffichee] = useState<number | null>(null);
  // Projet visé par le menu de sa ligne : déplacement, ou suppression.
  const [movedProject, setMovedProject] = useState<Project | null>(null);
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
      const data = await api.getProjects({
        board: projectBoardId,
        category: categoryFilter,
        company: companyFilter,
        status: statusFilter,
        actor: actorFilter,
      });
      setProjectsLus({ cle: projectBoardId, items: data });
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
      try {
        const { needs_setup } = await api.getSetupState();
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
    const [nextCompanies, nextUsers] = await Promise.all([api.getCompanies(), api.getUsers()]);
    setCompanies(nextCompanies);
    setUsers(nextUsers);
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
    if (!companyFilter || companyFilter === "all") return setSupportLues(null);
    setLecturesSupport((n) => n + 1);
    try {
      setSupportLues({ cle: companyFilter, items: await api.getSupportRequests(companyFilter) });
    } finally {
      setLecturesSupport((n) => n - 1);
    }
  }, [companyFilter]);

  // Les étiquettes du support, lues comme celles des cartes : sans argument,
  // elles se relisent ; avec un correctif, il s'applique sur place — une
  // étiquette recolorée se voit aussitôt sur les demandes.
  const loadSupportLabels = useCallback(
    async (patch?: { id: number; data: Partial<SupportLabel> }) => {
      if (patch) {
        setSupportLabelsLues((l) =>
          l
            ? {
                ...l,
                items: l.items.map((e) => (e.id === patch.id ? { ...e, ...patch.data } : e)),
              }
            : l,
        );
        return;
      }
      if (!companyFilter || companyFilter === "all") return setSupportLabelsLues(null);
      setSupportLabelsLues({
        cle: companyFilter,
        items: await api.getSupportLabels(companyFilter),
      });
    },
    [companyFilter],
  );

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
    api.getFollows().then(setFollows).catch(() => setFollows(emptyFollows()));
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

  useEffect(() => {
    if (user) loadSupportLabels();
  }, [user, loadSupportLabels]);

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

    // En mode Tâche comme en mode Support, « toutes » n'a pas de sens : les
    // listes comme les demandes appartiennent à une société précise. On retient
    // la première.
    if ((mode === "tasks" || mode === "support") && !connue && companies[0]) {
      setCompanyFilter(String(companies[0].id));
      return;
    }
    // En mode Projet comme en mode Assets, une société supprimée renvoie sur
    // « toutes ».
    if ((mode === "projects" || mode === "assets") && !connue && companyFilter !== "all") {
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
      setBoardsLus({ cle: companyFilter, items: await api.getBoards(companyFilter) });
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
    if (!boards.some((b) => String(b.id) === boardId)) setBoardId(String(premier.id));
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
    // « Aucune liste dans ce tableau » au premier passage en mode Tâche.
    if (!boardId) return setTaskListsLues(null);
    setLecturesTaches((n) => n + 1);
    try {
      setTaskListsLues({ cle: boardId, items: await api.getTaskLists(boardId) });
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
        setFollows(suivi ? await api.unfollow(kind, id) : await api.follow(kind, id));
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
    if (cible.kind === "project") {
      setMode("projects");
      setSelectedProjectId(cible.id);
      setDrawerOpened(true);
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
   * Ce qu'on voit quand un élément suivi change. Le serveur n'envoie rien pour
   * ses propres gestes : tout ce qui arrive ici vient de quelqu'un d'autre, et
   * il n'y a donc rien à filtrer.
   */
  const montrerNotification = useCallback(
    (avis: NotificationSuivi) => {
      notifications.show({
        id: avis.id,
        title: avis.title,
        icon: <IconEye size={18} />,
        color: "teal",
        autoClose: 10000,
        message: (
          <Stack gap={4}>
            <Text size="sm">
              {avis.author} {avis.message}
            </Text>
            <Anchor
              size="sm"
              onClick={() => {
                notifications.hide(avis.id);
                ouvrirCible({ kind: avis.kind, id: avis.target_id });
              }}
            >
              Ouvrir
            </Anchor>
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
      "support-requests": loadSupportRequests,
      "support-labels": () => loadSupportLabels(),
    };

    const appliquer = async (message: FluxMessage) => {
      // Deux sortes de messages circulent : les compteurs de version, qui
      // s'adressent à tout le monde, et les notifications de suivi, qui ne
      // s'adressent qu'à nous.
      if (estNotification(message)) {
        montrerNotification(message.notification);
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
    loadSupportRequests,
    loadSupportLabels,
    montrerNotification,
  ]);

  // Le retour en mode Projets repart de « Toutes les sociétés ».
  const changeMode = useCallback((suivant: Mode) => {
    setMode(suivant);
    if (suivant === "projects") setCompanyFilter("all");
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

  // Raccourcis clavier : Tab fait le tour des modes, Option/Alt + Tab fait
  // défiler les tableaux du mode courant, N nouveau projet, S fait défiler le
  // filtre société.
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

      // « Nouveau projet » n'existe qu'en mode Projet, raccourci compris.
      if (event.code === "KeyN") {
        if (mode !== "projects") return;
        event.preventDefault();
        handleOpenNewProject();
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

  const openNewAccessSection = () => {
    setEditedAccessSection(null);
    setSectionDrawerOpened(true);
  };

  // La zone en pointillé d'une colonne : elle ouvre la boîte de choix, et
  // c'est le greffon choisi qui dit ce que l'élément sera.
  const openPluginPicker = (section: AccessSection) => setSectionPourBloc(section);

  /**
   * Le greffon choisi : l'élément est créé aussitôt avec la configuration que
   * le greffon donne par défaut, puis son tiroir s'ouvre pour la régler. Sans
   * cela, il faudrait un tiroir qui crée et un autre qui modifie.
   */
  const handlePluginChoisi = async (plugin: AccessPlugin) => {
    const section = sectionPourBloc;
    setSectionPourBloc(null);
    if (!section) return;
    const bloc = await api.createAccessBlock({
      section_id: section.id,
      type: plugin.type,
      config: plugin.defaultConfig,
    });
    await loadAccessBlocks();
    setEditedAccessBlock(bloc);
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

  const openEditAccessCategory = () => {
    setEditedAccessCategory(
      accessCategories?.find((c) => String(c.id) === accessCategoryId) ?? null,
    );
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

  // Suppression demandée depuis le menu « Actions » des onglets : la
  // confirmation a déjà été donnée dans la modale. Le rechargement a lieu même
  // en cas de refus du serveur : les onglets montrent alors ce qui existe
  // encore.
  const deleteAccessCategory = async () => {
    if (!accessCategoryId) return;
    try {
      await api.deleteAccessCategory(Number(accessCategoryId));
    } finally {
      await loadAccessCategories();
    }
  };

  // Une demande créée depuis un onglet en prend le statut ; depuis « Tous »,
  // elle s'ouvre « Non résolu ».
  const openNewSupportRequest = () => {
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

  const openEditProjectBoard = () => {
    setEditedProjectBoard(
      projectBoards?.find((b) => String(b.id) === projectBoardId) ?? null,
    );
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

  // Suppressions demandées depuis le menu « Actions » des onglets : la
  // confirmation a déjà été donnée dans la modale. Le rechargement a lieu même
  // en cas de refus du serveur : les onglets montrent alors ce qui existe
  // encore, l'onglet visé compris.
  const deleteProjectBoard = async () => {
    if (!projectBoardId) return;
    try {
      await api.deleteProjectBoard(Number(projectBoardId));
    } finally {
      await loadProjectBoards();
    }
  };

  const deleteBoard = async () => {
    if (!boardId) return;
    try {
      await api.deleteBoard(boardId);
    } finally {
      await loadBoards();
    }
  };

  const openNewBoard = () => {
    setEditedBoard(null);
    setBoardDrawerOpened(true);
  };

  const openEditBoard = () => {
    setEditedBoard(boards?.find((b) => String(b.id) === boardId) ?? null);
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
        onAuthenticated={handleAuthenticated}
      />
    );

  return (
    <Stack gap={0} h="100vh">
      <Header
        companies={companies}
        companyFilter={companyFilter}
        onCompanyFilterChange={setCompanyFilter}
        onOpenSettings={() => setSettingsOpened(true)}
        user={user}
        onLogout={handleLogout}
        onOpenPreferences={() => setPreferencesOpened(true)}
        mode={mode}
      />
      {/* Contenu resserré : moitié moins d'espace en haut et sur les côtés que
          les 100px d'origine, sur les projets comme sur les listes. */}
      <Box
        pt={50}
        px={50}
        pb={100}
        w="100%"
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {mode === "access" && (
          <AccessPage
            categories={accessCategories}
            categoryId={accessCategoryId}
            onCategoryChange={setAccessCategoryId}
            onAddCategory={openNewAccessCategory}
            onEditCategory={openEditAccessCategory}
            onDeleteCategory={deleteAccessCategory}
            sections={accessSections}
            onAddSection={openNewAccessSection}
            blocks={accessBlocks}
            onAddBlock={openPluginPicker}
            onEditBlock={setEditedAccessBlock}
            loading={chargementAcces}
          />
        )}
        {mode === "support" && (
          <SupportPage
            requests={supportRequests}
            statusTab={supportStatusTab}
            onStatusTabChange={setSupportStatusTab}
            onOpenRequest={openSupportRequest}
            onAddRequest={openNewSupportRequest}
            hasCompany={companyFilter !== "all" && companyFilter !== ""}
            loading={chargementSupport}
          />
        )}

        {/* Le mode Assets n'a encore que sa place : sa page dit simplement
            qu'elle est vide. */}
        {mode === "assets" && <AssetsPage />}

        {loaded && mode === "tasks" && (
          <TasksPage
            boards={boards}
            boardId={boardId}
            onBoardChange={setBoardId}
            onAddBoard={openNewBoard}
            onEditBoard={openEditBoard}
            onDeleteBoard={deleteBoard}
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
          />
        )}

        {loaded && mode === "projects" && (
          <ProjectsPage
            boards={projectBoards}
            boardId={projectBoardId}
            onBoardChange={setProjectBoardId}
            onAddBoard={openNewProjectBoard}
            onEditBoard={openEditProjectBoard}
            onDeleteBoard={deleteProjectBoard}
            projects={projects}
            filters={{
              categories,
              categoryFilter,
              onCategoryFilterChange: setCategoryFilter,
              statusFilter,
              onStatusFilterChange: setStatusFilter,
              users,
              actorFilter,
              onActorFilterChange: setActorFilter,
            }}
            onRowClick={handleOpenProject}
            onMoveProject={setMovedProject}
            onDeleteProject={setDeletedProject}
            onAddProject={handleOpenNewProject}
            loading={chargementProjets}
          />
        )}
      </Box>

      <BoardDrawer
        opened={boardDrawerOpened}
        onClose={() => setBoardDrawerOpened(false)}
        board={editedBoard}
        companyId={companyFilter}
        labels={labels}
        onLabelsChanged={loadLabels}
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

      <PluginPickerModal
        opened={sectionPourBloc !== null}
        onClose={() => setSectionPourBloc(null)}
        onChoose={handlePluginChoisi}
      />

      <AccessBlockDrawer
        opened={editedAccessBlock !== null}
        onClose={() => setEditedAccessBlock(null)}
        block={editedAccessBlock}
        onSaved={handleAccessBlockSaved}
        onDeleted={handleAccessBlockSaved}
      />

      <AccessSectionDrawer
        opened={sectionDrawerOpened}
        section={editedAccessSection}
        categoryId={accessCategoryId}
        onSaved={handleAccessSectionSaved}
        onDeleted={handleAccessSectionSaved}
      />

      <SupportRequestDrawer
        opened={supportDrawerOpened}
        onClose={() => setSupportDrawerOpened(false)}
        request={editedSupportRequest}
        companyId={companyFilter}
        defaultStatus={statutDeLOnglet(supportStatusTab)}
        users={users}
        labels={supportLabels}
        onLabelsChanged={loadSupportLabels}
        currentUser={user}
        onSaved={handleSupportRequestSaved}
        onDeleted={handleSupportRequestSaved}
      />

      <ProjectBoardDrawer
        opened={projectBoardDrawerOpened}
        onClose={() => setProjectBoardDrawerOpened(false)}
        board={editedProjectBoard}
        categories={categories}
        onCategoriesChanged={loadCategories}
        labels={projectLabels}
        onLabelsChanged={loadProjectLabels}
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
        users={users}
        labels={projectLabels}
        boards={projectBoards ?? []}
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
        project={movedProject}
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
        currentUser={user}
        onUserUpdated={setUser}
        onDataChanged={handleSettingsChanged}
      />
    </Stack>
  );
}
