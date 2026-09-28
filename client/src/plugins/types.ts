// Le contrat d'un greffon du mode Accès.
//
// Une section ne sait pas ce qu'elle porte : elle range des éléments, chacun
// désigné par un type (« link », « clock », …). C'est le greffon qui sait quoi
// en faire — comment l'afficher dans la colonne, et quels champs proposer pour
// le configurer. Ajouter une sorte d'élément, c'est ajouter un fichier dans ce
// dossier et l'inscrire dans « index.ts » : ni la page, ni le tiroir, ni la
// boîte de choix n'ont à changer.
//
// La configuration circule en « unknown » : sa forme appartient au greffon, et
// personne d'autre n'a à la connaître. Chaque greffon la relit avec son propre
// « lire », qui comble ce qui manque — une configuration rangée par une
// version antérieure, ou une base retouchée à la main, ne doit pas casser
// l'affichage.

import type { ComponentType } from "react";
import type { AccessBlockType } from "@milo/shared";

/** Ce que le tiroir passe aux champs d'un greffon. */
export interface PluginConfigProps {
  config: unknown;
  onChange: (config: Record<string, unknown>) => void;
}

/** Ce que la colonne passe à l'affichage d'un greffon. */
export interface PluginDisplayProps {
  config: unknown;
}

export interface AccessPlugin {
  /** Ce que la base range : il ne change jamais. */
  type: AccessBlockType;
  /** Son nom dans la boîte de choix, et en titre de son tiroir. */
  label: string;
  icon: ComponentType<{ size?: number }>;
  /** La configuration d'un élément neuf. */
  defaultConfig: Record<string, unknown>;
  /** Ce que la colonne montre. */
  Display: ComponentType<PluginDisplayProps>;
  /** Les champs de son tiroir. Le tiroir lui-même est commun à tous. */
  Config: ComponentType<PluginConfigProps>;
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

/** La configuration reçue, à laquelle on change un champ. */
export const avec = (
  config: unknown,
  cle: string,
  valeur: unknown,
): Record<string, unknown> => ({
  ...((config as Record<string, unknown> | null) ?? {}),
  [cle]: valeur,
});
