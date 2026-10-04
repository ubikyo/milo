// Le contrat d'un widget du panneau des statistiques du mode Support.
//
// Comme les widgets du mode Accès (widgets/types.ts) : le panneau ne sait pas
// ce qu'il montre. Chaque indicateur est désigné par un type (« tickets »,
// …), et c'est le widget qui sait le calculer, l'afficher et le configurer.
// Ajouter une sorte d'indicateur, c'est ajouter un fichier dans ce dossier,
// l'inscrire dans « index.ts » et dans « SUPPORT_INDICATOR_TYPES »
// (shared/domain.ts).
//
// La configuration circule en « unknown » : sa forme appartient au widget,
// qui la relit avec les aides du mode Accès (texte, avec) — elles comblent ce
// qui manque.

import type { WidgetKind } from "../widgets/genres";
import type { ComponentType } from "react";
import type { IndicatorWidgetBase } from "../components/ui/IndicatorsPanel";
import type { Id, SupportIndicatorType, SupportRequest } from "@milo/shared";

/** Ce que le tiroir passe aux champs d'un widget. */
export interface IndicatorConfigProps {
  config: unknown;
  onChange: (config: Record<string, unknown>) => void;
}

/** Ce que le panneau passe à l'affichage d'un widget. */
export interface IndicatorDisplayProps {
  config: unknown;
  /** Les demandes de la société regardée, tous statuts confondus. */
  requests: SupportRequest[];
  /** Le compte connecté : ce qui « me » revient se compte par lui. */
  userId: Id;
  /**
   * Enregistre une configuration modifiée depuis l'affichage lui-même — un
   * titre qui se renomme au double-clic. Sans effet une fois verrouillé.
   */
  onChange?: (config: Record<string, unknown>) => void | Promise<void>;
  /** Les sections verrouillées : le widget ne propose plus rien qui modifie. */
  locked?: boolean;
}

export interface SupportIndicatorWidget {
  /** Ce que la base range : il ne change jamais. */
  type: SupportIndicatorType;
  /** Son type : le groupe où le tiroir des widgets le range (widgets/genres.ts). */
  kind: WidgetKind;
  /** Son nom dans le tiroir des widgets, et en titre de son tiroir. */
  label: string;
  icon: ComponentType<{ size?: number }>;
  /** La configuration d'un indicateur neuf. */
  defaultConfig: Record<string, unknown>;
  /** Ce que le panneau montre. */
  Display: ComponentType<IndicatorDisplayProps>;
  /**
   * Les champs de son tiroir. Le tiroir lui-même est commun à tous. Sans
   * champs, le widget n'a que son nom à régler : choisi, il s'ajoute
   * aussitôt, et son tiroir ne porte que le nom.
   */
  Config?: ComponentType<IndicatorConfigProps>;
  /** Vrai quand le widget prend ses clics en charge : voir IndicatorWidgetBase. */
  ownClicks?: boolean;
  /** Vrai quand il montre une valeur : voir IndicatorWidgetBase. */
  withValue?: boolean;
  /** Vrai quand il occupe toute la hauteur de sa section : voir IndicatorWidgetBase. */
  fill?: boolean;
  /** Vrai quand il se nomme sur place : voir IndicatorWidgetBase. */
  inlineEdit?: boolean;
  /** La largeur de son tiroir : voir IndicatorWidgetBase. */
  drawerSize?: number;
  /** L'air qu'il laisse autour de lui : voir IndicatorWidgetBase. */
  margins?: IndicatorWidgetBase<SupportIndicatorType>["margins"];
  /** Vrai quand il ne doit pas paraître : voir IndicatorWidgetBase. */
  hidden?: IndicatorWidgetBase<SupportIndicatorType>["hidden"];
}
