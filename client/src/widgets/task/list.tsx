import { Stack, Switch } from "@mantine/core";
import { IconLayoutKanban } from "@tabler/icons-react";
import { NUMBERS, TaskBoardWidget, withNumbers } from "../../components/board/TaskBoard";
import CopyPasteActions from "../../components/ui/CopyPasteActions";
import BoardListFields from "../../components/ui/BoardListFields";
import { withField } from "../types";
import type { TaskIndicatorWidget } from "./types";

// The open board's lists and their cards, as a widget: they sit
// in a section like an indicator. What they show, and what is done with them,
// comes from the page (TaskBoardContext). The cards' number is
// a widget option, off by default; the lists' lock remains a
// board setting. The "Actions" menu of its drawer copies and pastes the
// board's labels.

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
        {/* The board's labels: they go to saving. */}
        <BoardListFields kind="task-labels" />
      </Stack>
    </>
  ),
  ownClicks: true,
  fill: true,
  Display: ({ config }) => <TaskBoardWidget config={config} />,
};
