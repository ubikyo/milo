// The "Taxes" widget, in the "Logistique" group (shared, taxes.ts): a grid of
// the taxes entered in its drawer — a name and a rate each, in their order —,
// which the Produits widgets, the declared equipment and the applications
// offer once associated. Its type is "logistics", with the contacts' permissions.

import { Stack } from "@mantine/core";
import { IconPercentage } from "@tabler/icons-react";
import TaxTablesFields from "../../components/taxes/TaxTablesFields";
import TaxesList, { TAX_COLUMNS } from "../../components/taxes/TaxesList";
import ColumnFields, { LIST_COLUMNS } from "../../components/ui/ColumnFields";
import type { ContactWidget } from "../contact";
import { PERCENT_HEIGHT } from "../height";
import type { IndicatorConfigProps } from "../support/types";

/** The columns a new widget shows: its name and its rate. */
const DEFAULT_COLUMNS = TAX_COLUMNS.map(({ key, defaultWidth }) => ({ key, width: defaultWidth }));

/** The list settings: the grid's columns, then its taxes — its own data, which go to saving. */
function ListFields(props: IndicatorConfigProps) {
  return (
    <Stack gap="xl">
      <ColumnFields columns={TAX_COLUMNS} defaults={DEFAULT_COLUMNS} {...props} />
      <TaxTablesFields />
    </Stack>
  );
}

export const taxListWidget: ContactWidget = {
  type: "list",
  kind: "logistics",
  label: "Taxes",
  icon: IconPercentage,
  // Once placed, the widget shows its name and its rate, at 100 % of its
  // section's height.
  defaultConfig: { [LIST_COLUMNS]: DEFAULT_COLUMNS, ...PERCENT_HEIGHT },
  ownClicks: true,
  fill: true,
  Display: ({ config }) => <TaxesList config={config} />,
  Config: ListFields,
};
