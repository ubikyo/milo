// The "Emplacements" widget, in the "Logistique" group (shared, locations.ts):
// the location records entered on a board — a warehouse, labels and a tree
// of places; no name of their own.
// Its type is "logistics", with the contacts' permissions.

import { Stack } from "@mantine/core";
import { IconMapPin } from "@tabler/icons-react";
import { LOCATION_WAREHOUSE_SOURCES } from "@milo/shared";
import LocationsList, { LOCATION_COLUMNS } from "../../components/locations/LocationsList";
import ColumnFields, { LIST_COLUMNS } from "../../components/ui/ColumnFields";
import LabelGroupFields from "../../components/ui/LabelGroupFields";
import LabelTemplatesFields from "../../components/ui/LabelTemplatesFields";
import { WidgetLinksField } from "../../components/ui/WidgetLinks";
import type { ContactWidget } from "../contact";
import type { IndicatorConfigProps } from "../support/types";

/**
 * The list settings: at the top, the widget's labels, then the Entrepôts
 * widgets its warehouses come from, on any board; then its label templates;
 * last, the grid's columns.
 */
function ListFields(props: IndicatorConfigProps) {
  return (
    <Stack gap="xl">
      {/* The widget's labels: they go to saving. */}
      <LabelGroupFields kind="location-labels" />
      <WidgetLinksField
        inputs={[{ field: LOCATION_WAREHOUSE_SOURCES, label: "Entrepôt", types: ["warehouse.list"] }]}
        config={props.config}
        onChange={props.onChange}
      />
      {/* Its label templates: its own data, as the declared assets'. */}
      <LabelTemplatesFields kind="location" />
      <ColumnFields columns={LOCATION_COLUMNS} {...props} />
    </Stack>
  );
}

export const locationListWidget: ContactWidget = {
  type: "list",
  kind: "logistics",
  label: "Emplacements",
  icon: IconMapPin,
  // Once placed, the widget shows these columns; the others are added from its
  // drawer.
  defaultConfig: {
    [LIST_COLUMNS]: ["warehouse", "labels", "places"].map((key) => ({ key })),
  },
  ownClicks: true,
  fill: true,
  Display: ({ config, id }) => <LocationsList config={config} blockId={id} />,
  Config: ListFields,
};
