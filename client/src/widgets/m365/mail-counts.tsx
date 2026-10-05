import { Group, Input, Loader, Select, Stack, Switch, Text } from "@mantine/core";
import { IconChevronDown, IconFolders, IconMailFilled } from "@tabler/icons-react";
import dayjs from "dayjs";
import { useContext, useEffect, useState } from "react";
import type { ComponentType } from "react";
import { api } from "../../api";
import { notifyError } from "../../lib/errors";
import { BoardWidgetsContext } from "../../components/ui/IndicatorsPanel";
import type { Indicator, IndicatorWidgetBase, WidgetRender } from "../../components/ui/IndicatorsPanel";
import { NameField, NAME, Nothing, IndicatorTitle, IndicatorValue } from "../support/common";
import { LabelBars } from "../support/labels";
import { text, withField } from "../types";
import { CHART_COLORS } from "../chart-colors";
import {
  EmptyList,
  INPUT_BACKGROUND,
  INPUT_INSET,
  ListFooter,
  NAME_INSET,
  ROUNDING,
  RowCheckbox,
  RowCheckboxSpace,
  pickKeys,
  rowStyle,
  useRowSelection,
} from "../../components/ui/DrawerRows";
import { OPTION_HEIGHT, VISIBLE_OPTIONS } from "../../components/ui/ColumnFields";
import optionClasses from "../../assets/styles/ColumnFields.module.css";
import {
  COUNTED_FOLDERS,
  MAIL_SOURCE,
  m365Event,
  mailKey,
  mailSourceOf,
  shownFoldersOf,
  widgetReference,
} from "@milo/shared";
import type {
  AccessMailFolder,
  AccessMailFolderCounts,
  Id,
  MailFolderKind,
  MailMetric,
} from "@milo/shared";
import type { IndicatorConfigProps } from "../support/types";

// The mail widgets that count rather than list: an "Indicateur" — the unread
// ones, the total, those received today, those flagged — and "Messages par
// dossier". Each follows the Mail widgets of its board — all of them, unless
// its drawer names one (MAIL_SOURCE) —, and counts what they read, under
// their consent. They only ask Graph for what it keeps or counts itself
// (server, routes/board-widgets.ts): no e-mail is read.

/** The mail widgets that count, as the board's registry takes them (widgets/index.tsx). */
export interface MailCountWidget extends IndicatorWidgetBase<string> {
  Display: ComponentType<{ config: unknown } & WidgetRender>;
}

/** Like the Mail widget, the counts are reread at this rate, and when Graph notifies. */
const RELOAD_INTERVAL = 2 * 60_000;

/** Graph sends several notifications for one arrival: a single reread follows them. */
const NOTIFICATION_DELAY = 1_000;

/** A mailbox's name: the start of its address. */
const ownerName = (owner: string) => owner.split("@")[0]!;

/** The mailboxes that could not be read say why, without hiding the others. */
const report = (errors: { owner: string; message: string }[]) => {
  for (const e of errors) notifyError(`${ownerName(e.owner)} : ${e.message}`, "Boîte illisible");
};

/** The folders a Mail widget reads, as a key: the count reads again when they change. */
const sourcesKeyOf = (config: unknown) =>
  [...shownFoldersOf(config)].map(([email, ids]) => `${email}:${ids.join("+")}`).join(",");

/** The board's Mail widgets, in column order. */
const useMailWidgets = (): Indicator<string>[] =>
  useContext(BoardWidgetsContext).filter((w) => w.type === "mail");

/**
 * The Mail widget a count names; undefined for all the board's — none named,
 * or one since removed.
 */
const useMailSource = (config: unknown): Indicator<string> | undefined => {
  const mails = useMailWidgets();
  const chosen = mailSourceOf(config);
  return mails.find((w) => w.id === chosen);
};

/** The Mail widgets a count follows: the one it names, otherwise all the board's. */
const useMailSources = (config: unknown): Indicator<string>[] => {
  const mails = useMailWidgets();
  const source = useMailSource(config);
  return source ? [source] : mails;
};

/** The value of the "all the board's Mail widgets" option. */
const ALL = "all";

/** A Mail widget, as the drawer offers it: by its reference alone. */
const mailLabel = (w: Indicator<string>, rank: number) =>
  widgetReference(w.type, w.config) || String(rank + 1);

/** The drawer's "Widget associé" field: all the board's Mail widgets, or one of them. */
function SourceField({ config, onChange }: IndicatorConfigProps) {
  const mails = useMailWidgets();
  const source = useMailSource(config);
  return (
    <Select
      label="Widget associé"
      data={[
        { value: ALL, label: "Tous les widgets" },
        ...mails.map((w, rank) => ({ value: String(w.id), label: mailLabel(w, rank) })),
      ]}
      value={source ? String(source.id) : ALL}
      onChange={(value) =>
        value && onChange(withField(config, MAIL_SOURCE, value === ALL ? null : Number(value)))
      }
      allowDeselect={false}
      w={180}
    />
  );
}

type Read<T> = { phase: "loading" } | { phase: "ready"; data: T } | { phase: "error"; message: string };

/**
 * What a widget reads of the mailboxes: at once, then at an interval and on
 * each arrival Graph notifies. A reread that fails keeps what was shown.
 */
function useMailRead<T>(
  blockId: Id,
  config: unknown,
  read: () => Promise<T & { errors: { owner: string; message: string }[] }>,
  /** What else, changed, reads again: the metric counted. */
  key: string,
): Read<T> & { empty: boolean; orphan: boolean } {
  const sources = useMailSources(config);
  // The sources and what they read: a change of either reads again.
  const sourcesKey = sources.map((s) => `${s.id}:${sourcesKeyOf(s.config)}`).join(";");
  const orphan = sources.length === 0;
  const empty = orphan || sources.every((s) => sourcesKeyOf(s.config) === "");
  const [state, setState] = useState<Read<T>>({ phase: "loading" });

  useEffect(() => {
    if (!blockId || empty) return;
    let active = true;
    setState({ phase: "loading" });
    const load = (first: boolean) =>
      read()
        .then((data) => {
          if (!active) return;
          if (first) report(data.errors);
          setState({ phase: "ready", data });
        })
        .catch((e: Error) => active && first && setState({ phase: "error", message: e.message }));
    load(true);
    const heartbeat = setInterval(() => load(false), RELOAD_INTERVAL);
    let pending: ReturnType<typeof setTimeout> | undefined;
    const onNewMail = () => {
      clearTimeout(pending);
      pending = setTimeout(() => load(false), NOTIFICATION_DELAY);
    };
    window.addEventListener(m365Event("mail"), onNewMail);
    return () => {
      active = false;
      clearInterval(heartbeat);
      clearTimeout(pending);
      window.removeEventListener(m365Event("mail"), onNewMail);
    };
    // "read" is rebuilt at each render: what it depends on is in the key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockId, sourcesKey, empty, key]);

  return { ...state, empty, orphan };
}

/** What a mail widget shows while it has nothing to count, or cannot. */
function Pending({ state }: { state: Read<unknown> & { empty: boolean; orphan: boolean } }) {
  if (state.orphan) return <Nothing>Aucun widget Messages sur le tableau</Nothing>;
  if (state.empty) return <Nothing>Aucune boîte aux lettres</Nothing>;
  if (state.phase === "error") {
    return (
      <Text size="sm" c="red" lineClamp={2}>
        {state.message}
      </Text>
    );
  }
  return <Loader size="xs" color="gray" />;
}

// --- Indicateur --------------------------------------------------------------

const METRIC = "metric";

const METRICS: { value: MailMetric; label: string }[] = [
  { value: "unread", label: "E-mails non lus" },
  { value: "total", label: "E-mails au total" },
  { value: "today", label: "E-mails reçus aujourd'hui" },
  { value: "flagged", label: "E-mails avec indicateur" },
];

/** The stored metric, or the first: an unknown value does not bring anything down. */
const metricOf = (config: unknown) =>
  METRICS.find((m) => m.value === text(config, METRIC)) ?? METRICS[0]!;

function MailCount({ config, id }: { config: unknown } & WidgetRender) {
  const metric = metricOf(config);
  const state = useMailRead(
    id,
    config,
    // The start of the viewer's day: "today" is theirs, not the server's.
    () => api.getMailCount(id, metric.value, dayjs().startOf("day").toISOString()),
    metric.value,
  );
  return (
    // The name at the top, the quantity at bottom left: the card gives the height.
    <Stack gap={4} justify="space-between" style={{ flex: 1 }}>
      <IndicatorTitle config={config} defaultValue={metric.label} />
      {state.phase === "ready" ? (
        <IndicatorValue config={config}>{state.data.value}</IndicatorValue>
      ) : (
        <Pending state={state} />
      )}
    </Stack>
  );
}

export const mailCountWidget: MailCountWidget = {
  type: "mail_count",
  kind: "m365",
  label: "Indicateur e-mail",
  icon: IconMailFilled,
  withValue: true,
  defaultConfig: { [NAME]: "", [METRIC]: "unread" },

  Display: MailCount,

  Config: ({ config, onChange }: IndicatorConfigProps) => (
    <Stack gap="xl">
      <SourceField config={config} onChange={onChange} />
      <NameField config={config} onChange={onChange} defaultValue={metricOf(config).label} />
      <Select
        label="Données"
        data={METRICS}
        value={metricOf(config).value}
        onChange={(value) => value && onChange(withField(config, METRIC, value))}
        allowDeselect={false}
      />
    </Stack>
  ),
};

// --- Messages par dossier ----------------------------------------------------

const FOLDERS_LABEL = "Messages par dossier";
/** "unread": the bars count the unread ones rather than all. */
const COUNTED = "counted";
const WITH_EMPTY = "withEmpty";

const COUNTS = [
  { value: "total", label: "Tous les messages" },
  { value: "unread", label: "Non lus" },
];

const unreadOnly = (config: unknown) => text(config, COUNTED) === "unread";
const withEmpty = (config: unknown) =>
  Boolean((config as Record<string, unknown> | null)?.[WITH_EMPTY]);

/**
 * A folder's color, from the charts' palette: the bin and the junk e-mail in
 * red, the inbox, sent items and drafts in green, the person's own in blue.
 */
const colorOfFolder = (kind: MailFolderKind | ""): string => {
  if (kind === "deleteditems" || kind === "junkemail") return CHART_COLORS.red;
  if (kind === "inbox" || kind === "sentitems" || kind === "drafts") return CHART_COLORS.green;
  return CHART_COLORS.blue;
};

/** A counted folder, as the list shows it: whose, which, and its name when stored. */
interface CountedFolder {
  email: string;
  id: string;
  name: string;
}

/**
 * The counted folders the configuration holds. Each mailbox's entry keeps, next
 * to its ids, their names ("names", in the same order): the drawer shows them
 * without reading the mailbox's whole folder tree.
 */
const countedListOf = (config: unknown): CountedFolder[] => {
  const value = (config as Record<string, unknown> | null)?.[COUNTED_FOLDERS];
  if (!Array.isArray(value)) return [];
  return (value as Record<string, unknown>[]).flatMap((entry) => {
    const email = typeof entry?.email === "string" ? entry.email.trim().toLowerCase() : "";
    const ids = Array.isArray(entry?.folders) ? (entry.folders as unknown[]) : [];
    const names = Array.isArray(entry?.names) ? (entry.names as unknown[]) : [];
    return ids.flatMap((id, i) =>
      email && typeof id === "string" && id
        ? [{ email, id, name: typeof names[i] === "string" ? names[i] : "" }]
        : [],
    );
  });
};

/** Each mailbox's folders, once read, for the page's duration: their tree is long to walk. */
const folderLists = new Map<string, Promise<AccessMailFolder[]>>();

const folderListOf = (key: string, email: string): Promise<AccessMailFolder[]> => {
  const id = `${key}|${email}`;
  let list = folderLists.get(id);
  if (!list) {
    list = api.getPersonFolders(key, email);
    folderLists.set(id, list);
    list.catch(() => folderLists.delete(id));
  }
  return list;
};

const folderValue = (f: CountedFolder) => `${f.email}|${f.id}`;

/**
 * A name's height: an "xs" field's, which Mantine only defines inside its
 * fields — read outside one, "--input-height-xs" is worth nothing.
 */
const NAME_HEIGHT = 30;

/** How much closer to its checkbox a folder's name sits than the row's gap. */
const CHECKBOX_GAP_TRIM = 5;

/**
 * The folders counted, like a list's columns (ColumnFields): one row each,
 * checked to be removed; "Ajouter un dossier" chooses one of the folders of
 * the Mail widget's mailboxes, those already there left out. None: the widget
 * counts the folders the Mail widget reads.
 */
function FoldersField({ config, onChange }: IndicatorConfigProps) {
  const sources = useMailSources(config);
  // Each mailbox, with the key of the first Mail widget that reads it: its
  // folders are read under that one's consent.
  const keys = new Map<string, string>();
  for (const s of sources) {
    for (const [email] of shownFoldersOf(s.config)) if (!keys.has(email)) keys.set(email, mailKey(s.config));
  }
  const people = [...keys.keys()];
  const keysKey = [...keys].map(([email, key]) => `${email}:${key}`).join(",");
  /** Each mailbox's folders, read once its owner consented: their names, by id. */
  const [names, setNames] = useState<Map<string, AccessMailFolder[]>>(new Map());
  const [adding, setAdding] = useState(false);
  const [isOpen, setOpened] = useState(false);

  const list = countedListOf(config).filter((f) => people.includes(f.email));
  // The folder lists are only read to add one — or for a folder stored
  // without its name, by an earlier version.
  const needed = adding || list.some((f) => !f.name);
  useEffect(() => {
    if (!needed) return;
    let active = true;
    for (const entry of keysKey ? keysKey.split(",") : []) {
      const [email, key] = entry.split(":") as [string, string];
      if (!key) continue;
      folderListOf(key, email)
        .then((folders) => active && setNames((before) => new Map(before).set(email, folders)))
        .catch((e: Error) => active && notifyError(e.message, "Dossiers illisibles"));
    }
    return () => {
      active = false;
    };
  }, [keysKey, needed]);

  const ids = list.map(folderValue);
  const selection = useRowSelection(ids);
  if (people.length === 0) return null;

  const store = (next: CountedFolder[]) => {
    const byPerson = new Map<string, CountedFolder[]>();
    for (const f of next) byPerson.set(f.email, [...(byPerson.get(f.email) ?? []), f]);
    onChange(
      withField(
        config,
        COUNTED_FOLDERS,
        [...byPerson].map(([email, folders]) => ({
          email,
          folders: folders.map((f) => f.id),
          names: folders.map((f) => f.name || nameIn(f)),
        })),
      ),
    );
  };

  const several = people.length > 1;
  /** Its name in the mailbox's folder list, once read. */
  const nameIn = (f: CountedFolder) => names.get(f.email)?.find((n) => n.id === f.id)?.name ?? "";
  const nameOf = (f: CountedFolder) => {
    const name = f.name || nameIn(f) || "…";
    return several ? `${f.email.split("@")[0]} · ${name}` : name;
  };

  // What can still be added: the folders not yet in the list, by mailbox.
  const taken = new Set(ids);
  const options = people.map((email) => ({
    group: email,
    items: (names.get(email) ?? [])
      .filter((n) => !taken.has(`${email}|${n.id}`))
      .map((n) => ({ value: `${email}|${n.id}`, label: n.name })),
  }));
  const data = several ? options : (options[0]?.items ?? []);

  const add = (value: string | null) => {
    setAdding(false);
    if (!value) return;
    const [email, ...rest] = value.split("|");
    const id = rest.join("|");
    const name = names.get(email!)?.find((n) => n.id === id)?.name ?? "";
    store([...list, { email: email!, id, name }]);
  };

  const removeChecked = () => {
    const checked = new Set(selection.checked);
    store(list.filter((f) => !checked.has(folderValue(f))));
    selection.reset();
  };

  const total = list.length + (adding ? 1 : 0);
  return (
    <Input.Wrapper label="Dossiers">
      {total === 0 ? (
        <EmptyList icon={IconFolders} message="Les dossiers du widget Messages associé" />
      ) : (
        <Stack gap={1}>
          {list.map((f, rank) => (
            <Group key={folderValue(f)} gap="sm" wrap="nowrap" style={rowStyle(rank, total, false)}>
              <RowCheckbox
                label={`Sélectionner ${nameOf(f)}`}
                checked={selection.isChecked(folderValue(f))}
                onChange={(on) => selection.toggle(folderValue(f), on)}
              />
              <Text
                size="sm"
                truncate
                // A field's height, as in the drawer's other lists: the
                // row's inset gives the 4px above and below.
                style={{ flex: 1, marginLeft: -CHECKBOX_GAP_TRIM, lineHeight: `${NAME_HEIGHT}px` }}
              >
                {nameOf(f)}
              </Text>
            </Group>
          ))}
          {adding && (
            <Group gap="sm" wrap="nowrap" style={rowStyle(list.length, total, false)}>
              <RowCheckboxSpace />
              <Select
                size="sm"
                radius={ROUNDING}
                // Its text aligns with the names above it.
                style={{ flex: 1, marginLeft: -NAME_INSET - CHECKBOX_GAP_TRIM + 3 }}
                data={data}
                value={null}
                placeholder={
                  people.every((email) => names.has(email))
                    ? "Choisir un dossier"
                    : "Chargement des dossiers…"
                }
                nothingFoundMessage="Aucun autre dossier"
                searchable
                onChange={add}
                // The added row, left without a folder, disappears.
                onBlur={() => setAdding(false)}
                {...pickKeys}
                onDropdownOpen={() => setOpened(true)}
                onDropdownClose={() => setOpened(false)}
                allowDeselect={false}
                autoFocus
                defaultDropdownOpened
                rightSection={<IconChevronDown size={14} />}
                rightSectionPointerEvents="none"
                // The list, as the drawer's other pickers show it (ColumnFields).
                comboboxProps={{ shadow: "md" }}
                maxDropdownHeight={VISIBLE_OPTIONS * OPTION_HEIGHT}
                classNames={{ option: optionClasses.option }}
                styles={{
                  input: {
                    height: "var(--input-height-xs)",
                    minHeight: "var(--input-height-xs)",
                    borderWidth: 0,
                    paddingLeft: INPUT_INSET,
                    cursor: "pointer",
                    ...(isOpen ? { backgroundColor: INPUT_BACKGROUND } : {}),
                  },
                }}
                aria-label="Dossier à ajouter"
              />
            </Group>
          )}
        </Stack>
      )}
      <ListFooter
        addLabel="Ajouter un dossier"
        onAdd={() => setAdding(true)}
        checkedCount={selection.checked.length}
        onDeleteChecked={removeChecked}
      />
    </Input.Wrapper>
  );
}

function MailFolders({ config, id }: { config: unknown } & WidgetRender) {
  const state = useMailRead<AccessMailFolderCounts>(
    id,
    config,
    () => api.getMailFolderCounts(id),
    "",
  );
  const unread = unreadOnly(config);

  const content = (() => {
    if (state.phase !== "ready") return <Pending state={state} />;
    const { folders } = state.data;
    // Several mailboxes: each folder says whose it is. The fullest first.
    const several = new Set(folders.map((f) => f.owner)).size > 1;
    const data = folders
      .map((f) => ({
        name: several ? `${ownerName(f.owner)} · ${f.name}` : f.name,
        value: unread ? f.unread : f.total,
        color: colorOfFolder(f.kind),
      }))
      .filter((b) => withEmpty(config) || b.value > 0)
      .sort((a, b) => b.value - a.value);
    if (data.length === 0) return <Nothing>{unread ? "Aucun e-mail non lu" : "Aucun e-mail"}</Nothing>;
    return <LabelBars data={data} ownColors />;
  })();

  return (
    <Stack gap="xs" style={{ flex: 1 }}>
      <IndicatorTitle config={config} defaultValue={FOLDERS_LABEL} />
      {content}
    </Stack>
  );
}

export const mailFoldersWidget: MailCountWidget = {
  type: "mail_folders",
  kind: "m365",
  label: FOLDERS_LABEL,
  icon: IconFolders,
  defaultConfig: { [NAME]: "", [COUNTED]: "total", [WITH_EMPTY]: false },

  Display: MailFolders,

  Config: ({ config, onChange }: IndicatorConfigProps) => (
    <Stack gap="xl">
      <SourceField config={config} onChange={onChange} />
      <FoldersField config={config} onChange={onChange} />
      <NameField config={config} onChange={onChange} defaultValue={FOLDERS_LABEL} />
      <Select
        label="Compter"
        data={COUNTS}
        value={unreadOnly(config) ? "unread" : "total"}
        onChange={(value) => value && onChange(withField(config, COUNTED, value))}
        allowDeselect={false}
      />
      <Switch
        label="Afficher les dossiers vides"
        checked={withEmpty(config)}
        onChange={(e) => onChange(withField(config, WITH_EMPTY, e.currentTarget.checked))}
        color="teal"
      />
    </Stack>
  ),
};

/** In the order the widgets drawer presents them, after the Mail widget. */
export const MAIL_COUNT_WIDGETS: MailCountWidget[] = [mailCountWidget, mailFoldersWidget];
