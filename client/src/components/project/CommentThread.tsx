import { ActionIcon, Collapse, Group, Menu, Paper, Stack, Text, Textarea } from "@mantine/core";
import {
  IconChevronLeft,
  IconChevronRight,
  IconMessage,
  IconPencil,
  IconSend,
  IconTrash,
} from "@tabler/icons-react";
import dayjs from "dayjs";
import { Fragment, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { GREEN, RED } from "../../themes/colors";
import { PersonAvatar } from "../ui/ActorAvatars";
import DeleteConfirmModal from "../ui/DeleteConfirmModal";
import EmptyPanel from "../ui/EmptyPanel";
import PointMenu, { menuPosition } from "../ui/PointMenu";
import type { PointMenuPosition } from "../ui/PointMenu";
import { MILO_ACTOR_ID } from "@milo/shared";
import type { Actor, SqliteBool } from "@milo/shared";

/**
 * A comment as the thread displays it. The server's two threads — projects
 * and cards — fit into it, as do the drafts of a project not yet
 * created, whose identifier is not yet a row number.
 */
export interface ThreadItem {
  id: number | string;
  text: string;
  /** Words the application writes itself: neither edited nor deleted. */
  system?: SqliteBool;
  created_at: string;
  updated_at: string;
  author: Actor | null;
}

const formatTimestamp = (value: string): string => dayjs(value).format("DD/MM/YYYY HH:mm");

// Dotted rule between the comment's header — author and date —
// and its text.
const HEADER_LINE = "1px dotted var(--mantine-color-default-border)";

// Text inset within its bubble. The field that replaces it when typing takes the
// same: the text does not move a pixel when switching from one to the other.
const COMMENT_PADDING = 30;

// A Milo entry: the header, a line of space, then a bullet per field. The
// text keeps its "A → B" arrow — the server uses it to group
// edits — but it is displayed as a chevron.
const ARROW = " → ";

function systemText(text: string): ReactNode {
  const [header = "", ...rows] = text.split("\n");
  const row = (l: string) =>
    l.split(ARROW).map((chunk, i) => (
      <Fragment key={i}>
        {i > 0 && (
          <IconChevronRight
            size={14}
            style={{ verticalAlign: "-2px", margin: "0 4px" }}
            aria-label="devient"
          />
        )}
        {chunk}
      </Fragment>
    ));
  return (
    <>
      {header}
      {rows.length > 0 && <div style={{ height: "0.75em" }} />}
      {rows.map((l, i) => (
        <div key={i}>{row(l)}</div>
      ))}
    </>
  );
}

interface CommentBubbleProps {
  comment: ThreadItem;
  onUpdate: (id: number | string, text: string) => void;
  onDelete: (id: number | string) => void;
  /** The thread is read-only: the bubble can be neither edited nor deleted. */
  readOnly?: boolean;
}

function CommentBubble({ comment, onUpdate, onDelete, readOnly = false }: CommentBubbleProps) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(comment.text);
  const [confirmDeleteOpened, setConfirmDeleteOpened] = useState(false);
  const [menu, setMenu] = useState<PointMenuPosition | null>(null);

  const startEdit = () => {
    setText(comment.text);
    setEditing(true);
  };

  const save = () => {
    if (!text.trim()) return;
    onUpdate(comment.id, text.trim());
    setEditing(false);
  };

  // A word written by the application — the creation of the card or project,
  // signed Milo — records a fact: it is neither edited nor deleted.
  const frozen = readOnly || Boolean(comment.system) || comment.author?.id === MILO_ACTOR_ID;

  // A Milo entry — the creation, the edits — shows collapsed: the
  // bubble shrinks to its banner, Milo and the date, on a blue background. The button
  // to the right of the bubble expands it, with an accordion animation.
  const isSystemDisk = Boolean(comment.system) || comment.author?.id === MILO_ACTOR_ID;
  const [expanded, setExpanded] = useState(false);
  const folded = isSystemDisk && !expanded;

  const remove = () => {
    setConfirmDeleteOpened(false);
    onDelete(comment.id);
  };

  return (
    <>
      <Paper
        // Collapsed, the bubble is a solid blue banner, with no border.
        withBorder={!folded}
        bg={
          folded
            ? "var(--mantine-color-blue-filled)"
            : "var(--mantine-color-default)"
        }
        style={{
          borderRadius: "var(--mantine-radius-default)",
          transition: "background-color 200ms ease",
        }}
        // Actions go through right-click, and double-click edits —
        // whoever the author. A frozen entry has neither menu nor double-click.
        onContextMenu={frozen || editing ? undefined : (e) => setMenu(menuPosition(e))}
        onDoubleClick={frozen || editing ? undefined : startEdit}
      >
        {/* Editing a comment does not take it out of its bubble: the header stays
            in place, only the text turns into an input. Enter submits, Shift+Enter
            inserts a line break, Escape cancels. */}
        <Stack gap={0}>
          <Group
            justify="space-between"
            align="center"
            wrap="nowrap"
            px="sm"
            // As much space above as below: otherwise the author
            // and the date sit too high in their banner.
            py={8}
            // Collapsed, the banner is the whole bubble: it has nothing to separate.
            style={folded ? undefined : { borderBottom: HEADER_LINE }}
          >
            {/* The author on the left, the date on the right. A comment written before
                the author was recorded, or whose account was deleted, has
                none: its badge stays, without a name. */}
            <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
              <PersonAvatar person={comment.author} size={22} />
              {comment.author && (
                <Text size="xs" fw={600} c={folded ? "white" : undefined} truncate>
                  {comment.author.name}
                </Text>
              )}
            </Group>

            <Group gap={4} wrap="nowrap" style={{ flexShrink: 0 }}>
              {/* A Milo entry completed by a neighboring edit is not
                  "modified": it tells what followed. */}
              <Text size="xs" c={folded ? "white" : "dimmed"}>
                {formatTimestamp(comment.updated_at)}
                {!isSystemDisk && comment.updated_at !== comment.created_at ? " (modifié)" : ""}
              </Text>

              {isSystemDisk && (
                <ActionIcon
                  variant="subtle"
                  color={folded ? "white" : "gray"}
                  size="sm"
                  onClick={() => setExpanded((d) => !d)}
                  aria-label={expanded ? "Replier le commentaire" : "Déplier le commentaire"}
                  aria-expanded={expanded}
                  // Expanded, hover is a neutral gray: Mantine's
                  // leans blue. In dark mode, dark-4 rather than
                  // NEUTRAL_HOVER, which blends in with the bubble's background.
                  style={
                    folded
                      ? undefined
                      : ({
                          "--ai-hover": "var(--milo-menu-hover)",
                        } as CSSProperties)
                  }
                >
                  {/* Left when collapsed, down when expanded: the chevron
                      turns like an accordion's. */}
                  <IconChevronLeft
                    size={16}
                    style={{
                      transform: expanded ? "rotate(-90deg)" : "none",
                      transition: "transform 200ms ease",
                    }}
                  />
                </ActionIcon>
              )}
            </Group>
          </Group>

          {/* The comment is plain text: its line breaks
              count, and nothing else gets formatted. When typing, the field
              takes exactly the text's place — same inset, same size,
              no frame or background: you write where you were reading. */}
          <Collapse expanded={!folded}>
            {editing ? (
              <Textarea
                value={text}
                onChange={(e) => setText(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setEditing(false);
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    save();
                  }
                }}
                autosize
                minRows={1}
                autoFocus
                variant="unstyled"
                size="sm"
                p={COMMENT_PADDING}
                styles={{ input: { padding: 0, minHeight: 0 } }}
                aria-label="Modifier le commentaire"
                // Escape cancels the edit alone: the drawer stays open (Mantine
                // closes it from a window listener this attribute holds back).
                data-mantine-stop-propagation
              />
            ) : (
              <Text
                component={isSystemDisk ? "div" : "p"}
                size="sm"
                p={COMMENT_PADDING}
                style={{ whiteSpace: "pre-wrap" }}
              >
                {isSystemDisk ? systemText(comment.text) : comment.text}
              </Text>
            )}
          </Collapse>
        </Stack>
      </Paper>

      {menu && !frozen && (
        <PointMenu position={menu} onClose={() => setMenu(null)}>
          <Menu.Item leftSection={<IconPencil size={16} />} onClick={startEdit}>
            Modifier
          </Menu.Item>
          <Menu.Divider />
          <Menu.Item
            color={RED}
            leftSection={<IconTrash size={16} />}
            onClick={() => setConfirmDeleteOpened(true)}
          >
            Supprimer
          </Menu.Item>
        </PointMenu>
      )}

      <DeleteConfirmModal
        opened={confirmDeleteOpened && !frozen}
        onClose={() => setConfirmDeleteOpened(false)}
        onConfirm={remove}
        title="Supprimer le commentaire"
        message={
          <>Voulez-vous vraiment supprimer ce commentaire ? Cette action est irréversible.</>
        }
      />
    </>
  );
}

/**
 * The send button, as the test button of the sending address in Settings /
 * Entra (SenderField): 26 px in a 36 px high field, 5 px from its edges, and
 * 5 px more between the text and the button.
 */
const FIELD_HEIGHT = 36;
const SEND_SIZE = 26;
const SEND_INSET = (FIELD_HEIGHT - SEND_SIZE) / 2;
const SEND_SECTION = SEND_SIZE + 2 * SEND_INSET + 5;
// Mantine sets the right section 1 px inside the field, off its border: the
// button's insets are counted from the border's outer edge.
const SECTION_OFFSET = 1;

interface CommentThreadProps {
  comments: ThreadItem[];
  onAdd: (text: string) => void;
  onUpdate: (id: number | string, text: string) => void;
  onDelete: (id: number | string) => void;
  /**
   * Without the right to edit the item, its thread is read-only: no typing,
   * no editing, no deletion.
   */
  readOnly?: boolean;
}

export default function CommentThread({
  comments,
  onAdd,
  onUpdate,
  onDelete,
  readOnly = false,
}: CommentThreadProps) {
  const [draft, setDraft] = useState("");

  const submit = () => {
    if (!draft.trim()) return;
    onAdd(draft.trim());
    setDraft("");
  };

  return (
    <Stack gap={0} style={{ flex: 1, minHeight: 0 }}>
      {/* The input keeps its 30 px below it; the stack's gap is zero,
          otherwise it would add to that inset. */}
      {!readOnly && (
        <Textarea
          pb={30}
          placeholder="Ajouter un commentaire…"
          value={draft}
          onChange={(e) => setDraft(e.currentTarget.value)}
          autosize
          minRows={1}
          maxRows={4}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          // The send button inside the field, at its right: on its last
          // line as it grows.
          rightSectionWidth={SEND_SECTION}
          rightSectionProps={{
            style: {
              alignItems: "flex-end",
              justifyContent: "flex-end",
              paddingBottom: SEND_INSET - SECTION_OFFSET,
              paddingRight: SEND_INSET - SECTION_OFFSET,
            },
          }}
          // On a single line, a multiline field is a little lower than a
          // TextInput (about 35 px): brought back to its 36 px, the button sits
          // centered in it, as in Entra.
          styles={{ input: { minHeight: FIELD_HEIGHT } }}
          rightSection={
            <ActionIcon
              variant="filled"
              radius={3}
              size={SEND_SIZE}
              onClick={submit}
              aria-label="Envoyer le commentaire"
              style={{ backgroundColor: GREEN, color: "#ffffff" }}
            >
              <IconSend size={16} />
            </ActionIcon>
          }
        />
      )}

      {comments.length === 0 ? (
        // The empty thread takes all the remaining height; the input above
        // already serves as the action, so the prompt has no button.
        <EmptyPanel icon={IconMessage} message="Aucun commentaire pour le moment." />
      ) : (
        <Stack gap="xs">
          {comments.map((comment) => (
            <CommentBubble
              key={comment.id}
              comment={comment}
              onUpdate={onUpdate}
              onDelete={onDelete}
              readOnly={readOnly}
            />
          ))}
        </Stack>
      )}
    </Stack>
  );
}
