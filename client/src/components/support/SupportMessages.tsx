import {
  ActionIcon,
  Anchor,
  Button,
  Group,
  Menu,
  Paper,
  Stack,
  Text,
  Typography,
} from "@mantine/core";
import { RichTextEditor } from "@mantine/tiptap";
import {
  IconAlertTriangle,
  IconChevronDown,
  IconMailCheck,
  IconMailOff,
  IconPaperclip,
  IconX,
  IconSend2,
  IconTrash,
} from "@tabler/icons-react";
import dayjs from "dayjs";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { RED } from "../../themes/colors";
import { PersonAvatar, SenderAvatar } from "../ui/ActorAvatars";
import DeleteConfirmModal from "../ui/DeleteConfirmModal";
import RichTextField, { useRichEditor } from "../ui/RichText";
import type { ThreadItem } from "../project/CommentThread";
import { MILO_ACTOR_ID } from "@milo/shared";
import type {
  SqliteBool,
  SupportAttachment,
  SupportCommentFormat,
  SupportMailStatus,
  SupportStatus,
} from "@milo/shared";
import RecipientsInput from "./RecipientsInput";
import EmailFrame from "./EmailFrame";
import classes from "../../assets/styles/SupportMessages.module.css";

/** A message in the thread, and what became of its sending by e-mail. */
export type SupportMessage = ThreadItem & {
  mail_status?: SupportMailStatus;
  mail_to?: string;
  mail_cc?: string;
  mail_bcc?: string;
  /** "email": a received e-mail, shown as is in a frame. */
  format?: SupportCommentFormat;
  attachments?: SupportAttachment[];
  /** An internal comment, from the "Commentaires" tab. */
  internal?: SqliteBool | boolean;
};

/** What a reply's footer says, depending on how it was sent. */
const SENDING: Record<
  Exclude<SupportMailStatus, "">,
  { icon: typeof IconMailCheck; color: string; text: (a: string) => string }
> = {
  sent: {
    icon: IconMailCheck,
    color: "teal",
    text: (a) => `Envoyé par e-mail à ${a}`,
  },
  simulated: {
    icon: IconMailOff,
    color: "dimmed",
    text: (a) => `Simulation : non envoyé à ${a}`,
  },
  failed: {
    icon: IconAlertTriangle,
    color: "red",
    text: (a) => `Échec de l'envoi à ${a}`,
  },
};

// A request's thread, read like an e-mail conversation: what comes
// from the sender on the left, what the team writes on the right, each at
// three quarters of the width. The application's words — creation, merge,
// closure — sit in the middle, small: they belong to no one.

const MESSAGE_WIDTH = "75%";

/** The air between two messages, and around each one's body. */
const MESSAGES_GAP = 30;
const MARGIN_MESSAGE = 30;

/** A message's background, received or sent: its position says who it comes from. */
const MESSAGE_BACKGROUND =
  "light-dark(var(--mantine-color-gray-1), var(--mantine-color-dark-7))";

/** "1,2 Mo": an attachment's size. */
const readableSize = (bytes: number): string => {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo`;
  }
  if (bytes >= 1024)
    return `${Math.round(bytes / 1024).toLocaleString("fr-FR")} Ko`;
  return `${bytes} o`;
};

/** A row of the file list: what is shown, and what can be done with it. */
interface FileRow {
  key: string;
  name: string;
  size: number;
  /** The address to download it from, once stored. */
  href?: string;
  /** Remove it, as long as the reply has not been sent. */
  onRemove?: () => void;
}

/**
 * Files, one per row: the name on the left, and the sizes right-aligned
 * in a column. Used for a message's attachments as well as for those of a
 * reply being written, which are removed with a cross.
 */
function FileList({
  rows,
  px = MARGIN_MESSAGE,
}: {
  rows: FileRow[];
  px?: number;
}) {
  const removable = rows.some((l) => l.onRemove);
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: removable
          ? "minmax(0, 1fr) auto auto"
          : "minmax(0, 1fr) auto",
        alignItems: "center",
        columnGap: 16,
        rowGap: 4,
        padding: `var(--mantine-spacing-sm) ${px}px`,
        borderTop: "1px dotted var(--mantine-color-default-border)",
      }}
    >
      {rows.map((row) => {
        const name = (
          <>
            <IconPaperclip size={14} style={{ flexShrink: 0 }} />
            <Text span size="sm" c="inherit" truncate>
              {row.name}
            </Text>
          </>
        );
        const style = {
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          minWidth: 0,
        };
        return (
          <Fragment key={row.key}>
            {row.href ? (
              <Anchor
                href={row.href}
                target="_blank"
                rel="noopener noreferrer"
                size="sm"
                style={style}
              >
                {name}
              </Anchor>
            ) : (
              // Not yet stored, so no link: but the same component
              // as the messages' attachments, hence the same color.
              <Anchor
                component="span"
                size="sm"
                underline="never"
                style={style}
              >
                {name}
              </Anchor>
            )}
            <Text size="sm" c="dimmed" ta="right">
              {readableSize(row.size)}
            </Text>
            {removable && (
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                onClick={row.onRemove}
                aria-label={`Retirer ${row.name}`}
              >
                <IconX size={14} />
              </ActionIcon>
            )}
          </Fragment>
        );
      })}
    </div>
  );
}

/** An e-mail's attachments, under its body: each one can be downloaded. */
function Attachments({ attachments }: { attachments: SupportAttachment[] }) {
  return (
    <FileList
      px={10}
      rows={attachments.map((p) => ({
        key: p.url,
        name: p.name,
        size: p.size,
        href: p.url,
      }))}
    />
  );
}

const formatDate = (value: string): string =>
  dayjs(value).format("DD/MM/YYYY HH:mm");

const escape = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * A message's text, as HTML. Those from before the editor are plain text:
 * they are escaped and put into paragraphs, as the server does with the
 * e-mails it imports. The rest was sanitized by the server on write;
 * the empty paragraphs the editor leaves at the end of the text are removed.
 */
const asHtml = (text: string): string =>
  /<[a-z][\s\S]*>/i.test(text)
    ? text.replace(/(?:<p>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>\s*)+$/i, "")
    : text
        .split(/\n{2,}/)
        .map((block) => block.trim())
        .filter(Boolean)
        .map((block) => `<p>${escape(block).replace(/\n/g, "<br>")}</p>`)
        .join("");

/** An empty editor renders "<p></p>": that is not a message. */
const isEmpty = (html: string): boolean =>
  !/<img\b/i.test(html) &&
  html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim() === "";

interface SupportMessagesProps {
  messages: SupportMessage[];
  /** The address of the request's sender: its messages are the received ones. */
  senderEmail: string;
  /** Without it — without the right to edit the request —, nothing can be deleted. */
  onDelete?: (id: number | string) => Promise<void>;
}

/** A reply's footer: sent, simulated, or refused — and who was in copy. */
function SendFooter({
  status,
  a,
  cc = "",
  bcc = "",
}: {
  status: Exclude<SupportMailStatus, "">;
  a: string;
  cc?: string;
  bcc?: string;
}) {
  const { icon: Icon, color, text } = SENDING[status];
  const copies = [cc && `Cc : ${cc}`, bcc && `Cci : ${bcc}`]
    .filter(Boolean)
    .join(" · ");
  return (
    <Group
      gap={6}
      px="md"
      py={6}
      justify="flex-end"
      style={{ borderTop: "1px dotted var(--mantine-color-default-border)" }}
    >
      <Icon
        size={14}
        color={
          color === "dimmed"
            ? "var(--mantine-color-dimmed)"
            : `var(--mantine-color-${color}-6)`
        }
      />
      <Text size="xs" c={color}>
        {text(a)}
        {copies && (
          <Text span size="xs" c="dimmed">
            {" "}
            · {copies}
          </Text>
        )}
      </Text>
    </Group>
  );
}

/**
 * The message thread. It does not scroll itself: the panel that
 * contains it does, and the last message is brought into view.
 */
export default function SupportMessages({
  messages,
  senderEmail,
  onDelete,
}: SupportMessagesProps) {
  const [toDelete, setToDelete] = useState<SupportMessage | null>(null);
  const end = useRef<HTMLDivElement | null>(null);

  // The last message in view, as in a mail client: on opening and on
  // each added message. Only the thread's frame scrolls — "scrollIntoView"
  // would also scroll the drawer down, which must open at the top of the ticket.
  // The frame is the first parent that clips overflow, "hidden"
  // included: just mounted, Mantine's (ScrollArea) is one as long as its
  // bar is not ready. Looking only for "auto" or "scroll" skipped it and
  // scrolled the whole drawer down.
  useEffect(() => {
    let frame = end.current?.parentElement ?? null;
    while (frame) {
      if (getComputedStyle(frame).overflowY !== "visible") break;
      frame = frame.parentElement;
    }
    if (frame) frame.scrollTop = frame.scrollHeight;
  }, [messages.length]);

  /**
   * Received: written by the sender, whether or not they have an account. A message sent
   * — or that was meant to be sent — by e-mail is always a team reply,
   * even when its author is also the request's sender.
   */
  const received = (m: SupportMessage): boolean =>
    !m.mail_status &&
    Boolean(
      m.author &&
      (m.author.id === 0 ||
        (senderEmail &&
          m.author.email.toLowerCase() === senderEmail.toLowerCase())),
    );

  // A single block: in the drawer's stack, the end marker and the deletion
  // modal would each take their gap under the last message.
  return (
    <div>
      <Stack gap={MESSAGES_GAP}>
        {messages.map((m) => {
          if (m.system && !m.author) {
            return (
              <Text key={m.id} size="xs" c="dimmed" ta="center">
                {m.text} · {formatDate(m.created_at)}
              </Text>
            );
          }
          // The thread's opening, signed Milo: a fact, with its logo.
          if (m.system && m.author?.id === MILO_ACTOR_ID) {
            return (
              <Group key={m.id} gap={6} justify="center" wrap="nowrap">
                <PersonAvatar person={m.author} size={18} />
                <Text size="xs" c="dimmed">
                  {m.text} — {m.author.name}
                </Text>
              </Group>
            );
          }
          // An application word signed by an account — "Fusionnée dans…",
          // "Fermée le…" — remains a fact, not a message.
          if (m.system && !received(m)) {
            return (
              <Text key={m.id} size="xs" c="dimmed" ta="center">
                {m.text} — {m.author?.name}
              </Text>
            );
          }

          const left = received(m);
          // A default reply, sent automatically: signed Milo, it is
          // distinguished from those the team writes.
          const automatic = !left && m.author?.id === MILO_ACTOR_ID;
        // The address and date: faded on the message's background, in softened
        // white on a reply's green.
        const secondary = left ? "dimmed" : "inherit";
        const opacity = left ? undefined : 0.85;
          return (
            <Paper
              key={m.id}
              w={MESSAGE_WIDTH}
              ml={left ? 0 : "auto"}
              bg={MESSAGE_BACKGROUND}
              style={{
                borderRadius: "var(--mantine-radius-md)",
                overflow: "hidden",
              }}
            >
              {/* An e-mail's header: who, their address, when. */}
              <Group
                justify="space-between"
                wrap="nowrap"
                px="md"
                py={8}
                // A team reply: the header in the send button's green,
                // its text in white. An automatic reply: in blue.
                style={
                  left
                    ? { borderBottom: "1px solid var(--mantine-color-default-border)" }
                    : {
                        backgroundColor: automatic
                          ? "var(--mantine-color-blue-filled)"
                          : "var(--mantine-color-teal-filled)",
                        color: "white",
                      }
                }
              >
                <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
                  {left && m.author ? (
                    <SenderAvatar person={m.author} size={26} />
                  ) : (
                    <PersonAvatar person={m.author} size={26} />
                  )}
                  <div style={{ minWidth: 0 }}>
                    <Text size="sm" fw={600} c="inherit" truncate>
                      {m.author?.name ?? "—"}
                    </Text>
                    {m.author?.email && (
                      <Text size="xs" c={secondary} opacity={opacity} truncate>
                        {m.author.email}
                      </Text>
                    )}
                  </div>
                </Group>
                <Group gap={4} wrap="nowrap" style={{ flexShrink: 0 }}>
                  <Text size="xs" c={secondary} opacity={opacity}>
                    {formatDate(m.created_at)}
                    {m.updated_at !== m.created_at ? " (modifié)" : ""}
                  </Text>
                  {/* An application word is not deleted, nor is a reply:
                    it may already have reached the sender. */}
                  {!m.system && left && onDelete && (
                    <ActionIcon
                      variant="subtle"
                      color={RED}
                      size="sm"
                      onClick={() => setToDelete(m)}
                      aria-label="Supprimer le message"
                    >
                      <IconTrash size={14} />
                    </ActionIcon>
                  )}
                </Group>
              </Group>
              {/* A received e-mail as it was written, in its frame; a
                Milo message with the editor's typography. */}
              {m.format === "email" ? (
                <div style={{ padding: MARGIN_MESSAGE }}>
                  <EmailFrame html={m.text} />
                </div>
              ) : (
                <Typography
                  p={MARGIN_MESSAGE}
                  style={{ fontSize: "var(--mantine-font-size-sm)" }}
                >
                  <div
                    className={classes.body}
                    dangerouslySetInnerHTML={{ __html: asHtml(m.text) }}
                  />
                </Typography>
              )}
              {m.attachments && m.attachments.length > 0 && (
                <Attachments attachments={m.attachments} />
              )}
              {/* Only a failure is flagged: a sent reply goes without saying, and
                a simulation only concerns debugging. */}
              {m.mail_status === "failed" && (
                <SendFooter
                  status={m.mail_status}
                  a={m.mail_to ?? ""}
                  cc={m.mail_cc ?? ""}
                  bcc={m.mail_bcc ?? ""}
                />
              )}
            </Paper>
          );
        })}
      </Stack>

      {/* Outside the stack: its gap would add under the last message. */}
      <div ref={end} />

      <DeleteConfirmModal
        opened={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={() => {
          const m = toDelete;
          setToDelete(null);
          if (m) void onDelete?.(m.id);
        }}
        title="Supprimer le message"
        message="Voulez-vous vraiment supprimer ce message ? Cette action est irréversible."
      />
    </div>
  );
}

/** What the send button does to the request, once the reply has been sent. */
export interface ReplySending {
  status: SupportStatus;
  cc: string[];
  bcc: string[];
  /** The attachments, to upload before sending the reply. */
  files: File[];
}

/**
 * The ceiling on attachments for a reply sent by e-mail: the server's
 * (lib/ticket-files.ts), which Graph imposes.
 */
const SEND_SIZE_MAX = 3 * 1024 * 1024;

/** The three ways to send, the first being the default. */
const SENDINGS: { status: SupportStatus; label: string }[] = [
  { status: "pending", label: "Envoyer et définir en attente" },
  { status: "resolved", label: "Envoyer et définir comme résolu" },
  { status: "closed", label: "Envoyer et définir comme fermé" },
];

/**
 * The reply: the editor and its button, placed under the messages panel.
 * The editor is cleared once the message is sent; if it is refused, the text
 * stays, so that it is not lost.
 *
 * The button sends and sets the request to "En attente"; its arrow offers to
 * mark it resolved or closed instead. "CC" and "CCI", in the
 * toolbar, each open their address row — only when the reply
 * goes by e-mail.
 */
export function SupportReply({
  template = "",
  onSend,
  byEmail = false,
  withFiles = false,
  blockedReason,
}: {
  /**
   * What the editor carries by default — the default contents from Settings:
   * set when empty, and again once the reply has been sent.
   */
  template?: string;
  onSend: (html: string, sending: ReplySending) => Promise<void>;
  /** True when the reply goes by e-mail: copying then makes sense. */
  byEmail?: boolean;
  /** True when the reply can carry attachments: the request exists. */
  withFiles?: boolean;
  /** When sending is not yet possible: the reason, as a tooltip. */
  blockedReason?: string;
}) {
  const editor = useRichEditor({ placeholder: "Écrire une réponse…" });
  const [sending, setSending] = useState(false);
  const [cc, setCc] = useState<string[] | null>(null);
  const [bcc, setBcc] = useState<string[] | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const filePicker = useRef<HTMLInputElement | null>(null);
  // What the editor received from the template, as the editor renders it.
  const appliedTemplate = useRef("");

  /** Sets the template, cursor at the start: you write before the signature. */
  const applyTemplate = useCallback(() => {
    if (!editor) return;
    editor.chain().setContent(template).setTextSelection(1).run();
    appliedTemplate.current = editor.getHTML();
  }, [editor, template]);

  // A template that changes — the thread advances, another request opens —
  // replaces the old one as long as it has not been touched; never written text.
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (isEmpty(current) || current === appliedTemplate.current) applyTemplate();
  }, [editor, applyTemplate]);

  const total = files.reduce((sum, f) => sum + f.size, 0);
  const tooHeavy = byEmail && total > SEND_SIZE_MAX;

  const send = async (status: SupportStatus) => {
    if (!editor || tooHeavy || blockedReason) return;
    const html = editor.getHTML();
    if (isEmpty(html)) return;
    setSending(true);
    try {
      await onSend(html, {
        status,
        cc: cc ?? [],
        bcc: bcc ?? [],
        files: files,
      });
      applyTemplate();
      setCc(null);
      setBcc(null);
      setFiles([]);
    } catch {
      // The drawer has already said what went wrong: the text stays in place.
    } finally {
      setSending(false);
    }
  };

  /** Opens the row, or closes it — its addresses with it. */
  const toggle = (
    row: string[] | null,
    insertRow: (v: string[] | null) => void,
  ) => insertRow(row === null ? [] : null);

  // The button sends "en attente"; its arrow offers the other two outcomes.
  // Full width, the button stretches and takes the editor's bottom corners.
  // Dark gray, a notch lighter in the dark theme to stand out from the
  // field; hover darkens by the same amount.
  const corner = "calc(var(--mantine-radius-default) - 1px)";
  const gray = {
    "--button-bg": "light-dark(var(--mantine-color-dark-6), var(--mantine-color-dark-4))",
    "--button-hover": "light-dark(var(--mantine-color-dark-7), var(--mantine-color-dark-5))",
    "--ai-bg": "light-dark(var(--mantine-color-dark-6), var(--mantine-color-dark-4))",
    "--ai-hover": "light-dark(var(--mantine-color-dark-7), var(--mantine-color-dark-5))",
  } as CSSProperties;
  const buttons = (
    <Group gap={1} wrap="nowrap" style={{ flex: 1 }}>
      <Button
        color="dark"
        variant="filled"
        size="compact-sm"
        h={36}
        leftSection={<IconSend2 size={16} />}
        onClick={() => void send("pending")}
        loading={sending}
        disabled={Boolean(blockedReason)}
        title={blockedReason ?? SENDINGS[0]!.label}
        style={{
          ...gray,
          flex: 1,
          borderRadius: `0 0 0 ${corner}`,
        }}
      >
        Envoyer
      </Button>
      <Menu position="top-end" withinPortal shadow="md">
        <Menu.Target>
          <ActionIcon
            color="dark"
            variant="filled"
            size={36}
            disabled={sending || Boolean(blockedReason)}
            aria-label="Autres façons d'envoyer"
            style={{
              ...gray,
              borderRadius: `0 0 ${corner} 0`,
            }}
          >
            <IconChevronDown size={14} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          {SENDINGS.map(({ status, label }) => (
            <Menu.Item key={status} onClick={() => void send(status)}>
              {label}
            </Menu.Item>
          ))}
        </Menu.Dropdown>
      </Menu>
    </Group>
  );

  return (
    <RichTextField
      editor={editor}
      // A reply is written at greater length than a comment: fifteen lines
      // before scrolling.
      maxLines={15}
      toolbarControls={
        (byEmail || withFiles) && (
          <>
            {withFiles && (
              <RichTextEditor.Control
                onClick={() => filePicker.current?.click()}
                aria-label="Joindre des fichiers"
              >
                <IconPaperclip size={16} />
              </RichTextEditor.Control>
            )}
            {byEmail && (
              <>
                <RichTextEditor.Control
                  onClick={() => toggle(cc, setCc)}
                  active={cc !== null}
                  aria-label="Copie"
                  px={6}
                  w="auto"
                >
                  <Text size="xs" fw={600} c="inherit">
                    CC
                  </Text>
                </RichTextEditor.Control>
                <RichTextEditor.Control
                  onClick={() => toggle(bcc, setBcc)}
                  active={bcc !== null}
                  aria-label="Copie cachée"
                  px={6}
                  w="auto"
                >
                  <Text size="xs" fw={600} c="inherit">
                    CCI
                  </Text>
                </RichTextEditor.Control>
              </>
            )}
            {/* The selector itself, hidden: the paperclip opens it. Several
                files at once, added to those already chosen. */}
            <input
              ref={filePicker}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                const selected = [...(e.currentTarget.files ?? [])];
                setFiles((already) => [...already, ...selected]);
                e.currentTarget.value = "";
              }}
            />
          </>
        )
      }
      // The chosen attachments, as in the messages, under the text;
      // each is removed with a cross as long as the reply has not been sent.
      contentEnd={
        files.length > 0 && (
          <>
            <FileList
              px={10}
              rows={files.map((f, rank) => ({
                key: `${rank}-${f.name}`,
                name: f.name,
                size: f.size,
                onRemove: () =>
                  setFiles((already) => already.filter((_, i) => i !== rank)),
              }))}
            />
            {tooHeavy && (
              <Text size="xs" c="red" px={12} pb={6}>
                Les pièces jointes d'une réponse par e-mail ne dépassent pas 3
                Mo au total.
              </Text>
            )}
          </>
        )
      }
      topSection={
        byEmail &&
        (cc !== null || bcc !== null) && (
          <>
            {cc !== null && (
              <RecipientsInput label="CC" value={cc} onChange={setCc} />
            )}
            {bcc !== null && (
              <RecipientsInput label="CCI" value={bcc} onChange={setBcc} />
            )}
          </>
        )
      }
      // Under the editor, full width, flush against the borders.
      bottomBar={buttons}
    />
  );
}
