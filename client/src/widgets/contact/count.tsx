import { Select, Stack } from "@mantine/core";
import { IconAddressBook } from "@tabler/icons-react";
import { useContext } from "react";
import type { Contact, Product } from "@milo/shared";
import { CopyPasteContext } from "../../components/ui/CopyPasteActions";
import { useContacts } from "../../lib/contacts";
import { useProducts } from "../../lib/products";
import { LIST_SOURCE, ListSourceField, useListSourceKey } from "../list-source";
import { IndicatorTitle, IndicatorValue, NAME, NameField } from "../support/common";
import { text, withField } from "../types";
import type { ContactWidget } from ".";

// The logistics' "Indicateur": a number of contacts or of products. It counts
// those of the board — or of the widget its drawer names ("Widget associé"):
// a Contact widget for the contacts, a Produits widget for the products —
// that match the chosen data. Its "Données" are grouped: "Contacts" — all of
// them, the companies, the people —, "Produits". Like the lists, it reads the
// items itself (lib/contacts.ts, lib/products.ts).

const TYPE = "type";

/** The data counted: the contacts', the products'. */
type Source = "contact" | "product";

interface CountType {
  value: string;
  label: string;
  /** The list widgets it reads, by their prefix. */
  source: Source;
  account: (item: Contact | Product) => boolean;
}

const DEFAULT_TYPE: CountType = {
  value: "total",
  label: "Nombre de contacts",
  source: "contact",
  account: () => true,
};

const TYPES: CountType[] = [
  DEFAULT_TYPE,
  {
    value: "company",
    label: "Nombre de sociétés",
    source: "contact",
    account: (c) => (c as Contact).type === "company",
  },
  {
    value: "person",
    label: "Nombre de personnes",
    source: "contact",
    account: (c) => (c as Contact).type === "person",
  },
  { value: "products", label: "Nombre de produits", source: "product", account: () => true },
];

/** The groups of the "Données" choice, in their order. */
const GROUPS: { source: Source; label: string }[] = [
  { source: "contact", label: "Contacts" },
  { source: "product", label: "Produits" },
];

/** The stored type, or the first: an unknown value does not bring anything down. */
const typeOf = (config: unknown) => TYPES.find((t) => t.value === text(config, TYPE)) ?? DEFAULT_TYPE;

function LogisticsCount({ config }: { config: unknown }) {
  const boardId = useContext(CopyPasteContext)?.board?.id;
  const type = typeOf(config);
  // Both read, whichever is counted: hooks are not called conditionally.
  const { contacts } = useContacts(type.source === "contact" ? boardId : undefined);
  const { products } = useProducts(type.source === "product" ? boardId : undefined);
  // The list widget followed: its items — and those without a widget, which
  // show everywhere —; none named, all of them.
  const key = useListSourceKey(type.source, config);
  const items: (Contact | Product)[] | null = type.source === "contact" ? contacts : products;
  const counted = (items ?? []).filter(
    (item) => (!key || !item.list_key || item.list_key === key) && type.account(item),
  );
  return (
    // The name on top, the number bottom left, like the other indicators.
    <Stack gap={4} justify="space-between" style={{ flex: 1 }}>
      <IndicatorTitle config={config} defaultValue={type.label} />
      <IndicatorValue config={config}>{items ? counted.length : "…"}</IndicatorValue>
    </Stack>
  );
}

export const contactCountIndicator: ContactWidget = {
  type: "contacts",
  kind: "logistics",
  label: "Indicateur",
  icon: IconAddressBook,
  withValue: true,
  // Its "Widget associé" follows its data: it places it itself.
  ownSource: true,
  defaultConfig: { [NAME]: "", [TYPE]: DEFAULT_TYPE.value },

  Display: ({ config }) => <LogisticsCount config={config} />,

  Config: ({ config, onChange }) => {
    const type = typeOf(config);
    return (
      <Stack gap="xl">
        <ListSourceField prefix={type.source} config={config} onChange={onChange} />
        <Stack gap="md">
          <NameField config={config} onChange={onChange} defaultValue={type.label} />
          <Select
            label="Données"
            data={GROUPS.map((g) => ({
              group: g.label,
              items: TYPES.filter((t) => t.source === g.source).map(({ value, label }) => ({
                value,
                label,
              })),
            }))}
            value={type.value}
            onChange={(value) => {
              if (!value) return;
              const next = withField(config, TYPE, value);
              // Other data: the widget followed was of the other kind.
              const source = TYPES.find((t) => t.value === value)?.source;
              onChange(source === type.source ? next : withField(next, LIST_SOURCE, null));
            }}
            allowDeselect={false}
          />
        </Stack>
      </Stack>
    );
  },
};
