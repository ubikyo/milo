import { Stack } from "@mantine/core";
import { IconList } from "@tabler/icons-react";
import { PROJECT_COLUMNS, ProjectsListWidget } from "../../components/project/ProjectTable";
import CopyPasteActions from "../../components/ui/CopyPasteActions";
import ColumnFields, { LIST_COLUMNS } from "../../components/ui/ColumnFields";
import ProjectCategoriesFields from "../../components/project/ProjectCategoriesFields";
import BoardListFields from "../../components/ui/BoardListFields";
import LabelGroupFields from "../../components/ui/LabelGroupFields";
import type { WidgetConfigProps } from "../types";
import type { ProjectIndicatorWidget } from "./types";
import { PERCENT_HEIGHT } from "../height";

// The projects list, as a widget: it sits in a section like an
// indicator, and its configuration says what it displays — its columns. The
// open board's projects, its filters and what is opened from it come from the
// page (ProjectsListContext). The "Actions" menu of its drawer copies and
// pastes its labels and categories.

export const projectsListIndicator: ProjectIndicatorWidget = {
  type: "list",
  kind: "project",
  label: "Projets",
  icon: IconList,
  // Once placed, the widget shows these columns; the others are added from its
  // drawer.
  defaultConfig: {
    ...PERCENT_HEIGHT,
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
  return (
    <>
      <CopyPasteActions scope="projects" items={["labels", "categories"]} />
      <Stack gap="xl">
        <ColumnFields columns={PROJECT_COLUMNS} {...props} />
        {/* The widget's categories, labels and milestone types, under its
            columns: they go to saving, with the configuration. */}
        <ProjectCategoriesFields />
        <LabelGroupFields kind="project-labels" />
        <BoardListFields kind="milestone-types" />
      </Stack>
    </>
  );
}
