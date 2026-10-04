import { Stack } from "@mantine/core";
import { IconList } from "@tabler/icons-react";
import { PROJECT_COLUMNS, ProjectsListWidget } from "../components/project/ProjectTable";
import CopyPasteActions from "../components/ui/CopyPasteActions";
import ColumnFields, { LIST_COLUMNS } from "../components/ui/ColumnFields";
import BoardListFields from "../components/ui/BoardListFields";
import { useSettingsMode } from "../lib/rights";
import type { WidgetConfigProps } from "../widgets/types";
import type { ProjectIndicatorWidget } from "./types";

// La liste des projets, en widget : elle se pose dans une section comme un
// indicateur, et sa configuration dit ce qu'elle affiche — ses colonnes. Les
// projets du tableau ouvert, ses filtres et ce qu'on en ouvre viennent de la
// page (ProjetsListeContext). Le menu « Actions » de son tiroir copie et
// colle les étiquettes et les catégories du tableau.

export const projectsListIndicator: ProjectIndicatorWidget = {
  type: "list",
  kind: "project",
  label: "Projets",
  icon: IconList,
  // Posé, le widget montre ces colonnes ; les autres s'ajoutent depuis son
  // tiroir.
  defaultConfig: {
    [LIST_COLUMNS]: [
      "number",
      "name",
      "category_name",
      "actors",
      "created_at",
      "labels",
      "status",
    ].map((key) => ({ key })),
  },
  ownClicks: true,
  fill: true,
  Display: ({ config }) => <ProjectsListWidget config={config} />,
  Config: Settings,
};

function Settings(props: WidgetConfigProps) {
  // Les types de jalons relèvent du Paramétrage.
  const canEditSettings = useSettingsMode();
  return (
    <>
      <CopyPasteActions scope="projects" items={["labels", "categories"]} />
      <Stack gap="xl">
        <ColumnFields columns={PROJECT_COLUMNS} {...props} />
        {/* Les catégories, les étiquettes du tableau et les types de jalons,
            sous ses colonnes : ils partent à la sauvegarde, avec la
            configuration. */}
        <BoardListFields kind="categories" />
        <BoardListFields kind="project-labels" />
        {canEditSettings && <BoardListFields kind="milestone-types" />}
      </Stack>
    </>
  );
}
