import { api } from "../../api";
import { TASK_INDICATORS, indicateurTacheDe } from "../../task-indicators";
import IndicatorsPanel, { type IndicatorsApi } from "../ui/IndicatorsPanel";
import type { Id, IndicatorSection, TaskIndicator, TaskIndicatorType, TaskList } from "@milo/shared";

// Les sections du mode Tâche, sous les onglets. Leurs widgets sont ceux de
// client/src/task-indicators : les listes du tableau ouvert, et les
// indicateurs qui se calculent sur ses cartes.
interface TaskIndicatorsPanelProps {
  /** « null » tant que les sections du panneau ne sont pas lues. */
  sections: IndicatorSection[] | null;
  indicators: TaskIndicator[];
  lists: TaskList[];
  onChanged: () => void | Promise<void>;
  locked: boolean;
  userId: Id;
}

const ECRITURES: IndicatorsApi<TaskIndicatorType> = {
  create: api.createTaskIndicator,
  update: api.updateTaskIndicator,
  remove: api.deleteTaskIndicator,
  reorder: api.reorderTaskIndicators,
  sections: api.taskIndicatorSections,
};

export default function TaskIndicatorsPanel({
  sections,
  indicators,
  lists,
  onChanged,
  locked,
  userId,
}: TaskIndicatorsPanelProps) {
  return (
    <IndicatorsPanel
      sections={sections}
      indicators={indicators}
      widgets={TASK_INDICATORS}
      widgetOf={indicateurTacheDe}
      render={(widget, config, rendu) => (
        <widget.Display config={config} lists={lists} userId={userId} {...rendu} />
      )}
      api={ECRITURES}
      onChanged={onChanged}
      locked={locked}
    />
  );
}
