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

import type { WidgetKind } from "./genres";
import type { ComponentType } from "react";
import type { AccessBlockType, Id } from "@milo/shared";

/** Ce que le tiroir passe aux champs d'un widget. */
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
export interface Marges {
  haute: number;
  basse: number;
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
   * Les champs qu'il pose tout en bas du tiroir, après les marges communes à
   * tous — l'interrupteur d'un lien, qui se lit comme un dernier mot.
   */
  ConfigFin?: ComponentType<WidgetConfigProps>;
  /**
   * La largeur de son tiroir, en pixels, quand ses champs ne tiennent pas
   * dans celle de tous (TIROIR_LARGEUR) — les machines d'Uptime, une par
   * ligne avec leur vérification.
   */
  drawerSize?: number;
  /**
   * L'air qu'il laisse d'ordinaire, selon le type de l'élément visible qui le
   * précède et de celui qui le suit — « null » en tête ou en bout de colonne.
   * C'est la colonne qui le pose, et la configuration peut le remplacer
   * (marges.tsx) : l'affichage n'en pose aucun lui-même.
   */
  marges: (previousType: AccessBlockType | null, nextType: AccessBlockType | null) => Marges;
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
export const texte = (config: unknown, cle: string, defaut = ""): string => {
  const valeur = (config as Record<string, unknown> | null)?.[cle];
  return typeof valeur === "string" ? valeur : defaut;
};

/**
 * Le même, pour un champ attendu en nombre. Une valeur absente, vide ou
 * illisible vaut le repli ; une taille rangée en chaîne par une version
 * antérieure, elle, se relit tout de même.
 */
export const nombre = (config: unknown, cle: string, defaut: number): number => {
  const valeur = (config as Record<string, unknown> | null)?.[cle];
  if (valeur === null || valeur === undefined || valeur === "") return defaut;
  const lu = Number(valeur);
  return Number.isFinite(lu) ? lu : defaut;
};

/** La configuration reçue, à laquelle on change un champ. */
export const avec = (
  config: unknown,
  cle: string,
  valeur: unknown,
): Record<string, unknown> => ({
  ...((config as Record<string, unknown> | null) ?? {}),
  [cle]: valeur,
});
