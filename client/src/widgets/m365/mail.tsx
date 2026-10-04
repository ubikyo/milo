import {
  Badge,
  Button,
  Checkbox,
  Drawer,
  Group,
  Loader,
  NumberInput,
  ScrollArea,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconExternalLink, IconMail, IconMailbox, IconPaperclip } from "@tabler/icons-react";
import dayjs from "dayjs";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { api } from "../../api";
import ConfigurationProblem from "../../components/ui/ConfigurationProblem";
import { Frame } from "../margins";
import EmailFrame from "../../components/support/EmailFrame";
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
import { withField, count } from "../types";
import type { AccessWidget, WidgetConfigProps } from "../types";
import { MAIL_PEOPLE, SHOWN_FOLDERS, m365Event, mailKey, shownFoldersOf } from "@milo/shared";
import type { AccessMail, AccessMailDetail, Id, MailAddress } from "@milo/shared";

// Mail: the viewer's inbox, if the drawer asks for it, as a grid — everyone sees their own, whatever the
// board —, and the mailboxes of the people the widget names. Each of these
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
const HEIGHT = "height";
const UNREAD = "unreadOnly";
const HEADER = "header";
const FRAMED = "framed";
/** Whether a new e-mail, seen when the page rereads the mailboxes, shows a notification. */
const NOTIFY = "notifyNew";
/** Whether the viewer's own inbox is read (server, routes/board-widgets.ts). */
const OWN_INBOX = "ownInbox";

/** The emails of a page: those the grid requests at once. */
const QUANTITY_DEFAULT = 15;
const QUANTITY_MIN = 5;
const QUANTITY_MAX = 100;

/** The grid's height, beyond which it scrolls. */
const DEFAULT_HEIGHT = 360;
const HEIGHT_MIN = 120;
const HEIGHT_MAX = 1600;

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

/** A column's width when the drawer sets none: the narrow ones keep theirs. */
const NATURAL_WIDTHS: Record<string, number | string> = {
  sender: "30%",
  date: 80,
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

/** A mailbox's name: the start of its address, the viewer's own being "Moi". */
const ownerName = (owner: string) => (owner ? owner.split("@")[0]! : "Moi");

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

const size = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
};

/** The emails opened, for the duration of the page: reopening them requests nothing. */
const alreadyOpened = new Map<string, AccessMailDetail>();

function Reader({
  blockId,
  header,
  onClose,
}: {
  blockId: Id;
  header: AccessMail | null;
  onClose: () => void;
}) {
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
      size={760}
      // In a portal, but under the widget for React: nothing in it makes the widget drag.
      data-no-widget-drag
      title={
        <Title order={4} lineClamp={2}>
          {header?.subject || "Sans objet"}
        </Title>
      }
    >
      {/* The drawer lives in a portal, but its events bubble up through
          React to the widget: right click does not open its settings there. */}
      <Stack
        gap="md"
        data-no-widget-drag
        onContextMenu={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {header && (
          <Stack gap={2}>
            <Group justify="space-between" wrap="nowrap" align="flex-start">
              <Text size="sm" fw={600}>
                {nameOf(header.from)}{" "}
                {header.from.name && (
                  <Text span size="sm" c="dimmed" fw={400}>
                    &lt;{header.from.email}&gt;
                  </Text>
                )}
              </Text>
              <Text size="sm" c="dimmed" style={{ flexShrink: 0 }}>
                {dayjs(header.received_at).format("dddd D MMMM YYYY, HH:mm")}
              </Text>
            </Group>
            {detail && detail.to.length > 0 && (
              <Text size="xs" c="dimmed">
                À : {addresses(detail.to)}
              </Text>
            )}
            {detail && detail.cc.length > 0 && (
              <Text size="xs" c="dimmed">
                Cc : {addresses(detail.cc)}
              </Text>
            )}
          </Stack>
        )}
        {detail && (detail.attachments.length > 0 || detail.url) && (
          <Group gap="xs">
            {detail.attachments.map((p) => (
              <Badge
                key={p.id}
                variant="default"
                leftSection={<IconPaperclip size={12} />}
                style={{ cursor: "pointer", textTransform: "none" }}
                onClick={() => download(p.id, p.name)}
                title="Télécharger"
              >
                {p.name} · {size(p.size)}
              </Badge>
            ))}
            {detail.url && (
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
              >
                Ouvrir dans Outlook
              </Button>
            )}
          </Group>
        )}
        {error && (
          <Text size="sm" c="red">
            {error}
          </Text>
        )}
        {!detail && !error && (
          <Group gap="xs" c="dimmed">
            <Loader size="xs" color="gray" />
            <Text size="sm">Chargement de l'e-mail…</Text>
          </Group>
        )}
        {detail && <EmailFrame html={detail.html} />}
      </Stack>
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
      unread: number | null;
    }
  | { phase: "error"; message: string };

function Mail({ blockId, config }: { blockId: Id; config: unknown }) {
  const quantity = bound(count(config, QUANTITY, QUANTITY_DEFAULT), QUANTITY_MIN, QUANTITY_MAX);
  const height = bound(count(config, HEIGHT, DEFAULT_HEIGHT), HEIGHT_MIN, HEIGHT_MAX);
  const unreadOnly = isChecked(config, UNREAD, false);
  const columns = keptColumns(MAIL_COLUMNS, withColumns(config));
  const own = isChecked(config, OWN_INBOX, false);
  const shown = [...shownFoldersOf(config)];
  // The mailboxes read: the page reads them again when they change.
  const sourcesKey = `${own}|${shown.map(([email, ids]) => `${email}:${ids.join("+")}`).join(",")}`;
  // Only the viewer's inbox: the header names it.
  const onlyOwn = own && shown.length === 0;
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

  // Several mailboxes: an error says whose.
  const several = shown.length > 0;
  // No mailbox to read: nothing is requested, the widget asks for its settings.
  const nothingToRead = !own && shown.length === 0;

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
                unread: page.unread ?? null,
              };
            }
            const fresh = new Map(page.messages.map((m) => [mailKeyOf(m), m]));
            const known = new Set(before.messages.map(mailKeyOf));
            return {
              ...before,
              unread: page.unread ?? before.unread,
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
      .catch((e: Error) => notifications.show({ color: "red", message: e.message }))
      .finally(() => {
        ongoing.current = false;
        setMore(false);
      });
  }, [state, blockId, quantity, unreadOnly]);

  if (nothingToRead) return <ConfigurationProblem widget={mailWidget.label} />;

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
            <Text size="sm" c="dimmed" truncate title={m.to.map((a) => a.email).join(", ")}>
              {m.to.map(nameOf).join(", ")}
            </Text>
          );
        case "subject":
          return (
            <Text size="sm" fw={weight} truncate c={m.importance === "high" ? "red" : undefined}>
              {m.subject || "Sans objet"}
            </Text>
          );
        case "preview":
          return (
            <Text size="sm" c="dimmed" truncate>
              {m.preview}
            </Text>
          );
        case "date":
          return (
            <Text size="xs" c="dimmed" fw={weight} ta="right" style={{ whiteSpace: "nowrap" }}>
              {whenLabel(m.received_at)}
            </Text>
          );
        case "attachments":
          return m.has_attachments ? <IconPaperclip size={12} color="var(--mantine-color-dimmed)" /> : null;
        case "importance":
          return m.importance === "normal" ? null : (
            <Text size="xs" c={m.importance === "high" ? "red" : "dimmed"} truncate>
              {m.importance === "high" ? "Haute" : "Basse"}
            </Text>
          );
        case "status":
          return (
            <Text size="xs" c={m.is_read ? "dimmed" : undefined} fw={weight} truncate>
              {m.is_read ? "Lu" : "Non lu"}
            </Text>
          );
        case "categories":
          return (
            <Text size="xs" c="dimmed" truncate title={m.categories.join(", ")}>
              {m.categories.join(", ")}
            </Text>
          );
        case "mailbox":
          return (
            <Text size="xs" c="dimmed" truncate title={m.owner || undefined}>
              {ownerName(m.owner)}
            </Text>
          );
        case "folder":
          return (
            <Text size="xs" c="dimmed" truncate>
              {m.folder}
            </Text>
          );
        default:
          return null;
      }
    };

    return (
      <Stack gap={6}>
        {isChecked(config, HEADER, true) && (
          <Group gap={6} c="dimmed">
            <IconMail size={14} />
            <Text size="xs">
              {onlyOwn ? "Boîte de réception" : "E-mails"}
              {state.unread !== null && ` · ${state.unread} non lu${state.unread > 1 ? "s" : ""}`}
            </Text>
          </Group>
        )}
        {state.messages.length === 0 ? (
          <Text size="sm" c="dimmed">
            {unreadOnly ? "Aucun e-mail non lu" : "Aucun e-mail"}
          </Text>
        ) : (
          <ScrollArea.Autosize mah={height} onBottomReached={loadMore} type="hover" offsetScrollbars="y">
            <Table
              highlightOnHover
              stickyHeader
              verticalSpacing={4}
              horizontalSpacing="xs"
              fz="sm"
              style={{ "--table-hover-color": NEUTRAL_HOVER, tableLayout: "fixed" } as CSSProperties}
            >
              <Table.Thead>
                <Table.Tr>
                  {columns.map((c) => (
                    <Table.Th
                      key={c.id}
                      fz="xs"
                      c="dimmed"
                      fw={500}
                      w={c.width ?? NATURAL_WIDTHS[c.key]}
                      ta={c.key === "date" ? "right" : undefined}
                      style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                    >
                      {c.key === "attachments" ? <IconPaperclip size={12} /> : c.label}
                    </Table.Th>
                  ))}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {state.messages.map((m) => (
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
            {/* The bottom of the grid requests the next page; when the grid
                does not scroll yet, the button does the same. */}
            {state.more && (
              <Group justify="center" py={6}>
                {more ? (
                  <Loader size="xs" color="gray" />
                ) : (
                  <Button size="compact-xs" variant="subtle" color="gray" onClick={loadMore}>
                    Charger les suivants
                  </Button>
                )}
              </Group>
            )}
          </ScrollArea.Autosize>
        )}
        <Reader blockId={blockId} header={isOpen} onClose={() => setOpened(null)} />
      </Stack>
    );
  })();

  return (
    <Frame config={config} framed={isChecked(config, FRAMED, false)}>
      {content}
    </Frame>
  );
}

/**
 * The drawer: the viewer's own inbox, the people whose mailbox may be read —
 * each with its consent state, then the folders read —, the grid's columns
 * and its settings.
 */
function MailConfig({ config, onChange }: WidgetConfigProps) {
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
    <Stack gap="xl">
      <ConfirmationActions scope="mail" owner={key} pending={pending} />
      <Checkbox
        label="Afficher ma boîte de réception"
        description="Chacun voit la sienne, lue dans Entra (permission Mail.Read)."
        checked={isChecked(config, OWN_INBOX, false)}
        onChange={(e) => onChange(withField(config, OWN_INBOX, e.currentTarget.checked))}
        color="teal"
      />
      <ReceptionField
        configKey={MAIL_PEOPLE}
        field="email"
        label="Boîtes aux lettres"
        description={
          <>
            Chaque adresse ajoutée reçoit, à l'enregistrement, un code à quatre chiffres : son
            titulaire vous le communique s'il accepte que ses e-mails soient affichés. Saisissez-le
            depuis le menu « Actions », puis « Confirmer une adresse ». Une fois l'adresse
            confirmée, choisissez à sa droite les dossiers à lire. Tous ceux qui voient ce tableau
            pourront lire ces e-mails.
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
      <ColumnFields columns={MAIL_COLUMNS} config={withColumns(config)} onChange={onChange} />
      <Group align="flex-start">
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
        <NumberInput
          label="Hauteur de la grille"
          value={count(config, HEIGHT, DEFAULT_HEIGHT)}
          onChange={(v) => onChange(withField(config, HEIGHT, v === "" ? DEFAULT_HEIGHT : Number(v)))}
          min={HEIGHT_MIN}
          max={HEIGHT_MAX}
          suffix=" px"
          allowNegative={false}
          allowDecimal={false}
          w={150}
        />
      </Group>
      <Stack gap="sm">
        <Checkbox
          label="Non lus uniquement"
          checked={isChecked(config, UNREAD, false)}
          onChange={(e) => onChange(withField(config, UNREAD, e.currentTarget.checked))}
          color="teal"
        />
        <Checkbox
          label="Notifier les nouveaux e-mails"
          description="Une notification s'affiche dans la page à l'arrivée d'un e-mail."
          checked={isChecked(config, NOTIFY, false)}
          onChange={(e) => onChange(withField(config, NOTIFY, e.currentTarget.checked))}
          color="teal"
        />
        <Checkbox
          label="Afficher le nombre de non lus"
          checked={isChecked(config, HEADER, true)}
          onChange={(e) => onChange(withField(config, HEADER, e.currentTarget.checked))}
          color="teal"
        />
      </Stack>
    </Stack>
  );
}

export const mailWidget: AccessWidget = {
  type: "mail",
  kind: "m365",
  label: "Mail",
  icon: IconMail,
  defaultConfig: {
    [QUANTITY]: QUANTITY_DEFAULT,
    [HEIGHT]: DEFAULT_HEIGHT,
    [LIST_COLUMNS]: DEFAULT_COLUMNS,
    [UNREAD]: false,
    [HEADER]: true,
    [FRAMED]: false,
    [OWN_INBOX]: false,
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
