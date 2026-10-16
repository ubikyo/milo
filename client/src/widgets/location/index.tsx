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
 * The list settings: at the top, the Entrepôts widgets its warehouses come
 * from, on any board; then the grid's columns, the widget's labels, and its
 * label templates.
 */
function ListFields(props: IndicatorConfigProps) {
  return (
    <Stack gap="xl">
      <WidgetLinksField
        inputs={[{ field: LOCATION_WAREHOUSE_SOURCES, label: "Entrepôt", types: ["warehouse.list"] }]}
        config={props.config}
        onChange={props.onChange}
      />
      <ColumnFields columns={LOCATION_COLUMNS} defaults={DEFAULT_COLUMNS} {...props} />
      {/* The widget's labels: they go to saving. */}
      <LabelGroupFields kind="location-labels" />
      {/* Its label templates: its own data, as the declared assets'. */}
      <LabelTemplatesFields kind="location" />
    </Stack>
  );
}

/** The columns a new widget shows; the others are added from its drawer. */
const DEFAULT_COLUMNS = ["warehouse", "labels", "places"].map((key) => ({ key }));

export const locationListWidget: ContactWidget = {
  type: "list",
  kind: "logistics",
  label: "Emplacements",
  icon: IconMapPin,
  // Once placed, the widget shows these columns; the others are added from its
  // drawer.
  defaultConfig: {
    [LIST_COLUMNS]: DEFAULT_COLUMNS,
  },
  ownClicks: true,
  fill: true,
  Display: ({ config, id }) => <LocationsList config={config} blockId={id} />,
  Config: ListFields,
};
