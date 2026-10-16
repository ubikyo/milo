import { Stack } from "@mantine/core";
import { IconList } from "@tabler/icons-react";
import { PROJECT_DEFAULT_COLUMNS, SUPPORT_CREATION, TASK_CREATION } from "@milo/shared";
import { PROJECT_COLUMNS, ProjectsListWidget } from "../../components/project/ProjectTable";
import CopyPasteActions from "../../components/ui/CopyPasteActions";
import ColumnFields, { LIST_COLUMNS } from "../../components/ui/ColumnFields";
import ProjectCategoriesFields from "../../components/project/ProjectCategoriesFields";
import BoardListFields from "../../components/ui/BoardListFields";
import LabelGroupFields from "../../components/ui/LabelGroupFields";
import { WidgetLinksField } from "../../components/ui/WidgetLinks";
import type { WidgetConfigProps } from "../types";
import type { ProjectIndicatorWidget } from "./types";
import { PERCENT_HEIGHT } from "../height";

// The projects list, as a widget: it sits in a section like an
// indicator, and its configuration says what it displays — its columns. The
// open board's projects, its filters and what is opened from it come from the
// page (ProjectsListContext). The "Actions" menu of its drawer copies and
// pastes its labels and categories. Its projects create tickets and tasks in
// the widgets it names ("Widgets associés"), above its columns.

export const projectsListIndicator: ProjectIndicatorWidget = {
  type: "list",
  kind: "project",
  label: "Projets",
  icon: IconList,
  // Once placed, the widget shows these columns; the others are added from its
  // drawer. The labels column shows the "Priorité" group: the server names it
  // once the group exists (repositories/list-seeds.ts).
  defaultConfig: {
    ...PERCENT_HEIGHT,
    [LIST_COLUMNS]: PROJECT_DEFAULT_COLUMNS.map(({ groupName: _groupName, ...c }) => c),
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
        <WidgetLinksField
          direction="out"
          inputs={[
            { field: SUPPORT_CREATION, label: "Création d'une demande de support", types: ["support.list"], single: true },
            { field: TASK_CREATION, label: "Création d'une tâche", types: ["task.list"] },
          ]}
          config={props.config}
          onChange={props.onChange}
        />
        <ColumnFields columns={PROJECT_COLUMNS} defaults={PROJECT_DEFAULT_COLUMNS} {...props} />
        {/* The widget's labels, categories and milestone types, under its
            columns: they go to saving, with the configuration. */}
        <LabelGroupFields kind="project-labels" />
        <ProjectCategoriesFields />
        <BoardListFields kind="milestone-types" />
      </Stack>
    </>
  );
}
