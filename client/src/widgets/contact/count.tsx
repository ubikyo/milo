import { Select, Stack } from "@mantine/core";
import { IconAddressBook } from "@tabler/icons-react";
import { useContext } from "react";
import type { Contact } from "@milo/shared";
import { CopyPasteContext } from "../../components/ui/CopyPasteActions";
import { useContacts } from "../../lib/contacts";
import { useListSourceKey } from "../list-source";
import { IndicatorTitle, IndicatorValue, NAME, NameField } from "../support/common";
import { text, withField } from "../types";
import type { ContactWidget } from ".";

// A number of contacts: those of the board — or of the Contact widget its
// drawer names ("Widget associé") — that match the chosen type: all of them,
// the companies, the people. Like the Contact widget, it reads the contacts
// itself (lib/contacts.ts).

const TYPE = "type";

interface CountType {
  value: string;
  label: string;
  account: (c: Contact) => boolean;
}

const DEFAULT_TYPE: CountType = { value: "total", label: "Nombre de contacts", account: () => true };

const TYPES: CountType[] = [
  DEFAULT_TYPE,
  { value: "company", label: "Nombre de sociétés", account: (c) => c.type === "company" },
  { value: "person", label: "Nombre de personnes", account: (c) => c.type === "person" },
];

/** The stored type, or the first: an unknown value does not bring anything down. */
const typeOf = (config: unknown) => TYPES.find((t) => t.value === text(config, TYPE)) ?? DEFAULT_TYPE;

function ContactCount({ config }: { config: unknown }) {
  const boardId = useContext(CopyPasteContext)?.board?.id;
  const { contacts } = useContacts(boardId);
  // The Contact widget followed: its contacts — and those without a widget,
  // which show everywhere —; none named, all of them.
  const key = useListSourceKey("contact", config);
  const type = typeOf(config);
  const counted = (contacts ?? []).filter(
    (c) => (!key || !c.list_key || c.list_key === key) && type.account(c),
  );
  return (
    // The name on top, the number bottom left, like the other indicators.
    <Stack gap={4} justify="space-between" style={{ flex: 1 }}>
      <IndicatorTitle config={config} defaultValue={type.label} />
      <IndicatorValue config={config}>{contacts ? counted.length : "…"}</IndicatorValue>
    </Stack>
  );
}

export const contactCountIndicator: ContactWidget = {
  type: "contacts",
  kind: "logistics",
  label: "Indicateur",
  icon: IconAddressBook,
  withValue: true,
  defaultConfig: { [NAME]: "", [TYPE]: DEFAULT_TYPE.value },

  Display: ({ config }) => <ContactCount config={config} />,

  Config: ({ config, onChange }) => (
    <Stack gap="md">
      <NameField config={config} onChange={onChange} defaultValue={typeOf(config).label} />
      <Select
        label="Données"
        data={TYPES.map(({ value, label }) => ({ value, label }))}
        value={typeOf(config).value}
        onChange={(value) => value && onChange(withField(config, TYPE, value))}
        allowDeselect={false}
      />
    </Stack>
  ),
};
