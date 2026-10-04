// A board's layout — its sections and their widgets —, exported
// so another account can take it over, then imported by it.
//
// The exchanged text is the JSON itself, or that JSON compressed (deflate) then
// written in base64 when that is shorter: a JSON begins with "{", base64
// never does.
//
// The import trusts nothing: the layout may come from a version that
// knew one more widget, or in which a widget stored its
// configuration differently. An unknown type is discarded, a configuration
// first takes that of a new widget before laying what it brings on top.
// The server redoes the same checks, rights included.

import { listKey, isListWidgetType, migrateWidgetConfig } from "@milo/shared";
import type { BoardWidget, ExportedLayout, IndicatorSection } from "@milo/shared";
import type { BoardWidgetDefinition } from "../board-widgets";

const FORMAT = "deflate-raw";

/** The layout of what is being viewed: the sections in order, and what each holds. */
export const layoutOf = (
  sections: IndicatorSection[],
  widgets: BoardWidget[],
): ExportedLayout => ({
  version: 1,
  sections: sections.map((section) => ({
    width_unit: section.width_unit,
    width_value: section.width_value,
    gap: section.gap,
    widgets: widgets
      .filter((w) => w.section_id === section.id)
      .map((w) => ({ type: w.type, config: w.config })),
  })),
});

const toBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  // In chunks: String.fromCharCode does not accept an endless array.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
};

const fromBase64 = (text: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

const transformer = async (bytes: Uint8Array<ArrayBuffer>, feed: CompressionStream | DecompressionStream) =>
  new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(feed)).arrayBuffer());

/** The text to transmit: the shorter of the JSON and its compressed form. */
export const encoder = async (layout: ExportedLayout): Promise<string> => {
  const json = JSON.stringify(layout);
  if (typeof CompressionStream === "undefined") return json;
  try {
    const compressed = toBase64(
      await transformer(new TextEncoder().encode(json), new CompressionStream(FORMAT)),
    );
    return compressed.length < json.length ? compressed : json;
  } catch {
    return json;
  }
};

const UNREADABLE = "Ce texte n'est pas une disposition exportée.";

/** The layout carried by a pasted text; throws, with a readable message, otherwise. */
export const decode = async (text: string): Promise<ExportedLayout> => {
  const raw = text.trim();
  let json = raw;
  if (!raw.startsWith("{")) {
    try {
      json = new TextDecoder().decode(
        await transformer(fromBase64(raw.replace(/\s+/g, "")), new DecompressionStream(FORMAT)),
      );
    } catch {
      throw new Error(UNREADABLE);
    }
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error(UNREADABLE);
  }
  const subject = parsed as Partial<ExportedLayout> | null;
  if (!subject || typeof subject !== "object" || !Array.isArray(subject.sections)) {
    throw new Error(UNREADABLE);
  }
  if (subject.version !== 1) {
    throw new Error("Cette disposition vient d'une version que l'application ne sait pas lire.");
  }
  return subject as ExportedLayout;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** What the import will do, said before it happens. */
export interface ImportPreview {
  /** The layout to send: cleaned, each configuration completed. */
  layout: ExportedLayout;
  sections: number;
  widgets: number;
  /** The export's widgets that will not be placed: unknown type, or one the account cannot edit. */
  discarded: number;
  /** The widgets of the current structure's lists that will disappear, with their items. */
  lostLists: BoardWidget[];
}

/**
 * The layout received, ready to import for this account: only the
 * widgets it knows and can place remain, and each configuration starts from that
 * of a new widget — a field added since the export has its default value there.
 */
export const preview = (
  received: ExportedLayout,
  current: BoardWidget[],
  widgetOf: (type: string) => BoardWidgetDefinition | undefined,
  canPlace: (widget: BoardWidgetDefinition) => boolean,
): ImportPreview => {
  let discarded = 0;
  const sections = received.sections.filter(isObject).map((section) => ({
    width_unit: section.width_unit,
    width_value: section.width_value,
    gap: section.gap,
    widgets: (Array.isArray(section.widgets) ? section.widgets : []).flatMap((w) => {
      const widget = isObject(w) && typeof w.type === "string" ? widgetOf(w.type) : undefined;
      if (!widget || !canPlace(widget)) {
        discarded += 1;
        return [];
      }
      // A layout exported before the keys were translated still reads.
      const config = migrateWidgetConfig(widget.type, w.config);
      return [{ type: widget.type, config: { ...widget.defaultConfig, ...config } }];
    }),
  }));
  // A current list that the import does not take over — its key is no longer there —
  // loses its items. Those the account cannot remove stay.
  const reusedKeys = new Set(
    sections.flatMap((s) => s.widgets.map((w) => listKey(w.config)).filter(Boolean)),
  );
  const lostLists = current.filter((w) => {
    const widget = widgetOf(w.type);
    return (
      isListWidgetType(w.type) &&
      widget !== undefined &&
      canPlace(widget) &&
      !reusedKeys.has(listKey(w.config))
    );
  });
  return {
    layout: { version: 1, sections },
    sections: sections.length,
    widgets: sections.reduce((n, s) => n + s.widgets.length, 0),
    discarded,
    lostLists,
  };
};
