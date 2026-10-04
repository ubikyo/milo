import { Stack, Switch } from "@mantine/core";
import { IconLayoutKanban } from "@tabler/icons-react";
import { NUMBERS, TaskBoardWidget, withNumbers } from "../components/board/TaskBoard";
import CopyPasteActions from "../components/ui/CopyPasteActions";
import BoardListFields from "../components/ui/BoardListFields";
import { withField } from "../widgets/types";
import type { TaskIndicatorWidget } from "./types";

// Les listes du tableau ouvert et leurs cartes, en widget : elles se posent
// dans une section comme un indicateur. Ce qu'elles montrent, et ce qu'on en
// fait, vient de la page (TableauDesTachesContext). Le numéro des cartes est
// une option du widget, éteinte par défaut ; le verrou des listes reste un
// réglage du tableau. Le menu « Actions » de son tiroir copie et colle les
// étiquettes du tableau.

export const taskListIndicator: TaskIndicatorWidget = {
  type: "list",
  kind: "task",
  label: "Tâches",
  icon: IconLayoutKanban,
  defaultConfig: { [NUMBERS]: false },
  Config: ({ config, onChange }) => (
    <>
      <CopyPasteActions scope="tasks" items={["labels"]} />
      <Stack gap="xl">
        <Switch
          color="teal"
          label="Numéro des cartes"
          checked={withNumbers(config)}
          onChange={(e) => onChange(withField(config, NUMBERS, e.currentTarget.checked))}
        />
        {/* Les étiquettes du tableau : elles partent à la sauvegarde. */}
        <BoardListFields kind="task-labels" />
      </Stack>
    </>
  ),
  ownClicks: true,
  fill: true,
  Display: ({ config }) => <TaskBoardWidget config={config} />,
};
