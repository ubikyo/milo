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

import { cleDeListe, isListWidgetType } from "@milo/shared";
import type { BoardWidget, DispositionExportee, IndicatorSection } from "@milo/shared";
import type { WidgetDeTableau } from "../board-widgets";

const FORMAT = "deflate-raw";

/** La disposition de ce qu'on regarde : les sections dans l'ordre, et ce que chacune porte. */
export const dispositionDe = (
  sections: IndicatorSection[],
  widgets: BoardWidget[],
): DispositionExportee => ({
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

const enBase64 = (octets: Uint8Array): string => {
  let binaire = "";
  // Par tranches : String.fromCharCode n'accepte pas un tableau sans fin.
  for (let i = 0; i < octets.length; i += 0x8000) {
    binaire += String.fromCharCode(...octets.subarray(i, i + 0x8000));
  }
  return btoa(binaire);
};

const deBase64 = (texte: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(atob(texte), (c) => c.charCodeAt(0));

const transformer = async (octets: Uint8Array<ArrayBuffer>, flux: CompressionStream | DecompressionStream) =>
  new Uint8Array(await new Response(new Blob([octets]).stream().pipeThrough(flux)).arrayBuffer());

/** Le texte à transmettre : le plus court du JSON et de sa forme compressée. */
export const encoder = async (disposition: DispositionExportee): Promise<string> => {
  const json = JSON.stringify(disposition);
  if (typeof CompressionStream === "undefined") return json;
  try {
    const compresse = enBase64(
      await transformer(new TextEncoder().encode(json), new CompressionStream(FORMAT)),
    );
    return compresse.length < json.length ? compresse : json;
  } catch {
    return json;
  }
};

const ILLISIBLE = "Ce texte n'est pas une disposition exportée.";

/** La disposition que porte un texte collé ; lève, avec un message lisible, sinon. */
export const decoder = async (texte: string): Promise<DispositionExportee> => {
  const brut = texte.trim();
  let json = brut;
  if (!brut.startsWith("{")) {
    try {
      json = new TextDecoder().decode(
        await transformer(deBase64(brut.replace(/\s+/g, "")), new DecompressionStream(FORMAT)),
      );
    } catch {
      throw new Error(ILLISIBLE);
    }
  }
  let lu: unknown;
  try {
    lu = JSON.parse(json);
  } catch {
    throw new Error(ILLISIBLE);
  }
  const objet = lu as Partial<DispositionExportee> | null;
  if (!objet || typeof objet !== "object" || !Array.isArray(objet.sections)) {
    throw new Error(ILLISIBLE);
  }
  if (objet.version !== 1) {
    throw new Error("Cette disposition vient d'une version que l'application ne sait pas lire.");
  }
  return objet as DispositionExportee;
};

const estObjet = (valeur: unknown): valeur is Record<string, unknown> =>
  Boolean(valeur) && typeof valeur === "object" && !Array.isArray(valeur);

/** Ce que l'import fera, dit avant qu'il ne se fasse. */
export interface ApercuImport {
  /** La disposition à envoyer : nettoyée, chaque configuration complétée. */
  disposition: DispositionExportee;
  sections: number;
  widgets: number;
  /** Les widgets de l'export qui ne seront pas posés : type inconnu, ou que le compte ne modifie pas. */
  ecartes: number;
  /** Les widgets de liste de la structure actuelle qui disparaîtront, avec leurs éléments. */
  listesPerdues: BoardWidget[];
}

/**
 * La disposition reçue, prête à importer pour ce compte : seuls restent les
 * widgets qu'il connaît et peut poser, et chaque configuration part de celle
 * d'un widget neuf — un champ ajouté depuis l'export y a sa valeur par défaut.
 */
export const apercu = (
  recue: DispositionExportee,
  actuels: BoardWidget[],
  widgetOf: (type: string) => WidgetDeTableau | undefined,
  peutPoser: (widget: WidgetDeTableau) => boolean,
): ApercuImport => {
  let ecartes = 0;
  const sections = recue.sections.filter(estObjet).map((section) => ({
    width_unit: section.width_unit,
    width_value: section.width_value,
    gap: section.gap,
    widgets: (Array.isArray(section.widgets) ? section.widgets : []).flatMap((w) => {
      const widget = estObjet(w) && typeof w.type === "string" ? widgetOf(w.type) : undefined;
      if (!widget || !peutPoser(widget)) {
        ecartes += 1;
        return [];
      }
      const config = estObjet(w.config) ? w.config : {};
      return [{ type: widget.type, config: { ...widget.defaultConfig, ...config } }];
    }),
  }));
  // Une liste actuelle que l'import ne reprend pas — sa clé n'y est plus —
  // perd ses éléments. Celles que le compte ne peut pas enlever restent.
  const clesReprises = new Set(
    sections.flatMap((s) => s.widgets.map((w) => cleDeListe(w.config)).filter(Boolean)),
  );
  const listesPerdues = actuels.filter((w) => {
    const widget = widgetOf(w.type);
    return (
      isListWidgetType(w.type) &&
      widget !== undefined &&
      peutPoser(widget) &&
      !clesReprises.has(cleDeListe(w.config))
    );
  });
  return {
    disposition: { version: 1, sections },
    sections: sections.length,
    widgets: sections.reduce((n, s) => n + s.widgets.length, 0),
    ecartes,
    listesPerdues,
  };
};
