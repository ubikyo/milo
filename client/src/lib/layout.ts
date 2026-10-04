// La disposition d'un tableau — ses sections et leurs widgets —, exportée
// pour qu'un autre compte la reprenne, puis importée par lui.
//
// Le texte échangé est le JSON lui-même, ou ce JSON compressé (deflate) puis
// écrit en base64 quand c'est plus court : un JSON commence par « { », le
// base64 jamais.
//
// L'import ne fait confiance à rien : la disposition vient peut-être d'une
// version qui connaissait un widget de plus, ou dont un widget rangeait sa
// configuration autrement. Un type inconnu est écarté, une configuration
// reprend d'abord celle d'un widget neuf avant d'y poser ce qu'elle apporte.
// Le serveur refait les mêmes vérifications, droits compris.

import { listKey, isListWidgetType, migrateWidgetConfig } from "@milo/shared";
import type { BoardWidget, ExportedLayout, IndicatorSection } from "@milo/shared";
import type { BoardWidgetDefinition } from "../board-widgets";

const FORMAT = "deflate-raw";

/** La disposition de ce qu'on regarde : les sections dans l'ordre, et ce que chacune porte. */
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
  // Par tranches : String.fromCharCode n'accepte pas un tableau sans fin.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
};

const fromBase64 = (text: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

const transformer = async (bytes: Uint8Array<ArrayBuffer>, feed: CompressionStream | DecompressionStream) =>
  new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(feed)).arrayBuffer());

/** Le texte à transmettre : le plus court du JSON et de sa forme compressée. */
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

/** La disposition que porte un texte collé ; lève, avec un message lisible, sinon. */
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

/** Ce que l'import fera, dit avant qu'il ne se fasse. */
export interface ImportPreview {
  /** La disposition à envoyer : nettoyée, chaque configuration complétée. */
  layout: ExportedLayout;
  sections: number;
  widgets: number;
  /** Les widgets de l'export qui ne seront pas posés : type inconnu, ou que le compte ne modifie pas. */
  discarded: number;
  /** Les widgets de liste de la structure actuelle qui disparaîtront, avec leurs éléments. */
  lostLists: BoardWidget[];
}

/**
 * La disposition reçue, prête à importer pour ce compte : seuls restent les
 * widgets qu'il connaît et peut poser, et chaque configuration part de celle
 * d'un widget neuf — un champ ajouté depuis l'export y a sa valeur par défaut.
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
      // Une disposition exportée avant la traduction des clés se lit encore.
      const config = migrateWidgetConfig(widget.type, w.config);
      return [{ type: widget.type, config: { ...widget.defaultConfig, ...config } }];
    }),
  }));
  // Une liste actuelle que l'import ne reprend pas — sa clé n'y est plus —
  // perd ses éléments. Celles que le compte ne peut pas enlever restent.
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
