import { Group, NumberInput } from "@mantine/core";
import { LARGEUR_CHAMP, avecReinitialiser } from "./champs-style";
import { nombre } from "./types";
import type { AccessWidget, Marges } from "./types";
import type { AccessBlock, AccessBlockType } from "@milo/shared";

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
  const ordinaires = ordinairesDe(widget, voisins);
  return {
    haute: reglee(config, MARGE_HAUTE) ?? ordinaires.haute,
    basse: reglee(config, MARGE_BASSE) ?? ordinaires.basse,
  };
};

/**
 * Les types qui entourent l'élément dans sa colonne, tels que la colonne les
 * montre : un élément caché ou d'un type inconnu ne précède ni ne suit
 * personne (components/access/SectionBlocks.tsx). Les éléments arrivent déjà
 * dans leur ordre.
 */
export const voisinsDe = (
  blocks: AccessBlock[],
  bloc: AccessBlock,
  widgetDe: (type: AccessBlockType) => AccessWidget | undefined,
  locked: boolean,
): Voisins => {
  const visibles = blocks.filter((b) => {
    if (b.section_id !== bloc.section_id) return false;
    if (b.id === bloc.id) return true;
    const widget = widgetDe(b.type);
    return widget !== undefined && !widget.hidden?.(b.config, locked);
  });
  const rang = visibles.findIndex((b) => b.id === bloc.id);
  return {
    previousType: visibles[rang - 1]?.type ?? null,
    nextType: visibles[rang + 1]?.type ?? null,
  };
};

interface ChampsMargesProps {
  widget: AccessWidget;
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
  voisins: Voisins;
}

/**
 * Les deux champs du tiroir. Ils montrent la marge en vigueur — l'ordinaire
 * du widget tant que rien n'est réglé. Ramener un champ à cet ordinaire, ou
 * le vider, retire le réglage.
 */
export function ChampsMarges({ widget, config, onChange, voisins }: ChampsMargesProps) {
  const ordinaires = ordinairesDe(widget, voisins);
  const actuelles = margesDe(widget, config, voisins);

  const regler = (cle: string, ordinaire: number, valeur: string | number) => {
    const { [cle]: _retire, ...reste } = config;
    onChange(
      valeur === "" || Number(valeur) === ordinaire ? reste : { ...reste, [cle]: Number(valeur) },
    );
  };

  const champ = (label: string, cle: string, valeur: number, ordinaire: number) => (
    <NumberInput
      label={label}
      description={`Par défaut : ${ordinaire} px`}
      placeholder={String(ordinaire)}
      value={valeur}
      onChange={(v) => regler(cle, ordinaire, v)}
      min={0}
      max={MARGE_MAX}
      suffix=" px"
      allowNegative={false}
      allowDecimal={false}
      w={LARGEUR_CHAMP}
      {...avecReinitialiser(valeur !== ordinaire, () => regler(cle, ordinaire, ""))}
    />
  );

  return (
    <Group align="flex-start">
      {champ("Marge haute", MARGE_HAUTE, actuelles.haute, ordinaires.haute)}
      {champ("Marge basse", MARGE_BASSE, actuelles.basse, ordinaires.basse)}
    </Group>
  );
}
