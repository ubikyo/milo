// The "Entrepôts" widget, in the "Logistique" group (shared, warehouses.ts):
// the warehouses entered by hand on a board. Its type is "logistics", with
// the contacts' permissions.

import { Stack } from "@mantine/core";
import { IconBuildingWarehouse } from "@tabler/icons-react";
import ColumnFields, { LIST_COLUMNS } from "../../components/ui/ColumnFields";
import LabelGroupFields from "../../components/ui/LabelGroupFields";
import WarehouseTablesFields from "../../components/warehouses/WarehouseTablesFields";
import WarehousesList, { WAREHOUSE_COLUMNS } from "../../components/warehouses/WarehousesList";
import type { ContactWidget } from "../contact";
import type { IndicatorConfigProps } from "../support/types";

/**
 * The list settings: at the top, the grid's columns, then the widget's
 * warehouse labels, then its countries.
 */
function ListFields(props: IndicatorConfigProps) {
  return (
    <Stack gap="xl">
      <ColumnFields columns={WAREHOUSE_COLUMNS} defaults={DEFAULT_COLUMNS} {...props} />
      {/* The widget's labels: they go to saving. */}
      <LabelGroupFields kind="warehouse-labels" />
      <WarehouseTablesFields />
    </Stack>
  );
}

/** The columns a new widget shows; the others are added from its drawer. */
const DEFAULT_COLUMNS = ["name", "labels"].map((key) => ({ key }));

export const warehouseListWidget: ContactWidget = {
  type: "list",
  kind: "logistics",
  label: "Entrepôts",
  icon: IconBuildingWarehouse,
  // Once placed, the widget shows these columns; the others are added from its
  // drawer.
  defaultConfig: { [LIST_COLUMNS]: DEFAULT_COLUMNS },
  ownClicks: true,
  fill: true,
  Display: ({ config, id }) => <WarehousesList config={config} blockId={id} />,
  Config: ListFields,
};
