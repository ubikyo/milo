import {
  ActionIcon,
  Badge,
  Center,
  Checkbox,
  Group,
  Menu,
  Popover,
  Table,
  Text,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import {
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconFilter,
  IconLifebuoy,
  IconSelector,
} from "@tabler/icons-react";
import dayjs from "dayjs";
import { Fragment, createContext, useContext, useMemo, useState } from "react";
import ActorAvatars, { ACTOR_AVATAR_SIZE, ACTOR_GAP, SenderAvatar } from "../ui/ActorAvatars";
import AddButton from "../ui/AddButton";
import { keptColumns, defaultWidths, useColumnWidthEditing, DATE_FORMATS, formatMoment } from "../ui/ColumnFields";
import type { ListColumn } from "../ui/ColumnFields";
import EmptyPanel from "../ui/EmptyPanel";
import GridScroll from "../ui/GridScroll";
import LabelChip from "../ui/LabelChip";
import { ReferenceTag } from "../ui/ReferenceTag";
import { menuPosition, type PointMenuPosition } from "../ui/PointMenu";
import { useResizableColumns } from "../ui/useResizableColumns";
import { DUE_COLOR, DUE_WORD, shortDate, dueState } from "../../lib/due";
import { STRONG_TEXT } from "../../themes/colors";
import { SUPPORT_STATUSES, listKey, supportStatusLabel, supportTicketRef } from "@milo/shared";
import { useIsEditing } from "../../lib/editing";
import { inList } from "../../lib/lists";
import { labelRank, labelsColumnTitle, ofGroup, useLabelGroups } from "../../lib/label-groups";
import type { CSSProperties, ReactNode } from "react";
import type { Actor, Id, SupportRequest, SupportStatus } from "@milo/shared";
import { NewShortcut } from "../../lib/newShortcut";

// The Support mode's request list: a section widget, like the
// indicators (widgets/support/list.tsx). What it shows and what can be done in it —
// the open tab, sorting, filters, checked boxes, the right-click
// menu — belongs to the page: the "Actions" menu in the tab row
// acts on the requests checked here. The page provides it through
// "SupportListContext"; the widget only chooses its columns.

/** The tab that filters nothing: it shows the requests of all statuses. */
export const ALL = "all";

// Rows' vertical padding, as in the projects table: the height
// includes the padding (box-sizing).
const ROW_PADDING_Y = 5;

// A request's labels, on a single line: beyond two, the
// count of the others replaces the list.
const LABELS_SHOWN = 2;
const LABEL_HEIGHT = 20;

// The longest ticket number expected: the tag takes its width.
const REFERENCE_TEMPLATE = supportTicketRef(9999);

/**
 * The tag color of each status, drawn like a label: the
 * red of what no one has taken yet, the orange of what is in progress,
 * the green of what is settled.
 */
const STATUS_COLOR: Record<SupportStatus, string> = {
  new: "red.6",
  open: "orange.6",
  pending: "orange.6",
  resolved: "green.6",
  closed: "green.6",
};

/** A missing value reads the same everywhere: a discreet dash. */
function Empty() {
  return (
    <Text size="sm" c="dimmed">
      —
    </Text>
  );
}

function LabelsCell({ labels }: { labels: SupportRequest["labels"] }) {
  if (!labels.length) return <Empty />;

  // In their order — group after group —, whatever the order they were set in.
  const shown = ofGroup(labels, null).slice(0, LABELS_SHOWN);
  const remaining = labels.length - shown.length;

  return (
    // Fixed-height box: without it, the line-box adds half a pixel and the
    // row becomes taller than the others.
    <div
      style={{
        height: ACTOR_AVATAR_SIZE,
        display: "flex",
        alignItems: "center",
        overflow: "hidden",
      }}
    >
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
    </div>
  );
}

/** The sender of a request received by e-mail, as an actor to display. */
const senderOf = (request: SupportRequest): Actor | null =>
  request.sender_email
    ? {
        id: 0,
        name: request.sender_name || request.sender_email,
        email: request.sender_email,
        gravatar_url: "",
      }
    : null;

/**
 * The actors shown: the sender first — they are an actor by default —,
 * then the designated ones. Whoever has an account is already there, and is not duplicated.
 */
const shownActors = (request: SupportRequest): Actor[] => {
  const sender = senderWithoutAccount(request);
  return sender ? [sender, ...request.actors] : request.actors;
};

/** The sender, if not already among the actors under their account. */
const senderWithoutAccount = (request: SupportRequest): Actor | null => {
  const sender = senderOf(request);
  if (!sender) return null;
  const address = sender.email.toLowerCase();
  return request.actors.some((a) => a.email.toLowerCase() === address) ? null : sender;
};

/** An actor's key in the filter: an account, or an address without an account. */
const actorKey = (a: Actor): string => (a.id ? `u:${a.id}` : `e:${a.email.toLowerCase()}`);

function ActorsCell({ request }: { request: SupportRequest }) {
  // The sender comes first, marked with their envelope — whether or not they have an
  // account. With an account, they are already among the actors: they are taken out of
  // there to be shown only once, but with their mark, as in the drawer.
  const address = request.sender_email.toLowerCase();
  const withAccount = address
    ? request.actors.find((a) => a.email.toLowerCase() === address)
    : undefined;
  const sender = withAccount ?? senderOf(request);
  if (!sender) return <ActorAvatars actors={request.actors} />;
  const others = withAccount ? request.actors.filter((a) => a !== withAccount) : request.actors;
  return (
    <Group gap={ACTOR_GAP} wrap="nowrap">
      <div style={{ display: "inline-flex" }}>
        <SenderAvatar person={sender} />
      </div>
      {others.length > 0 && <ActorAvatars actors={others} />}
    </Group>
  );
}

/** The due date, and the bubble that says where things stand — the same as a card's. */
function DueCell({ due }: { due: string }) {
  const state = dueState(due);
  if (!due) {
    return (
      <Text size="sm" c="dimmed">
        Aucune
      </Text>
    );
  }

  return (
    <Group gap="xs" wrap="nowrap">
      {/* The date itself takes the state's color: orange at three days,
          red once past. */}
      <Text size="sm" c={DUE_COLOR[state]} fw={state === "none" ? undefined : 600}>
        {shortDate(due)}
      </Text>
      {state !== "none" && (
        <Badge color={DUE_COLOR[state]} variant="filled" radius="sm" size="sm">
          {DUE_WORD[state]}
        </Badge>
      )}
    </Group>
  );
}

// --- Sorting and filters ---------------------------------------------------
// As in the projects table: the label sorts, the funnel filters, and the
// two are separate controls.

// The "Objet" column has a fixed width: a subject that is too long is cut
// with an ellipsis rather than widening the column.
const SUBJECT_WIDTH = 600;
/**
 * The minimum of the "Étiquettes" column, enough for its two labels and
 * the count of the others. The actors, for their part, stick to their avatars:
 * it is the labels that get the remaining room.
 */
const LABELS_MIN_WIDTH = 260;
/** Width of the date columns: "Reçu le" and "Échéance". */
const DATE_WIDTH = 130;
export type ColumnKey = "ticket" | "subject" | "actors" | "labels" | "due" | "status" | "received";

/** The sort: a column, and for the labels, its group — two can coexist. */
interface Sort {
  key: ColumnKey;
  group?: Id;
  direction: "asc" | "desc";
}

/** True when the sort is that of this column — and of this group, for the labels. */
const sameSort = (sort: Sort, key: ColumnKey, group: Id | undefined): boolean =>
  sort.key === key && (key !== "labels" || sort.group === group);

/** A funnel option: "all" means "no filter". */
export interface FilterOption {
  value: string;
  label: string;
}

export const ALL_OPTION = "all";

const STATUS_ORDER = Object.fromEntries(SUPPORT_STATUSES.map((s, i) => [s.value, i])) as Record<
  SupportStatus,
  number
>;

/** The value each column sorts on; "null" goes to the bottom. */
const VALUES: Record<ColumnKey, (d: SupportRequest) => string | number | null> = {
  ticket: (d) => d.number,
  subject: (d) => d.subject || null,
  actors: (d) => {
    const a = shownActors(d);
    return a.length ? a.map((x) => x.name).join(", ") : null;
  },
  // By the first label, in the labels' order — group after group: the one the
  // cell shows first. A column limited to a group reads its own (useSupportList).
  labels: (d) => labelRank(d.labels, null),
  due: (d) => d.due_date || null,
  status: (d) => STATUS_ORDER[d.status],
  received: (d) => d.created_at,
};

const DUES: FilterOption[] = [
  { value: ALL_OPTION, label: "Toutes" },
  { value: "late", label: DUE_WORD.late },
  { value: "soon", label: DUE_WORD.soon },
  { value: "with", label: "Avec échéance" },
  { value: "without", label: "Sans échéance" },
];

const PERIODS: FilterOption[] = [
  { value: ALL_OPTION, label: "Toutes les dates" },
  { value: "1", label: "Aujourd'hui" },
  { value: "7", label: "7 derniers jours" },
  { value: "30", label: "30 derniers jours" },
];

interface Filters {
  ticket: string;
  subject: string;
  actor: string;
  label: string;
  due: string;
  status: string;
  received: string;
}

const NO_FILTER: Filters = {
  ticket: "",
  subject: "",
  actor: ALL_OPTION,
  label: ALL_OPTION,
  due: ALL_OPTION,
  status: ALL_OPTION,
  received: ALL_OPTION,
};

const chosen = (f: Filters, d: SupportRequest): boolean => {
  if (f.ticket && !supportTicketRef(d.number).toLowerCase().includes(f.ticket.trim().toLowerCase()))
    return false;
  if (f.subject && !d.subject.toLowerCase().includes(f.subject.trim().toLowerCase())) return false;
  if (f.actor !== ALL_OPTION && !shownActors(d).some((a) => actorKey(a) === f.actor)) return false;
  if (f.label !== ALL_OPTION && !d.labels.some((l) => l.name === f.label)) return false;
  if (f.due !== ALL_OPTION) {
    if (f.due === "without" ? d.due_date : !d.due_date) return false;
    if ((f.due === "late" || f.due === "soon") && dueState(d.due_date) !== f.due)
      return false;
  }
  if (f.status !== ALL_OPTION && d.status !== f.status) return false;
  if (f.received !== ALL_OPTION) {
    const since = dayjs()
      .startOf("day")
      .subtract(Number(f.received) - 1, "day");
    if (dayjs(d.created_at).isBefore(since)) return false;
  }
  return true;
};

/**
 * The funnel of a choice list. It is colored as long as it retains something.
 * The declared asset lists take it too (DeclaredAssetsList).
 */
export function ChoiceFilter({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: FilterOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  const active = value !== ALL_OPTION;
  return (
    <Menu position="bottom-end" withinPortal shadow="md">
      <Menu.Target>
        <ActionIcon
          variant={active ? "light" : "subtle"}
          color={active ? "teal" : "gray"}
          size="sm"
          aria-label={`Filtrer par ${label}`}
        >
          <IconFilter size={14} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown mah={360} style={{ overflowY: "auto" }}>
        {options.map((option) => (
          <Menu.Item
            key={option.value}
            onClick={() => onChange(option.value)}
            leftSection={
              option.value === value ? <IconCheck size={14} /> : <span style={{ width: 14 }} />
            }
          >
            {option.label}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}

/** The funnel of a text column: you type what you are looking for. */
export function TextFilter({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const active = value.trim() !== "";
  return (
    <Popover position="bottom-end" withinPortal shadow="md" trapFocus>
      <Popover.Target>
        <ActionIcon
          variant={active ? "light" : "subtle"}
          color={active ? "teal" : "gray"}
          size="sm"
          aria-label={`Filtrer par ${label}`}
        >
          <IconFilter size={14} />
        </ActionIcon>
      </Popover.Target>
      <Popover.Dropdown>
        <TextInput
          size="xs"
          placeholder={`Rechercher un ${label}`}
          value={value}
          onChange={(e) => onChange(e.currentTarget.value)}
          data-autofocus
          w={220}
        />
      </Popover.Dropdown>
    </Popover>
  );
}

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
  /** For a labels column, the group it shows. */
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

/** The key of the received inboxes, in the list's configuration: each to a context. */
export const MAILBOXES = "mailboxes";

/** The columns the list can show, in order. */
export const SUPPORT_COLUMNS: ListColumn[] = [
  { key: "ticket", label: "Ticket" },
  { key: "subject", label: "Objet" },
  { key: "actors", label: "Acteurs" },
  // It picks the group it shows.
  { key: "labels", label: "Étiquettes", labelGroups: "/support-labels" },
  { key: "status", label: "Statut" },
  { key: "received", label: "Reçu le", formats: DATE_FORMATS },
  { key: "due", label: "Échéance" },
];

/**
 * The list's state, held by the page: what is seen in the open tab,
 * sorted and filtered, and what has been checked in it.
 */
export const useSupportList = (requests: SupportRequest[] | null, tab: string) => {
  // By default, the most recent first: it is the server's order.
  const [sort, setSort] = useState<Sort>({ key: "received", direction: "desc" });
  const [filters, setFilters] = useState<Filters>(NO_FILTER);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  /** The row whose right-click menu is open, and where it opens. */
  const [context, setContext] = useState<{
    request: SupportRequest;
    position: PointMenuPosition;
  } | null>(null);

  const inTab = useMemo(
    () =>
      !requests ? [] : tab === ALL ? requests : requests.filter((r) => r.status === tab),
    [requests, tab],
  );

  // What the funnels offer: what is in the tab, nothing more.
  const actorOptions = useMemo<FilterOption[]>(() => {
    const seen = new Map<string, string>();
    for (const d of inTab) for (const a of shownActors(d)) seen.set(actorKey(a), a.name);
    return [
      { value: ALL_OPTION, label: "Tous" },
      ...[...seen]
        .sort((a, b) => a[1].localeCompare(b[1], "fr"))
        .map(([value, label]) => ({ value, label })),
    ];
  }, [inTab]);
  const labelOptions = useMemo<FilterOption[]>(() => {
    const names = new Set(inTab.flatMap((d) => d.labels.map((l) => l.name)));
    return [
      { value: ALL_OPTION, label: "Toutes" },
      ...[...names].sort((a, b) => a.localeCompare(b, "fr")).map((n) => ({ value: n, label: n })),
    ];
  }, [inTab]);

  const shown = useMemo(() => {
    const value =
      sort.key === "labels"
        ? (d: SupportRequest) => labelRank(d.labels, sort.group)
        : VALUES[sort.key];
    const factor = sort.direction === "asc" ? 1 : -1;
    return inTab
      .filter((d) => chosen(filters, d))
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
  }, [inTab, filters, sort]);

  // Checked boxes only apply to what is seen: a request that is filtered out
  // or moved to another tab does not blindly undergo an action.
  const selection = shown.filter((d) => checked.has(d.id));

  return {
    tab,
    sort,
    setSort,
    filters,
    setFilters,
    checked,
    setChecked,
    context,
    setContext,
    inTab,
    shown,
    selection,
    actorOptions,
    labelOptions,
  };
};

export interface SupportList extends ReturnType<typeof useSupportList> {
  loading: boolean;
  onOpenRequest: (request: SupportRequest) => void;
  /**
   * Without it — without the right to add a request —, no add row.
   * The list key says which widget it is added from.
   */
  onAddRequest?: (listKey: string) => void;
}

/** The list's state, given by the page to the widget. Outside Support mode, there is none. */
export const SupportListContext = createContext<SupportList | null>(null);

export default function SupportRequestsList({ config }: { config: unknown }) {
  const list = useContext(SupportListContext);
  // Outside Support mode, nothing to list. The rest lives in a separate
  // component: its hooks are thus called on each render, in the same order.
  if (!list) return null;
  const { onAddRequest } = list;
  return (
    // "N" adds one, as "Nouveau ticket" does (lib/newShortcut).
    <NewShortcut
      action="Nouvelle demande"
      run={onAddRequest && (() => onAddRequest(listKey(config)))}
    >
      <RequestsList config={config} list={list} />
    </NewShortcut>
  );
}

function RequestsList({ config, list }: { config: unknown; list: SupportList }) {
  const {
    tab,
    sort,
    setSort,
    filters,
    setFilters,
    checked,
    setChecked,
    context,
    setContext,
    shown: allShown,
    inTab: allInTab,
    actorOptions,
    labelOptions,
    loading,
    onOpenRequest,
    onAddRequest: addRequest,
  } = list;

  // The board's requests, of the chosen context, that the page has read — those
  // of this widget only (lib/lists.ts). A request added here is
  // its own.
  const ofThisWidget = inList(config);
  const shown = allShown.filter(ofThisWidget);
  const inTab = allInTab.filter(ofThisWidget);
  const onAddRequest = addRequest && (() => addRequest(listKey(config)));
  const isEditing = useIsEditing();

  // The retained columns, in the order chosen by the configuration.
  // A column may come back: "id" distinguishes each occurrence.
  const columns = keptColumns(SUPPORT_COLUMNS, config);
  // A labels column limited to a group takes its name.
  const labelGroups = useLabelGroups("/support-labels");
  // The checkbox at the start of each row, then the columns.
  const columnCount = columns.length + 1;
  // In edit mode, the widths set above the columns go to the widget.
  const widthEditing = useColumnWidthEditing(SUPPORT_COLUMNS, config, columns.map((c) => c.id));
  const resize = useResizableColumns(
    "support",
    ["checkbox", ...columns.map((c) => c.id)],
    defaultWidths(SUPPORT_COLUMNS, config),
    undefined,
    widthEditing,
  );

  const isFiltered = Object.entries(filters).some(
    ([key, v]) => v !== NO_FILTER[key as keyof Filters],
  );
  const filter = (key: keyof Filters) => (value: string) =>
    setFilters((f) => ({ ...f, [key]: value }));

  const toggle = (id: number) =>
    setChecked((already) => {
      const next = new Set(already);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const sortBy = (key: ColumnKey, group?: Id) =>
    setSort((current) =>
      sameSort(current, key, group)
        ? { key, group, direction: current.direction === "asc" ? "desc" : "asc" }
        : {
            key,
            group,
            direction: key === "subject" || key === "actors" || key === "labels" ? "asc" : "desc",
          },
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

  // Each column's header: the columns are displayed in the order of the
  // configuration, the checkbox staying first.
  const headers: Record<ColumnKey, (id: string, group?: Id) => ReactNode> = {
    ticket: (id) =>
      th(
        id,
        "Ticket",
        "ticket",
        <TextFilter label="ticket" value={filters.ticket} onChange={filter("ticket")} />,
        { width: 1, whiteSpace: "nowrap" },
      ),
    subject: (id) =>
      th(
        id,
        "Objet",
        "subject",
        <TextFilter label="objet" value={filters.subject} onChange={filter("subject")} />,
        { width: SUBJECT_WIDTH },
      ),
    actors: (id) =>
      th(
        id,
        "Acteurs",
        "actors",
        <ChoiceFilter
          label="acteur"
          options={actorOptions}
          value={filters.actor}
          onChange={filter("actor")}
        />,
        { width: 1, whiteSpace: "nowrap" },
      ),
    labels: (id, group) =>
      th(
        id,
        labelsColumnTitle(labelGroups, group),
        "labels",
        <ChoiceFilter
          label="étiquette"
          options={labelOptions}
          value={filters.label}
          onChange={filter("label")}
        />,
        { minWidth: LABELS_MIN_WIDTH },
        group,
      ),
    status: (id) =>
      th(
        id,
        "Statut",
        "status",
        // Under a status tab, the filter would have nothing to choose.
        tab === ALL ? (
          <ChoiceFilter
            label="statut"
            options={[{ value: ALL_OPTION, label: "Tous" }, ...SUPPORT_STATUSES]}
            value={filters.status}
            onChange={filter("status")}
          />
        ) : undefined,
      ),
    received: (id) =>
      th(
        id,
        "Reçu le",
        "received",
        <ChoiceFilter
          label="date de réception"
          options={PERIODS}
          value={filters.received}
          onChange={filter("received")}
        />,
        { width: DATE_WIDTH, maxWidth: DATE_WIDTH },
      ),
    due: (id) =>
      th(
        id,
        "Échéance",
        "due",
        <ChoiceFilter
          label="échéance"
          options={DUES}
          value={filters.due}
          onChange={filter("due")}
        />,
        { width: DATE_WIDTH, maxWidth: DATE_WIDTH },
      ),
  };

  // Each column's cell, for a request.
  const cells: Record<
    ColumnKey,
    (request: SupportRequest, group?: Id, format?: string) => ReactNode
  > = {
    ticket: (request) => (
      <Table.Td key="ticket" style={{ whiteSpace: "nowrap" }}>
        <ReferenceTag reference={supportTicketRef(request.number)} template={REFERENCE_TEMPLATE} />
      </Table.Td>
    ),
    subject: (request) => (
      <Table.Td key="subject" style={{ maxWidth: SUBJECT_WIDTH, width: SUBJECT_WIDTH }}>
        {request.subject ? (
          <Text size="sm" truncate>
            {request.subject}
          </Text>
        ) : (
          <Empty />
        )}
      </Table.Td>
    ),
    actors: (request) => (
      <Table.Td key="actors">
        <ActorsCell request={request} />
      </Table.Td>
    ),
    // Limited to a group, the column shows only its labels.
    labels: (request, group) => (
      <Table.Td key="labels">
        <LabelsCell labels={ofGroup(request.labels, group)} />
      </Table.Td>
    ),
    status: (request) => (
      <Table.Td key="status">
        <LabelChip
          label={{
            name: supportStatusLabel(request.status),
            color: STATUS_COLOR[request.status],
          }}
          size="xs"
          height={LABEL_HEIGHT}
        />
      </Table.Td>
    ),
    received: (request, _group, format) => (
      <Table.Td
        key="received"
        style={{ whiteSpace: "nowrap", width: DATE_WIDTH, maxWidth: DATE_WIDTH }}
      >
        <Text size="sm">{formatMoment(request.created_at, format)}</Text>
      </Table.Td>
    ),
    due: (request) => (
      <Table.Td key="due" style={{ width: DATE_WIDTH, maxWidth: DATE_WIDTH }}>
        <DueCell due={request.due_date} />
      </Table.Td>
    ),
  };

  // Without requests in the tab, only the empty screen is shown. A list emptied
  // by the filters, on the other hand, keeps its headers: that is where they are removed.
  if (inTab.length === 0 && !isFiltered) {
    return loading ? null : (
      <EmptyPanel
        icon={IconLifebuoy}
        message="Aucune demande"
        actionLabel="Nouveau ticket"
        onAction={onAddRequest}
      />
    );
  }

  return (
    // A section narrower than the list makes it scroll sideways, rather
    // than squash its columns.
    <GridScroll>
      <Table
        {...resize.tableProps}
        highlightOnHover
        verticalSpacing={0}
        styles={{
          // content-box: the height describes the content area, without the
          // padding or border clipping it.
          td: {
            boxSizing: "content-box",
            height: ACTOR_AVATAR_SIZE,
            paddingTop: ROW_PADDING_Y,
            paddingBottom: ROW_PADDING_Y,
          },
          th: {
            boxSizing: "content-box",
            height: ACTOR_AVATAR_SIZE,
            paddingTop: ROW_PADDING_Y,
            paddingBottom: ROW_PADDING_Y,
            verticalAlign: "middle",
          },
        }}
      >
        {resize.colgroup}
        <Table.Thead>
          {resize.widthRow}
          <Table.Tr>
            {/* No "check all": requests are chosen one by one. */}
            <Table.Th style={{ width: 1 }} />
            {columns.map((c) => headers[c.key as ColumnKey](c.id, c.group))}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {shown.map((request) => (
            <Table.Tr
              key={request.id}
              onClick={() => onOpenRequest(request)}
              // In edit mode, right-click goes back to the widget's menu.
              onContextMenu={(e) => {
                if (isEditing) return;
                setContext({ request, position: menuPosition(e) });
              }}
              // The row whose menu is open keeps the hover background: it
              // shows which request it applies to.
              style={{
                cursor: "pointer",
                backgroundColor:
                  context?.request.id === request.id ? "var(--table-hover-color)" : undefined,
              }}
            >
              {/* The checkbox must not open the request: the click stops there. */}
              <Table.Td onClick={(e) => e.stopPropagation()}>
                <Checkbox
                  size="xs"
                  color="teal"
                  aria-label={`Cocher ${supportTicketRef(request.number)}`}
                  checked={checked.has(request.id)}
                  onChange={() => toggle(request.id)}
                />
              </Table.Td>
              {columns.map((c) => (
                <Fragment key={c.id}>{cells[c.key as ColumnKey](request, c.group, c.format)}</Fragment>
              ))}
            </Table.Tr>
          ))}

          {/* Filtered down to nothing, the list says so, along with how to undo it. */}
          {shown.length === 0 && (
            <Table.Tr style={{ backgroundColor: "transparent" }}>
              <Table.Td colSpan={columnCount}>
                <Group gap="xs">
                  <Text size="sm" c="dimmed">
                    Aucune demande ne correspond aux filtres.
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

          {/* Last row: adding happens where the list ends. The explicit background
              neutralizes the hover — this row is not a request. */}
          {onAddRequest && (
            <Table.Tr style={{ backgroundColor: "transparent" }}>
              <Table.Td colSpan={columnCount}>
                <AddButton label="Nouveau ticket" onClick={onAddRequest} />
              </Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>
    </GridScroll>
  );
}
