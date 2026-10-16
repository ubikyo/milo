import { Stack, Switch } from "@mantine/core";
import { IconLayoutKanban } from "@tabler/icons-react";
import { TASKS_MAIL_TEMPLATE_KEYS } from "@milo/shared";
import { NUMBERS, TaskBoardWidget, withNumbers } from "../../components/board/TaskBoard";
import MailTemplates from "../../components/settings/MailTemplates";
import CopyPasteActions from "../../components/ui/CopyPasteActions";
import LabelGroupFields from "../../components/ui/LabelGroupFields";
import { useSettingsMode, useTemplatesAccess } from "../../lib/rights";
import { withField } from "../types";
import type { WidgetConfigProps } from "../types";
import type { TaskIndicatorWidget } from "./types";
import { PERCENT_HEIGHT } from "../height";

// The open board's lists and their cards, as a widget: they sit
// in a section like an indicator. What they show, and what is done with them,
// comes from the page (TaskBoardContext). The cards' number is
// a widget option, off by default; the lists' lock remains a
// board setting. The "Actions" menu of its drawer copies and pastes the
// board's labels. For whoever may modify the Paramétrage, the template of
// the due date reminder follows.

function ListFields({ config, onChange }: WidgetConfigProps) {
  const canEditSettings = useSettingsMode();
  const canEditTemplates = useTemplatesAccess();
  return (
    <>
      <CopyPasteActions scope="tasks" items={["labels"]} />
      <Stack gap="xl">
        {/* The board's labels: they go to saving. */}
        <LabelGroupFields kind="task-labels" />
        <Switch
          color="teal"
          label="Numéro des cartes"
          checked={withNumbers(config)}
          onChange={(e) => onChange(withField(config, NUMBERS, e.currentTarget.checked))}
        />
        {canEditSettings && <MailTemplates canEdit={canEditTemplates} only={TASKS_MAIL_TEMPLATE_KEYS} />}
      </Stack>
    </>
  );
}

export const taskListIndicator: TaskIndicatorWidget = {
  type: "list",
  kind: "task",
  label: "Tâches",
  icon: IconLayoutKanban,
  defaultConfig: { [NUMBERS]: false, ...PERCENT_HEIGHT },
  Config: (props) => <ListFields {...props} />,
  ownClicks: true,
  fill: true,
  Display: ({ config }) => <TaskBoardWidget config={config} />,
};
