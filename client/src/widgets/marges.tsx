import { poser, type LigneReglage } from "../components/ui/LignesReglages";
import { nombre } from "./types";
import type { AccessWidget, Marges } from "./types";
import type { BoardWidget, AccessBlockType } from "@milo/shared";

// L'air au-dessus et au-dessous d'un élément de colonne.
//
// Chaque widget dit celui qu'il laisse d'ordinaire, selon ce qui l'entoure
// (« marges »). La configuration peut le remplacer, élément par élément : ses
// deux champs ne sont rangés que lorsqu'ils s'écartent de cet ordinaire, si
// bien qu'un élément laissé tel quel suit encore ses voisins quand on le
// déplace.

const MARGE_HAUTE = "margeHaute";
const MARGE_BASSE = "margeBasse";

/** Au-delà, l'élément se perdrait loin de sa colonne. */
const MARGE_MAX = 200;

interface Voisins {
  previousType: AccessBlockType | null;
  nextType: AccessBlockType | null;
}

/** Une marge rangée dans la configuration, ou « null » : l'ordinaire du widget vaut. */
const reglee = (config: unknown, cle: string): number | null => {
  const lu = nombre(config, cle, Number.NaN);
  return Number.isNaN(lu) ? null : lu;
};

/** Les éléments qui ouvrent un groupe : l'air qui les précède est le leur. */
const TITRES: AccessBlockType[] = ["category", "subcategory"];

/**
 * L'ordinaire du widget, sauf devant une catégorie ou une sous-catégorie :
 * l'élément n'y laisse rien sous lui, le titre posant seul l'écart qui
 * l'en sépare.
 */
const ordinairesDe = (widget: AccessWidget, { previousType, nextType }: Voisins): Marges => {
  const ordinaires = widget.marges(previousType, nextType);
  return nextType !== null && TITRES.includes(nextType) ? { ...ordinaires, basse: 0 } : ordinaires;
};

/** L'air que l'élément laisse vraiment : le sien, ou celui de sa configuration. */
export const margesDe = (
  widget: AccessWidget,
  config: unknown,
  voisins: Voisins,
): Marges => {
  return margesReglees(config, ordinairesDe(widget, voisins));
};

/**
 * Les types qui entourent l'élément dans sa colonne, tels que la colonne les
 * montre : un élément caché ou d'un type inconnu ne précède ni ne suit
 * personne (components/access/SectionBlocks.tsx). Les éléments arrivent déjà
 * dans leur ordre.
 */
export const voisinsDe = (
  blocks: BoardWidget[],
  bloc: BoardWidget,
  widgetDe: (type: AccessBlockType) => AccessWidget | undefined,
  locked: boolean,
): Voisins => {
  const visibles = blocks.filter((b) => {
    if (b.section_id !== bloc.section_id) return false;
    if (b.id === bloc.id) return true;
    const widget = widgetDe(b.type as AccessBlockType);
    return widget !== undefined && !widget.hidden?.(b.config, locked);
  });
  const rang = visibles.findIndex((b) => b.id === bloc.id);
  return {
    previousType: (visibles[rang - 1]?.type as AccessBlockType | undefined) ?? null,
    nextType: (visibles[rang + 1]?.type as AccessBlockType | undefined) ?? null,
  };
};

/** L'air que la configuration règle, l'ordinaire valant ailleurs. */
export const margesReglees = (config: unknown, ordinaires: Marges): Marges => ({
  haute: reglee(config, MARGE_HAUTE) ?? ordinaires.haute,
  basse: reglee(config, MARGE_BASSE) ?? ordinaires.basse,
});

/**
 * Les deux lignes des marges, au bout du bloc « Apparence » du tiroir
 * (LignesReglages), pour tout widget : elles montrent la marge en vigueur —
 * « ordinaires » tant que rien n'est réglé. Ramener un champ à cet ordinaire,
 * le vider ou cliquer sur son bouton retire le réglage.
 */
export const lignesMargesPour = (
  ordinaires: Marges,
  config: unknown,
  onChange: (config: Record<string, unknown>) => void,
): LigneReglage[] => {
  const actuelles = margesReglees(config, ordinaires);

  const regler = (cle: string, ordinaire: number, valeur: number | "") =>
    onChange(poser(config, { [cle]: valeur === ordinaire ? "" : valeur }));

  const ligne = (
    nom: string,
    quoi: string,
    cle: string,
    valeur: number,
    ordinaire: number,
  ): LigneReglage => ({
    nom,
    quoi,
    taille: {
      valeur,
      defaut: ordinaire,
      min: 0,
      max: MARGE_MAX,
      onChange: (v) => regler(cle, ordinaire, v),
    },
    modifiee: valeur !== ordinaire,
    reinitialiser: () => regler(cle, ordinaire, ""),
  });

  return [
    ligne("Haut", "de la marge haute", MARGE_HAUTE, actuelles.haute, ordinaires.haute),
    ligne("Bas", "de la marge basse", MARGE_BASSE, actuelles.basse, ordinaires.basse),
  ];
};

/** Les lignes des marges d'un widget du mode Accès, d'après son ordinaire. */
export const lignesMarges = (
  widget: AccessWidget,
  config: Record<string, unknown>,
  onChange: (config: Record<string, unknown>) => void,
  voisins: Voisins,
): LigneReglage[] => lignesMargesPour(ordinairesDe(widget, voisins), config, onChange);
