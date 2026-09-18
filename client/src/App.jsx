import { Box, ScrollArea, Stack, Title } from "@mantine/core";
import { useCallback, useEffect, useState } from "react";
import { api, setUnauthorizedHandler } from "./api";
import { getToken, setToken } from "./auth";
import LoginPage from "./components/LoginPage.jsx";
import Header from "./components/Header.jsx";
import ProjectDrawer from "./components/ProjectDrawer.jsx";
import ProjectTable from "./components/ProjectTable.jsx";
import SettingsModal from "./components/SettingsModal.jsx";

export default function App() {
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);

  const [categories, setCategories] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [buildings, setBuildings] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [buildingFilter, setBuildingFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const [drawerOpened, setDrawerOpened] = useState(false);
  const [settingsOpened, setSettingsOpened] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState(null);

  const loadProjects = useCallback(async () => {
    try {
      const data = await api.getProjects({
        category: categoryFilter,
        company: companyFilter,
        building: buildingFilter,
        status: statusFilter,
      });
      setProjects(data);
    } finally {
      setLoaded(true);
    }
  }, [categoryFilter, companyFilter, buildingFilter, statusFilter]);

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
    setProjects([]);
    setLoaded(false);
  };

  const loadLookups = useCallback(async () => {
    const [nextCategories, nextCompanies, nextBuildings] = await Promise.all([
      api.getCategories(),
      api.getCompanies(),
      api.getBuildings(),
    ]);
    setCategories(nextCategories);
    setCompanies(nextCompanies);
    setBuildings(nextBuildings);
  }, []);

  useEffect(() => {
    if (user) loadLookups();
  }, [user, loadLookups]);

  useEffect(() => {
    if (user) loadProjects();
  }, [user, loadProjects]);

  // Un filtre peut pointer vers une société/catégorie qui vient d'être supprimée.
  useEffect(() => {
    if (
      companyFilter !== "all" &&
      companies.length &&
      !companies.some((c) => String(c.id) === companyFilter)
    ) {
      setCompanyFilter("all");
    }
  }, [companies, companyFilter]);

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
      buildingFilter !== "all" &&
      buildings.length &&
      !buildings.some((b) => String(b.id) === buildingFilter)
    ) {
      setBuildingFilter("all");
    }
  }, [buildings, buildingFilter]);

  const handleOpenNewProject = useCallback(() => {
    setSelectedProjectId(null);
    setDrawerOpened(true);
  }, []);

  // « N » : nouveau projet. Sans modificateur, donc on s'efface dès qu'une
  // saisie est en cours pour ne pas voler la frappe.
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.code !== "KeyN" || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;

      const el = document.activeElement;
      const saisieEnCours =
        el && (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.isContentEditable);
      if (saisieEnCours) return;

      event.preventDefault();
      handleOpenNewProject();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleOpenNewProject]);

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

  const handleSettingsChanged = async () => {
    await loadLookups();
    await loadProjects();
  };

  const hasFilters =
    categoryFilter !== "all" || companyFilter !== "all" || buildingFilter !== "all" || statusFilter !== "all";
  // Rien ne dépend d'un état "en cours de chargement" : un rechargement (ajout
  // d'une société depuis les réglages, par exemple) ne doit rien faire
  // apparaître ni disparaître le temps de la requête.
  const hasProjects = projects.length > 0;
  const showFilters = loaded && (hasProjects || hasFilters);

  if (!authChecked) return null;
  if (!user) return <LoginPage needsSetup={needsSetup} onAuthenticated={handleAuthenticated} />;

  return (
    <Stack gap={0} h="100vh">
      <Header
        companies={companies}
        companyFilter={companyFilter}
        onCompanyFilterChange={setCompanyFilter}
        buildings={buildings}
        buildingFilter={buildingFilter}
        onBuildingFilterChange={setBuildingFilter}
        categories={categories}
        categoryFilter={categoryFilter}
        onCategoryFilterChange={setCategoryFilter}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        onAddProject={handleOpenNewProject}
        onOpenSettings={() => setSettingsOpened(true)}
        showFilters={showFilters}
        user={user}
        onLogout={handleLogout}
      />
      <Box p={100} w="100%" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        {loaded && hasProjects && (
          <Title order={2} mb="md">
            Projets
          </Title>
        )}
        {loaded && (
          <ScrollArea
            style={{ flex: 1, minHeight: 0 }}
            type="always"
            scrollbarSize={2}
            styles={{
              // Même principe que dans les réglages : la barre pilote la liste
              // mais se cale sur le bord droit de la fenêtre, sur toute sa hauteur.
              root: { position: "static" },
              scrollbar: {
                position: "fixed",
                top: 0,
                bottom: 0,
                right: 0,
                left: "auto",
                height: "auto",
                width: "var(--scrollarea-scrollbar-size)",
              },
            }}
          >
            <ProjectTable
              projects={projects}
              filtered={hasFilters}
              onRowClick={handleOpenProject}
              onAddProject={handleOpenNewProject}
            />
          </ScrollArea>
        )}
      </Box>

      <ProjectDrawer
        opened={drawerOpened}
        onClose={handleCloseDrawer}
        projectId={selectedProjectId}
        categories={categories}
        companies={companies}
        buildings={buildings}
        onSaved={handleSaved}
        onDeleted={handleSaved}
      />

      <SettingsModal
        opened={settingsOpened}
        onClose={() => setSettingsOpened(false)}
        companies={companies}
        categories={categories}
        currentUser={user}
        onDataChanged={handleSettingsChanged}
      />
    </Stack>
  );
}
