// The "Commandes" widget, in the "Logistique" group (shared, orders.ts): the
// quotes and orders entered on a board. Its type is "logistics", with the
// contacts' and the products' permissions.

import { Stack } from "@mantine/core";
import { IconReceipt, IconSignature } from "@tabler/icons-react";
import {
  CURSOR_VARIABLE,
  ORDERS_MAIL_TEMPLATE_KEYS,
  ORDER_CONTENT_EVENTS,
  ORDER_CONTENT_VARIABLES,
  ORDER_PRODUCT_SOURCES,
  ORDER_SUPPLIER_SOURCES,
  ORDER_WAREHOUSE_SOURCES,
} from "@milo/shared";
import type { Id } from "@milo/shared";
import type { ComponentType } from "react";
import { api } from "../../api";
import MailTemplates from "../../components/settings/MailTemplates";
import SupportTemplates from "../../components/settings/SupportTemplates";
import { notifyError } from "../../lib/errors";
import { useSettingsMode, useTemplatesAccess } from "../../lib/rights";
import OrderNumberTemplateFields from "../../components/orders/OrderNumberTemplateFields";
import OrdersList, { ORDER_COLUMNS } from "../../components/orders/OrdersList";
import ColumnFields from "../../components/ui/ColumnFields";
import type { IndicatorWidgetBase } from "../../components/ui/IndicatorsPanel";
import LabelGroupFields from "../../components/ui/LabelGroupFields";
import { WidgetLinksField } from "../../components/ui/WidgetLinks";
import type { IndicatorConfigProps } from "../support/types";
import { PERCENT_HEIGHT } from "../height";

/** A predefined reply's variables: the order's, then where the cursor goes. */
const CONTENT_VARIABLES = [...ORDER_CONTENT_VARIABLES, CURSOR_VARIABLE];

export interface OrderDisplayProps {
  config: unknown;
  /** The widget's identifier: the search asks it to open an order. */
  id: Id;
  /** The signed-in account: a new order's actor. */
  userId: Id;
}

export interface OrderWidget extends IndicatorWidgetBase<string> {
  Display: ComponentType<OrderDisplayProps>;
}

/**
 * The list settings: at the top, the widgets it reads — the Contact widgets
 * its suppliers come from, the Produits widgets its products come from, the
 * Entrepôts widgets its delivery warehouses come from —, on
 * any board; then the widget's order labels, its numbering formats; for
 * whoever may modify the Paramétrage, the templates of the e-mails to the
 * supplier, then their predefined replies; last, its columns, right above
 * "Apparence".
 */
function ListFields(props: IndicatorConfigProps) {
  const canEditSettings = useSettingsMode();
  const canEditTemplates = useTemplatesAccess();
  return (
    <Stack gap="xl">
      <WidgetLinksField
        inputs={[
          { field: ORDER_SUPPLIER_SOURCES, label: "Fournisseurs", types: ["contact.list"] },
          { field: ORDER_PRODUCT_SOURCES, label: "Produits", types: ["product.list"] },
          { field: ORDER_WAREHOUSE_SOURCES, label: "Entrepôt", types: ["warehouse.list"] },
        ]}
        config={props.config}
        onChange={props.onChange}
      />
      {/* The widget's labels: they go to saving. */}
      <LabelGroupFields kind="order-labels" />
      {/* Its numbering formats: its own data, written as they are edited. */}
      <OrderNumberTemplateFields />
      {canEditSettings && (
        <>
          <MailTemplates canEdit={canEditTemplates} only={ORDERS_MAIL_TEMPLATE_KEYS} />
          {/* The predefined replies after the templates they are laid out in. */}
          <SupportTemplates
            label="Réponses pré-définies"
            events={ORDER_CONTENT_EVENTS}
            load={api.getOrderContents}
            create={api.createOrderContent}
            updateStatement={api.updateOrderContent}
            remove={api.deleteOrderContent}
            addTitle="Ajouter une réponse pré-définie"
            entityLabel="la réponse"
            emptyIcon={IconSignature}
            emptyText="Aucune réponse pré-définie pour le moment"
            canEdit
            onError={notifyError}
            // Written by whoever sends the e-mail: a signature.
            variableGroups={["Utilisateur"]}
            // Dropped into a quote request, as the other e-mails.
            previewTemplate="order_quote_request"
            // The supplier's, and its contact's the e-mail goes to; and where
            // the cursor goes, once dropped in.
            extraVariables={CONTENT_VARIABLES}
            // Several contents per e-mail, placed in the list's order.
            uniqueEvents={false}
            reorder={api.reorderOrderContents}
          />
        </>
      )}
      <ColumnFields columns={ORDER_COLUMNS} {...props} />
    </Stack>
  );
}

export const orderListWidget: OrderWidget = {
  type: "list",
  kind: "logistics",
  label: "Commandes",
  icon: IconReceipt,
  defaultConfig: { ...PERCENT_HEIGHT },
  ownClicks: true,
  fill: true,
  Display: ({ config, id, userId }) => <OrdersList config={config} blockId={id} userId={userId} />,
  Config: ListFields,
};
