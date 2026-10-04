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
import { keptColumns, defaultWidths } from "../ui/ChampsColonnes";
import EmptyPanel from "../ui/EmptyPanel";
import GridScroll from "../ui/GrilleScroll";
import LabelChip from "../ui/LabelChip";
import { ReferenceTag } from "../ui/ReferenceTag";
import { menuPosition, type PointMenuPosition } from "../ui/PointMenu";
import { useResizableColumns } from "../ui/useColonnesRedimensionnables";
import { DUE_COLOR, DUE_WORD, shortDate, dueState } from "../../lib/echeance";
import { STRONG_TEXT } from "../../themes/colors";
import { SUPPORT_STATUSES, listKey, supportStatusLabel, supportTicketRef } from "@milo/shared";
import { useIsEditing } from "../../lib/edition";
import { inList } from "../../lib/listes";
import type { CSSProperties, ReactNode } from "react";
import type { Actor, SupportRequest, SupportStatus } from "@milo/shared";

// La liste des demandes du mode Support : un widget des sections, comme les
// indicateurs (indicators/liste.tsx). Ce qu'elle montre et ce qu'on y fait —
// l'onglet ouvert, le tri, les filtres, les cases cochées, le menu du clic
// droit — appartient à la page : le menu « Actions » de la rangée d'onglets
// porte sur les demandes cochées ici. La page le donne par
// « SupportListeContext » ; le widget ne choisit que ses colonnes.

/** L'onglet qui ne filtre rien : il montre les demandes de tous les statuts. */
export const ALL = "all";

// Padding vertical des lignes, comme dans le tableau des projets : la hauteur
// inclut le padding (box-sizing).
const ROW_PADDING_Y = 5;

// Les étiquettes d'une demande, sur une seule ligne : au-delà de deux, le
// compte des autres remplace la liste.
const LABELS_SHOWN = 2;
const LABEL_HEIGHT = 20;

// Le numéro de ticket le plus long qu'on attend : le tag en prend la largeur.
const REFERENCE_TEMPLATE = supportTicketRef(9999);

/**
 * La couleur du tag de chaque statut, dessiné comme une étiquette : le
 * rouge de ce que personne n'a encore pris, l'orange de ce qui est en cours,
 * le vert de ce qui est réglé.
 */
const STATUS_COLOR: Record<SupportStatus, string> = {
  new: "red.6",
  open: "orange.6",
  pending: "orange.6",
  resolved: "green.6",
  closed: "green.6",
};

/** Une valeur absente se lit pareil partout : un tiret discret. */
function Empty() {
  return (
    <Text size="sm" c="dimmed">
      —
    </Text>
  );
}

function LabelsCell({ labels }: { labels: SupportRequest["labels"] }) {
  if (!labels.length) return <Empty />;

  // Les plus lourdes devant : le serveur les range ainsi, la saisie du tiroir
  // non.
  const montrees = [...labels].sort((a, b) => b.weight - a.weight).slice(0, LABELS_SHOWN);
  const remaining = labels.length - montrees.length;

  return (
    // Boîte de hauteur fixe : sans elle, la line-box ajoute un demi-pixel et la
    // ligne devient plus haute que les autres.
    <div
      style={{
        height: ACTOR_AVATAR_SIZE,
        display: "flex",
        alignItems: "center",
        overflow: "hidden",
      }}
    >
      <Group gap={4} wrap="nowrap">
        {montrees.map((label) => (
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

/** L'expéditeur d'une demande reçue par e-mail, en acteur à afficher. */
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
 * Les acteurs qu'on montre : l'expéditeur en tête — il est acteur d'office —,
 * puis les désignés. Celui qui a un compte y est déjà, il n'est pas redoublé.
 */
const shownActors = (request: SupportRequest): Actor[] => {
  const sender = senderWithoutAccount(request);
  return sender ? [sender, ...request.actors] : request.actors;
};

/** L'expéditeur, s'il n'est pas déjà parmi les acteurs sous son compte. */
const senderWithoutAccount = (request: SupportRequest): Actor | null => {
  const sender = senderOf(request);
  if (!sender) return null;
  const address = sender.email.toLowerCase();
  return request.actors.some((a) => a.email.toLowerCase() === address) ? null : sender;
};

/** La clé d'un acteur dans le filtre : un compte, ou une adresse sans compte. */
const actorKey = (a: Actor): string => (a.id ? `u:${a.id}` : `e:${a.email.toLowerCase()}`);

function ActorsCell({ request }: { request: SupportRequest }) {
  // L'expéditeur passe en tête, marqué de son enveloppe — qu'il ait un compte
  // ou non. Avec un compte, il est déjà parmi les acteurs : il en sort pour
  // n'être montré qu'une fois, mais avec sa marque, comme dans le tiroir.
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

/** L'échéance, et la bulle qui dit où on en est — la même qu'une carte. */
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
      {/* La date prend elle-même la couleur de l'état : orange à trois jours,
          rouge une fois passée. */}
      <Text size="sm" c={DUE_COLOR[state]} fw={state === "aucun" ? undefined : 600}>
        {shortDate(due)}
      </Text>
      {state !== "aucun" && (
        <Badge color={DUE_COLOR[state]} variant="filled" radius="sm" size="sm">
          {DUE_WORD[state]}
        </Badge>
      )}
    </Group>
  );
}

// --- Tri et filtres --------------------------------------------------------
// Comme au tableau des projets : le libellé trie, l'entonnoir filtre, et les
// deux sont des commandes distinctes.

// La colonne « Objet » a une largeur fixe : un objet trop long se coupe
// d'une ellipse plutôt que d'élargir la colonne.
const SUBJECT_WIDTH = 600;
/**
 * Le minimum de la colonne « Étiquettes », assez pour ses deux étiquettes et
 * le compte des autres. Les acteurs, eux, s'en tiennent à leurs avatars :
 * c'est aux étiquettes qu'ira l'air qui reste.
 */
const LABELS_MIN_WIDTH = 260;
/** Largeur des colonnes de dates : « Reçu le » et « Échéance ». */
const DATE_WIDTH = 130;
export type ColumnKey = "ticket" | "subject" | "actors" | "labels" | "due" | "status" | "received";

interface Sort {
  key: ColumnKey;
  direction: "asc" | "desc";
}

/** Une option d'entonnoir : « all » vaut « pas de filtre ». */
interface FilterOption {
  value: string;
  label: string;
}

const ALL_OPTION = "all";

const STATUS_ORDER = Object.fromEntries(SUPPORT_STATUSES.map((s, i) => [s.value, i])) as Record<
  SupportStatus,
  number
>;

/** La valeur sur laquelle chaque colonne se trie ; « null » passe en bas. */
const VALUES: Record<ColumnKey, (d: SupportRequest) => string | number | null> = {
  ticket: (d) => d.number,
  subject: (d) => d.subject || null,
  actors: (d) => {
    const a = shownActors(d);
    return a.length ? a.map((x) => x.name).join(", ") : null;
  },
  // Par la plus lourde des étiquettes : celle que la cellule montre en tête.
  labels: (d) => (d.labels.length ? Math.max(...d.labels.map((l) => l.weight)) : null),
  due: (d) => d.due_date || null,
  status: (d) => STATUS_ORDER[d.status],
  received: (d) => d.created_at,
};

const DUES: FilterOption[] = [
  { value: ALL_OPTION, label: "Toutes" },
  { value: "retard", label: DUE_WORD.retard },
  { value: "bientot", label: DUE_WORD.bientot },
  { value: "avec", label: "Avec échéance" },
  { value: "sans", label: "Sans échéance" },
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
    if (f.due === "sans" ? d.due_date : !d.due_date) return false;
    if ((f.due === "retard" || f.due === "bientot") && dueState(d.due_date) !== f.due)
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

/** L'entonnoir d'une liste de choix. Il se colore tant qu'il retient quelque chose. */
function ChoiceFilter({
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

/** L'entonnoir d'une colonne de texte : on tape ce qu'on cherche. */
function TextFilter({
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
  sort,
  onSort,
  filter,
  style,
  handle,
}: {
  label: string;
  column: ColumnKey;
  sort: Sort;
  onSort: (key: ColumnKey) => void;
  filter?: ReactNode;
  style?: CSSProperties;
  handle: ReactNode;
}) {
  const active = sort.key === column;
  const Icon = !active ? IconSelector : sort.direction === "asc" ? IconChevronUp : IconChevronDown;
  return (
    <Table.Th style={style}>
      <Group gap={4} wrap="nowrap">
        <UnstyledButton onClick={() => onSort(column)} style={{ flex: 1, minWidth: 0 }}>
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

/** La clé des boîtes reçues, dans la configuration de la liste : chacune vers un contexte. */
export const MAILBOXES = "boites";

/** Les colonnes que la liste sait montrer, dans l'ordre. */
export const SUPPORT_COLUMNS: { key: ColumnKey; label: string }[] = [
  { key: "ticket", label: "Ticket" },
  { key: "subject", label: "Objet" },
  { key: "actors", label: "Acteurs" },
  { key: "labels", label: "Étiquettes" },
  { key: "status", label: "Statut" },
  { key: "received", label: "Reçu le" },
  { key: "due", label: "Échéance" },
];

/**
 * L'état de la liste, tenu par la page : ce qu'on voit dans l'onglet ouvert,
 * trié et filtré, et ce qu'on y a coché.
 */
export const useSupportList = (requests: SupportRequest[] | null, tab: string) => {
  // Par défaut, les plus récentes en premier : c'est l'ordre du serveur.
  const [sort, setSort] = useState<Sort>({ key: "received", direction: "desc" });
  const [filters, setFilters] = useState<Filters>(NO_FILTER);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  /** La ligne dont le menu du clic droit est ouvert, et où il s'ouvre. */
  const [context, setContext] = useState<{
    request: SupportRequest;
    position: PointMenuPosition;
  } | null>(null);

  const dansLOnglet = useMemo(
    () =>
      !requests ? [] : tab === ALL ? requests : requests.filter((r) => r.status === tab),
    [requests, tab],
  );

  // Ce que les entonnoirs proposent : ce qui se trouve dans l'onglet, pas plus.
  const optionsActeurs = useMemo<FilterOption[]>(() => {
    const seen = new Map<string, string>();
    for (const d of dansLOnglet) for (const a of shownActors(d)) seen.set(actorKey(a), a.name);
    return [
      { value: ALL_OPTION, label: "Tous" },
      ...[...seen]
        .sort((a, b) => a[1].localeCompare(b[1], "fr"))
        .map(([value, label]) => ({ value, label })),
    ];
  }, [dansLOnglet]);
  const optionsEtiquettes = useMemo<FilterOption[]>(() => {
    const names = new Set(dansLOnglet.flatMap((d) => d.labels.map((l) => l.name)));
    return [
      { value: ALL_OPTION, label: "Toutes" },
      ...[...names].sort((a, b) => a.localeCompare(b, "fr")).map((n) => ({ value: n, label: n })),
    ];
  }, [dansLOnglet]);

  const montrees = useMemo(() => {
    const value = VALUES[sort.key];
    const factor = sort.direction === "asc" ? 1 : -1;
    return dansLOnglet
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
  }, [dansLOnglet, filters, sort]);

  // Les cases cochées ne valent que pour ce qu'on voit : une demande filtrée
  // ou passée dans un autre onglet ne subit pas une action à l'aveugle.
  const selection = montrees.filter((d) => checked.has(d.id));

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
    dansLOnglet,
    montrees,
    selection,
    optionsActeurs,
    optionsEtiquettes,
  };
};

export interface SupportList extends ReturnType<typeof useSupportList> {
  loading: boolean;
  onOpenRequest: (request: SupportRequest) => void;
  /**
   * Sans lui — sans le droit d'ajouter une demande —, pas de ligne d'ajout.
   * La clé de liste dit le widget d'où on l'ajoute.
   */
  onAddRequest?: (listKey: string) => void;
}

/** L'état de la liste, donné par la page au widget. Hors du mode Support, il n'y en a pas. */
export const SupportListContext = createContext<SupportList | null>(null);

export default function SupportRequestsList({ config }: { config: unknown }) {
  const list = useContext(SupportListContext);
  // Hors du mode Support, rien à lister. Le reste vit dans un composant à
  // part : ses hooks s'appellent ainsi à chaque rendu, dans le même ordre.
  if (!list) return null;
  return <RequestsList config={config} list={list} />;
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
    montrees: allShown,
    dansLOnglet: allInTab,
    optionsActeurs,
    optionsEtiquettes,
    loading,
    onOpenRequest,
    onAddRequest: addRequest,
  } = list;

  // Les demandes du tableau, du contexte choisi, que la page a lues — celles
  // de ce widget seulement (lib/listes.ts). Une demande ajoutée ici est la
  // sienne.
  const ofThisWidget = inList(config);
  const montrees = allShown.filter(ofThisWidget);
  const dansLOnglet = allInTab.filter(ofThisWidget);
  const onAddRequest = addRequest && (() => addRequest(listKey(config)));
  const isEditing = useIsEditing();

  // Les colonnes gardées, dans l'ordre choisi par la configuration.
  // Une colonne peut revenir : « id » distingue chaque occurrence.
  const columns = keptColumns(SUPPORT_COLUMNS, config);
  // La case à cocher en tête de chaque ligne, puis les colonnes.
  const columnCount = columns.length + 1;
  const resize = useResizableColumns(
    "support",
    ["case", ...columns.map((c) => c.id)],
    defaultWidths(SUPPORT_COLUMNS, config),
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

  const sortBy = (key: ColumnKey) =>
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : {
            key,
            direction: key === "subject" || key === "actors" || key === "labels" ? "asc" : "desc",
          },
    );

  const th = (
    id: string,
    label: string,
    column: ColumnKey,
    filter?: ReactNode,
    style?: CSSProperties,
  ) => (
    <SortableTh
      key={id}
      label={label}
      column={column}
      sort={sort}
      onSort={sortBy}
      filter={filter}
      style={style}
      handle={resize.handle(id)}
    />
  );

  // L'entête de chaque colonne : les colonnes s'affichent dans l'ordre de la
  // configuration, la case à cocher restant en tête.
  const headers: Record<ColumnKey, (id: string) => ReactNode> = {
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
          options={optionsActeurs}
          value={filters.actor}
          onChange={filter("actor")}
        />,
        { width: 1, whiteSpace: "nowrap" },
      ),
    labels: (id) =>
      th(
        id,
        "Étiquettes",
        "labels",
        <ChoiceFilter
          label="étiquette"
          options={optionsEtiquettes}
          value={filters.label}
          onChange={filter("label")}
        />,
        { minWidth: LABELS_MIN_WIDTH },
      ),
    status: (id) =>
      th(
        id,
        "Statut",
        "status",
        // Sous un onglet de statut, le filtre n'aurait rien à choisir.
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

  // La cellule de chaque colonne, pour une demande.
  const cells: Record<ColumnKey, (request: SupportRequest) => ReactNode> = {
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
    labels: (request) => (
      <Table.Td key="labels">
        <LabelsCell labels={request.labels} />
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
    received: (request) => (
      <Table.Td
        key="received"
        style={{ whiteSpace: "nowrap", width: DATE_WIDTH, maxWidth: DATE_WIDTH }}
      >
        <Text size="sm">{dayjs(request.created_at).format("DD/MM/YYYY HH:mm")}</Text>
      </Table.Td>
    ),
    due: (request) => (
      <Table.Td key="due" style={{ width: DATE_WIDTH, maxWidth: DATE_WIDTH }}>
        <DueCell due={request.due_date} />
      </Table.Td>
    ),
  };

  // Sans demande dans l'onglet, seul l'écran vide s'affiche. Une liste vidée
  // par les filtres, elle, garde ses entêtes : c'est là qu'on les retire.
  if (dansLOnglet.length === 0 && !isFiltered) {
    return loading ? null : (
      <EmptyPanel
        icon={IconLifebuoy}
        message="Aucune demande"
        actionLabel="Nouveau ticket"
        onAction={onAddRequest}
        size="md"
      />
    );
  }

  return (
    // Une section plus étroite que la liste la fait défiler de côté, plutôt
    // que d'écraser ses colonnes.
    <GridScroll>
      <Table
        {...resize.tableProps}
        highlightOnHover
        verticalSpacing={0}
        styles={{
          // content-box : la hauteur décrit la zone de contenu, sans que le
          // padding ni la bordure la rognent.
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
          <Table.Tr>
            {/* Pas de « tout cocher » : on choisit les demandes une à une. */}
            <Table.Th style={{ width: 1 }} />
            {columns.map((c) => headers[c.key](c.id))}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {montrees.map((request) => (
            <Table.Tr
              key={request.id}
              onClick={() => onOpenRequest(request)}
              // En modification, le clic droit revient au menu du widget.
              onContextMenu={(e) => {
                if (isEditing) return;
                setContext({ request, position: menuPosition(e) });
              }}
              // La ligne dont le menu est ouvert garde le fond du survol : on
              // voit sur quelle demande il porte.
              style={{
                cursor: "pointer",
                backgroundColor:
                  context?.request.id === request.id ? "var(--table-hover-color)" : undefined,
              }}
            >
              {/* La case ne doit pas ouvrir la demande : le clic s'arrête là. */}
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
                <Fragment key={c.id}>{cells[c.key](request)}</Fragment>
              ))}
            </Table.Tr>
          ))}

          {/* Filtrée jusqu'au vide, la liste le dit, et de quoi défaire. */}
          {montrees.length === 0 && (
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

          {/* Dernière ligne : l'ajout se fait là où la liste se termine. Le fond
              explicite neutralise le survol — cette ligne n'est pas une demande. */}
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
