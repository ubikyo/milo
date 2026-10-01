import { IconList } from "@tabler/icons-react";
import AssetsList, { COLONNES_ASSETS } from "../components/assets/AssetsList";
import ChampsColonnes from "../components/ui/ChampsColonnes";
import type { AssetIndicatorWidget } from "./types";

// La liste des postes, en widget : elle se pose dans une section comme un
// indicateur, et sa configuration ne dit que les colonnes qu'elle montre. Les
// postes viennent de la page (AssetsListeContext).

export const listeAssetIndicator: AssetIndicatorWidget = {
  type: "list",
  label: "Liste des assets",
  icon: IconList,
  defaultConfig: {},
  ownClicks: true,
  Display: ({ config }) => <AssetsList config={config} />,
  Config: (props) => <ChampsColonnes colonnes={COLONNES_ASSETS} {...props} />,
};
