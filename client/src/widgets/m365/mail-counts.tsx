import { Group, Input, Select, Stack, Text } from "@mantine/core";
import { IconChevronDown, IconFolders } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { notifyError } from "../../lib/errors";
import { useSources } from "../../lib/sources";
import { withField } from "../types";
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
  m365Event,
  mailKey,
  shownFoldersOf,
} from "@milo/shared";
import type {
  AccessMailFolder,
  Id,
  MailFolderKind,
  SourceWidget,
} from "@milo/shared";
import type { IndicatorConfigProps } from "../support/types";

// What the "Indicateurs" widgets read of the mailboxes (widgets/indicators,
// sources/mail.tsx): they follow the Mail widgets their drawer names
// (SOURCES), on any board one sees, and count what they read, under their
// consent — the folders' counts, the e-mails received today, those flagged.
// They only ask Graph for what it keeps or counts itself (server,
// routes/board-widgets.ts): no e-mail is read.

/** Like the Mail widget, the counts are reread at this rate, and when Graph notifies. */
const RELOAD_INTERVAL = 2 * 60_000;

/** Graph sends several notifications for one arrival: a single reread follows them. */
const NOTIFICATION_DELAY = 1_000;

/** A mailbox's name: the start of its address. */
export const ownerName = (owner: string) => owner.split("@")[0]!;

/** The mailboxes that could not be read say why, without hiding the others. */
const report = (errors: { owner: string; message: string }[]) => {
  for (const e of errors) notifyError(`${ownerName(e.owner)} : ${e.message}`, "Boîte illisible");
};

/** The folders a Mail widget reads, as a key: the count reads again when they change. */
const sourcesKeyOf = (config: unknown) =>
  [...shownFoldersOf(config)].map(([email, ids]) => `${email}:${ids.join("+")}`).join(",");

/** The Mail widgets a count follows (SOURCES), on any board one sees. */
const useMailSources = (config: unknown): SourceWidget[] => useSources("mail", config);

type Read<T> = { phase: "loading" } | { phase: "ready"; data: T } | { phase: "error"; message: string };

/**
 * What a widget reads of the mailboxes: at once, then at an interval and on
 * each arrival Graph notifies. A reread that fails keeps what was shown.
 */
export function useMailRead<T>(
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

/** Why a count has nothing to show: no Mail widget, no mailbox, a failure; null otherwise. */
export const pendingOf = (state: Read<unknown> & { empty: boolean; orphan: boolean }): string | null => {
  if (state.orphan) return "Aucun widget Messages associé";
  if (state.empty) return "Aucune boîte aux lettres";
  if (state.phase === "error") return state.message;
  return null;
};

// --- The folders counted ----------------------------------------------------

/**
 * A folder's color, from the charts' palette: the bin and the junk e-mail in
 * red, the inbox, sent items and drafts in green, the person's own in blue.
 */
export const colorOfFolder = (kind: MailFolderKind | ""): string => {
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
export function FoldersField({ config, onChange }: IndicatorConfigProps) {
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
