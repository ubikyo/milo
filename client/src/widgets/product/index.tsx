// The "Produits" widget, in the "Logistique" group (shared, products.ts): the
// products entered by hand on a board. Its type is "logistics", with the
// contacts' permissions.

import { Stack } from "@mantine/core";
import { IconPackage } from "@tabler/icons-react";
import { PRODUCT_SUPPLIER_SOURCES, TAX_SOURCES } from "@milo/shared";
import ProductsList, { PRODUCT_COLUMNS } from "../../components/products/ProductsList";
import ProductTablesFields from "../../components/products/ProductTablesFields";
import ColumnFields from "../../components/ui/ColumnFields";
import LabelGroupFields from "../../components/ui/LabelGroupFields";
import { WidgetLinksField } from "../../components/ui/WidgetLinks";
import type { ContactWidget } from "../contact";
import type { IndicatorConfigProps } from "../support/types";
import { PERCENT_HEIGHT } from "../height";

/**
 * The list settings: at the top, the Contact widgets its suppliers come from
 * and the Taxes widgets its prices' taxes come from, on any board; then the
 * grid's columns, the board's product labels and its categories tree. The variants are each product's own, in its drawer.
 */
function ListFields(props: IndicatorConfigProps) {
  return (
    <Stack gap="xl">
      <WidgetLinksField
        inputs={[
          { field: PRODUCT_SUPPLIER_SOURCES, label: "Fournisseurs", types: ["contact.list"] },
          { field: TAX_SOURCES, label: "Taxes", types: ["tax.list"] },
        ]}
        config={props.config}
        onChange={props.onChange}
      />
      <ColumnFields columns={PRODUCT_COLUMNS} {...props} />
      {/* The board's labels and categories: they go to saving. */}
      <LabelGroupFields kind="product-labels" />
      <ProductTablesFields />
    </Stack>
  );
}

export const productListWidget: ContactWidget = {
  type: "list",
  kind: "logistics",
  label: "Produits",
  icon: IconPackage,
  defaultConfig: { ...PERCENT_HEIGHT },
  ownClicks: true,
  fill: true,
  Display: ({ config, id }) => <ProductsList config={config} blockId={id} />,
  Config: ListFields,
};
