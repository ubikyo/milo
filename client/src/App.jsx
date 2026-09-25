import { Box, Stack } from "@mantine/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, setUnauthorizedHandler } from "./api";
import { getToken, setToken } from "./lib/auth";
import LoginPage from "./pages/LoginPage.jsx";
import AccessPage from "./pages/AccessPage.jsx";
import ProjectsPage from "./pages/ProjectsPage.jsx";
import SupportPage from "./pages/SupportPage.jsx";
import TasksPage from "./pages/TasksPage.jsx";
import { DEFAULT_MODE, MODES } from "./lib/modes";
import PreferencesModal from "./components/settings/PreferencesModal.jsx";
import BoardDrawer from "./components/board/BoardDrawer.jsx";
import Header from "./components/ui/Header.jsx";
import DeleteConfirmModal from "./components/ui/DeleteConfirmModal.jsx";
import MoveProjectModal from "./components/project/MoveProjectModal.jsx";
import ProjectBoardDrawer from "./components/project/ProjectBoardDrawer.jsx";
import ProjectDrawer from "./components/project/ProjectDrawer.jsx";
import ModeSwitch from "./components/ui/ModeSwitch.jsx";
import ShortcutsHelp from "./components/ui/ShortcutsHelp.jsx";
import SettingsModal from "./components/settings/SettingsModal.jsx";

export default function App() {
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);

  const [categories, setCategories] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [buildings, setBuildings] = useState([]);
  const [users, setUsers] = useState([]);
  // Chaque liste lue porte la sélection à laquelle elle répond : la société
  // pour les tableaux, le tableau pour les listes et les projets. On sait donc
  // dès le rendu si ce qu'on a en main concerne encore ce qui est affiché —
  // une remise à zéro par effet arriverait trop tard, elle ne s'exécute
  // qu'après l'affichage et l'écran vide du tableau précédent apparaîtrait le
  // temps d'une image.
  //
  // La liste dérivée vaut « null » tant qu'elle n'a pas été lue pour la
  // sélection courante, et « [] » quand elle est vide pour de bon.
  const [boardsLus, setBoardsLus] = useState(null);
  // Identifiant du tableau ouvert, en chaîne : c'est la valeur de l'onglet.
  const [boardId, setBoardId] = useState(null);
  // Tableaux du mode Projet : ils ne dépendent d'aucune société.
  const [projectBoards, setProjectBoards] = useState(null);
  const [projectBoardId, setProjectBoardId] = useState(null);
  const [taskListsLues, setTaskListsLues] = useState(null);
  const [labelsLues, setLabelsLues] = useState(null);
  // Les étiquettes du mode Projet, lues de la même façon que celles des
  // cartes, mais rattachées au tableau de projets ouvert.
  const [projectLabelsLues, setProjectLabelsLues] = useState(null);
  // « projects » ou « tasks ».
  const [mode, setMode] = useState(DEFAULT_MODE);
  // Le mode d'ouverture est un réglage du compte : il s'applique une fois, à
  // l'ouverture de la session, et non aux changements de mode qui suivent.
  const modeApplique = useRef(null);
  const [projectsLus, setProjectsLus] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("all");
  // « Toutes les sociétés » par défaut ; le mode Tâche impose ensuite une
  // société précise.
  const [companyFilter, setCompanyFilter] = useState("all");
  const [buildingFilter, setBuildingFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [actorFilter, setActorFilter] = useState("all");

  // Lectures en cours, par vue. Un écran vide est une conclusion : on ne la
  // tire jamais pendant une lecture, on n'affiche rien en attendant. Un
  // compteur et non un booléen, car deux lectures se chevauchent (les tableaux
  // puis leur contenu).
  const [lecturesTaches, setLecturesTaches] = useState(0);
  const [lecturesProjets, setLecturesProjets] = useState(0);
  const chargementTaches = lecturesTaches > 0;
  const chargementProjets = lecturesProjets > 0;

  const boards =
    boardsLus?.companyId === companyFilter ? boardsLus.items : null;
  const taskLists =
    taskListsLues?.boardId === boardId ? taskListsLues.items : null;
  // Les étiquettes d'un autre tableau ne valent pas pour celui-ci : tant que
  // les siennes ne sont pas lues, il n'en a aucune.
  const labels = labelsLues?.boardId === boardId ? labelsLues.items : [];
  const projectLabels =
    projectLabelsLues?.boardId === projectBoardId ? projectLabelsLues.items : [];
  const projects =
    projectsLus?.boardId === projectBoardId ? projectsLus.items : null;

  const [drawerOpened, setDrawerOpened] = useState(false);
  // Tiroir des tableaux : « null » à la création, le tableau visé sinon.
  const [boardDrawerOpened, setBoardDrawerOpened] = useState(false);
  const [editedBoard, setEditedBoard] = useState(null);
  const [projectBoardDrawerOpened, setProjectBoardDrawerOpened] =
    useState(false);
  const [editedProjectBoard, setEditedProjectBoard] = useState(null);
  const [settingsOpened, setSettingsOpened] = useState(false);
  const [preferencesOpened, setPreferencesOpened] = useState(false);
  // Dernière version de données connue, pour détecter les modifications
  // faites par quelqu'un d'autre.
  const knownVersion = useRef(null);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  // Projet visé par le menu de sa ligne : déplacement, ou suppression.
  const [movedProject, setMovedProject] = useState(null);
  const [deletedProject, setDeletedProject] = useState(null);

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
        building: buildingFilter,
        status: statusFilter,
        actor: actorFilter,
      });
      setProjectsLus({ boardId: projectBoardId, items: data });
      knownVersion.current =
        (await api.getVersion().catch(() => null))?.version ??
        knownVersion.current;
    } finally {
      setLecturesProjets((n) => n - 1);
      setLoaded(true);
    }
  }, [
    projectBoardId,
    categoryFilter,
    companyFilter,
    buildingFilter,
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

  const handleAuthenticated = ({ token, user: account }) => {
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
    const [nextCompanies, nextBuildings, nextUsers] = await Promise.all([
      api.getCompanies(),
      api.getBuildings(),
      api.getUsers(),
    ]);
    setCompanies(nextCompanies);
    setBuildings(nextBuildings);
    setUsers(nextUsers);
  }, []);

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
    if (user) loadProjects();
  }, [user, loadProjects]);

  useEffect(() => {
    if (user) loadProjectBoards();
  }, [user, loadProjectBoards]);

  // Le tableau de projets ouvert doit exister : en supprimer un ramène sur le
  // premier de la liste.
  useEffect(() => {
    if (!projectBoards) return;
    if (!projectBoards.length) return setProjectBoardId(null);
    if (!projectBoards.some((b) => String(b.id) === projectBoardId)) {
      setProjectBoardId(String(projectBoards[0].id));
    }
  }, [projectBoards, projectBoardId]);

  useEffect(() => {
    if (user) loadCategories();
  }, [user, loadCategories]);

  // Un filtre peut pointer vers une société/catégorie qui vient d'être supprimée.
  useEffect(() => {
    if (!companies.length) return;
    const connue = companies.some((c) => String(c.id) === companyFilter);

    // En mode Tâche, « toutes » n'a pas de sens : on retient la première société.
    if (mode === "tasks" && !connue) {
      setCompanyFilter(String(companies[0].id));
      return;
    }
    // En mode Projet, une société supprimée renvoie sur « toutes ».
    if (mode === "projects" && !connue && companyFilter !== "all") {
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
        companyId: companyFilter,
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
    if (!boards.length) return setBoardId(null);
    if (!boards.some((b) => String(b.id) === boardId))
      setBoardId(String(boards[0].id));
  }, [boards, boardId]);

  // Les étiquettes appartiennent au tableau ouvert : elles se lisent avec ses
  // listes, et servent au tiroir du tableau comme à celui d'une carte.
  // Appelée sans rien, elle relit les étiquettes du tableau. Appelée avec un
  // « patch », elle se contente de l'appliquer sur place, sans rien demander au
  // serveur : une étiquette recolorée se voit aussitôt sur les cartes, et la
  // relecture qui suit ne fait que confirmer.
  const loadLabels = useCallback(
    async (patch) => {
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
      setLabelsLues({ boardId, items: await api.getLabels(boardId) });
    },
    [boardId],
  );

  useEffect(() => {
    if (user) loadLabels();
  }, [user, loadLabels]);

  // Les étiquettes du mode Projet : mêmes règles que celles des cartes, sur le
  // tableau de projets ouvert.
  const loadProjectLabels = useCallback(
    async (patch) => {
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
        boardId: projectBoardId,
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
      setTaskListsLues({ boardId, items: await api.getTaskLists(boardId) });
    } finally {
      setLecturesTaches((n) => n - 1);
    }
  }, [boardId]);

  useEffect(() => {
    if (user) loadTaskLists();
  }, [user, loadTaskLists]);

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

  // Le bâtiment retenu doit exister et appartenir à la société sélectionnée :
  // sinon on filtrerait sur un bâtiment absent de la liste déroulante.
  useEffect(() => {
    if (buildingFilter === "all" || !buildings.length) return;
    const choisi = buildings.find((b) => String(b.id) === buildingFilter);
    const coherent =
      choisi &&
      (companyFilter === "all" || String(choisi.company_id) === companyFilter);
    if (!coherent) setBuildingFilter("all");
  }, [buildings, buildingFilter, companyFilter]);

  // Flux d'événements : le serveur pousse la version dès qu'une écriture a
  // lieu, le rechargement est donc immédiat. On consomme le flux avec `fetch`
  // et non `EventSource`, qui n'accepte pas d'en-tête d'authentification.
  useEffect(() => {
    if (!user) return undefined;

    let arrete = false;
    let controleur;

    const appliquer = async (version) => {
      if (knownVersion.current === null) {
        knownVersion.current = version;
        return;
      }
      if (version !== knownVersion.current) {
        knownVersion.current = version;
        await Promise.all([
          loadLookups(),
          loadProjectBoards(),
          loadCategories(),
          loadProjects(),
          loadBoards(),
          loadTaskLists(),
          loadLabels(),
          loadProjectLabels(),
        ]);
      }
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
              try {
                await appliquer(JSON.parse(ligne.slice(5)).version);
              } catch {
                /* message illisible : on ignore */
              }
            }
          }
        } catch {
          /* connexion perdue : nouvelle tentative après une courte pause */
        }
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
  ]);

  // Le retour en mode Projets repart de « Toutes les sociétés ».
  const changeMode = useCallback((suivant) => {
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
  // défiler les tableaux du mode courant, N nouveau projet, S/B/C font défiler
  // les filtres société / bâtiment / catégorie.
  useEffect(() => {
    const onKeyDown = (event) => {
      // Jamais pendant une saisie de texte : ni vol de frappe, ni navigation
      // clavier cassée dans les formulaires. En revanche les listes
      // déroulantes de Mantine sont des <input readonly> : elles ne reçoivent
      // aucune frappe, les raccourcis doivent continuer d'y fonctionner.
      const el = document.activeElement;
      const saisieDeTexte =
        el &&
        (el.tagName === "TEXTAREA" ||
          el.isContentEditable ||
          (el.tagName === "INPUT" && !el.readOnly));
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
          changeMode(MODES[(i + 1) % MODES.length].value);
          return;
        }

        // Tableau suivant du mode ouvert, en boucle sur le premier. Les
        // tableaux valent « null » tant qu'ils n'ont pas été lus.
        const tableaux = mode === "projects" ? projectBoards : boards;
        if (!tableaux?.length) return;
        const courant = mode === "projects" ? projectBoardId : boardId;
        const i = tableaux.findIndex((b) => String(b.id) === courant);
        const cible = String(tableaux[(i + 1) % tableaux.length].id);
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
      const suivante = (courante, valeurs) => {
        if (valeurs.length === 0) return courante;
        const i = valeurs.indexOf(courante);
        return valeurs[(i + 1) % valeurs.length];
      };

      if (event.code === "KeyS") {
        event.preventDefault();
        setCompanyFilter((c) =>
          suivante(c, [
            ...(mode === "projects" ? ["all"] : []),
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

  const handleOpenProject = (project) => {
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

  const handleProjectBoardSaved = async (board) => {
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
    try {
      await api.deleteProjectBoard(projectBoardId);
    } finally {
      await loadProjectBoards();
    }
  };

  const deleteBoard = async () => {
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
  const handleBoardSaved = async (board) => {
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
        {mode === "access" && <AccessPage />}
        {mode === "support" && <SupportPage />}

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
              companyFilter,
              buildings,
              buildingFilter,
              onBuildingFilterChange: setBuildingFilter,
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
        buildings={buildings}
        users={users}
        labels={projectLabels}
        currentUser={user}
        onCategoriesChanged={loadCategories}
        onLabelsChanged={loadProjectLabels}
        onSaved={handleSaved}
        onDeleted={handleSaved}
      />

      <MoveProjectModal
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
