// Le contrat d'un widget du mode Accès.
//
// Une section ne sait pas ce qu'elle porte : elle range des éléments, chacun
// désigné par un type (« link », « clock », …). C'est le widget qui sait quoi
// en faire — comment l'afficher dans la colonne, et quels champs proposer pour
// le configurer. Ajouter une sorte d'élément, c'est ajouter un fichier dans ce
// dossier et l'inscrire dans « index.ts » : ni la page, ni le tiroir, ni la
// boîte de choix n'ont à changer.
//
// La configuration circule en « unknown » : sa forme appartient au widget, et
// personne d'autre n'a à la connaître. Chaque widget la relit avec son propre
// « lire », qui comble ce qui manque — une configuration rangée par une
// version antérieure, ou une base retouchée à la main, ne doit pas casser
// l'affichage.

import type { WidgetKind } from "./kinds";
import type { ComponentType } from "react";
import type { SettingRow } from "../components/ui/SettingRows";
import type { AccessBlockType, Id } from "@milo/shared";

/** Ce que le tiroir passe aux champs d'un widget. */
/**
 * La clé du cadre, la même pour tous les widgets : tous peuvent s'encadrer,
 * le registre (board-widgets) s'en chargeant pour ceux qui ne le font pas
 * eux-mêmes (cadrePropre).
 */
export const FRAMED = "framed";

/** Vrai quand le widget est encadré ; sans réglage, « defaut » vaut. */
export const isFramed = (config: unknown, defaultValue = false): boolean => {
  const value = (config as Record<string, unknown> | null)?.[FRAMED];
  return typeof value === "boolean" ? value : defaultValue;
};

export interface WidgetConfigProps {
  config: unknown;
  onChange: (config: Record<string, unknown>) => void;
}

/** Ce que la colonne passe à l'affichage d'un widget. */
export interface WidgetDisplayProps {
  /** L'élément affiché : un widget dont le serveur garde des données (RSS) les lit par lui. */
  blockId: Id;
  config: unknown;
  /**
   * Enregistre une configuration modifiée depuis l'affichage lui-même. Seuls
   * les widgets qui se modifient sur place s'en servent (voir « inlineEdit »).
   */
  onChange: (config: Record<string, unknown>) => void | Promise<void>;
  /**
   * Ouvre le tiroir de cet élément. Un widget qui laisse ses clics à la page
   * n'a rien à en faire : c'est elle qui l'appelle. Il reste là pour celui qui
   * les prend en charge et voudrait y mener par un geste à lui — aucun ne le
   * fait aujourd'hui, le clic droit ouvrant déjà le tiroir de n'importe quel
   * élément.
   */
  onEdit: () => void;
  /** Catégorie verrouillée : le widget ne propose plus rien qui modifie. */
  locked: boolean;
}

/** L'air laissé au-dessus et au-dessous d'un élément, en pixels. */
export interface Margins {
  top: number;
  bottom: number;
}

export interface AccessWidget {
  /** Ce que la base range : il ne change jamais. */
  type: AccessBlockType;
  /** Son type : le groupe où le tiroir des widgets le range (widgets/genres.ts). */
  kind: WidgetKind;
  /** Son nom dans le tiroir des widgets, et en titre de son tiroir. */
  label: string;
  icon: ComponentType<{ size?: number }>;
  /** La configuration d'un élément neuf. */
  defaultConfig: Record<string, unknown>;
  /** Ce que la colonne montre. */
  Display: ComponentType<WidgetDisplayProps>;
  /** Les champs de son tiroir. Le tiroir lui-même est commun à tous. */
  Config: ComponentType<WidgetConfigProps>;
  /**
   * Ses lignes d'apparence — la couleur et la taille d'un titre, la couleur
   * d'un lien. Le tiroir les pose dans le bloc « Apparence », avant les
   * marges communes à tous.
   */
  appearance?: (config: unknown, onChange: WidgetConfigProps["onChange"]) => SettingRow[];
  /**
   * Vrai quand le widget dessine lui-même son cadre (ENCADRE) — l'air autour
   * de l'heure d'une horloge, par exemple. Sinon, le registre l'encadre.
   */
  ownFrame?: boolean;
  /** Vrai quand il est encadré tant que rien n'est réglé — les attributs. */
  defaultFrame?: boolean;
  /**
   * Les champs qu'il pose tout en bas du tiroir, après les marges communes à
   * tous — l'interrupteur d'un lien, qui se lit comme un dernier mot.
   */
  ConfigEnd?: ComponentType<WidgetConfigProps>;
  /**
   * La largeur de son tiroir, en pixels, quand ses champs ne tiennent pas
   * dans celle de tous (TIROIR_LARGEUR).
   */
  drawerSize?: number;
  /**
   * L'air qu'il laisse d'ordinaire, selon le type de l'élément visible qui le
   * précède et de celui qui le suit — « null » en tête ou en bout de colonne.
   * C'est la colonne qui le pose, et la configuration peut le remplacer
   * (marges.tsx) : l'affichage n'en pose aucun lui-même.
   */
  margins: (previousType: AccessBlockType | null, nextType: AccessBlockType | null) => Margins;
  /**
   * Vrai quand l'élément se nomme à même la colonne : rien ne s'ouvre à sa
   * création, il paraît vide et attend qu'on le renseigne sur place.
   */
  inlineEdit?: boolean;
  /**
   * Vrai quand le widget prend ses clics en charge : la page ne l'enveloppe
   * alors pas d'un bouton qui ouvrirait son tiroir. C'est le cas d'un titre,
   * qui se renomme au double-clic, comme d'un lien, dont le clic simple
   * ouvre l'adresse. Toujours vrai lorsque « inlineEdit » l'est.
   */
  ownClicks?: boolean;
  /**
   * Vrai quand l'élément ne doit pas paraître du tout. Un lien désactivé
   * reste visible tant que la catégorie est ouverte — sans quoi on ne
   * pourrait plus le réactiver — et disparaît une fois qu'elle est
   * verrouillée.
   */
  hidden?: (config: unknown, locked: boolean) => boolean;
}

/**
 * Un champ de la configuration, quelle que soit la façon dont il a été rangé.
 * Une valeur absente ou d'un autre type vaut le repli plutôt que de s'afficher
 * en « undefined ».
 */
export const text = (config: unknown, key: string, defaultValue = ""): string => {
  const value = (config as Record<string, unknown> | null)?.[key];
  return typeof value === "string" ? value : defaultValue;
};

/**
 * Le même, pour un champ attendu en nombre. Une valeur absente, vide ou
 * illisible vaut le repli ; une taille rangée en chaîne par une version
 * antérieure, elle, se relit tout de même.
 */
export const count = (config: unknown, key: string, defaultValue: number): number => {
  const value = (config as Record<string, unknown> | null)?.[key];
  if (value === null || value === undefined || value === "") return defaultValue;
  const readValue = Number(value);
  return Number.isFinite(readValue) ? readValue : defaultValue;
};

/** La configuration reçue, à laquelle on change un champ. */
export const withField = (
  config: unknown,
  key: string,
  value: unknown,
): Record<string, unknown> => ({
  ...((config as Record<string, unknown> | null) ?? {}),
  [key]: value,
});
