import { Stack } from "@mantine/core";
import { IconDeviceDesktopAnalytics } from "@tabler/icons-react";
import ManagedDeviceAssetsList, {
  MANAGED_DEVICE_ASSET_COLUMNS,
} from "../../components/managed-device-assets/ManagedDeviceAssetsList";
import ManagedDeviceAssetTablesFields from "../../components/managed-device-assets/ManagedDeviceAssetTablesFields";
import ColumnFields from "../../components/ui/ColumnFields";
import LabelGroupFields from "../../components/ui/LabelGroupFields";
import LabelTemplatesFields from "../../components/ui/LabelTemplatesFields";
import type { IndicatorConfigProps } from "../support/types";
import type { ManagedDeviceAssetIndicatorWidget } from "./types";

/**
 * The list settings: at the top, the board's asset labels — each names the
 * GLPI agent tag of the workstations it brings —, then its columns, then the
 * board's model and VLAN tables, then its label templates.
 */
function ListFields(props: IndicatorConfigProps) {
  return (
    <Stack gap="xl">
      {/* The board's labels: they go to saving. */}
      <LabelGroupFields kind="managed-device-asset-labels" />
      <ColumnFields columns={MANAGED_DEVICE_ASSET_COLUMNS} {...props} />
      {/* The board's models and VLANs: they go to saving too. */}
      <ManagedDeviceAssetTablesFields />
      {/* Its label templates, before the "Apparence" block: board data too. */}
      <LabelTemplatesFields kind="managed_device_asset" />
    </Stack>
  );
}

// The workstation list, as a widget: it sits in a section like an
// indicator, and its configuration names the columns it shows. The
// workstations come from the page (ManagedDeviceAssetsListContext).

export const managedDeviceAssetListIndicator: ManagedDeviceAssetIndicatorWidget = {
  type: "list",
  kind: "managed_device_asset",
  label: "Équipements supervisés",
  icon: IconDeviceDesktopAnalytics,
  defaultConfig: {},
  ownClicks: true,
  fill: true,
  Display: ({ config }) => <ManagedDeviceAssetsList config={config} />,
  Config: ListFields,
};
