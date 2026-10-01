import { api } from "../../api";
import { ASSET_INDICATORS, indicateurAssetDe } from "../../asset-indicators";
import IndicatorsPanel, { type IndicatorsApi } from "../ui/IndicatorsPanel";
import type { Asset, AssetIndicator, AssetIndicatorType, IndicatorSection } from "@milo/shared";

// Les sections du mode Assets, sous les onglets. Leurs widgets sont ceux de
// client/src/asset-indicators : la liste des postes, et les indicateurs qui
// se calculent sur les postes de la société regardée.
interface AssetIndicatorsPanelProps {
  /** « null » tant que les sections du panneau ne sont pas lues. */
  sections: IndicatorSection[] | null;
  indicators: AssetIndicator[];
  assets: Asset[];
  onChanged: () => void | Promise<void>;
  locked: boolean;
}

const ECRITURES: IndicatorsApi<AssetIndicatorType> = {
  create: api.createAssetIndicator,
  update: api.updateAssetIndicator,
  remove: api.deleteAssetIndicator,
  reorder: api.reorderAssetIndicators,
  sections: api.assetIndicatorSections,
};

export default function AssetIndicatorsPanel({
  sections,
  indicators,
  assets,
  onChanged,
  locked,
}: AssetIndicatorsPanelProps) {
  return (
    <IndicatorsPanel
      sections={sections}
      indicators={indicators}
      widgets={ASSET_INDICATORS}
      widgetOf={indicateurAssetDe}
      render={(widget, config, rendu) => (
        <widget.Display config={config} assets={assets} {...rendu} />
      )}
      api={ECRITURES}
      onChanged={onChanged}
      locked={locked}
    />
  );
}
