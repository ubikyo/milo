// The "Produits" widget, in the "Logistique" group (shared, products.ts): the
// products entered by hand on a board. Its type is "logistics", with the
// contacts' permissions.

import { Stack } from "@mantine/core";
import { IconPackage } from "@tabler/icons-react";
import ProductsList, { PRODUCT_COLUMNS } from "../../components/products/ProductsList";
import ProductTablesFields from "../../components/products/ProductTablesFields";
import ColumnFields from "../../components/ui/ColumnFields";
import LabelGroupFields from "../../components/ui/LabelGroupFields";
import type { ContactWidget } from "../contact";
import type { IndicatorConfigProps } from "../support/types";

/**
 * The list settings: at the top, the board's product labels, then its
 * categories tree, then the grid's columns. The variants are each product's
 * own, in its drawer.
 */
function ListFields(props: IndicatorConfigProps) {
  return (
    <Stack gap="xl">
      {/* The board's labels and categories: they go to saving. */}
      <LabelGroupFields kind="product-labels" />
      <ProductTablesFields />
      <ColumnFields columns={PRODUCT_COLUMNS} {...props} />
    </Stack>
  );
}

export const productListWidget: ContactWidget = {
  type: "list",
  kind: "logistics",
  label: "Produits",
  icon: IconPackage,
  defaultConfig: {},
  ownClicks: true,
  fill: true,
  Display: ({ config, id }) => <ProductsList config={config} blockId={id} />,
  Config: ListFields,
};
