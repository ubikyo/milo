// Le contrat d'un widget du panneau des statistiques du mode Assets.
//
// Le même que celui du Support (indicators/types.ts), sur les postes au lieu
// des demandes. Ajouter une sorte d'indicateur, c'est ajouter un fichier dans
// ce dossier, l'inscrire dans « index.ts » et dans « ASSET_INDICATOR_TYPES »
// (shared/domain.ts).

import type { ComponentType } from "react";
import type { IndicatorWidgetBase } from "../components/ui/IndicatorsPanel";
import type { Asset, AssetIndicatorType } from "@milo/shared";

/** Ce que le panneau passe à l'affichage d'un widget. */
export interface AssetIndicatorDisplayProps {
  config: unknown;
  /** Les postes de la société regardée — tous, « toutes les sociétés » comprise. */
  assets: Asset[];
  /**
   * Enregistre une configuration modifiée depuis l'affichage lui-même — un
   * titre qui se renomme au double-clic. Sans effet une fois verrouillé.
   */
  onChange?: (config: Record<string, unknown>) => void | Promise<void>;
  /** Les sections verrouillées : le widget ne propose plus rien qui modifie. */
  locked?: boolean;
}

export interface AssetIndicatorWidget extends IndicatorWidgetBase<AssetIndicatorType> {
  /** Ce que le panneau montre. */
  Display: ComponentType<AssetIndicatorDisplayProps>;
}
