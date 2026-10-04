// The contract of an Access mode widget.
//
// A section does not know what it carries: it stores elements, each
// designated by a type ("link", "clock", …). The widget is what knows what to
// do with them — how to display it in the column, and which fields to offer to
// configure it. Adding a kind of element means adding a file in this folder
// and registering it in "index.ts": neither the page, nor the drawer, nor the
// choice box has to change.
//
// The configuration travels as "unknown": its shape belongs to the widget,
// and nobody else needs to know it. Each widget rereads it with its own
// reader, which fills in what is missing — a configuration stored by an
// earlier version, or a hand-edited database, must not break the display.

import type { WidgetKind } from "./kinds";
import type { ComponentType } from "react";
import type { SettingRow } from "../components/ui/SettingRows";
import type { AccessBlockType, Id } from "@milo/shared";

/** What the drawer passes to a widget's fields. */
/**
 * The frame's key, the same for all widgets: all can be framed, the registry
 * (board-widgets) taking care of those that do not do it themselves
 * (ownFrame).
 */
export const FRAMED = "framed";

/** True when the widget is framed; with no setting, "defaultValue" applies. */
export const isFramed = (config: unknown, defaultValue = false): boolean => {
  const value = (config as Record<string, unknown> | null)?.[FRAMED];
  return typeof value === "boolean" ? value : defaultValue;
};

export interface WidgetConfigProps {
  config: unknown;
  onChange: (config: Record<string, unknown>) => void;
}

/** What the column passes to a widget's display. */
export interface WidgetDisplayProps {
  /** The displayed element: a widget whose data the server keeps (RSS) reads it through it. */
  blockId: Id;
  config: unknown;
  /**
   * Stores a configuration modified from the display itself. Only widgets
   * that edit in place use it (see "inlineEdit").
   */
  onChange: (config: Record<string, unknown>) => void | Promise<void>;
  /**
   * Opens this element's drawer. A widget that leaves its clicks to the page
   * has nothing to do with it: the page calls it. It remains there for one
   * that handles them itself and would want to lead there by a gesture of its
   * own — none does today, right click already opening the drawer of any
   * element.
   */
  onEdit: () => void;
  /** Locked category: the widget no longer offers anything that modifies. */
  locked: boolean;
}

/** The space left above and below an element, in pixels. */
export interface Margins {
  top: number;
  bottom: number;
}

export interface AccessWidget {
  /** What the database stores: it never changes. */
  type: AccessBlockType;
  /** Its kind: the group in which the widget drawer sorts it (widgets/kinds.ts). */
  kind: WidgetKind;
  /** Its name in the widget drawer, and as the title of its drawer. */
  label: string;
  icon: ComponentType<{ size?: number }>;
  /** The configuration of a new element. */
  defaultConfig: Record<string, unknown>;
  /** What the column shows. */
  Display: ComponentType<WidgetDisplayProps>;
  /** The fields of its drawer. The drawer itself is shared by all. */
  Config: ComponentType<WidgetConfigProps>;
  /**
   * Its appearance rows — a title's color and size, a link's color. The drawer
   * places them in the "Apparence" block, before the margins shared by all.
   */
  appearance?: (config: unknown, onChange: WidgetConfigProps["onChange"]) => SettingRow[];
  /**
   * True when the widget draws its own frame (ownFrame) — the space around a
   * clock's time, for example. Otherwise, the registry frames it.
   */
  ownFrame?: boolean;
  /** True when it is framed as long as nothing is set — the attributes. */
  defaultFrame?: boolean;
  /**
   * The fields it places at the very bottom of the drawer, after the margins
   * shared by all — a link's switch, which reads like a last word.
   */
  ConfigEnd?: ComponentType<WidgetConfigProps>;
  /**
   * The width of its drawer, in pixels, when its fields do not fit in the
   * shared one (DRAWER_WIDTH).
   */
  drawerSize?: number;
  /**
   * The space it usually leaves, depending on the type of the visible element
   * that precedes it and of the one that follows — "null" at the head or end
   * of a column. The column sets it, and the configuration can override it
   * (margins.tsx): the display sets none itself.
   */
  margins: (previousType: AccessBlockType | null, nextType: AccessBlockType | null) => Margins;
  /**
   * True when the element is named right in the column: nothing opens on its
   * creation, it appears empty and waits to be filled in place.
   */
  inlineEdit?: boolean;
  /**
   * True when the widget handles its own clicks: the page then does not wrap
   * it in a button that would open its drawer. This is the case of a title,
   * which is renamed by double click, as of a link, whose single click opens
   * the address. Always true when "inlineEdit" is.
   */
  ownClicks?: boolean;
  /**
   * True when the element must not appear at all. A disabled link remains
   * visible while the category is open — otherwise it could no longer be
   * re-enabled — and disappears once it is locked.
   */
  hidden?: (config: unknown, locked: boolean) => boolean;
}

/**
 * A configuration field, however it was stored. A missing value or one of
 * another type yields the fallback rather than displaying as "undefined".
 */
export const text = (config: unknown, key: string, defaultValue = ""): string => {
  const value = (config as Record<string, unknown> | null)?.[key];
  return typeof value === "string" ? value : defaultValue;
};

/**
 * The same, for a field expected as a number. A missing, empty or unreadable
 * value yields the fallback; a size stored as a string by an earlier version,
 * on the other hand, is still read.
 */
export const count = (config: unknown, key: string, defaultValue: number): number => {
  const value = (config as Record<string, unknown> | null)?.[key];
  if (value === null || value === undefined || value === "") return defaultValue;
  const readValue = Number(value);
  return Number.isFinite(readValue) ? readValue : defaultValue;
};

/** The received configuration, with one field changed. */
export const withField = (
  config: unknown,
  key: string,
  value: unknown,
): Record<string, unknown> => ({
  ...((config as Record<string, unknown> | null) ?? {}),
  [key]: value,
});
