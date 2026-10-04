// The contract of a Task mode section widget.
//
// The same as Support's (widgets/support/types.ts), on the open board's
// lists instead of requests. Adding a kind of indicator means
// adding a file to this folder, registering it in "index.ts" and in
// "TASK_INDICATOR_TYPES" (shared/domain.ts).

import type { ComponentType } from "react";
import type { IndicatorWidgetBase } from "../../components/ui/IndicatorsPanel";
import type { Id, TaskIndicatorType, TaskList } from "@milo/shared";

/** What the panel passes to a widget's display. */
export interface TaskIndicatorDisplayProps {
  config: unknown;
  /** The open board's lists, and their cards. */
  lists: TaskList[];
  /** The signed-in account: what is "mine" is counted through it. */
  userId: Id;
  /**
   * Saves a configuration changed from the display itself — a
   * title renamed on double-click. No effect once locked.
   */
  onChange?: (config: Record<string, unknown>) => void | Promise<void>;
  /** The locked sections: the widget no longer offers anything that modifies. */
  locked?: boolean;
}

export interface TaskIndicatorWidget extends IndicatorWidgetBase<TaskIndicatorType> {
  /** What the panel shows. */
  Display: ComponentType<TaskIndicatorDisplayProps>;
}
