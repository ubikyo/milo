// Le contrat d'un widget des sections du mode Tâche.
//
// Le même que celui du Support (indicators/types.ts), sur les listes du
// tableau ouvert au lieu des demandes. Ajouter une sorte d'indicateur, c'est
// ajouter un fichier dans ce dossier, l'inscrire dans « index.ts » et dans
// « TASK_INDICATOR_TYPES » (shared/domain.ts).

import type { ComponentType } from "react";
import type { IndicatorWidgetBase } from "../components/ui/IndicatorsPanel";
import type { Id, TaskIndicatorType, TaskList } from "@milo/shared";

/** Ce que le panneau passe à l'affichage d'un widget. */
export interface TaskIndicatorDisplayProps {
  config: unknown;
  /** Les listes du tableau ouvert, et leurs cartes. */
  lists: TaskList[];
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

export interface TaskIndicatorWidget extends IndicatorWidgetBase<TaskIndicatorType> {
  /** Ce que le panneau montre. */
  Display: ComponentType<TaskIndicatorDisplayProps>;
}
