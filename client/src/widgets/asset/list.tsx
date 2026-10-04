import { Stack } from "@mantine/core";
import { IconList } from "@tabler/icons-react";
import AssetsList, { ASSET_COLUMNS } from "../../components/assets/AssetsList";
import ColumnFields from "../../components/ui/ColumnFields";
import LabelGroupFields from "../../components/ui/LabelGroupFields";
import type { IndicatorConfigProps } from "../support/types";
import type { AssetIndicatorWidget } from "./types";

/**
 * The list settings: at the top, the board's asset labels — each names the
 * GLPI agent tag of the workstations it brings —, then its columns.
 */
function ListFields(props: IndicatorConfigProps) {
  return (
    <Stack gap="xl">
      {/* The board's labels: they go to saving. */}
      <LabelGroupFields kind="asset-labels" />
      <ColumnFields columns={ASSET_COLUMNS} {...props} />
    </Stack>
  );
}

// The workstation list, as a widget: it sits in a section like an
// indicator, and its configuration names the columns it shows. The workstations come from the page (AssetsListContext).

export const assetListIndicator: AssetIndicatorWidget = {
  type: "list",
  kind: "asset",
  label: "Assets",
  icon: IconList,
  defaultConfig: {},
  ownClicks: true,
  fill: true,
  Display: ({ config }) => <AssetsList config={config} />,
  Config: ListFields,
};
