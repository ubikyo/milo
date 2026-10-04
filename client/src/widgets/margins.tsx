import { insertRow, type SettingRow } from "../components/ui/SettingRows";
import { count } from "./types";
import type { AccessWidget, Margins } from "./types";
import type { BoardWidget, AccessBlockType } from "@milo/shared";

// L'air au-dessus et au-dessous d'un élément de colonne.
//
// Chaque widget dit celui qu'il laisse d'ordinaire, selon ce qui l'entoure
// (« marges »). La configuration peut le remplacer, élément par élément : ses
// deux champs ne sont rangés que lorsqu'ils s'écartent de cet ordinaire, si
// bien qu'un élément laissé tel quel suit encore ses voisins quand on le
// déplace.

const HIGH_MARGIN = "marginTop";
const LOW_MARGIN = "marginBottom";

/** Au-delà, l'élément se perdrait loin de sa colonne. */
const MARGIN_MAX = 200;

interface Neighbors {
  previousType: AccessBlockType | null;
  nextType: AccessBlockType | null;
}

/** Une marge rangée dans la configuration, ou « null » : l'ordinaire du widget vaut. */
const configured = (config: unknown, key: string): number | null => {
  const readValue = count(config, key, Number.NaN);
  return Number.isNaN(readValue) ? null : readValue;
};

/** Les éléments qui ouvrent un groupe : l'air qui les précède est le leur. */
const TITLES: AccessBlockType[] = ["category", "subcategory"];

/**
 * L'ordinaire du widget, sauf devant une catégorie ou une sous-catégorie :
 * l'élément n'y laisse rien sous lui, le titre posant seul l'écart qui
 * l'en sépare.
 */
const regularOf = (widget: AccessWidget, { previousType, nextType }: Neighbors): Margins => {
  const regular = widget.margins(previousType, nextType);
  return nextType !== null && TITLES.includes(nextType) ? { ...regular, bottom: 0 } : regular;
};

/** L'air que l'élément laisse vraiment : le sien, ou celui de sa configuration. */
export const marginsOf = (
  widget: AccessWidget,
  config: unknown,
  neighbors: Neighbors,
): Margins => {
  return configuredMargins(config, regularOf(widget, neighbors));
};

/**
 * Les types qui entourent l'élément dans sa colonne, tels que la colonne les
 * montre : un élément caché ou d'un type inconnu ne précède ni ne suit
 * personne (components/access/SectionBlocks.tsx). Les éléments arrivent déjà
 * dans leur ordre.
 */
export const neighborsOf = (
  blocks: BoardWidget[],
  block: BoardWidget,
  widgetFor: (type: AccessBlockType) => AccessWidget | undefined,
  locked: boolean,
): Neighbors => {
  const visibleItems = blocks.filter((b) => {
    if (b.section_id !== block.section_id) return false;
    if (b.id === block.id) return true;
    const widget = widgetFor(b.type as AccessBlockType);
    return widget !== undefined && !widget.hidden?.(b.config, locked);
  });
  const rank = visibleItems.findIndex((b) => b.id === block.id);
  return {
    previousType: (visibleItems[rank - 1]?.type as AccessBlockType | undefined) ?? null,
    nextType: (visibleItems[rank + 1]?.type as AccessBlockType | undefined) ?? null,
  };
};

/** L'air que la configuration règle, l'ordinaire valant ailleurs. */
export const configuredMargins = (config: unknown, regular: Margins): Margins => ({
  top: configured(config, HIGH_MARGIN) ?? regular.top,
  bottom: configured(config, LOW_MARGIN) ?? regular.bottom,
});

/**
 * Les deux lignes des marges, au bout du bloc « Apparence » du tiroir
 * (LignesReglages), pour tout widget : elles montrent la marge en vigueur —
 * « ordinaires » tant que rien n'est réglé. Ramener un champ à cet ordinaire,
 * le vider ou cliquer sur son bouton retire le réglage.
 */
export const marginRowsFor = (
  regular: Margins,
  config: unknown,
  onChange: (config: Record<string, unknown>) => void,
): SettingRow[] => {
  const current = configuredMargins(config, regular);

  const adjust = (key: string, regular: number, value: number | "") =>
    onChange(insertRow(config, { [key]: value === regular ? "" : value }));

  const row = (
    name: string,
    what: string,
    key: string,
    value: number,
    regular: number,
  ): SettingRow => ({
    name,
    what,
    size: {
      value,
      defaultValue: regular,
      min: 0,
      max: MARGIN_MAX,
      onChange: (v) => adjust(key, regular, v),
    },
    modified: value !== regular,
    reset: () => adjust(key, regular, ""),
  });

  return [
    row("Haut", "de la marge haute", HIGH_MARGIN, current.top, regular.top),
    row("Bas", "de la marge basse", LOW_MARGIN, current.bottom, regular.bottom),
  ];
};

/** Les lignes des marges d'un widget du mode Accès, d'après son ordinaire. */
export const marginRows = (
  widget: AccessWidget,
  config: Record<string, unknown>,
  onChange: (config: Record<string, unknown>) => void,
  neighbors: Neighbors,
): SettingRow[] => marginRowsFor(regularOf(widget, neighbors), config, onChange);
