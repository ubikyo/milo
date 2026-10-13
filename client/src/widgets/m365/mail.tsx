import {
  Button,
  Drawer,
  Group,
  Loader,
  Menu,
  NumberInput,
  ScrollArea,
  Stack,
  Switch,
  Table,
  Tabs,
  Text,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconChevronDown,
  IconExternalLink,
  IconMail,
  IconMailbox,
  IconPaperclip,
  IconTrash,
} from "@tabler/icons-react";
import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { api } from "../../api";
import EmptyPanel from "../../components/ui/EmptyPanel";
import { Frame } from "../margins";
import { isSized } from "../height";
import alignment from "../../assets/styles/Alignment.module.css";
import scroll from "../../assets/styles/ListScroll.module.css";
import DrawerScrollArea, {
  DRAWER_PADDING,
  DRAWER_PANEL_STYLE,
  DRAWER_STYLES,
  DRAWER_TABS_STYLES,
} from "../../components/ui/DrawerScroll";
import DrawerFooter from "../../components/ui/DrawerFooter";
import { HEADER_BACKGROUND } from "../../components/ui/DrawerRows";
import { tabStyle } from "../../themes/tabs";
import { ACTIONS_BUTTON_STYLE, DRAWER_MENU_OFFSET, TAB_MENU_STYLES } from "../../themes/menus";
import { RED } from "../../themes/colors";
import DeleteConfirmModal from "../../components/ui/DeleteConfirmModal";
import { useWidgetAccess } from "../../lib/rights";
import { clearRequest, usePublishedResults, useRequestedItem } from "../../lib/searchSources";

/**
 * The message's background: a ticket's message's on the light theme; on dark,
 * a gray lighter than the drawer's, which would otherwise swallow it.
 */
const MESSAGE_BACKGROUND = "var(--milo-m365-message)";

/** "À :" and "Cc :": white on the dark theme, the text's color on the light one. */
const LABEL_COLOR = "var(--milo-strong-text)";

/** The reader's width: a ticket's drawer's. */
const DRAWER_WIDTH = 820;
import { ReceivedEmail } from "../../components/support/SupportMessages";
import {
  ConfirmationActions,
  State as OptinState,
  looksLikeAddress,
} from "../../components/support/Inboxes";
import ChoicePicker, { FOLDER_NOUN, foldersOf } from "../../components/ui/ChoicePicker";
import ColumnFields, { LIST_COLUMNS, keptColumns } from "../../components/ui/ColumnFields";
import type { ListColumn } from "../../components/ui/ColumnFields";
import ReceptionField, { inboxesOf } from "../../components/ui/ReceptionField";
import { useConfirmations } from "../../lib/confirmations";
import { notifyError } from "../../lib/errors";
import { NEUTRAL_HOVER } from "../../themes/colors";
import { GRID_STYLES, SortLabel } from "../../components/project/ProjectTable";
import { useResizableColumns } from "../../components/ui/useResizableColumns";
import { withField, count } from "../types";
import type { AccessWidget, WidgetConfigProps, WidgetDisplayProps } from "../types";
import {
  MAIL_PEOPLE,
  SHOWN_FOLDERS,
  accessIncludes,
  m365Event,
  mailKey,
  shownFoldersOf,
} from "@milo/shared";
import type { AccessMail, AccessMailDetail, Id, MailAddress } from "@milo/shared";
import MailTemplates from "../../components/settings/MailTemplates";
import { useSettingsMode, useTemplatesAccess } from "../../lib/rights";
import type { MailTemplateKey } from "@milo/shared";

/** The template of the e-mail that carries the code. */
const MAIL_TEMPLATES: readonly MailTemplateKey[] = ["mail_confirmation"];

// Mail: the mailboxes of the people the widget names, as a grid. Each of these
// receives a code by e-mail when the widget is saved, and their mailbox is
// only read once that code, passed on, is entered from the "Actions" menu
// (server, lib/mail-optin.ts); the drawer then chooses, to the right of the
// address, which of their folders are read — none chosen, their inbox.
// Everything is read from Entra by the server (server/src/lib/entra.ts,
// Mail.Read application permission), merged from most recent to oldest, page
// by page: the next one arrives when scrolling down to the bottom of the grid. A click on a row opens the email in a
// drawer, as the sender wrote it (EmailFrame, the Support one), with its
// attachments.
//
// Nothing is modified in the mailbox: an email opened here is not marked read there.

const QUANTITY = "count";
const UNREAD = "unreadOnly";
const FRAMED = "framed";
/** Whether a new e-mail, seen when the page rereads the mailboxes, shows a notification. */
const NOTIFY = "notifyNew";

/** The emails of a page: those the grid requests at once. */
const QUANTITY_DEFAULT = 15;
const QUANTITY_MIN = 5;
const QUANTITY_MAX = 100;

/** How close to the bottom of the grid the next page is requested, in pixels. */
const LOAD_AHEAD = 120;

/**
 * The page rereads the mailboxes at this rate: new emails are placed at the
 * top. When Graph notifies the server (lib/m365-webhooks.ts), it rereads at once.
 */
const RELOAD_INTERVAL = 2 * 60_000;

/** Graph sends several notifications for one arrival: a single reread follows them. */
const NOTIFICATION_DELAY = 1_000;

/** The grid's columns, set in the drawer like a list's (ColumnFields). */
const MAIL_COLUMNS: ListColumn[] = [
  { key: "sender", label: "Expéditeur" },
  { key: "to", label: "Destinataires" },
  { key: "subject", label: "Objet" },
  { key: "preview", label: "Aperçu" },
  { key: "date", label: "Date de réception" },
  { key: "attachments", label: "Pièces jointes" },
  { key: "importance", label: "Importance" },
  { key: "status", label: "État" },
  { key: "categories", label: "Catégories" },
  { key: "mailbox", label: "Boîte" },
  { key: "folder", label: "Dossier" },
];

const DEFAULT_COLUMNS = [{ key: "sender" }, { key: "subject" }, { key: "date" }];

/**
 * A column's width when the drawer sets none: the narrow ones keep theirs, the
 * others share the rest.
 */
const NATURAL_WIDTHS: Record<string, number> = {
  // Wide enough for its header, "Date de réception", and for a full date.
  date: 145,
  attachments: 32,
  importance: 90,
  status: 70,
};

const isChecked = (config: unknown, key: string, defaultValue: boolean): boolean => {
  const value = (config as Record<string, unknown> | null)?.[key];
  return value === undefined ? defaultValue : Boolean(value);
};

/**
 * The configuration as the column list reads it. The first widgets kept their
 * columns as bare keys: they become rows; without any, the default ones.
 */
const withColumns = (config: unknown): Record<string, unknown> => {
  const base = (config as Record<string, unknown> | null) ?? {};
  const value = base[LIST_COLUMNS];
  if (!Array.isArray(value)) return { ...base, [LIST_COLUMNS]: DEFAULT_COLUMNS };
  if (value.every((v) => typeof v === "string")) {
    const keys = value as string[];
    return { ...base, [LIST_COLUMNS]: keys.length ? keys.map((key) => ({ key })) : DEFAULT_COLUMNS };
  }
  return base;
};

/** The addresses of the people the widget names, in lowercase. */
const peopleOf = (config: unknown): string[] => [
  ...new Set(
    inboxesOf(config, MAIL_PEOPLE)
      .map((r) => (typeof r.email === "string" ? r.email.trim().toLowerCase() : ""))
      .filter(looksLikeAddress),
  ),
];

/** A mailbox's name: the start of its address. */
const ownerName = (owner: string) => owner.split("@")[0]!;

/**
 * A mailbox that cannot be read — Graph's "Access denied" — says why in a
 * notification, without hiding the others; its id is its message: the
 * rereads do not stack it. "several": the message says whose.
 */
const report = (errors: { owner: string; message: string }[], several: boolean) => {
  for (const e of errors) {
    notifyError(`${several ? `${ownerName(e.owner)} : ` : ""}${e.message}`, "Boîte illisible");
  }
};

/**
 * The e-mails arrived since the last reading, in a notification — one each,
 * beyond three a single one that counts them.
 */
const announce = (fresh: AccessMail[]) => {
  if (fresh.length > 3) {
    notifications.show({
      title: "Nouveaux e-mails",
      message: `${fresh.length} nouveaux e-mails`,
      icon: <IconMail size={16} />,
    });
    return;
  }
  for (const m of fresh) {
    notifications.show({
      title: nameOf(m.from),
      message: m.subject || "Sans objet",
      icon: <IconMail size={16} />,
    });
  }
};

/** What designates an e-mail: two mailboxes may give the same id. */
const mailKeyOf = (m: AccessMail) => `${m.owner}|${m.id}`;

const bound = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Today, the time; this year, the day; before that, the full date. */
const whenLabel = (iso: string): string => {
  const date = dayjs(iso);
  if (date.isSame(dayjs(), "day")) return date.format("HH:mm");
  if (date.isSame(dayjs(), "year")) return date.format("D MMM");
  return date.format("DD/MM/YYYY");
};

const nameOf = (a: MailAddress) => a.name || a.email || "Inconnu";

/** What a column sorts the e-mails on. */
const SORT_VALUES: Record<string, (m: AccessMail) => string | number> = {
  sender: (m) => nameOf(m.from),
  to: (m) => m.to.map(nameOf).join(", "),
  subject: (m) => m.subject,
  preview: (m) => m.preview,
  date: (m) => m.received_at,
  attachments: (m) => (m.has_attachments ? 1 : 0),
  importance: (m) => ({ low: 0, normal: 1, high: 2 })[m.importance] ?? 1,
  status: (m) => (m.is_read ? 1 : 0),
  categories: (m) => m.categories.join(", "),
  mailbox: (m) => ownerName(m.owner),
  folder: (m) => m.folder,
};

/** The columns that start from the largest: the most recent, the most important first. */
const DESCENDING = new Set(["date", "attachments", "importance"]);

interface MailSort {
  key: string;
  direction: "asc" | "desc";
}

/** The e-mails in the order of the sort. */
const sortedMails = (messages: AccessMail[], sort: MailSort): AccessMail[] => {
  const value = SORT_VALUES[sort.key];
  if (!value) return messages;
  const factor = sort.direction === "asc" ? 1 : -1;
  return [...messages].sort((a, b) => {
    const left = value(a);
    const right = value(b);
    if (typeof left === "number" && typeof right === "number") return (left - right) * factor;
    return String(left).localeCompare(String(right), "fr", { numeric: true }) * factor;
  });
};

/** The emails opened, for the duration of the page: reopening them requests nothing. */
const alreadyOpened = new Map<string, AccessMailDetail>();

function Reader({
  blockId,
  header,
  onClose,
  onDeleted,
}: {
  blockId: Id;
  header: AccessMail | null;
  onClose: () => void;
  /** The e-mail is gone from its mailbox: the grid drops it. */
  onDeleted: (mail: AccessMail) => void;
}) {
  // Deleting takes the right to delete on the type, as the server checks.
  const access = useWidgetAccess();
  const canDelete = accessIncludes(access("m365"), "delete");
  const [confirming, setConfirming] = useState(false);
  const remove = async () => {
    setConfirming(false);
    if (!header) return;
    try {
      await api.deleteAccessMail(blockId, header.id, header.owner);
      alreadyOpened.delete(mailKeyOf(header));
      onDeleted(header);
      onClose();
      notifications.show({ color: "teal", message: "E-mail supprimé" });
    } catch (e) {
      notifyError((e as Error).message);
    }
  };
  const [detail, setDetail] = useState<AccessMailDetail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!header) return;
    const known = alreadyOpened.get(mailKeyOf(header));
    setDetail(known ?? null);
    setError("");
    if (known) return;
    let active = true;
    api
      .getAccessMail(blockId, header.id, header.owner)
      .then((d) => {
        alreadyOpened.set(mailKeyOf(header), d);
        if (active) setDetail(d);
      })
      .catch((e: Error) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [blockId, header]);

  const download = async (attachmentId: string, name: string) => {
    if (!header) return;
    try {
      const file = await api.downloadAccessMailAttachment(blockId, header.id, attachmentId, header.owner);
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      notifications.show({ color: "red", message: (e as Error).message });
    }
  };

  const addresses = (list: MailAddress[]) =>
    list.map((a) => (a.name ? `${a.name} <${a.email}>` : a.email)).join(", ");

  return (
    <Drawer
      opened={header !== null}
      onClose={onClose}
      position="right"
      size={DRAWER_WIDTH}
      padding={DRAWER_PADDING}
      withCloseButton={false}
      // Like a ticket's drawer: only the tab's panel scrolls, the tab and the
      // bottom button stay in place (components/ui/DrawerScroll.tsx).
      styles={DRAWER_STYLES}
      // In a portal, but under the widget for React: nothing in it makes the widget drag.
      data-no-widget-drag
    >
      {/* The drawer lives in a portal, but its events bubble up through
          React to the widget: right click does not open its settings there. */}
      <Tabs
        value="message"
        style={DRAWER_PANEL_STYLE}
        styles={DRAWER_TABS_STYLES}
        data-no-widget-drag
        onContextMenu={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <Tabs.List mb="md">
          <Tabs.Tab value="message" leftSection={<IconMail size={16} />} style={tabStyle(true)}>
            Message
          </Tabs.Tab>
          {/* At the end of the tab row, as a ticket's actions. */}
          {detail?.url && (
            <Button
              component="a"
              href={detail.url}
              target="_blank"
              rel="noopener noreferrer"
              size="compact-xs"
              variant="subtle"
              color="gray"
              rightSection={<IconExternalLink size={12} />}
              ml="auto"
              style={{ alignSelf: "center" }}
            >
              Ouvrir dans Outlook
            </Button>
          )}
          {canDelete && header && (
            <Menu
              position="bottom-end"
              withinPortal
              shadow="md"
              offset={DRAWER_MENU_OFFSET}
              styles={TAB_MENU_STYLES}
            >
              <Menu.Target>
                <Button
                  variant="subtle"
                  color="gray"
                  rightSection={<IconChevronDown size={14} />}
                  ml={detail?.url ? undefined : "auto"}
                  mb={4}
                  style={{ alignSelf: "center", ...ACTIONS_BUTTON_STYLE } as CSSProperties}
                >
                  Actions
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item
                  color={RED}
                  leftSection={<IconTrash size={16} />}
                  onClick={() => setConfirming(true)}
                >
                  Supprimer
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          )}
        </Tabs.List>

        <Tabs.Panel value="message" style={DRAWER_PANEL_STYLE}>
          <DrawerScrollArea fill>
            <Stack gap={0} style={{ flex: 1 }}>
              <Text fw={700} size="lg" pb={30}>
                {header?.subject || "Sans objet"}
              </Text>
                {header && (
                  <ReceivedEmail
                    author={{ id: 0, name: header.from.name, email: header.from.email, gravatar_url: "" }}
                    date={header.received_at}
                    headerBackground={HEADER_BACKGROUND}
                    background={MESSAGE_BACKGROUND}
                    recipients={
                      detail && (
                        <>
                          {detail.to.length > 0 && (
                            <Text size="xs" c="dimmed">
                              <Text span inherit c={LABEL_COLOR}>
                                À :
                              </Text>{" "}
                              {addresses(detail.to)}
                            </Text>
                          )}
                          {detail.cc.length > 0 && (
                            <Text size="xs" c="dimmed">
                              <Text span inherit c={LABEL_COLOR}>
                                Cc :
                              </Text>{" "}
                              {addresses(detail.cc)}
                            </Text>
                          )}
                        </>
                      )
                    }
                    html={
                      detail ? (
                        detail.html
                      ) : error ? (
                        <Text size="sm" c="red">
                          {error}
                        </Text>
                      ) : (
                        <Group gap="xs" c="dimmed">
                          <Loader size="xs" color="gray" />
                          <Text size="sm">Chargement de l'e-mail…</Text>
                        </Group>
                      )
                    }
                    files={(detail?.attachments ?? []).map((p) => ({
                      key: p.id,
                      name: p.name,
                      size: p.size,
                      onOpen: () => void download(p.id, p.name),
                    }))}
                  />
                )}
            </Stack>
          </DrawerScrollArea>
        </Tabs.Panel>
      </Tabs>

      <DrawerFooter onClose={onClose} />

      <DeleteConfirmModal
        opened={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => void remove()}
        title="Supprimer l'e-mail"
        message="Voulez-vous vraiment supprimer cet e-mail ? Il sera placé dans les éléments supprimés de sa boîte aux lettres."
      />
    </Drawer>
  );
}

type State =
  | { phase: "loading" }
  | {
      phase: "ready";
      messages: AccessMail[];
      more: boolean;
      /** Where the next page starts. */
      cursor: string;
    }
  | { phase: "error"; message: string };

function Mail({ blockId, config, onEdit, locked }: WidgetDisplayProps) {
  const quantity = bound(count(config, QUANTITY, QUANTITY_DEFAULT), QUANTITY_MIN, QUANTITY_MAX);
  const unreadOnly = isChecked(config, UNREAD, false);
  const columns = keptColumns(MAIL_COLUMNS, withColumns(config));
  // By default, as the mailboxes send them: the most recent first.
  const [sort, setSort] = useState<MailSort>({ key: "date", direction: "desc" });
  const onSort = (key: string) =>
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key, direction: DESCENDING.has(key) ? "desc" : "asc" },
    );
  // As the projects': the drawer's widths, otherwise the natural ones, until a
  // column is dragged.
  const resize = useResizableColumns(
    "mail",
    columns.map((c) => c.id),
    Object.fromEntries(
      columns.flatMap((c) => {
        const width = c.width ?? NATURAL_WIDTHS[c.key];
        return width ? [[c.id, width]] : [];
      }),
    ),
  );
  const shown = [...shownFoldersOf(config)];
  // A height of its own: the grid fills it and scrolls; "Auto", it shows all its rows.
  const sized = isSized(config);
  // The mailboxes read: the page reads them again when they change.
  const sourcesKey = shown.map(([email, ids]) => `${email}:${ids.join("+")}`).join(",");
  const [state, setState] = useState<State>({ phase: "loading" });
  const [more, setMore] = useState(false);
  const [isOpen, setOpened] = useState<AccessMail | null>(null);
  // The next page is requested only one at a time, even if the bottom of the
  // grid is reached several times while it arrives.
  const ongoing = useRef(false);
  // The e-mails already shown: those a reread brings besides are new. The
  // setting is read through a ref, so that changing it does not reread everything.
  const seen = useRef(new Set<string>());
  const notify = useRef(false);
  notify.current = isChecked(config, NOTIFY, false);
  useEffect(() => {
    if (state.phase === "ready") seen.current = new Set(state.messages.map(mailKeyOf));
  }, [state]);

  // The e-mails loaded are searched (SearchBox): their subject, sender and
  // the start of their text. One found opens here, in the reader.
  const loaded = state.phase === "ready" ? state.messages : null;
  usePublishedResults(
    blockId,
    "mail",
    useMemo(
      () =>
        loaded?.map((m) => ({
          kind: "mail" as const,
          title: m.subject || "Sans objet",
          context: [nameOf(m.from), whenLabel(m.received_at), m.folder].filter(Boolean).join(" · "),
          keywords: [m.from.email, m.preview].filter(Boolean).join(" "),
          item: mailKeyOf(m),
        })) ?? null,
      [loaded],
    ),
  );
  const requested = useRequestedItem(blockId);
  useEffect(() => {
    const found = requested && loaded?.find((m) => mailKeyOf(m) === requested);
    if (!found) return;
    clearRequest();
    setOpened(found);
  }, [requested, loaded]);

  // Several mailboxes: an error says whose.
  const several = shown.length > 1;
  // No mailbox to read: nothing is requested, the widget asks for its settings.
  const nothingToRead = shown.length === 0;

  // The first page, reread at an interval: what has arrived since is placed at
  // the top, and the emails already there resume their state — read elsewhere, for example.
  useEffect(() => {
    if (!blockId || nothingToRead) return;
    let active = true;
    setState({ phase: "loading" });
    const read = (first: boolean) =>
      api
        .getAccessMails(blockId, "", quantity, unreadOnly)
        .then((page) => {
          if (!active) return;
          report(page.errors, several);
          if (!first && notify.current) {
            announce(page.messages.filter((m) => !seen.current.has(mailKeyOf(m))));
          }
          setState((before) => {
            if (first || before.phase !== "ready") {
              return {
                phase: "ready",
                messages: page.messages,
                more: page.more,
                cursor: page.cursor,
              };
            }
            const fresh = new Map(page.messages.map((m) => [mailKeyOf(m), m]));
            const known = new Set(before.messages.map(mailKeyOf));
            return {
              ...before,
              messages: [
                ...page.messages.filter((m) => !known.has(mailKeyOf(m))),
                ...before.messages.map((m) => fresh.get(mailKeyOf(m)) ?? m),
              ],
            };
          });
        })
        .catch((e: Error) => active && first && setState({ phase: "error", message: e.message }));
    read(true);
    const heartbeat = setInterval(() => read(false), RELOAD_INTERVAL);
    let pending: ReturnType<typeof setTimeout> | undefined;
    const onNewMail = () => {
      clearTimeout(pending);
      pending = setTimeout(() => read(false), NOTIFICATION_DELAY);
    };
    window.addEventListener(m365Event("mail"), onNewMail);
    return () => {
      active = false;
      clearInterval(heartbeat);
      clearTimeout(pending);
      window.removeEventListener(m365Event("mail"), onNewMail);
    };
  }, [blockId, quantity, unreadOnly, sourcesKey, several, nothingToRead]);

  // A page that failed is not requested again by itself: only the button retries.
  const failed = useRef(false);
  const loadMore = useCallback(() => {
    if (state.phase !== "ready" || !state.more || ongoing.current) return;
    ongoing.current = true;
    setMore(true);
    api
      .getAccessMails(blockId, state.cursor, quantity, unreadOnly)
      .then((page) =>
        setState((before) => {
          if (before.phase !== "ready") return before;
          const known = new Set(before.messages.map(mailKeyOf));
          return {
            ...before,
            more: page.more,
            cursor: page.cursor,
            messages: [...before.messages, ...page.messages.filter((m) => !known.has(mailKeyOf(m)))],
          };
        }),
      )
      .catch((e: Error) => {
        failed.current = true;
        notifications.show({ color: "red", message: e.message });
      })
      .finally(() => {
        ongoing.current = false;
        setMore(false);
      });
  }, [state, blockId, quantity, unreadOnly]);

  // Given a height, the next page arrives before the very bottom of the grid is
  // reached; and while the grid does not fill its place yet — nothing to
  // scroll —, it requests the following ones by itself. "Auto", with no
  // scrolling, they come through the button.
  const viewport = useRef<HTMLDivElement>(null);
  const nearBottom = () => {
    const v = viewport.current;
    return v !== null && v.scrollHeight - v.scrollTop - v.clientHeight <= LOAD_AHEAD;
  };
  const loadAhead = () => {
    if (!failed.current && nearBottom()) loadMore();
  };
  useEffect(() => {
    if (state.phase === "ready" && state.more) loadAhead();
  });

  // No mailbox: "Ajouter" opens the drawer, where they are named.
  if (nothingToRead) {
    return (
      <EmptyPanel
        icon={IconMailbox}
        message="Aucune boîte aux lettres"
        actionLabel={locked ? undefined : "Ajouter"}
        onAction={onEdit}
        fill={false}
      />
    );
  }

  const content = (() => {
    if (state.phase === "loading") {
      return (
        <Group gap="xs" c="dimmed">
          <Loader size="xs" color="gray" />
          <Text size="sm">Chargement des e-mails…</Text>
        </Group>
      );
    }
    if (state.phase === "error") {
      return (
        <Group gap={6} wrap="nowrap" align="flex-start">
          <IconMail size={16} style={{ flexShrink: 0, marginTop: 2 }} />
          <Text size="sm" c="red" lineClamp={3}>
            {state.message}
          </Text>
        </Group>
      );
    }

    const cell = (key: string, m: AccessMail) => {
      const weight = m.is_read ? 400 : 600;
      switch (key) {
        case "sender":
          return (
            <Text size="sm" fw={weight} truncate title={m.from.email}>
              {nameOf(m.from)}
            </Text>
          );
        case "to":
          return (
            <Text size="sm" truncate title={m.to.map((a) => a.email).join(", ")}>
              {m.to.map(nameOf).join(", ")}
            </Text>
          );
        case "subject":
          return (
            <Text size="sm" fw={weight} truncate>
              {m.subject || "Sans objet"}
            </Text>
          );
        case "preview":
          return (
            <Text size="sm" truncate>
              {m.preview}
            </Text>
          );
        case "date":
          return (
            <Text size="sm" fw={weight} ta="right" style={{ whiteSpace: "nowrap" }}>
              {whenLabel(m.received_at)}
            </Text>
          );
        case "attachments":
          return m.has_attachments ? <IconPaperclip size={14} /> : null;
        case "importance":
          return m.importance === "normal" ? null : (
            <Text size="sm" truncate>
              {m.importance === "high" ? "Haute" : "Basse"}
            </Text>
          );
        case "status":
          return (
            <Text size="sm" fw={weight} truncate>
              {m.is_read ? "Lu" : "Non lu"}
            </Text>
          );
        case "categories":
          return (
            <Text size="sm" truncate title={m.categories.join(", ")}>
              {m.categories.join(", ")}
            </Text>
          );
        case "mailbox":
          return (
            <Text size="sm" truncate title={m.owner || undefined}>
              {ownerName(m.owner)}
            </Text>
          );
        case "folder":
          return (
            <Text size="sm" truncate>
              {m.folder}
            </Text>
          );
        default:
          return null;
      }
    };

    const grid = (
      <Table
        highlightOnHover
        verticalSpacing={0}
        // The projects' grid format, header and rows.
        styles={GRID_STYLES}
        {...resize.tableProps}
        style={
          {
            // Without any width, the columns share the grid rather than
            // widening it to their content.
            ...(resize.tableProps.style ?? { tableLayout: "fixed", width: "100%" }),
            "--table-hover-color": NEUTRAL_HOVER,
          } as CSSProperties
        }
      >
        {resize.colgroup}
        <Table.Thead>
          <Table.Tr>
            {columns.map((c) => (
              <Table.Th key={c.id}>
                <SortLabel
                  label={c.key === "attachments" ? <IconPaperclip size={14} /> : c.label}
                  direction={sort.key === c.key ? sort.direction : null}
                  onSort={() => onSort(c.key)}
                />
                {resize.handle(c.id)}
              </Table.Th>
            ))}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {sortedMails(state.messages, sort).map((m) => (
            <Table.Tr key={mailKeyOf(m)} onClick={() => setOpened(m)} style={{ cursor: "pointer" }}>
              {columns.map((c) => (
                <Table.Td key={c.id} ta={c.key === "date" ? "right" : undefined}>
                  {cell(c.key, m)}
                </Table.Td>
              ))}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    );
    // Near the bottom of the grid, the next page is requested by itself; the
    // button remains, should a request have failed. A green band across the
    // whole width, against the bottom of the widget.
    const next = state.more && (
      <Button
        fullWidth
        variant="filled"
        color="teal"
        loading={more}
        onClick={() => {
          failed.current = false;
          loadMore();
        }}
        style={{ flexShrink: 0, height: "auto", padding: 10, borderRadius: "0 0 10px 10px" }}
      >
        Charger les suivants
      </Button>
    );

    return (
      <>
        {state.messages.length === 0 ? (
          <Text size="sm" c="dimmed">
            {unreadOnly ? "Aucun e-mail non lu" : "Aucun e-mail"}
          </Text>
        ) : sized ? (
          // The band stays under the scrolling grid, at the bottom of the widget.
          <Stack gap={0} style={{ flex: 1, minHeight: 0 }}>
            <ScrollArea
              viewportRef={viewport}
              onScrollPositionChange={loadAhead}
              type="auto"
              scrollbars="y"
              classNames={{ scrollbar: scroll.scrollbar, thumb: scroll.thumb }}
              style={{ flex: 1, minHeight: 0 }}
            >
              {grid}
            </ScrollArea>
            {next}
          </Stack>
        ) : (
          // "Auto": the whole grid, at its content's height; the following
          // pages come through the band.
          <Stack gap={0}>
            {grid}
            {next}
          </Stack>
        )}
        <Reader
          blockId={blockId}
          header={isOpen}
          onClose={() => setOpened(null)}
          onDeleted={(gone) =>
            setState((before) =>
              before.phase === "ready"
                ? { ...before, messages: before.messages.filter((m) => mailKeyOf(m) !== mailKeyOf(gone)) }
                : before,
            )
          }
        />
      </>
    );
  })();

  return (
    <Frame config={config} framed={isChecked(config, FRAMED, false)}>
      {/* Given a height, the content fills it: unframed, it is the place
          itself (Alignment.module.css), framed, it fills the frame. */}
      <Stack
        gap={6}
        className={sized ? alignment.frame : undefined}
        style={sized ? { flex: 1, minHeight: 0 } : undefined}
      >
        {content}
      </Stack>
    </Frame>
  );
}
/**
 * The people whose mailbox the widget reads — each with its consent state,
 * then, once confirmed, the folders read.
 */
function MailboxesField({ config, onChange }: WidgetConfigProps) {
  // The widget's key: a widget not yet saved has none — everything waits.
  const key = mailKey(config);
  const people = peopleOf(config);
  const { confirmed } = useConfirmations(key, people, "mail");
  const pending = people.filter((e) => !confirmed(e));
  // A person removed from the list, or not yet confirmed, is no longer read.
  const shown = new Map([...shownFoldersOf(config)].filter(([e]) => people.includes(e) && confirmed(e)));

  /** A person's folders, chosen; null: none of them is read any more. */
  const choose = (email: string, ids: string[] | null) => {
    const next = new Map(shown);
    if (ids) next.set(email, ids);
    else next.delete(email);
    onChange(
      withField(
        config,
        SHOWN_FOLDERS,
        [...next].map(([e, folders]) => ({ email: e, folders })),
      ),
    );
  };

  return (
    <>
      <ConfirmationActions scope="mail" owner={key} pending={pending} />
      <ReceptionField
        configKey={MAIL_PEOPLE}
        field="email"
        label="Boîtes aux lettres"
        description={
          <>
            L'ajout d'une boîte aux lettres nécessite un code d'activation à 4 chiffres envoyé sur
            l'adresse e-mail. Une fois ce code reçu, cliquer sur le menu « Actions » puis «
            Confirmer une adresse » pour terminer la configuration de l'adresse.
          </>
        }
        placeholder="Adresse e-mail"
        add="Ajouter une adresse e-mail"
        icon={IconMailbox}
        empty="Aucune boîte aux lettres"
        normalizeValue={(value) => value.trim()}
        // Confirmed, the address offers its folders; until then, it waits.
        state={(value) => {
          const email = value.trim().toLowerCase();
          if (!email) return null;
          if (!looksLikeAddress(email) || !confirmed(email)) return <OptinState confirmed={false} />;
          return (
            <ChoicePicker
              load={foldersOf(key, email)}
              chosen={shown.get(email)}
              onChange={(ids) => choose(email, ids)}
              noun={FOLDER_NOUN}
              errorTitle="Dossiers illisibles"
            />
          );
        }}
        config={config}
        onChange={onChange}
      />
    </>
  );
}

/** The drawer: the mailboxes read, the grid's columns and its settings. */
function MailConfig({ config, onChange }: WidgetConfigProps) {
  const canEditSettings = useSettingsMode();
  const canEditTemplates = useTemplatesAccess();
  return (
    <Stack gap="xl">
      <MailboxesField config={config} onChange={onChange} />
      <ColumnFields columns={MAIL_COLUMNS} config={withColumns(config)} onChange={onChange} />
      {/* A field emptied while typing stores the default value. */}
      <NumberInput
        label="E-mails par chargement"
        value={count(config, QUANTITY, QUANTITY_DEFAULT)}
        onChange={(v) => onChange(withField(config, QUANTITY, v === "" ? QUANTITY_DEFAULT : Number(v)))}
        min={QUANTITY_MIN}
        max={QUANTITY_MAX}
        allowNegative={false}
        allowDecimal={false}
        w={170}
      />
      <Stack gap="sm">
        <Switch
          label="Non lus uniquement"
          checked={isChecked(config, UNREAD, false)}
          onChange={(e) => onChange(withField(config, UNREAD, e.currentTarget.checked))}
          color="teal"
        />
        <Switch
          label="Notifier les nouveaux e-mails"
          checked={isChecked(config, NOTIFY, false)}
          onChange={(e) => onChange(withField(config, NOTIFY, e.currentTarget.checked))}
          color="teal"
        />
      </Stack>
      {/* The code e-mail's template, as in the Tickets widget: it falls
          under the Paramétrage. */}
      {canEditSettings && <MailTemplates canEdit={canEditTemplates} only={MAIL_TEMPLATES} />}
    </Stack>
  );
}

export const mailWidget: AccessWidget = {
  type: "mail",
  kind: "m365",
  label: "Messages",
  icon: IconMail,
  defaultConfig: {
    [QUANTITY]: QUANTITY_DEFAULT,
    [LIST_COLUMNS]: DEFAULT_COLUMNS,
    [UNREAD]: false,
    [FRAMED]: false,
    [NOTIFY]: false,
  },
  // Each row opens its email.
  ownClicks: true,

  Display: Mail,

  margins: () => ({ top: 0, bottom: 15 }),

  // It draws its own frame, set in the drawer's "Apparence" block.
  ownFrame: true,

  Config: MailConfig,
};
