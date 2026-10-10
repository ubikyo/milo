// The "Contact" widget, in the "Logistique" group (shared, contacts.ts): the
// people and companies entered by hand on a board. Its type is "logistics",
// with its own permissions.

import { Stack } from "@mantine/core";
import { IconAddressBook } from "@tabler/icons-react";
import type { ComponentType } from "react";
import type { Id } from "@milo/shared";
import ContactTablesFields from "../../components/contacts/ContactTablesFields";
import ContactsList, { CONTACT_COLUMNS } from "../../components/contacts/ContactsList";
import ColumnFields from "../../components/ui/ColumnFields";
import type { IndicatorWidgetBase } from "../../components/ui/IndicatorsPanel";
import LabelGroupFields from "../../components/ui/LabelGroupFields";
import type { IndicatorConfigProps } from "../support/types";

/** What the section passes to a widget's display. */
export interface ContactDisplayProps {
  config: unknown;
  /** The widget's identifier: the search asks it to open a contact. */
  id: Id;
  onChange?: (config: Record<string, unknown>) => void | Promise<void>;
  locked?: boolean;
}

export interface ContactWidget extends IndicatorWidgetBase<string> {
  Display: ComponentType<ContactDisplayProps>;
}

/**
 * The list settings: at the top, the board's contact labels, then its lists
 * — payment terms, currencies —, then the grid's columns.
 */
function ListFields(props: IndicatorConfigProps) {
  return (
    <Stack gap="xl">
      {/* The board's labels and lists: they go to saving. */}
      <LabelGroupFields kind="contact-labels" />
      <ContactTablesFields />
      <ColumnFields columns={CONTACT_COLUMNS} {...props} />
    </Stack>
  );
}

export const contactListWidget: ContactWidget = {
  type: "list",
  kind: "logistics",
  label: "Contact",
  icon: IconAddressBook,
  defaultConfig: {},
  ownClicks: true,
  fill: true,
  Display: ({ config, id }) => <ContactsList config={config} blockId={id} />,
  Config: ListFields,
};
