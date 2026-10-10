import { Anchor, Center, Group, Table, Text, UnstyledButton } from "@mantine/core";
import {
  IconAddressBook,
  IconChevronDown,
  IconChevronUp,
  IconSelector,
} from "@tabler/icons-react";
import {
  Fragment,
  useContext,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  CONTACT_ROUTES,
  CONTACT_TYPES,
  accessIncludes,
  contactName,
  contactTypeLabel,
  contextKey,
  listKey,
} from "@milo/shared";
import type { Contact, ContactType, Id } from "@milo/shared";
import ContactDrawer from "./ContactDrawer";
import AddButton from "../ui/AddButton";
import { keptColumns, defaultWidths, useColumnWidthEditing } from "../ui/ColumnFields";
import type { ListColumn } from "../ui/ColumnFields";
import { CopyPasteContext } from "../ui/CopyPasteActions";
import { ALL_OPTION, ChoiceFilter, TextFilter } from "../support/SupportRequestsList";
import type { FilterOption } from "../support/SupportRequestsList";
import EmptyPanel from "../ui/EmptyPanel";
import GridScroll from "../ui/GridScroll";
import LabelChip from "../ui/LabelChip";
import { useResizableColumns } from "../ui/useResizableColumns";
import { useIsEditing } from "../../lib/editing";
import { labelRank, labelsColumnTitle, ofGroup, useLabelGroups } from "../../lib/label-groups";
import { inList } from "../../lib/lists";
import { useWidgetAccess } from "../../lib/rights";
import { clearRequest, useRequestedItem } from "../../lib/searchSources";
import { useContacts } from "../../lib/contacts";
import { STRONG_TEXT } from "../../themes/colors";

// The list of a Contact widget (widgets/contact): the people and companies
// entered by hand. The same grid as the declared assets'
// (DeclaredAssetsList): its header, its sort, its columns chosen in the
// drawer — the labels, the name, the type, the first e-mail and the first
// website. It reads the board's contacts (lib/contacts.ts), and only shows
// those of its widget (LIST_KEY) — and, when the board looks at a context of
// the "Type de contact" group (CONTACT_TYPE_GROUP), those of that type.
//
// "Ajouter un contact" at the bottom of the grid, or in its empty state,
// opens its drawer (ContactDrawer), as a click on a row does.

// Vertical row padding, as in the declared assets' list: the height
// includes the padding (box-sizing).
const ROW_PADDING_Y = 5;
const ROW_HEIGHT = 28;

/** A value not given reads the same everywhere. */
const EMPTY = "—";

// A contact's labels, on a single line: beyond two, the count of the others
// replaces the list.
const LABELS_SHOWN = 2;
const LABEL_HEIGHT = 20;

export type ColumnKey = "labels" | "name" | "type" | "email" | "website";

/** The sort: a column, and for the labels, its group — two can coexist. */
interface Sort {
  key: ColumnKey;
  group?: Id;
  direction: "asc" | "desc";
}

const sameSort = (sort: Sort, key: ColumnKey, group: Id | undefined): boolean =>
  sort.key === key && (key !== "labels" || sort.group === group);

/** A website as stored, as it reads: without its scheme. */
const shortUrl = (url: string): string => url.replace(/^https?:\/\//i, "").replace(/\/$/, "");

/** The value each column sorts on; "null" goes to the bottom. */
const VALUES: Record<ColumnKey, (c: Contact) => string | number | null> = {
  labels: (c) => labelRank(c.labels, null),
  name: (c) => contactName(c) || null,
  type: (c) => contactTypeLabel(c.type),
  email: (c) => c.emails[0] || null,
  website: (c) => (c.websites[0] ? shortUrl(c.websites[0].url) : null),
};

// --- Filters -------------------------------------------------------------

type FilterKey = "name" | "labels" | "type";

type Filters = Record<FilterKey, string>;

const NO_FILTER: Filters = { name: "", labels: ALL_OPTION, type: ALL_OPTION };

/** The values a contact offers to a choice filter. */
const CHOICES: Record<Exclude<FilterKey, "name">, (c: Contact) => FilterOption[]> = {
  labels: (c) => c.labels.map((l) => ({ value: l.name, label: l.name })),
  type: (c) => [{ value: c.type, label: contactTypeLabel(c.type) }],
};

/** Does the contact pass every filter? */
const chosen = (f: Filters, c: Contact): boolean => {
  if (f.name.trim() && !contactName(c).toLowerCase().includes(f.name.trim().toLowerCase())) return false;
  return (Object.keys(CHOICES) as (keyof typeof CHOICES)[]).every(
    (key) => f[key] === ALL_OPTION || CHOICES[key](c).some((o) => o.value === f[key]),
  );
};

/** The columns the list can show, in order. */
export const CONTACT_COLUMNS: (ListColumn & { key: ColumnKey })[] = [
  // It picks the group it shows.
  { key: "labels", label: "Étiquettes", labelGroups: CONTACT_ROUTES.labels },
  { key: "name", label: "Nom" },
  { key: "type", label: "Type" },
  { key: "email", label: "E-mail" },
  { key: "website", label: "Site internet" },
];

function SortableTh({
  label,
  column,
  group,
  sort,
  onSort,
  filter,
  style,
  handle,
}: {
  label: string;
  column: ColumnKey;
  group?: Id;
  sort: Sort;
  onSort: (key: ColumnKey, group?: Id) => void;
  filter?: ReactNode;
  style?: CSSProperties;
  handle: ReactNode;
}) {
  const active = sameSort(sort, column, group);
  const Icon = !active ? IconSelector : sort.direction === "asc" ? IconChevronUp : IconChevronDown;
  return (
    <Table.Th style={style}>
      <Group gap={4} wrap="nowrap">
        <UnstyledButton onClick={() => onSort(column, group)} style={{ flex: 1, minWidth: 0 }}>
          <Group gap={4} wrap="nowrap" justify="space-between">
            <Text size="sm" fw={600} c={STRONG_TEXT}>
              {label}
            </Text>
            <Center c={active ? undefined : "dimmed"}>
              <Icon size={14} />
            </Center>
          </Group>
        </UnstyledButton>
        {filter}
      </Group>
      {handle}
    </Table.Th>
  );
}

/** A text cell: the value, or a dimmed dash. */
function TextCell({ value }: { value: string }) {
  return (
    <Text size="sm" c={value ? undefined : "dimmed"} truncate>
      {value || EMPTY}
    </Text>
  );
}

/** The contact's labels, in their order — group after group. */
function LabelsCell({ labels }: { labels: Contact["labels"] }) {
  if (!labels.length) return <TextCell value="" />;
  const shown = ofGroup(labels, null).slice(0, LABELS_SHOWN);
  const remaining = labels.length - shown.length;
  return (
    <Group gap={4} wrap="nowrap">
      {shown.map((label) => (
        <LabelChip key={label.id} label={label} size="xs" height={LABEL_HEIGHT} />
      ))}
      {remaining > 0 && (
        <Text size="xs" c="dimmed">
          +{remaining}
        </Text>
      )}
    </Group>
  );
}

/**
 * A link in a row: it opens without opening the contact — the row's click
 * stops at it.
 */
function LinkCell({ href, text }: { href: string; text: string }) {
  return (
    <Anchor
      href={href}
      target={href.startsWith("mailto:") ? undefined : "_blank"}
      rel="noopener noreferrer"
      size="sm"
      truncate
      onClick={(e) => e.stopPropagation()}
      style={{ display: "block" }}
    >
      {text}
    </Anchor>
  );
}

/** The contact type a board's context names — "Société", "Personne" —; null for another. */
const typeOfContext = (context: string | null | undefined): ContactType | null =>
  CONTACT_TYPES.find((t) => context && contextKey(t.label) === contextKey(context))?.value ?? null;

export default function ContactsList({ config, blockId }: { config: unknown; blockId: Id }) {
  const board = useContext(CopyPasteContext)?.board;
  const boardId = board?.id;
  // The type the board's context names: only its contacts show, and a new
  // contact is of it.
  const contextType = typeOfContext(board?.context);
  const { contacts: all, reload } = useContacts(boardId);
  // Those of this widget only.
  const contacts = useMemo(() => all?.filter(inList(config)) ?? null, [all, config]);
  const [sort, setSort] = useState<Sort>({ key: "name", direction: "asc" });
  const [filters, setFilters] = useState<Filters>(NO_FILTER);
  const isFiltered = (Object.keys(NO_FILTER) as FilterKey[]).some(
    (key) => filters[key] !== NO_FILTER[key],
  );
  const labelGroups = useLabelGroups(CONTACT_ROUTES.labels);
  const isEditing = useIsEditing();
  const access = useWidgetAccess()("logistics");
  // Adding is for display mode: in edit mode, clicks go to the widget.
  const canAdd = accessIncludes(access, "update") && !isEditing;
  /** The drawer: closed, adding (null), or showing a contact. */
  const [drawer, setDrawer] = useState<{ contact: Contact | null } | null>(null);

  // A contact chosen in the search opens here, once read.
  const requested = useRequestedItem(blockId);
  useEffect(() => {
    const found = requested && contacts?.find((c) => String(c.id) === requested);
    if (!found) return;
    clearRequest();
    setDrawer({ contact: found });
  }, [requested, contacts]);

  const shown = useMemo(() => {
    const value =
      sort.key === "labels" ? (c: Contact) => labelRank(c.labels, sort.group) : VALUES[sort.key];
    const factor = sort.direction === "asc" ? 1 : -1;
    return (contacts ?? [])
      .filter((c) => (contextType === null || c.type === contextType) && chosen(filters, c))
      .sort((a, b) => {
        const left = value(a);
        const rightHand = value(b);
        if (left == null && rightHand == null) return 0;
        if (left == null) return 1;
        if (rightHand == null) return -1;
        if (typeof left === "number" && typeof rightHand === "number")
          return (left - rightHand) * factor;
        return String(left).localeCompare(String(rightHand), "fr", { numeric: true }) * factor;
      });
  }, [contacts, sort, filters, contextType]);

  /** A choice filter's options: "Tous", then the values the contacts carry. */
  const optionsOf = (key: keyof typeof CHOICES, everything: string): FilterOption[] => {
    const found = new Map<string, string>();
    for (const contact of contacts ?? []) {
      for (const o of CHOICES[key](contact)) found.set(o.value, o.label);
    }
    return [
      { value: ALL_OPTION, label: everything },
      ...[...found]
        .map(([value, label]) => ({ value, label }))
        .sort((a, b) => a.label.localeCompare(b.label, "fr", { numeric: true })),
    ];
  };

  const choiceFilter = (key: keyof typeof CHOICES, label: string, everything: string) => (
    <ChoiceFilter
      label={label}
      options={optionsOf(key, everything)}
      value={filters[key]}
      onChange={(value) => setFilters((f) => ({ ...f, [key]: value }))}
    />
  );

  // A click on the label sorts, a second reverses the direction.
  const sortBy = (key: ColumnKey, group?: Id) =>
    setSort((current) =>
      sameSort(current, key, group)
        ? { key, group, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key, group, direction: "asc" },
    );

  // The columns shown, in the order the configuration sets.
  const columns = keptColumns(CONTACT_COLUMNS, config);
  // In edit mode, the widths set above the columns go to the widget.
  const widthEditing = useColumnWidthEditing(CONTACT_COLUMNS, config, columns.map((c) => c.id));
  const resize = useResizableColumns(
    "contact",
    columns.map((c) => c.id),
    defaultWidths(CONTACT_COLUMNS, config),
    undefined,
    widthEditing,
  );

  const th = (
    id: string,
    label: string,
    column: ColumnKey,
    filter?: ReactNode,
    style?: CSSProperties,
    group?: Id,
  ) => (
    <SortableTh
      key={id}
      label={label}
      column={column}
      group={group}
      sort={sort}
      onSort={sortBy}
      filter={filter}
      style={style}
      handle={resize.handle(id)}
    />
  );

  /** The header of each column. */
  const headers: Record<ColumnKey, (id: string, group?: Id) => ReactNode> = {
    labels: (id, group) =>
      th(
        id,
        labelsColumnTitle(labelGroups, group),
        "labels",
        choiceFilter("labels", "étiquette", "Toutes"),
        { whiteSpace: "nowrap" },
        group,
      ),
    name: (id) =>
      th(
        id,
        "Nom",
        "name",
        <TextFilter
          label="nom"
          value={filters.name}
          onChange={(value) => setFilters((f) => ({ ...f, name: value }))}
        />,
      ),
    type: (id) => th(id, "Type", "type", choiceFilter("type", "type", "Tous")),
    email: (id) => th(id, "E-mail", "email"),
    website: (id) => th(id, "Site internet", "website", undefined, { whiteSpace: "nowrap" }),
  };

  /** Each column's cell, for a contact. */
  const cells: Record<ColumnKey, (contact: Contact, group?: Id) => ReactNode> = {
    // Limited to a group, the column shows only its labels.
    labels: (contact, group) => (
      <Table.Td key="labels">
        <LabelsCell labels={ofGroup(contact.labels, group)} />
      </Table.Td>
    ),
    name: (contact) => (
      <Table.Td key="name">
        <TextCell value={contactName(contact)} />
      </Table.Td>
    ),
    type: (contact) => (
      <Table.Td key="type">
        <TextCell value={contactTypeLabel(contact.type)} />
      </Table.Td>
    ),
    email: (contact) => (
      <Table.Td key="email">
        {contact.emails[0] ? (
          <LinkCell href={`mailto:${contact.emails[0]}`} text={contact.emails[0]} />
        ) : (
          <TextCell value="" />
        )}
      </Table.Td>
    ),
    website: (contact) => (
      <Table.Td key="website">
        {contact.websites[0] ? (
          <LinkCell href={contact.websites[0].url} text={shortUrl(contact.websites[0].url)} />
        ) : (
          <TextCell value="" />
        )}
      </Table.Td>
    ),
  };

  const cellStyle = {
    boxSizing: "content-box" as const,
    height: ROW_HEIGHT,
    paddingTop: ROW_PADDING_Y,
    paddingBottom: ROW_PADDING_Y,
  };

  const table = (
    <Table
      {...resize.tableProps}
      highlightOnHover
      verticalSpacing={0}
      styles={{ td: cellStyle, th: { ...cellStyle, verticalAlign: "middle" } }}
    >
      {resize.colgroup}
      <Table.Thead>
        {resize.widthRow}
        <Table.Tr>{columns.map((c) => headers[c.key](c.id, c.group))}</Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {shown.map((contact) => (
          <Table.Tr
            key={contact.id}
            onClick={() => setDrawer({ contact })}
            style={{ cursor: "pointer" }}
          >
            {columns.map((c) => (
              <Fragment key={c.id}>{cells[c.key](contact, c.group)}</Fragment>
            ))}
          </Table.Tr>
        ))}

        {/* Filtered down to nothing, the list says so, along with how to undo it. */}
        {shown.length === 0 && isFiltered && (
          <Table.Tr style={{ backgroundColor: "transparent" }}>
            <Table.Td colSpan={columns.length}>
              <Group gap="xs">
                <Text size="sm" c="dimmed">
                  Aucun contact ne correspond aux filtres.
                </Text>
                <UnstyledButton onClick={() => setFilters(NO_FILTER)}>
                  <Text size="sm" c="teal">
                    Retirer les filtres
                  </Text>
                </UnstyledButton>
              </Group>
            </Table.Td>
          </Table.Tr>
        )}

        {/* Last row: adding a contact happens where the list ends. Its
            background neutralizes the hover: it is not a contact. */}
        {canAdd && (
          <Table.Tr style={{ backgroundColor: "transparent" }}>
            <Table.Td colSpan={columns.length}>
              <AddButton label="Ajouter un contact" onClick={() => setDrawer({ contact: null })} />
            </Table.Td>
          </Table.Tr>
        )}
      </Table.Tbody>
    </Table>
  );

  if (boardId === undefined || !contacts || !all) return null;

  return (
    <>
      {contacts.length === 0 ? (
        // With nothing to show, only the empty state, which offers to add.
        <EmptyPanel
          icon={IconAddressBook}
          message="Aucun contact"
          actionLabel={canAdd ? "Ajouter un contact" : undefined}
          onAction={canAdd ? () => setDrawer({ contact: null }) : undefined}
          size="md"
        />
      ) : (
        // A section narrower than the list makes it scroll sideways.
        <GridScroll>{table}</GridScroll>
      )}

      <ContactDrawer
        opened={drawer !== null}
        onClose={() => setDrawer(null)}
        boardId={boardId}
        listKey={listKey(config)}
        contact={drawer?.contact ?? null}
        contacts={all}
        initialType={contextType ?? undefined}
        onSaved={() => void reload()}
        canSave={accessIncludes(access, "update")}
        canDelete={accessIncludes(access, "delete")}
      />
    </>
  );
}
