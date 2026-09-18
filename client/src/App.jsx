import { Container, Stack, Title } from "@mantine/core";
import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import Header from "./components/Header.jsx";
import ProjectDrawer from "./components/ProjectDrawer.jsx";
import ProjectTable from "./components/ProjectTable.jsx";

export default function App() {
  const [categories, setCategories] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const [drawerOpened, setDrawerOpened] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState(null);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getProjects({ category: categoryFilter, status: statusFilter });
      setProjects(data);
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, statusFilter]);

  useEffect(() => {
    api.getCategories().then(setCategories);
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const handleOpenNewProject = () => {
    setSelectedProjectId(null);
    setDrawerOpened(true);
  };

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

  return (
    <Stack gap={0}>
      <Header
        categories={categories}
        categoryFilter={categoryFilter}
        onCategoryFilterChange={setCategoryFilter}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        onAddProject={handleOpenNewProject}
      />
      <Container size="lg" py="xl">
        <Title order={2} mb="md">
          Projets
        </Title>
        <ProjectTable projects={projects} loading={loading} onRowClick={handleOpenProject} />
      </Container>

      <ProjectDrawer
        opened={drawerOpened}
        onClose={handleCloseDrawer}
        projectId={selectedProjectId}
        categories={categories}
        onSaved={handleSaved}
        onDeleted={handleSaved}
      />
    </Stack>
  );
}
