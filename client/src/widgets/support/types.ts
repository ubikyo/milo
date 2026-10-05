// The contract of a Support mode statistics panel widget.
//
// Like Access mode's widgets (widgets/types.ts): the panel does not know
// what it shows. Each indicator is designated by a type ("tickets",
// …), and it is the widget that knows how to compute, display and configure it.
// Adding a kind of indicator means adding a file to this folder,
// registering it in "index.ts" and in "SUPPORT_INDICATOR_TYPES"
// (shared/domain.ts).
//
// The configuration flows as "unknown": its shape belongs to the widget,
// which re-reads it with Access mode's helpers (text, withField) — they fill in
// what is missing.

import type { WidgetKind } from "../kinds";
import type { ComponentType } from "react";
import type { SettingRow } from "../../components/ui/SettingRows";
import type { IndicatorWidgetBase } from "../../components/ui/IndicatorsPanel";
import type { Id, SupportIndicatorType, SupportRequest } from "@milo/shared";

/** What the drawer passes to a widget's fields. */
export interface IndicatorConfigProps {
  config: unknown;
  onChange: (config: Record<string, unknown>) => void;
  /**
   * The types around the widget in its section, as it shows them: its usual
   * margins depend on them. Unknown, those of a widget alone in its column.
   */
  neighbors?: { previousType: string | null; nextType: string | null };
}

/** What the panel passes to a widget's display. */
export interface IndicatorDisplayProps {
  config: unknown;
  /** The requests of the company being viewed, all statuses combined. */
  requests: SupportRequest[];
  /** The signed-in account: what is "mine" is counted through it. */
  userId: Id;
  /**
   * Saves a configuration changed from the display itself — a
   * title renamed on double-click. No effect once locked.
   */
  onChange?: (config: Record<string, unknown>) => void | Promise<void>;
  /** Opens its drawer: an empty widget sends there to be set. */
  onEdit?: () => void;
  /** The locked sections: the widget no longer offers anything that modifies. */
  locked?: boolean;
}

export interface SupportIndicatorWidget {
  /** What the database stores: it never changes. */
  type: SupportIndicatorType;
  /** Its kind: the group in which the widgets drawer arranges it (widgets/kinds.ts). */
  kind: WidgetKind;
  /** Its name in the widgets drawer, and as the title of its drawer. */
  label: string;
  icon: ComponentType<{ size?: number }>;
  /** The configuration of a new indicator. */
  defaultConfig: Record<string, unknown>;
  /** What the panel shows. */
  Display: ComponentType<IndicatorDisplayProps>;
  /**
   * The fields of its drawer. The drawer itself is common to all. Without
   * fields, the widget only has its name to set: once chosen, it is added
   * at once, and its drawer only holds the name.
   */
  Config?: ComponentType<IndicatorConfigProps>;
  /** The "Apparence du graphique" block: see IndicatorWidgetBase. */
  chartAppearance?: (config: unknown, onChange: IndicatorConfigProps["onChange"]) => SettingRow[];
  /** True when the widget handles its own clicks: see IndicatorWidgetBase. */
  ownClicks?: boolean;
  /** True when it shows a value: see IndicatorWidgetBase. */
  withValue?: boolean;
  /** True when it fills the whole height of its section: see IndicatorWidgetBase. */
  fill?: boolean;
  /** True when it is named in place: see IndicatorWidgetBase. */
  inlineEdit?: boolean;
  /** The width of its drawer: see IndicatorWidgetBase. */
  drawerSize?: number;
  /** The space it leaves around itself: see IndicatorWidgetBase. */
  margins?: IndicatorWidgetBase<SupportIndicatorType>["margins"];
  /** True when it must not appear: see IndicatorWidgetBase. */
  hidden?: IndicatorWidgetBase<SupportIndicatorType>["hidden"];
}
