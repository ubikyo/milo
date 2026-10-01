// Le contrat d'un widget des sections du mode Projet.
//
// Le même que celui du Support (indicators/types.ts), sur les projets du
// tableau ouvert au lieu des demandes. Ajouter une sorte d'indicateur, c'est
// ajouter un fichier dans ce dossier, l'inscrire dans « index.ts » et dans
// « PROJECT_INDICATOR_TYPES » (shared/domain.ts).

import type { ComponentType } from "react";
import type { IndicatorWidgetBase } from "../components/ui/IndicatorsPanel";
import type { Id, Project, ProjectIndicatorType } from "@milo/shared";

/** Ce que le panneau passe à l'affichage d'un widget. */
export interface ProjectIndicatorDisplayProps {
  config: unknown;
  /** Les projets du tableau ouvert, tels que ses filtres les retiennent. */
  projects: Project[];
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

export interface ProjectIndicatorWidget extends IndicatorWidgetBase<ProjectIndicatorType> {
  /** Ce que le panneau montre. */
  Display: ComponentType<ProjectIndicatorDisplayProps>;
}
