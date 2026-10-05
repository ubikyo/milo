import {
  ActionIcon,
  alpha,
  Anchor,
  Button,
  Checkbox,
  ColorSwatch,
  darken,
  getContrastColor,
  getPrimaryShade,
  Group,
  lighten,
  Menu,
  Paper,
  ScrollArea,
  Stack,
  Text,
  Textarea,
  TextInput,
  UnstyledButton,
  useComputedColorScheme,
  useMantineTheme,
} from "@mantine/core";
import {
  IconCheck,
  IconCheckbox,
  IconClock,
  IconCircleOff,
  IconColumns,
  IconCopy,
  IconCopyPlus,
  IconEye,
  IconFolderSymlink,
  IconLink,
  IconPaperclip,
  IconMessage,
  IconPencil,
  IconAlignLeft,
  IconPlus,
  IconSeparatorHorizontal,
  IconTrash,
  IconTrashX,
  IconX,
} from "@tabler/icons-react";
import {
  createContext,
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { api } from "../../api";
import { INSERT_LINE, RED } from "../../themes/colors";
import { PLUS_GAP, PLUS_SIZE } from "../../themes/plus";
import ActorAvatars from "../ui/ActorAvatars";
import PointMenu, { menuPosition, type PointMenuPosition } from "../ui/PointMenu";
import ColumnInsert, { COLUMN_INSERT_ZONE } from "../ui/ColumnInsert";
import AddButton from "../ui/AddButton";
import { useRights } from "../../lib/rights";
import { CardLabel } from "../ui/LabelChip";
import CelebrationEffect, { toggleMark, titleEffects, MARKS } from "../ui/CelebrationEffect";
import type { Effect, Zone } from "../ui/CelebrationEffect";
import CardDrawer from "./CardDrawer";
import MoveOrCopyListModal, { type ListAction } from "./MoveOrCopyListModal";
import DeleteConfirmModal from "../ui/DeleteConfirmModal";
import EmptyPanel from "../ui/EmptyPanel";
import swatches from "../../assets/styles/ListColors.module.css";
import classes from "../../assets/styles/TaskBoard.module.css";
import { errorMessage, notifyError } from "../../lib/errors";
import { DUE_WORD, shortDate, dueState } from "../../lib/due";
import { SelectionBorder } from "../ui/LabelColorPicker";
import type { DueState } from "../../lib/due";
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from "react";
import { listKey, isListColor, taskReference } from "@milo/shared";
import { inList } from "../../lib/lists";
import type {
  Board,
  FollowKind,
  Follows,
  Id,
  Label,
  ListColor,
  PublicUser,
  TaskCard,
  TaskList,
} from "@milo/shared";

/** A list's colors, resolved for the current theme. */
interface Palette {
  background: string;
  text: string;
  hover: string;
  hoverText: string;
  cardBorder: string;
  separatorBackground: string;
  separatorText: string;
  insertionLine: string;
}

/** A list drag, as the render sees it. */
interface ListDrag {
  id: Id;
  /** Its starting rank. */
  from: number;
  /** The rank where it will land. */
  target: number;
  /** Position of the clone that follows the pointer. */
  x: number;
  y: number;
}

/**
 * The same gesture, tracked outside rendering by a ref: it changes on every
 * pointer movement, and must not trigger a render until the activation
 * threshold is crossed.
 */
interface ListDragInProgress {
  id: Id;
  index: number;
  startX: number;
  startY: number;
  /** Pointer offset within the card, so the clone follows without jumping. */
  offsetX: number;
  offsetY: number;
  /** False until the pointer has crossed the activation threshold. */
  started: boolean;
}

/** A card's host list and the rank it will take there. */
interface CardTarget {
  listId: Id;
  index: number;
}

/** A card drag, as the render sees it. */
interface CardDrag {
  id: Id;
  /** The clone and the drop placeholder take the card's size. */
  width: number;
  height: number;
  target: CardTarget | null;
  x: number;
  y: number;
}

interface CardDragInProgress {
  id: Id;
  listId: Id;
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  started: boolean;
  /** Without the right to edit, a press stays a click: the card does not drag. */
  frozen: boolean;
}

/** A card just typed in, placed before the server responds. */
interface ProvisionalCard {
  id: string;
  list_id: Id;
  text: string;
  number: number;
  kind: "card" | "separator";
}

/** A celebration in progress, played on a list and the card that just arrived in it. */
interface Celebration {
  key: string;
  effect: Effect;
  column: Zone;
  card: Zone | null;
}

/** Typing a new card: where it will land, and of what kind. */
interface Composition {
  listId: Id;
  index: number;
  kind: "card" | "separator";
}

// Width of a list and gap between two lists.
const LIST_WIDTH = 270;
const LIST_GAP = 15;
// Inner padding of a list: half of Mantine's "md" (16px).
const LIST_PADDING = 8;
// Gap between two cards of the same list.
const CARD_GAP = 8;
// Pointer movement beyond which it is considered a drag
// and not a click (which opens renaming).
const DRAG_THRESHOLD = 5;

// Delay given to a second click before the first opens the card details: it
// is what makes double-click possible on a card. Short enough that
// opening does not drag, long enough for an ordinary double-click.
const DOUBLE_CLICK_DELAY = 250;

// Neutral board background: the list stands out from the page background, the card stays
// dark to stand out from the list that carries it.
const LIST_BG = "var(--milo-board-list-bg)";

// Colors offered in a list's menu: the projects' red, orange, green
// and blue, yellow and violet (shade 8), then two lighter
// shades of each (6 and 4, lightened in useListColors), in
// three rows of six. "Aucune", set apart, gives the list back the
// board's neutral background. The label is not displayed, it names the swatch.
const HUES = [
  { name: "red", label: "Rouge" },
  { name: "orange", label: "Orange" },
  { name: "yellow", label: "Jaune" },
  { name: "green", label: "Vert" },
  { name: "blue", label: "Bleu" },
  { name: "violet", label: "Violet" },
];
const SHADES = [
  { shade: 8, label: "" },
  { shade: 6, label: " moyen" },
  { shade: 4, label: " clair" },
];
const LIST_COLORS = SHADES.flatMap(({ shade, label }) =>
  HUES.map((t) => ({ value: `${t.name}.${shade}`, label: `${t.label}${label}` })),
);

// A list's colors, resolved for the current theme. Everything starts from its
// background: a card's border lightens it on hover, the "…" darkens it. The
// text is never picked by hand: Mantine's "getContrastColor"
// chooses between black and white from the luminosity of the background
// beneath it, as "autoContrast" does for its own components.
export function useListColors() {
  const theme = useMantineTheme();
  const colorScheme = useComputedColorScheme("light");

  return useCallback(
    (color: string | null | undefined): Palette => {
      const dark = colorScheme === "dark";
      // White is not a palette shade: it inverts from one theme
      // to the other, white on dark and black on light.
      let background: string;
      let neutral = false;
      // "red.8": the projects' color, lightened by a quarter per step
      // below 8 — the theme only has one shade of it (main.tsx). "red" — an
      // older color — takes the theme's main shade.
      const [name, shade] = (color ?? "").split(".");
      const palette = name ? theme.colors[name] : undefined;
      if (color === "white") background = dark ? theme.white : theme.black;
      else if (palette && isListColor(color)) {
        const base = palette[getPrimaryShade(theme, colorScheme)] ?? palette[6]!;
        background = shade ? lighten(base, (8 - Number(shade)) * 0.125) : base;
      }
      else {
        neutral = true;
        background = (dark ? theme.colors["dark"]?.[5] : theme.colors["gray"]?.[2]) ?? theme.white;
      }

      const readable = (below: string): string =>
        getContrastColor({
          color: below,
          theme,
          autoContrast: true,
          colorScheme,
        });

      const darkened = darken(background, 0.18);
      // A separator sits on its list's background, darkened more firmly
      // than on hover: it must read as a heading, not as a
      // hovered item. Except on the dark theme's neutral list: cards there
      // are already darker than the list, and a darkened separator would
      // blend in with them — so it lightens instead.
      const darkenedSeparator = neutral && dark ? lighten(background, 0.15) : darken(background, 0.35);
      return {
        background,
        text: readable(background),
        // What is hovered on the list darkens, what sits on it
        // lightens: the "…" and the rename field on one side, the
        // card border on the other.
        hover: darkened,
        hoverText: readable(darkened),
        // A card's border on hover: the list background, lightened.
        cardBorder: lighten(background, 0.45),
        separatorBackground: darkenedSeparator,
        separatorText: readable(darkenedSeparator),
        insertionLine: INSERT_LINE,
      };
    },
    [theme, colorScheme],
  );
}

// Background of a card's drop placeholder: recessed under the cards of its
// list. A list's own no longer needs one: it recalls itself there.
const CARD_PLACEHOLDER_BG = "var(--milo-drop-bg)";

// Card radius: the same for the card, its drop placeholder, the copy
// following the pointer and the input field that replaces it when editing.
const CARD_RADIUS = 8;
/** The height of the cover image at the top of a card. */
const COVER_HEIGHT = 120;

// Lists and cards have no border: the fields that edit them
// have none either, not even the blue Mantine adds on focus.
const INPUT_NO_BORDER = {
  input: { "--input-bd": "transparent", "--input-bd-focus": "transparent" },
};

// "Ajouter une carte" paints no background, not even on hover: it is the
// label that lightens by turning translucent. The "+" is aligned with the
// left edge of the list's content, with no inner margin.
interface AddCardButtonProps {
  label: string;
  onClick: () => void;
  color: string;
}

function AddCardButton({ label, onClick, color }: AddCardButtonProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <Button
      data-no-list-drag="true"
      variant="transparent"
      color={color}
      size="xs"
      justify="flex-start"
      fullWidth
      mt={5}
      pl={0}
      opacity={hovered ? 0.6 : 1}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      leftSection={<IconPlus size={PLUS_SIZE} />}
      onClick={onClick}
    >
      {label}
    </Button>
  );
}

// Card text is typed freely: line breaks count.
const CARD_TEXT: CSSProperties = { whiteSpace: "pre-wrap", wordBreak: "break-word" };

// Enter submits the card, Cmd (or Ctrl) + Enter inserts a line break. The browser
// inserts nothing by itself on this combination: we put the line
// break at the cursor position, which we restore right after.
const insertLineBreak = (
  element: HTMLTextAreaElement,
  setValue: (value: string) => void,
): void => {
  const { value } = element;
  const start = element.selectionStart ?? value.length;
  const end = element.selectionEnd ?? start;
  setValue(`${value.slice(0, start)}\n${value.slice(end)}`);
  requestAnimationFrame(() => {
    element.selectionStart = start + 1;
    element.selectionEnd = start + 1;
  });
};

// Keys shared by typing a card and editing it: Escape
// cancels, Enter submits, Cmd/Ctrl + Enter inserts a line break.
interface CardKeyDownOptions {
  setValue: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}

const cardKeyDown =
  ({ setValue, onCancel, onSubmit }: CardKeyDownOptions) =>
  (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
  if (event.key === "Escape") {
    onCancel();
    return;
  }
  if (event.key !== "Enter") return;
  event.preventDefault();
  if (event.metaKey || event.ctrlKey) insertLineBreak(event.currentTarget, setValue);
  else onSubmit();
  };

// The hover border is always there, transparent at rest: the card does not
// move when the pointer touches it.

// Diameter of the avatars placed on a card: larger than those on the projects
// board, where a tight row constrained them. Their overlap, however,
// stays that of the projects.
const CARD_AVATAR_SIZE = 25;
// The gap between a card's rows: labels, title, icons.
const CARD_CONTENT_GAP = 4;
// The space above each column of the last row, when they are
// stacked.
const CARD_STACKED_SPACE = 10;
// On the last row: the gap between an icon and its value, tight so
// they read together, and the one between two items, wider.
const ICON_VALUE_GAP = 2;
const CARD_ITEMS_GAP = 10;
// Between two tags (number, due date), the previous gap.
const TAGS_GAP = 6;

// The due date badge: a clock and the day, abbreviated. As soon as a card
// carries a date, it shows; its color is what alerts, or not. Red
// past the due day, orange within the three days before it, and otherwise a
// neutral background — the date is readable, but nothing is pressing. It precedes the
// checklists badge, as the due date precedes the title in the card details.
const DUE_BG: Record<DueState, string> = {
  late: "var(--mantine-color-red-filled)",
  soon: "var(--mantine-color-orange-filled)",
  // Still far off: the green of what is going well, like "À venir" in the card details.
  none: "var(--mantine-color-green-filled)",
};

// The three backgrounds are solid: the text on them is white.
const DUE_FG = "var(--mantine-color-white)";

// A card's number, as a green label: the same shape as the due date.
function CardNumberTag({ number }: { number: number }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "1px 6px",
        borderRadius: 6,
        backgroundColor: "var(--mantine-color-green-filled)",
        color: "var(--mantine-color-white)",
        flexShrink: 0,
      }}
    >
      <Text size="xs">{taskReference(number)}</Text>
    </span>
  );
}

interface CardDueBadgeProps {
  card: TaskCard;
}

function CardDueBadge({ card }: CardDueBadgeProps) {
  const text = shortDate(card.due_date);
  if (!text) return null;

  const state = dueState(card.due_date);
  const word = DUE_WORD[state];

  return (
    <span
      aria-label={word ? `Échéance : ${text} — ${word}` : `Échéance : ${text}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: ICON_VALUE_GAP,
        padding: "1px 6px",
        borderRadius: 6,
        backgroundColor: DUE_BG[state],
        color: DUE_FG,
        flexShrink: 0,
      }}
    >
      <IconClock size={14} />
      <Text size="xs">{text}</Text>
    </span>
  );
}

// The checklists badge: a checkbox symbol and the ratio of checked
// boxes to the total, summed over all the card's checklists. It
// can be clicked to expand, under the card, what is left to do. Once everything is
// checked, it gets a green frame: the card is done, and that must show without
// reading the count.
const CHECKLIST_DONE_BG = "var(--mantine-color-teal-filled)";

// What is left to check is set off from the card body by a rule and a
// bit of space: when expanded, you see at a glance where the card ends and its
// list begins. The same space separates the rows from each other: two
// stuck-together checkboxes read as a block, whereas they are checked one by one.
const CHECKLIST_PANEL_RULE = "1px solid var(--mantine-color-default-border)";
const CHECKLIST_PANEL_MARGIN = 10;
const CHECKLIST_PANEL_PAD = 16;
const CHECKLIST_PANEL_BOTTOM = 3;
const CHECKLIST_ITEM_GAP = 9;

interface CardChecklistBadgeProps {
  card: TaskCard;
  onToggle: () => void;
}

function CardChecklistBadge({ card, onToggle }: CardChecklistBadgeProps) {
  const total = card.checklist_total || 0;
  if (total === 0) return null;
  const done = card.checklist_done || 0;
  const complete = done === total;

  return (
    <UnstyledButton
      data-no-card-drag="true"
      onClick={onToggle}
      aria-label={`Checklists : ${done} sur ${total}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: ICON_VALUE_GAP,
        padding: "1px 0",
        borderRadius: 6,
        backgroundColor: complete ? CHECKLIST_DONE_BG : "transparent",
        color: complete ? "var(--mantine-color-white)" : "inherit",
      }}
    >
      <IconCheckbox size={14} />
      <Text size="xs">
        {done}/{total}
      </Text>
    </UnstyledButton>
  );
}

// What is left to do, expanded under the card: the unchecked items of
// all its checklists. Checking here removes the row and advances the
// badge, without opening the card details. Nothing left to check, no panel: the
// green badge already says so, a "Tout est coché" under the card would
// only lengthen it.
interface CardChecklistPanelProps {
  card: TaskCard;
  onCheck: (itemId: Id) => void;
}

function CardChecklistPanel({ card, onCheck }: CardChecklistPanelProps) {
  const remaining = card.checklist_open || [];
  if (remaining.length === 0) return null;

  return (
    <Stack
      gap={CHECKLIST_ITEM_GAP}
      data-no-card-drag="true"
      pt={CHECKLIST_PANEL_PAD}
      pb={CHECKLIST_PANEL_BOTTOM}
      mt={CHECKLIST_PANEL_MARGIN}
      px="xs"
      // The rule runs edge to edge, like the cover: it eats the card's inset
      // ("xs"), given back to the rows by the padding.
      style={{
        borderTop: CHECKLIST_PANEL_RULE,
        marginInline: "calc(-1 * var(--mantine-spacing-xs))",
      }}
    >
      {remaining.map((item) => (
        <Checkbox
          key={item.id}
          checked={false}
          onChange={() => onCheck(item.id)}
          size="xs"
          label={item.text || "Sans libellé"}
          styles={{
            body: { alignItems: "center" },
            labelWrapper: { minWidth: 0 },
            label: {
              cursor: "pointer",
              paddingLeft: 6,
              fontSize: "var(--mantine-font-size-xs)",
              wordBreak: "break-word",
            },
            input: { cursor: "pointer" },
          }}
        />
      ))}
    </Stack>
  );
}

// Bottom of the card: the description sign and the reference on the left, the
// members on the right. The reference ("TSK-12") is a discreet marker to
// designate it, given by the counter shared across modes; a board can hide it
// ("Numéros des cartes", in its drawer). The avatars
// overlap as in the projects board; with no members, the row shows
// none.
interface CardNumberProps {
  card: TaskCard;
  withNumber: boolean;
  onChecklistToggle: () => void;
}

function CardNumber({ card, withNumber, onChecklistToggle }: CardNumberProps) {
  const members = card.members || [];

  const attachments = card.attachment_count || 0;
  const comments = card.comment_count || 0;
  const links = card.link_count || 0;
  // A card still waiting for the server has no number.
  const showNumber = withNumber && card.number > 0;

  // The columns each wrapped onto their own row: CSS cannot say so,
  // so we read it from their position. Recomputed on every resize.
  const left = useRef<HTMLDivElement | null>(null);
  const rightHand = useRef<HTMLDivElement | null>(null);
  const [stacked, setStacked] = useState(false);
  useLayoutEffect(() => {
    const g = left.current;
    const d = rightHand.current;
    if (!g || !d) {
      setStacked(false);
      return undefined;
    }
    // Side by side, centered, their tops differ if their heights
    // differ: only actors entirely above the icons indicate
    // they are stacked.
    const measure = () =>
      setStacked(d.getBoundingClientRect().bottom <= g.getBoundingClientRect().top + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(g);
    observer.observe(d);
    return () => observer.disconnect();
  }, [members.length]);

  // Two columns: icons on the left, actors on the right. Each starts
  // from its content width on one row and never goes below
  // it ("fit-content"): as long as both fit together, they
  // stay side by side; otherwise, they each go on their own row, at
  // full width. "wrap-reverse"
  // then stacks the rows bottom to top: the actors, coming second,
  // rise above the icons.
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap-reverse",
        alignItems: "center",
      }}
    >
      {/* Stacked, each column takes 10px of space above it. The
          icons, at the bottom, take all of it; the actors, at the top, already have
          the gap that separates them from the title, which is subtracted. */}
      <Group
        ref={left}
        gap={CARD_ITEMS_GAP}
        align="center"
        wrap="wrap"
        c="dimmed"
        pt={stacked ? CARD_STACKED_SPACE : 0}
        style={{ flex: "1 1 auto", minWidth: "fit-content", maxWidth: "100%", rowGap: 4 }}
      >
        {/* The number opens the row. A card still waiting for the server
            has none. */}
        {/* Tags follow each other more closely than the other items. */}
        {(showNumber || shortDate(card.due_date)) && (
          <Group gap={TAGS_GAP} align="center" wrap="wrap" style={{ rowGap: 4 }}>
            {showNumber && <CardNumberTag number={card.number} />}
            {/* Then the due date: a late card must be seen before you
                read what it carries. */}
            <CardDueBadge card={card} />
          </Group>
        )}
        <CardChecklistBadge
          card={card}
          onToggle={onChecklistToggle}
        />
        {/* The icon says there is more to read in the card details. */}
        {card.has_description && (
          <IconAlignLeft size={14} aria-label="Cette carte a une description" />
        )}
        {comments > 0 && (
          <Group
            gap={ICON_VALUE_GAP}
            align="center"
            wrap="nowrap"
            aria-label={`Cette carte a ${comments} commentaire${comments > 1 ? "s" : ""}`}
          >
            <IconMessage size={14} />
            <Text size="xs">{comments}</Text>
          </Group>
        )}
        {links > 0 && (
          <Group
            gap={ICON_VALUE_GAP}
            align="center"
            wrap="nowrap"
            aria-label={`Cette carte a ${links} dépendance${links > 1 ? "s" : ""}`}
          >
            <IconLink size={14} />
            <Text size="xs">{links}</Text>
          </Group>
        )}
        {attachments > 0 && (
          <Group
            gap={ICON_VALUE_GAP}
            align="center"
            wrap="nowrap"
            aria-label={`Cette carte a ${attachments} pièce${attachments > 1 ? "s" : ""} jointe${attachments > 1 ? "s" : ""}`}
          >
            <IconPaperclip size={14} />
            <Text size="xs">{attachments}</Text>
          </Group>
        )}
      </Group>
      {/* On the right, the actors, tucked into the card's corner. Their inset
          stands in for the gap between columns: it only counts when they
          are side by side. */}
      {members.length > 0 && (
        <Group
          ref={rightHand}
          gap={6}
          justify="flex-end"
          align="center"
          wrap="wrap"
          pl={CARD_ITEMS_GAP}
          pt={stacked ? CARD_STACKED_SPACE - CARD_CONTENT_GAP : 0}
          style={{ flex: "1 1 auto", minWidth: "fit-content", maxWidth: "100%", rowGap: 4 }}
        >
          <ActorAvatars actors={members} size={CARD_AVATAR_SIZE} max={4} />
        </Group>
      )}
    </div>
  );
}

// A separator is not a card to follow: it titles what comes next.
// It is typed, edited and dragged like a card, but carries neither a
// number nor a card background.
const isSeparator = (card: TaskCard): boolean => card.kind === "separator";

// A separator's background: that of its list, darkened. An ordinary card
// keeps the background Mantine gives the Paper.
const separatorStyle = (card: TaskCard, palette: Palette): CSSProperties | null =>
  isSeparator(card)
    ? {
        backgroundColor: palette.separatorBackground,
        color: palette.separatorText,
      }
    : null;

// A card's cover, edge to edge: it eats the card's inset
// ("xs") and follows its rounding, border deducted. Several images take
// turns at the interval chosen in the card details; with no interval, the first
// stays.
function Cover({ urls, interval }: { urls: string[]; interval: number }) {
  const [rank, setRank] = useState(0);
  const [pause, setPaused] = useState(false);
  // The reloaded board gives a fresh list: only a change of images
  // restarts the rotation from the first.
  const key = urls.join("|");
  const count = urls.length;
  const current = count ? rank % count : 0;

  useEffect(() => setRank(0), [key]);

  // Like the image widget: hover suspends scrolling, and a chosen
  // dot restarts for a full interval.
  useEffect(() => {
    if (!interval || count < 2 || pause) return;
    const timeout = window.setTimeout(
      () => setRank((r) => (r + 1) % count),
      interval * 1000,
    );
    return () => window.clearTimeout(timeout);
  }, [key, count, interval, pause, rank]);

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      style={{
        position: "relative",
        width: "calc(100% + 2 * var(--mantine-spacing-xs))",
        margin: "calc(-1 * var(--mantine-spacing-xs)) calc(-1 * var(--mantine-spacing-xs)) 11px",
      }}
    >
      <img
        src={urls[current] ?? urls[0]}
        alt=""
        decoding="async"
        draggable={false}
        style={{
          display: "block",
          width: "100%",
          height: COVER_HEIGHT,
          objectFit: "cover",
          borderTopLeftRadius: CARD_RADIUS - 2,
          borderTopRightRadius: CARD_RADIUS - 2,
        }}
      />
      {/* The image widget's dots, placed on the photo, at the bottom: in white,
          with a shadow, to read on any image. They
          respond to clicks themselves: no drag, no card details opened. */}
      {count > 1 && (
        <Group
          gap={6}
          justify="center"
          wrap="nowrap"
          style={{ position: "absolute", left: 0, right: 0, bottom: 8 }}
        >
          {urls.map((src, i) => (
            <UnstyledButton
              key={`${src}-${i}`}
              data-no-card-drag="true"
              data-no-list-drag="true"
              aria-label={`Image ${i + 1}`}
              onClick={() => setRank(i)}
              onDoubleClick={(e) => e.stopPropagation()}
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                backgroundColor: "var(--mantine-color-white)",
                opacity: i === current ? 1 : 0.5,
                boxShadow: "0 0 2px rgba(0, 0, 0, 0.6)",
              }}
            />
          ))}
        </Group>
      )}
    </div>
  );
}

// What a card shows. Set apart: the card itself, the copy that follows
// the pointer and the cards of the list being moved all use it.
interface CardContentProps {
  card: TaskCard;
  withNumber?: boolean;
  compactLabels?: boolean;
  onLabelClick?: () => void;
  /** The board's labels: they take precedence over those the card carries. */
  labels?: Label[];
  checklistOpen?: boolean;
  onChecklistToggle?: () => void;
  onChecklistCheck?: (itemId: Id) => void;
}

function CardContent({
  card,
  withNumber = true,
  compactLabels,
  onLabelClick,
  labels,
  checklistOpen = false,
  onChecklistToggle,
  onChecklistCheck,
}: CardContentProps) {
  if (isSeparator(card))
    return (
      <Text size="sm" fw={700} style={CARD_TEXT}>
        {card.text}
      </Text>
    );

  // The board's labels take precedence: renamed or recolored, a label
  // shows in its new light without waiting for the lists to be
  // reloaded. The card only keeps the link.
  const cardLabels = (card.labels || []).map(
    (e) => (labels || []).find((l) => l.id === e.id) || e,
  );

  return (
    <Stack gap={CARD_CONTENT_GAP}>
      {/* The cover opens the card, edge to edge: it eats the
          card's inset ("xs") and follows its rounding, border deducted. */}
      {card.cover_urls?.length > 0 && (
        <Cover urls={card.cover_urls} interval={card.cover_interval} />
      )}
      {/* Labels top the title. Clicking one of them collapses or
          expands them all, across the whole board. */}
      {cardLabels.length > 0 && (
        <Group gap={3} align="center" pb={5} style={{ rowGap: 4 }}>
          {cardLabels.map((label) => (
            <CardLabel
              key={label.id}
              label={label}
              compact={compactLabels}
              onClick={onLabelClick}
            />
          ))}
        </Group>
      )}
      <Text size="sm" style={CARD_TEXT}>
        {card.text}
      </Text>
      <CardNumber
        card={card}
        withNumber={withNumber}
        onChecklistToggle={onChecklistToggle ?? (() => {})}
      />
      {/* Expanded by the badge: what is left to check, under the card. */}
      {checklistOpen && (
        <CardChecklistPanel card={card} onCheck={onChecklistCheck ?? (() => {})} />
      )}
    </Stack>
  );
}

// Height of the area that responds to hover between two cards: slightly more than
// the gap it covers, so it is easy to aim at.
const INSERT_ZONE = 12;

// Insertion between two cards: a dotted line with a "+" in the middle,
// which only appears on hover. The area takes no height in the stack —
// it overlaps the gap between the two cards, which keeps its 8px.
function CardInsert({ color, onClick }: { color: string; onClick: () => void }) {
  const [hovering, setHovered] = useState(false);

  return (
    <div style={{ position: "relative", height: 0, marginTop: -CARD_GAP }}>
      <div
        data-no-list-drag="true"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={onClick}
        aria-label="Insérer une carte ici"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: (CARD_GAP - INSERT_ZONE) / 2,
          height: INSERT_ZONE,
          display: "flex",
          alignItems: "center",
          gap: 6,
          cursor: "pointer",
          color: color,
          // The line and its "+" fade a little: they indicate without
          // taking precedence over the cards.
          opacity: hovering ? 0.8 : 0,
          transition: "opacity 120ms",
        }}
      >
        <span style={{ flex: 1, borderTop: `1px dashed ${color}` }} />
        <IconPlus size={PLUS_SIZE} />
        <span style={{ flex: 1, borderTop: `1px dashed ${color}` }} />
      </div>
    </div>
  );
}

// Frozen card: no pointer listening or hover, for the copies shown
// during a drag.
interface CardStillProps {
  card: TaskCard;
  palette: Palette;
  withNumber: boolean;
  compactLabels: boolean;
}

function CardStill({ card, palette, withNumber, compactLabels }: CardStillProps) {
  return (
    <Paper
      radius={CARD_RADIUS}
      p="xs"
      style={{ border: "2px solid transparent", ...separatorStyle(card, palette) }}
    >
      <CardContent card={card} withNumber={withNumber} compactLabels={compactLabels} />
    </Paper>
  );
}

// Insertion into a copy: the original is never touched.
const withInserted = <T,>(column: T[], index: number, value: T): T[] => {
  const copy = [...column];
  copy.splice(index, 0, value);
  return copy;
};

// Moving a card within a copy of the lists, to show it before
// the server has responded.
const withCardMoved = (
  lists: TaskList[],
  cardId: Id,
  toListId: Id,
  index: number,
): TaskList[] => {
  const card = lists
    .flatMap((l) => l.cards || [])
    .find((c) => c.id === cardId);
  if (!card) return lists;
  return lists.map((list) => {
    const cards = (list.cards || []).filter((c) => c.id !== cardId);
    if (list.id === toListId)
      cards.splice(index, 0, { ...card, list_id: toListId });
    return { ...list, cards: cards };
  });
};

// --- Liste ----------------------------------------------------------------

/** A list's rename in progress. */
interface ListEditing {
  id: Id;
  name: string;
}

interface ListCardProps {
  list: TaskList;
  editing: ListEditing | null;
  onStartEdit: () => void;
  onEditChange: (event: { currentTarget: { value: string } }) => void;
  onEditKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
  onEditBlur: () => void;
  onPointerDown: (event: ReactPointerEvent) => void;
  onDelete: () => void;
  onDeleteTasks: () => void;
  onMove: () => void;
  onCopy: () => void;
  onColor: (color: string) => void;
  /** Sets or removes an animation mark at the end of the title. */
  onAnimation: (effect: Effect) => void;
  onSeparator: () => void;
  /** Following this list means being notified of what happens to its cards. */
  followed: boolean;
  onToggleFollow: () => void;
  /** Locked board: the list can neither be moved nor deleted. */
  isLocked: boolean;
  /** The account's rights in the board's company. */
  rights: BoardRights;
  children?: ReactNode;
}

/** What the account can do in the open board, depending on its company. */
interface BoardRights {
  add: boolean;
  updateStatement: boolean;
  canDelete: boolean;
}

function ListCard({
  list,
  editing,
  onStartEdit,
  onEditChange,
  onEditKeyDown,
  onEditBlur,
  onPointerDown,
  onDelete,
  onDeleteTasks,
  onMove,
  onCopy,
  onColor,
  onAnimation,
  onSeparator,
  followed,
  onToggleFollow,
  isLocked,
  rights,
  children,
}: ListCardProps) {
  // The menu opens on right-click, at the clicked point. It closes by itself
  // on its entries, but not on the color swatches, which are not
  // entries: we drive it so a choice closes it.
  const [menu, setMenu] = useState<PointMenuPosition | null>(null);
  const colors = useListColors();
  const own = colors(list.color);
  const tasks = (list.cards || []).filter((c) => !isSeparator(c)).length;

  // An input field keeps the browser menu: cut, paste.
  const openMenu = (event: ReactMouseEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest("input, textarea")) return;
    // When editing, with nothing to offer: the widget's menu.
    if (!isLocked && !rights.add && !rights.updateStatement && !rights.canDelete) return;
    setMenu(menuPosition(event));
  };

  return (
    <Paper
      w={LIST_WIDTH}
      miw={LIST_WIDTH}
      radius="md"
      p={LIST_PADDING}
      data-list-id={list.id}
      // A list is dragged by its own gesture: it does not carry along the
      // widget that holds the board (IndicatorsPanel).
      data-no-widget-drag="true"
      onPointerDown={onPointerDown}
      onContextMenu={openMenu}
      style={{
        touchAction: "none",
        cursor: "pointer",
        alignSelf: "flex-start",
        backgroundColor: own.background,
      }}
    >
      {/* No gap here: the list's only spacing is that between two
          cards, set by the renderCards stack. The title and "add a
          card" set their own 5px of breathing room. */}
      <Stack gap={0}>
        {/* The title has 5px of room on its left; the field that replaces it
            aligns with the edge of the cards. */}
        <Group gap="xs" wrap="nowrap" pb={5} pl={editing ? 0 : 5}>
          {editing ? (
            <TextInput
              data-no-list-drag="true"
              value={editing.name}
              onChange={onEditChange}
              onKeyDown={onEditKeyDown}
              onBlur={onEditBlur}
              size="sm"
              radius={CARD_RADIUS}
              autoFocus
              styles={{
                input: {
                  ...INPUT_NO_BORDER.input,
                  backgroundColor: own.hover,
                  color: own.hoverText,
                },
              }}
              style={{ flex: 1, minWidth: 0 }}
              aria-label={`Renommer ${list.name}`}
            />
          ) : (
            <Text
              fw={600}
              size="sm"
              c={own.text}
              onClick={rights.updateStatement ? onStartEdit : undefined}
              style={{ cursor: "pointer", flex: 1, minWidth: 0 }}
            >
              {list.name}
            </Text>
          )}

          {/* How many cards the list holds, at the end of the title. Separators
              do not count: they organize the cards, they are not
              cards. */}
          <Text size="xs" c={own.text} opacity={0.7} style={{ flexShrink: 0 }}>
            {tasks}
          </Text>
        </Group>

        {children}
      </Stack>

      {/* Mantine returns focus to the anchor a moment after the menu closes.
          "Séparateur" opens an input that takes focus in the same
          breath: without "returnFocus", it would lose it right away and
          close on nothing. */}
      {menu && (
        <PointMenu position={menu} onClose={() => setMenu(null)} returnFocus={false}>
          {/* The separator is typed like a card, at the end of the
              list; it is then dragged to where it should divide. */}
          {/* When checked, the list is followed: any change to its
              cards counts as a notification. The check is on the right as in
              system menus, the eye on the left like the other icons. */}
          {/* When editing, the list only offers what concerns the
              board: moving it, copying it, deleting it. Outside
              editing, what concerns its content. */}
          {isLocked && (
            <Menu.Item
              leftSection={<IconEye size={16} />}
              rightSection={followed ? <IconCheck size={14} /> : null}
              onClick={onToggleFollow}
              closeMenuOnClick={false}
            >
              Suivre
            </Menu.Item>
          )}

          {isLocked && (rights.add || rights.updateStatement) && <Menu.Divider />}

          {isLocked && rights.add && (
            <Menu.Item
              leftSection={<IconSeparatorHorizontal size={16} />}
              onClick={onSeparator}
            >
              Séparateur
            </Menu.Item>
          )}
          {/* To another board, the list would leave this one: a locked
              board keeps it. */}
          {!isLocked && rights.updateStatement && (
            <Menu.Item
              leftSection={<IconFolderSymlink size={16} />}
              onClick={onMove}
            >
              Déplacer
            </Menu.Item>
          )}
          {/* Copy follows move: same question — to which board? —
              and the same dialog answers it, the current board included. */}
          {!isLocked && rights.add && (
            <Menu.Item
              leftSection={<IconCopy size={16} />}
              onClick={onCopy}
            >
              Copier
            </Menu.Item>
          )}

          {isLocked && rights.updateStatement && (
            <>
              <Menu.Divider />
              {/* The swatches do without a label: a color is
                  recognized. The section, though, carries one. */}
              <Menu.Label>Couleur de la liste</Menu.Label>
              <div className={swatches.grid}>
                {LIST_COLORS.map((color) => (
                  <ColorSwatch
                    key={color.value}
                    component="button"
                    type="button"
                    color={colors(color.value).background}
                    size={22}
                    onClick={() => {
                      setMenu(null);
                      onColor(color.value);
                    }}
                    className={swatches.swatch}
                    aria-label={color.label}
                    aria-pressed={color.value === list.color}
                  >
                    {color.value === list.color && <SelectionBorder />}
                  </ColorSwatch>
                ))}
              </div>
              <Menu.Item
                leftSection={<IconCircleOff size={16} />}
                onClick={() => onColor("")}
              >
                Aucune
              </Menu.Item>
              <Menu.Divider />
              {/* A card's arrival is celebrated according to the title's marks:
                  each emoji sets its own at the end, or removes it. */}
              <Menu.Label>Animation à l'arrivée</Menu.Label>
              <div className={swatches.animations}>
                {MARKS.map((m) => (
                  <UnstyledButton
                    key={m.effect}
                    className={swatches.animation}
                    onClick={() => {
                      setMenu(null);
                      onAnimation(m.effect);
                    }}
                    title={m.label}
                    aria-label={m.label}
                    aria-pressed={list.name.includes(m.mark)}
                  >
                    {m.emoji}
                  </UnstyledButton>
                ))}
              </div>
            </>
          )}

          {rights.canDelete && (
            <>
              <Menu.Divider />
              {/* Empty the list without deleting it: its separators stay. */}
              {isLocked ? (
                <Menu.Item
                  color={RED}
                  leftSection={<IconTrashX size={16} />}
                  onClick={onDeleteTasks}
                  disabled={tasks === 0}
                >
                  Supprimer tâches
                </Menu.Item>
              ) : (
                <Menu.Item
                  color={RED}
                  leftSection={<IconTrash size={16} />}
                  onClick={onDelete}
                >
                  Supprimer
                </Menu.Item>
              )}
            </>
          )}
        </PointMenu>
      )}
    </Paper>
  );
}

// --- Carte ----------------------------------------------------------------

/** Typing in progress on a card: the one being edited, and its text. */
interface CardEditing {
  id: Id;
  text: string;
}

interface CardViewProps {
  card: TaskCard;
  editing: CardEditing | null;
  onStartEdit: (card: TaskCard) => void;
  onEditChange: (event: { currentTarget: { value: string } }) => void;
  onEditKeyDown: (event: ReactKeyboardEvent<HTMLTextAreaElement>) => void;
  onEditBlur: () => void;
  onPointerDown: (event: ReactPointerEvent) => void;
  /** Without it — when editing —, right-click returns to the widget menu. */
  onContextMenu?: (card: TaskCard, position: PointMenuPosition) => void;
  /** Its menu is open: it keeps the hover frame. */
  active: boolean;
  palette: Palette;
  withNumber: boolean;
  compactLabels: boolean;
  onLabelClick: () => void;
  labels: Label[];
  checklistOpen: boolean;
  onChecklistToggle: () => void;
  onChecklistCheck: (itemId: Id) => void;
}

function CardView({
  card,
  editing,
  onStartEdit,
  onEditChange,
  onEditKeyDown,
  onEditBlur,
  onPointerDown,
  onContextMenu,
  active,
  palette,
  withNumber,
  compactLabels,
  onLabelClick,
  labels,
  checklistOpen,
  onChecklistToggle,
  onChecklistCheck,
}: CardViewProps) {
  const [hovered, setHovered] = useState(false);

  // When editing, the card keeps its attribute: it still occupies its
  // place in the position computation during a drag.
  if (editing) {
    return (
      <Textarea
        data-card-id={card.id}
        data-no-list-drag="true"
        value={editing.text}
        onChange={onEditChange}
        onKeyDown={onEditKeyDown}
        onBlur={onEditBlur}
        autosize
        minRows={2}
        autoFocus
        radius={CARD_RADIUS}
        styles={INPUT_NO_BORDER}
        aria-label="Modifier la carte"
      />
    );
  }

  return (
    <Paper
      data-card-id={card.id}
      data-no-list-drag="true"
      radius={CARD_RADIUS}
      p="xs"
      onPointerDown={onPointerDown}
      // A card opens its details with a simple click; only the separator, which
      // has no details, is still edited on the board.
      onDoubleClick={() => onStartEdit(card)}
      onContextMenu={(e) => onContextMenu?.(card, menuPosition(e))}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        touchAction: "none",
        cursor: "pointer",
        border: `2px solid ${hovered || active ? palette.cardBorder : "transparent"}`,
        ...separatorStyle(card, palette),
      }}
    >
      <CardContent
        card={card}
        withNumber={withNumber}
        compactLabels={compactLabels}
        onLabelClick={onLabelClick}
        labels={labels}
        checklistOpen={checklistOpen}
        onChecklistToggle={onChecklistToggle}
        onChecklistCheck={onChecklistCheck}
      />
    </Paper>
  );
}

// A frozen list: its background, title, cards and its "add a
// card", with no interaction. This is what the copy following the
// pointer and the list left in place during the drag show.
interface ListStillProps {
  list: TaskList;
  style?: CSSProperties;
  shadow?: string;
  withNumber: boolean;
  compactLabels: boolean;
  [other: string]: unknown;
}

function ListStill({
  list,
  style,
  shadow,
  withNumber,
  compactLabels,
  ...props
}: ListStillProps) {
  const own = useListColors()(list?.color);

  return (
    <Paper
      w={LIST_WIDTH}
      miw={LIST_WIDTH}
      radius="md"
      p={LIST_PADDING}
      shadow={shadow}
      style={{
        alignSelf: "flex-start",
        pointerEvents: "none",
        backgroundColor: own.background,
        ...style,
      }}
      {...props}
    >
      <Stack gap={0}>
        <Text fw={600} size="sm" c={own.text} pb={5} pl={5}>
          {list?.name}
        </Text>
        <Stack gap={CARD_GAP}>
          {(list?.cards || []).map((card) => (
            <CardStill
              key={card.id}
              card={card}
              palette={own}
              withNumber={withNumber}
              compactLabels={compactLabels}
            />
          ))}
        </Stack>
        <AddCardButton label="Ajouter une carte" color={own.text} onClick={() => {}} />
      </Stack>
    </Paper>
  );
}

export interface TaskBoardProps {
  boardId: string | null;
  boards: Board[];
  lists: TaskList[];
  loading: boolean;
  onListsChanged: () => void | Promise<void>;
  labels: Label[];
  users: PublicUser[];
  onLabelsChanged: (patch?: { id: number; data: Partial<Label> }) => void | Promise<void>;
  follows: Follows;
  onToggleFollow: (kind: FollowKind, id: Id) => void | Promise<void>;
  cardToOpen: Id | null;
  onCardOpened: (id: Id | null) => void;
  /** The "Tâches" widget that shows it: its lists, and those created in it. */
  listKey?: string;
  /** Show the card number: a widget option (widgets/task/list.tsx). */
  withNumber?: boolean;
}

/** The key of the "Tâches" widget option that shows the card number. */
export const NUMBERS = "show_numbers";

/** Does the widget show the card number? Without a setting, no. */
export const withNumbers = (config: unknown): boolean =>
  (config as Record<string, unknown> | null)?.[NUMBERS] === true;

/**
 * The open board, as the page stages it: the lists widget
 * (widgets/task/list.tsx) reads it here, wherever it is placed in the
 * sections.
 */
export const TaskBoardContext = createContext<TaskBoardProps | null>(null);

/**
 * The board's lists as a widget — only this widget's lists
 * (lib/lists.ts). Remounted for each board: typing or a drag in
 * progress does not survive the tab change.
 */
export function TaskBoardWidget({ config }: { config: unknown }) {
  const board = useContext(TaskBoardContext);
  const all = board?.lists;
  const visibleLists = useMemo(() => all?.filter(inList(config)) ?? [], [all, config]);
  if (!board) return null;
  return (
    <TaskBoard
      key={board.boardId}
      {...board}
      lists={visibleLists}
      listKey={listKey(config)}
      withNumber={withNumbers(config)}
    />
  );
}

export default function TaskBoard({
  boardId,
  boards,
  lists,
  loading,
  onListsChanged,
  labels,
  users,
  onLabelsChanged,
  follows,
  onToggleFollow,
  cardToOpen,
  onCardOpened,
  listKey,
  withNumber = false,
}: TaskBoardProps) {
  const [composing, setComposing] = useState(false);
  // The rank where the list being typed will land: "null", at the end. The "+"
  // between two lists gives one, and the panel opens at that spot.
  const [newRank, setNewRank] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const [editingId, setEditingId] = useState<Id | null>(null);
  const [editingName, setEditingName] = useState("");
  // Escape must cancel without the loss of focus saving in passing.
  const cancelled = useRef(false);

  const [pendingDelete, setPendingDelete] = useState<TaskList | null>(null);
  // The list being asked to be emptied of its tasks.
  const [listToEmpty, setListToEmpty] = useState<TaskList | null>(null);
  // List whose host board is being chosen.
  // The list about to be moved or copied, and which of the two.
  const [targetList, setTargetList] = useState<{ list: TaskList; mode: ListAction } | null>(
    null,
  );
  // Card whose details are open.
  const [openCard, setOpenedCard] = useState<TaskCard | null>(null);
  // A card's context menu, and the card whose deletion is
  // requested.
  const [cardMenu, setCardMenu] = useState<
    { card: TaskCard; position: PointMenuPosition } | null
  >(null);
  const [cardToDelete, setCardToDelete] = useState<TaskCard | null>(null);

  // A card designated from outside — by the address, or by a
  // notification link. The app has already moved to the right board; we
  // simply wait for its lists to be read to find the card there.
  useEffect(() => {
    if (cardToOpen === null) return;
    for (const column of lists) {
      const card = column.cards.find((c) => c.id === cardToOpen);
      if (card) {
        setOpenedCard(card);
        return;
      }
    }
  }, [cardToOpen, lists]);

  // The copy just duplicated: its details open as soon as the reloaded lists
  // carry it, so it can be taken up as the basis for another.
  const [copyToOpen, setCopyToOpen] = useState<Id | null>(null);
  useEffect(() => {
    if (copyToOpen === null) return;
    const copy = lists.flatMap((l) => l.cards).find((c) => c.id === copyToOpen);
    if (copy) {
      setCopyToOpen(null);
      setOpenedCard(copy);
    }
  }, [copyToOpen, lists]);

  // The address follows the open card: it is the app that writes it, the
  // board only tells it what it shows.
  useEffect(() => {
    onCardOpened(openCard?.id ?? null);
  }, [openCard, onCardOpened]);
  // Labels collapse into bars, or expand with their name: the
  // choice applies to the whole board, like a display setting.
  const [compactLabels, setCompactLabels] = useState(false);
  // Cards whose "what is left to do" panel is expanded. Each card
  // keeps its own: several can be open at once.
  const [expandedChecklists, setExpandedChecklists] = useState<Set<Id>>(() => new Set());

  // Typing a new card: the list, the rank where it will land and
  // its kind ("card" or "separator"). Editing an existing card
  // just below.
  const [cardCompose, setCardComposition] = useState<Composition | null>(null);
  const [cardText, setCardText] = useState("");
  const composeCancelled = useRef(false);
  const [editingCardId, setEditingCardId] = useState<Id | null>(null);
  // Opening of the card details is deferred, long enough for a second click to
  // beat it and open the title input.
  const openRecord = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(openRecord.current), []);
  const [editingCardText, setEditingCardText] = useState("");
  const editCancelled = useRef(false);

  // Order shown while a move is being saved. Without it, the
  // release would redraw from the props, still carrying the old
  // order: the item would be seen returning to its place during the server
  // round trip. The props take over as soon as they arrive.
  const [localOrder, setLocalOrder] = useState<TaskList[] | null>(null);
  const columns = localOrder || lists;
  useEffect(() => setLocalOrder(null), [lists]);

  const colors = useListColors();

  const board = (boards || []).find((b) => String(b.id) === String(boardId));
  // Locked, the board keeps its lists: no adding, moving or
  // deleting. Cards, however, can still be dragged.
  const isLocked = board?.is_locked === 1;
  // Whoever only reads opens the card details, without adding, dragging or
  // deleting anything.
  const can = useRights();
  const rights: BoardRights = {
    add: can("tasks", "create"),
    updateStatement: can("tasks", "update"),
    canDelete: can("tasks", "delete"),
  };
  // No list added: locked, or without the right.
  const withoutListAdd = isLocked || !rights.add;

  // Celebrations in progress: one per mark in the host list's title.
  const [celebrations, setCelebrations] = useState<Celebration[]>([]);

  // A card arriving in a marked list (✨, ❤️, 👍, 🚀, 🔥, ❄️, ⚡) is
  // celebrated. The list and the card are measured on screen: the board scrolls, so their
  // position is only known at that moment. The card has just been moved: we
  // wait for it to be painted at its new place before measuring it.
  const arrivalCelebration = (list: TaskList, cardId: Id) => {
    const effects = titleEffects(list.name);
    if (effects.length === 0) return;
    const zone = (el: Element | null): Zone | null => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, width: r.width, height: r.height };
    };
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const column = zone(document.querySelector(`[data-list-id="${list.id}"]`));
        if (!column) return;
        const card = zone(document.querySelector(`[data-card-id="${cardId}"]`));
        const key = Date.now();
        setCelebrations((before) => [
          ...before,
          ...effects.map((effect) => ({ key: `${key}-${effect}`, effect, column, card })),
        ]);
      }),
    );
  };

  // State of the drag in progress: a list, or a card.
  const [drag, setDrag] = useState<ListDrag | null>(null);
  const dragRef = useRef<ListDragInProgress | null>(null);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const [cardDrag, setCardDrag] = useState<CardDrag | null>(null);
  const cardDragRef = useRef<CardDragInProgress | null>(null);
  const cardTargetRef = useRef<CardTarget | null>(null);

  // Each list's height, tracked on screen: the "+" between two lists
  // takes that of the taller of the two, not that of the whole row.
  const [heights, setHeights] = useState<Map<string, number>>(() => new Map());
  useEffect(() => {
    const band = rowRef.current;
    if (!band) return undefined;
    const observer = new ResizeObserver((entries) => {
      setHeights((before) => {
        let next: Map<string, number> | null = null;
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.listId;
          const height = (entry.target as HTMLElement).offsetHeight;
          if (!id || before.get(id) === height) continue;
          next ??= new Map(before);
          next.set(id, height);
        }
        return next ?? before;
      });
    });
    band.querySelectorAll("[data-list-id]").forEach((column) => observer.observe(column));
    return () => observer.disconnect();
  }, [columns]);
  // Container of each list's cards, by list id.
  const cardZones = useRef(new Map<Id, HTMLElement>());

  // --- Renommage en ligne ------------------------------------------------
  const startEdit = (list: TaskList) => {
    if (!rights.updateStatement) return;
    cancelled.current = false;
    setEditingId(list.id);
    setEditingName(list.name);
  };

  const cancelEdit = () => {
    cancelled.current = true;
    setEditingId(null);
    setEditingName("");
  };

  const saveEdit = async (list: TaskList) => {
    if (cancelled.current) return;
    const name = editingName.trim();
    setEditingId(null);
    if (!name || name === list.name) return;
    try {
      await api.updateTaskList(list.id, { name: name });
      await onListsChanged();
    } catch (e) {
      notifyError(errorMessage(e));
    }
  };

  // --- List animation ----------------------------------------------------
  // The mark is placed at the end of the title: it is what decides the celebration.
  const setListAnimation = async (list: TaskList, effect: Effect) => {
    const name = toggleMark(list.name, effect);
    if (!name || name === list.name) return;
    setLocalOrder(columns.map((l) => (l.id === list.id ? { ...l, name } : l)));
    try {
      await api.updateTaskList(list.id, { name });
      await onListsChanged();
    } catch (e) {
      setLocalOrder(null);
      notifyError(errorMessage(e));
    }
  };

  // --- List color ---------------------------------------------------------
  const setListColor = async (list: TaskList, color: string) => {
    if ((list.color || "") === color) return;
    // The list takes its color right away: the server round trip must not
    // let the menu close on the old background.
    setLocalOrder(
      columns.map((l) => (l.id === list.id ? { ...l, color } : l)),
    );
    try {
      await api.updateTaskList(list.id, { color: color as ListColor });
      await onListsChanged();
    } catch (e) {
      setLocalOrder(null);
      notifyError(errorMessage(e));
    }
  };

  // --- List deletion ------------------------------------------------------
  const deleteList = async (list: TaskList) => {
    setPendingDelete(null);
    try {
      await api.deleteTaskList(list.id);
      await onListsChanged();
    } catch (e) {
      notifyError(errorMessage(e));
    }
  };

  const deleteTasks = async (list: TaskList) => {
    setListToEmpty(null);
    // The card details open on a task of this list would no longer have a card.
    if (openCard && openCard.list_id === list.id && !isSeparator(openCard)) {
      setOpenedCard(null);
    }
    try {
      await api.deleteTaskListCards(list.id);
      await onListsChanged();
    } catch (e) {
      notifyError(errorMessage(e));
    }
  };

  const deleteCard = async (card: TaskCard) => {
    setCardToDelete(null);
    if (openCard?.id === card.id) setOpenedCard(null);
    try {
      await api.deleteTaskCard(card.id);
      await onListsChanged();
    } catch (e) {
      notifyError(errorMessage(e));
    }
  };

  // --- Cards: typing and editing -----------------------------------------
  // In both cases, Escape cancels and loss of focus submits.
  const startCompose = (list: TaskList, index: number, kind: "card" | "separator" = "card") => {
    if (!rights.add) return;
    composeCancelled.current = false;
    setCardComposition({ listId: list.id, index, kind });
    setCardText("");
  };

  const cancelCompose = () => {
    composeCancelled.current = true;
    setCardComposition(null);
    setCardText("");
  };

  // Enter and loss of focus both lead here: the flag closes the
  // door behind the first of the two, otherwise the card would be created twice.
  // startCompose reopens it.
  const saveComposition = async (
    list: TaskList,
    rank: number | null,
    kind: "card" | "separator" = "card",
  ) => {
    if (composeCancelled.current) return;
    composeCancelled.current = true;
    const text = cardText.trim();
    setCardComposition(null);
    setCardText("");
    if (!text) return;

    const cards = list.cards || [];
    const index = Math.min(rank ?? cards.length, cards.length);

    // The card takes its place right away, at the targeted rank: without it the field
    // would vanish into nothing, and the card would only appear when the
    // server returns. Its reference waits for the server: the counter is shared
    // across all modes, and nothing here knows the next one.
    const provisional: ProvisionalCard = {
      id: `new-${Date.now()}`,
      list_id: list.id,
      text: text,
      number: 0,
      kind,
    };
    // The provisional card has no row id yet: it holds
    // the place of a real one for the round trip.
    setLocalOrder(
      columns.map((l) =>
        l.id === list.id
          ? { ...l, cards: withInserted(cards, index, provisional as unknown as TaskCard) }
          : l,
      ),
    );

    try {
      // The server always adds the card at the end: if it is inserted higher
      // up, the list's order follows right after.
      // It is born in the context being viewed: it receives its label.
      const created = await api.createTaskCard(list.id, text, kind, undefined, board?.context);
      if (index < cards.length) {
        await api.reorderTaskCards(
          list.id,
          withInserted(cards.map((c) => c.id), index, created.id),
        );
      }
      await onListsChanged();
    } catch (e) {
      setLocalOrder(null);
      notifyError(errorMessage(e));
    }
  };

  const startEditCard = (card: TaskCard) => {
    // The second click arrives before the card details open: we cancel
    // the pending opening, otherwise the drawer would come on top of the
    // input just opened.
    if (!rights.updateStatement) return;
    clearTimeout(openRecord.current);
    editCancelled.current = false;
    setEditingCardId(card.id);
    setEditingCardText(card.text);
  };

  // "Modifier" opens the card details; a separator, which has none, is edited
  // on the board.
  const editCard = (card: TaskCard) => {
    if (isSeparator(card)) startEditCard(card);
    else setOpenedCard(card);
  };

  // A duplicated separator has no card details: it is placed under the original,
  // and whichever of the two should divide elsewhere is dragged afterwards.
  const duplicateCard = async (card: TaskCard) => {
    try {
      const copy = await api.duplicateTaskCard(card.id);
      await onListsChanged();
      if (!isSeparator(card)) setCopyToOpen(copy.id);
    } catch (e) {
      notifyError(errorMessage(e));
    }
  };

  const cancelEditCard = () => {
    editCancelled.current = true;
    setEditingCardId(null);
    setEditingCardText("");
  };

  const saveEditCard = async (card: TaskCard) => {
    if (editCancelled.current) return;
    editCancelled.current = true;
    const text = editingCardText.trim();
    setEditingCardId(null);
    if (!text || text === card.text) return;
    try {
      await api.updateTaskCard(card.id, text);
      await onListsChanged();
    } catch (e) {
      notifyError(errorMessage(e));
    }
  };

  // --- List drag and drop ------------------------------------------------

  // Target index from the pointer's horizontal position: all lists
  // have the same width, a simple computation is enough.
  const targetFromPointer = useCallback(
    (clientX: number): number => {
      const row = rowRef.current;
      if (!row) return 0;
      const rect = row.getBoundingClientRect();
      const x = clientX - rect.left + row.scrollLeft;
      const index = Math.floor(x / (LIST_WIDTH + LIST_GAP));
      return Math.max(0, Math.min(columns.length - 1, index));
    },
    [columns.length],
  );

  const onListPointerDown =
    (list: TaskList, index: number) => (event: ReactPointerEvent) => {
    // Primary button only, never during a rename or on a locked
    // board.
    if (event.button !== 0 || editingId === list.id || isLocked || !rights.updateStatement) return;
    // Cards, the menu and input fields have their own role: pressing
    // on them does not move the list.
    if ((event.target as HTMLElement).closest("[data-no-list-drag]")) return;

    const element = event.currentTarget.getBoundingClientRect();
    dragRef.current = {
      id: list.id,
      index,
      startX: event.clientX,
      startY: event.clientY,
      // Pointer offset within the card, so the clone follows without jumping.
      offsetX: event.clientX - element.left,
      offsetY: event.clientY - element.top,
      started: false,
    };
    };

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;

      if (!d.started) {
        const distance = Math.hypot(
          event.clientX - d.startX,
          event.clientY - d.startY,
        );
        if (distance < DRAG_THRESHOLD) return;
        d.started = true;
        document.body.style.userSelect = "none";
        document.body.style.cursor = "pointer";
      }

      setDrag({
        id: d.id,
        from: d.index,
        target: targetFromPointer(event.clientX),
        x: event.clientX - d.offsetX,
        y: event.clientY - d.offsetY,
      });
    };

    const onUp = async () => {
      const d = dragRef.current;
      dragRef.current = null;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      if (!d || !d.started) return;

      const current = drag;
      setDrag(null);
      if (!current || current.target === current.from) return;

      // New order shown immediately, then saved.
      const order = columns.map((l) => l.id);
      const [moved] = order.splice(current.from, 1);
      if (moved === undefined) return;
      order.splice(current.target, 0, moved);
      setLocalOrder(
        order
          .map((id) => columns.find((l) => l.id === id))
          .filter((l): l is TaskList => Boolean(l)),
      );
      try {
        await api.reorderTaskLists(Number(boardId), order);
        await onListsChanged();
      } catch (e) {
        setLocalOrder(null);
        notifyError(errorMessage(e));
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [drag, columns, onListsChanged, targetFromPointer, boardId]);

  // --- Card drag and drop ------------------------------------------------

  // Target list and rank. Cards do not all have the same height: we need to
  // measure. "precedent" is the drop placeholder currently shown.
  const cardTargetFromPointer = useCallback(
    (clientX: number, clientY: number, previous: CardTarget | null): CardTarget | null => {
      const column = columns[targetFromPointer(clientX)];
      if (!column) return null;
      const zone = cardZones.current.get(column.id);
      if (!zone) return { listId: column.id, index: 0 };

      // The moved card is no longer displayed: only the others remain.
      const cards = [...zone.querySelectorAll<HTMLElement>("[data-card-id]")];

      // The drop placeholder takes up space and pushes the cards after it
      // down. We subtract that offset: otherwise the computed rank
      // would depend on the displayed placeholder and oscillate between two values.
      const home = zone.querySelector("[data-card-placeholder]");
      const offset = home
        ? (home as HTMLElement).getBoundingClientRect().height + CARD_GAP
        : 0;
      const homeRank =
        home && previous && previous.listId === column.id
          ? previous.index
          : cards.length;

      let index = cards.length;
      for (let i = 0; i < cards.length; i += 1) {
        const rect = (cards[i] as HTMLElement).getBoundingClientRect();
        const top = rect.top - (i >= homeRank ? offset : 0);
        if (clientY < top + rect.height / 2) {
          index = i;
          break;
        }
      }
      return { listId: column.id, index };
    },
    [columns, targetFromPointer],
  );

  const toggleChecklist = (cardId: Id) =>
    setExpandedChecklists((openSessions) => {
      const next = new Set(openSessions);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });

  // Checking from the card: the item leaves the panel and the badge
  // advances. The card details need not be open for this.
  const checkChecklistItem = async (itemId: Id) => {
    if (!rights.updateStatement) return;
    try {
      await api.updateChecklistItem(itemId, { done: true });
      await onListsChanged();
    } catch (e) {
      notifyError(errorMessage(e));
    }
  };

  const onCardPointerDown =
    (card: TaskCard, list: TaskList) => (event: ReactPointerEvent) => {
    if (event.button !== 0 || editingCardId === card.id) return;
    // A label responds to the click itself: it does not move the card and
    // does not open its details.
    if ((event.target as HTMLElement).closest("[data-no-card-drag]")) return;

    const element = event.currentTarget.getBoundingClientRect();
    cardTargetRef.current = null;
    cardDragRef.current = {
      id: card.id,
      listId: list.id,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - element.left,
      offsetY: event.clientY - element.top,
      // The clone and the drop placeholder take the card's size.
      width: element.width,
      height: element.height,
      started: false,
      frozen: !rights.updateStatement,
    };
    };

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const d = cardDragRef.current;
      if (!d) return;

      if (!d.started) {
        if (d.frozen) return;
        const distance = Math.hypot(
          event.clientX - d.startX,
          event.clientY - d.startY,
        );
        if (distance < DRAG_THRESHOLD) return;
        d.started = true;
        document.body.style.userSelect = "none";
        document.body.style.cursor = "pointer";
      }

      const target = cardTargetFromPointer(
        event.clientX,
        event.clientY,
        cardTargetRef.current,
      );
      cardTargetRef.current = target;
      setCardDrag({
        id: d.id,
        width: d.width,
        height: d.height,
        target,
        x: event.clientX - d.offsetX,
        y: event.clientY - d.offsetY,
      });
    };

    const onUp = async () => {
      const d = cardDragRef.current;
      const target = cardTargetRef.current;
      cardDragRef.current = null;
      cardTargetRef.current = null;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      if (!d) return;

      // A press that did not drag is a click: it opens the card's
      // details. But a double-click opens the title input instead — and its
      // first click goes through here first. The details therefore wait for the
      // double-click delay; if a second click arrives, it cancels the wait
      // ("startEditCard"). A separator has no details: nothing to hold.
      if (!d.started) {
        const card = columns.flatMap((l) => l.cards || []).find((c) => c.id === d.id);
        if (card && !isSeparator(card)) {
          clearTimeout(openRecord.current);
          openRecord.current = setTimeout(
            () => setOpenedCard(card),
            DOUBLE_CLICK_DELAY,
          );
        }
        return;
      }

      setCardDrag(null);
      if (!target) return;

      const home = columns.find((l) => l.id === target.listId);
      if (!home) return;

      // The host list's full order: its cards, the moved card
      // removed if it came from there, then reinserted at the targeted rank.
      const before = (home.cards || []).map((c) => c.id);
      const order = before.filter((id) => id !== d.id);
      order.splice(target.index, 0, d.id);
      if (target.listId === d.listId && order.join() === before.join()) return;

      // The card reaches its destination without waiting for the server's response.
      setLocalOrder(withCardMoved(columns, d.id, home.id, target.index));
      // Coming from another list: the arrival is celebrated, if the list asks for it.
      if (target.listId !== d.listId) arrivalCelebration(home, d.id);
      try {
        await api.reorderTaskCards(home.id, order);
        await onListsChanged();
      } catch (e) {
        setLocalOrder(null);
        notifyError(errorMessage(e));
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [columns, onListsChanged, cardTargetFromPointer]);

  // --- List creation -----------------------------------------------------
  const cancel = () => {
    setComposing(false);
    setNewRank(null);
    setName("");
  };

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await api.createTaskList(
        Number(boardId),
        name.trim(),
        newRank ?? undefined,
        listKey || undefined,
      );
      await onListsChanged();
      // We chain: the field stays open and empty for the next list,
      // which lands right after the one just created.
      setName("");
      setNewRank((r) => (r === null ? null : r + 1));
    } catch (e) {
      notifyError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  // Order shown during the drag: the moved list leaves the flow and gives
  // up its place to a drop placeholder at the targeted index.
  const dragged = drag ? columns.find((l) => l.id === drag.id) : null;
  const visibleItems = drag ? columns.filter((l) => l.id !== drag.id) : columns;

  const draggedCard = cardDrag
    ? columns.flatMap((l) => l.cards || []).find((c) => c.id === cardDrag.id)
    : null;
  // The list a card starts from: a dragged separator keeps its origin
  // list's background until it lands.
  const listOf = (card: TaskCard): TaskList | undefined =>
    columns.find((l) => l.id === card.list_id);

  // A list's cards, with the drop placeholder when the drag targets it
  // and, between two cards, the insertion point that opens an input.
  const renderCards = (list: TaskList) => {
    const cards = list.cards || [];
    // Typing in progress in this list, and the field that carries it: it is
    // written once, then placed at the targeted rank.
    const input = cardCompose?.listId === list.id ? cardCompose : null;
    const separator = input?.kind === "separator";
    const palette = colors(list.color);
    const field = input ? (
      <Textarea
        data-no-list-drag="true"
        placeholder={
          separator
            ? "Nom du séparateur"
            : "Saisissez le texte de la carte"
        }
        value={cardText}
        onChange={(e) => {
          const { value } = e.currentTarget;
          setCardText(value);
        }}
        onKeyDown={cardKeyDown({
          setValue: setCardText,
          onCancel: cancelCompose,
          onSubmit: () => saveComposition(list, input.index, input.kind),
        })}
        onBlur={() => saveComposition(list, input.index, input.kind)}
        autosize
        minRows={separator ? 1 : 2}
        autoFocus
        radius={CARD_RADIUS}
        styles={
          // The separator is written as it will display: in bold, on the
          // list's darkened background.
          separator
            ? {
                input: {
                  ...INPUT_NO_BORDER.input,
                  backgroundColor: palette.separatorBackground,
                  color: palette.separatorText,
                  fontWeight: 700,
                  // The gray Mantine gives placeholder text does not hold up
                  // on a colored background: we reuse the text color, just
                  // faded enough to remain a prompt.
                  "--input-placeholder-color": alpha(palette.separatorText, 0.75),
                },
              }
            : INPUT_NO_BORDER
        }
        aria-label={
          separator
            ? `Ajouter un séparateur dans ${list.name}`
            : `Ajouter une carte dans ${list.name}`
        }
      />
    ) : null;
    const displayed = cardDrag
      ? cards.filter((c) => c.id !== cardDrag.id)
      : cards;
    const rank =
      cardDrag && cardDrag.target && cardDrag.target.listId === list.id
        ? cardDrag.target.index
        : null;

    return (
      <Stack
        gap={CARD_GAP}
        ref={(el) => {
          if (el) cardZones.current.set(list.id, el);
          else cardZones.current.delete(list.id);
        }}
      >
        {displayed.map((card, index) => (
          <Fragment key={card.id}>
            {rank === index && cardDrag && <CardPlaceholder height={cardDrag.height} />}

            {/* Between two cards: the dotted line that opens an input at
                this rank. Not during a drag, nor above the first
                card, nor where the input is already open. */}
            {index > 0 &&
              rights.add &&
              !cardDrag &&
              !drag &&
              input?.index !== index &&
              input?.index !== index - 1 && (
                <CardInsert
                  color={palette.insertionLine}
                  onClick={() => startCompose(list, index)}
                />
              )}

            {input?.index === index && field}

            <CardView
              card={card}
              editing={
                editingCardId === card.id ? { id: card.id, text: editingCardText } : null
              }
              onStartEdit={startEditCard}
              onEditChange={(e) => {
                const { value } = e.currentTarget;
                setEditingCardText(value);
              }}
              onEditKeyDown={cardKeyDown({
                setValue: setEditingCardText,
                onCancel: cancelEditCard,
                onSubmit: () => saveEditCard(card),
              })}
              onEditBlur={() => saveEditCard(card)}
              onPointerDown={onCardPointerDown(card, list)}
              onContextMenu={
                isLocked ? (card, position) => setCardMenu({ card: card, position }) : undefined
              }
              active={cardMenu?.card.id === card.id}
              palette={palette}
              withNumber={withNumber}
              compactLabels={compactLabels}
              onLabelClick={() => setCompactLabels((c) => !c)}
              labels={labels}
              checklistOpen={expandedChecklists.has(card.id)}
              onChecklistToggle={() => toggleChecklist(card.id)}
              onChecklistCheck={checkChecklistItem}
            />
          </Fragment>
        ))}

        {/* Emplacement en fin de liste. */}
        {rank !== null && cardDrag && rank >= displayed.length && (
          <CardPlaceholder height={cardDrag.height} />
        )}

        {/* The input opened by "Ajouter une carte" closes the stack. */}
        {input && input.index >= displayed.length && field}
      </Stack>
    );
  };

  // The input panel for a new list: at the end of the row, or at the
  // rank given by the "+" between two lists.
  const newInset = (
    <Paper
      w={LIST_WIDTH}
      miw={LIST_WIDTH}
      radius="md"
      p={LIST_PADDING}
      style={{ backgroundColor: LIST_BG }}
    >
      <Stack gap="sm">
        <TextInput
          placeholder="Nom"
          styles={INPUT_NO_BORDER}
          value={name}
          onChange={(e) => {
            const { value } = e.currentTarget;
            setName(value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") create();
            if (e.key === "Escape") cancel();
          }}
          autoFocus
        />
        <Group justify="space-between" wrap="nowrap">
          <Anchor
            component="button"
            type="button"
            size="sm"
            onClick={create}
            disabled={busy || !name.trim()}
          >
            {/* The same "+" as the other "add" actions, and the
                same gap to its label. */}
            <Group gap={PLUS_GAP} wrap="nowrap">
              <IconPlus size={PLUS_SIZE} />
              <span>Ajouter la liste</span>
            </Group>
          </Anchor>
          <ActionIcon
            variant="subtle"
            color="gray"
            onClick={cancel}
            aria-label="Annuler"
          >
            <IconX size={16} />
          </ActionIcon>
        </Group>
      </Stack>
    </Paper>
  );

  // What deleting the targeted list would take with it.
  const deletedCards = pendingDelete?.cards?.length ?? 0;
  // What emptying the targeted list would take with it.
  const deletedTasks = (listToEmpty?.cards || []).filter((c) => !isSeparator(c)).length;

  return (
    <Stack gap="md" style={{ flex: 1, minHeight: 0 }}>

      {/* A board with no list: the prompt fills the panel's whole
          height, like the other empty screens. During a read, nothing is
          shown: "no list" would be a premature conclusion. */}
      {columns.length === 0 && !composing ? (
        loading ? null : (
          <EmptyPanel
            icon={IconColumns}
            message="Aucune liste"
            actionLabel={withoutListAdd ? undefined : "Ajouter une liste"}
            onAction={withoutListAdd ? undefined : () => setComposing(true)}
            // The size of the other empty lists — projects, requests.
            size="md"
          />
        )
      ) : (
        <ScrollArea
          // The bar only shows while scrolling, then fades:
          // at rest, the header's line stays whole.
          type="scroll"
          // The drag measures the scrolling element: it is no longer the row,
          // it is the area's viewport.
          viewportRef={rowRef}
          classNames={{ scrollbar: classes.scrollbar, thumb: classes.thumb }}
          style={{ flex: 1, minHeight: 0 }}
        >
          <Group align="flex-start" gap={LIST_GAP} wrap="nowrap">
            {visibleItems.map((list, index) => (
              <Fragment key={list.id}>
                {drag && drag.target === index && <Placeholder list={dragged ?? undefined} withNumber={withNumber} compactLabels={compactLabels} />}
                {composing && newRank === index && newInset}
                {/* Before each list: the line that inserts one at this
                    spot. It takes no width — the negative margin
                    gives the row back the gap this marker would cost it. */}
                {!drag && !cardDrag && !composing && !withoutListAdd && (
                  <div
                    style={{
                      position: "relative",
                      width: 0,
                      height: Math.max(
                        heights.get(String(list.id)) ?? 0,
                        index > 0 ? (heights.get(String(visibleItems[index - 1]!.id)) ?? 0) : 0,
                      ),
                      marginRight: -LIST_GAP,
                    }}
                  >
                    <ColumnInsert
                      label="Insérer une liste ici"
                      style={{
                        // Before the first, the scroll area would clip
                        // everything that overflows on the left: it therefore overlaps
                        // half of the list's edge.
                        left:
                          index === 0
                            ? -COLUMN_INSERT_ZONE / 2
                            : -(LIST_GAP + COLUMN_INSERT_ZONE) / 2,
                      }}
                      onClick={() => {
                        setNewRank(index);
                        setComposing(true);
                      }}
                    />
                  </div>
                )}
                <ListCard
                  followed={follows.list.includes(list.id)}
                  onToggleFollow={() => onToggleFollow("list", list.id)}
                  isLocked={isLocked}
                  rights={rights}
                  list={list}
                  editing={editingId === list.id ? { id: list.id, name: editingName } : null}
                  onStartEdit={() => startEdit(list)}
                  onEditChange={(e) => {
                    const { value } = e.currentTarget;
                    setEditingName(value);
                  }}
                  onEditKeyDown={(e) => {
                    if (e.key === "Enter") saveEdit(list);
                    if (e.key === "Escape") cancelEdit();
                  }}
                  onEditBlur={() => saveEdit(list)}
                  onPointerDown={onListPointerDown(list, columns.indexOf(list))}
                  onDelete={() => setPendingDelete(list)}
                  onDeleteTasks={() => setListToEmpty(list)}
                  onMove={() => setTargetList({ list, mode: "move" })}
                  onCopy={() => setTargetList({ list, mode: "copy" })}
                  onColor={(color) => setListColor(list, color)}
                  onAnimation={(effect) => setListAnimation(list, effect)}
                  onSeparator={() =>
                    startCompose(list, (list.cards || []).length, "separator")
                  }
                >
                  {renderCards(list)}

                  {cardCompose?.listId !== list.id && rights.add && (
                    <AddCardButton
                      label="Ajouter une carte"
                      color={colors(list.color).text}
                      onClick={() => startCompose(list, (list.cards || []).length)}
                    />
                  )}
                </ListCard>
              </Fragment>
            ))}

            {/* Placeholder at the end of the row. */}
            {drag && drag.target >= visibleItems.length && (
              <Placeholder list={dragged ?? undefined} withNumber={withNumber} compactLabels={compactLabels} />
            )}

            {/* Always to the right of the lists: the button gives way to the panel. */}
            {!composing && !drag && !withoutListAdd && (
              <AddButton
                label="Ajouter une liste"
                onClick={() => setComposing(true)}
                style={{ flexShrink: 0 }}
              />
            )}

            {composing && newRank === null && newInset}
          </Group>
        </ScrollArea>
      )}

      {/* Clone that follows the cursor, slightly tilted. */}
      {drag && dragged && (
        <ListStill
          list={dragged ?? undefined}
          shadow="xl"
          withNumber={withNumber}
          compactLabels={compactLabels}
          data-drag-clone="true"
          style={{
            position: "fixed",
            left: drag.x,
            top: drag.y,
            transform: "rotate(3deg)",
            zIndex: 400,
          }}
        />
      )}

      {cardDrag && draggedCard && (
        <Paper
          w={cardDrag.width}
          radius={CARD_RADIUS}
          p="xs"
          shadow="xl"
          data-card-clone="true"
          style={{
            position: "fixed",
            left: cardDrag.x,
            top: cardDrag.y,
            transform: "rotate(3deg)",
            pointerEvents: "none",
            zIndex: 400,
            ...separatorStyle(draggedCard, colors(listOf(draggedCard)?.color)),
          }}
        >
          <CardContent
            card={draggedCard}
            withNumber={withNumber}
            compactLabels={compactLabels}
            labels={labels}
          />
        </Paper>
      )}

      {celebrations.map((celebration) => (
        <CelebrationEffect
          key={celebration.key}
          effect={celebration.effect}
          column={celebration.column}
          card={celebration.card}
          onDone={() => setCelebrations((before) => before.filter((f) => f.key !== celebration.key))}
        />
      ))}

      <CardDrawer
        opened={openCard !== null}
        followed={openCard !== null && follows.card.includes(openCard.id)}
        onToggleFollow={() => {
          if (openCard) onToggleFollow("card", openCard.id);
        }}
        onClose={() => setOpenedCard(null)}
        card={openCard}
        labels={labels ?? []}
        users={users ?? []}
        boardId={boardId}
        onLabelsChanged={onLabelsChanged}
        onSaved={onListsChanged}
        readOnly={!rights.updateStatement}
      />

      {/* "Modifier" opens an input on the separator: focus must not
          return to the anchor, it would close it right away. */}
      {cardMenu && (
        <PointMenu
          position={cardMenu.position}
          onClose={() => setCardMenu(null)}
          returnFocus={false}
        >
          {/* Follow comes first, as in the card details. A separator has no
              details: there is nothing to follow in it. */}
          {!isSeparator(cardMenu.card) && (
            <>
              <Menu.Item
                leftSection={<IconEye size={16} />}
                rightSection={
                  follows.card.includes(cardMenu.card.id) ? <IconCheck size={14} /> : null
                }
                onClick={() => void onToggleFollow("card", cardMenu.card.id)}
                closeMenuOnClick={false}
              >
                Suivre
              </Menu.Item>
              <Menu.Divider />
            </>
          )}
          {/* Without the right to edit, the card details still open on click on
              the card, to be read. */}
          {rights.updateStatement && (
            <Menu.Item
              leftSection={<IconPencil size={16} />}
              onClick={() => editCard(cardMenu.card)}
            >
              Modifier
            </Menu.Item>
          )}
          {rights.add && (
            <Menu.Item
              leftSection={<IconCopyPlus size={16} />}
              onClick={() => void duplicateCard(cardMenu.card)}
            >
              Dupliquer
            </Menu.Item>
          )}
          {rights.canDelete && (
            <>
              <Menu.Divider />
              <Menu.Item
                color={RED}
                leftSection={<IconTrash size={16} />}
                onClick={() => setCardToDelete(cardMenu.card)}
              >
                Supprimer
              </Menu.Item>
            </>
          )}
        </PointMenu>
      )}

      <MoveOrCopyListModal
        opened={targetList !== null}
        onClose={() => setTargetList(null)}
        mode={targetList?.mode ?? "move"}
        list={targetList?.list ?? null}
        viewId={board?.view_id ?? null}
        onDone={onListsChanged}
      />

      <DeleteConfirmModal
        opened={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && deleteList(pendingDelete)}
        title="Supprimer la liste"
        message={
          <>
            Voulez-vous vraiment supprimer « {pendingDelete?.name} » ?
            {deletedCards > 0 && (
              <>
                {" "}
                <strong>
                  {deletedCards} carte{deletedCards > 1 ? "s" : ""}
                </strong>{" "}
                {deletedCards > 1 ? "seront supprimées" : "sera supprimée"}.
              </>
            )}
          </>
        }
      />

      <DeleteConfirmModal
        opened={listToEmpty !== null}
        onClose={() => setListToEmpty(null)}
        onConfirm={() => listToEmpty && deleteTasks(listToEmpty)}
        title="Supprimer les tâches"
        message={
          <>
            Voulez-vous vraiment supprimer{" "}
            <strong>
              {deletedTasks > 1
                ? `les ${deletedTasks} tâches`
                : "la tâche"}
            </strong>{" "}
            de « {listToEmpty?.name} » ? La liste et ses séparateurs restent en
            place.
          </>
        }
      />

      <DeleteConfirmModal
        opened={cardToDelete !== null}
        onClose={() => setCardToDelete(null)}
        onConfirm={() => cardToDelete && deleteCard(cardToDelete)}
        title={
          cardToDelete && isSeparator(cardToDelete)
            ? "Supprimer le séparateur"
            : "Supprimer la carte"
        }
        message={<>Voulez-vous vraiment supprimer « {cardToDelete?.text} » ?</>}
      />
    </Stack>
  );
}

// Drop placeholder: the moved list, recalled in full at 50%
// opacity. It is seen behind the copy that follows the pointer, where
// it will land.
interface PlaceholderProps {
  list: TaskList | undefined;
  withNumber: boolean;
  compactLabels: boolean;
}

function Placeholder({ list, withNumber, compactLabels }: PlaceholderProps) {
  // The dragged list may no longer exist (reload during the gesture):
  // the drop placeholder then has nothing to show.
  if (!list) return null;
  return (
    <ListStill
      list={list}
      withNumber={withNumber}
      compactLabels={compactLabels}
      data-drop-placeholder="true"
      style={{ opacity: 0.5 }}
    />
  );
}

// Drop placeholder for a card: same height as the moved card, so
// the list does not change size during the drag.
function CardPlaceholder({ height }: { height: number }) {
  return (
    <Paper
      h={height}
      radius={CARD_RADIUS}
      data-card-placeholder="true"
      style={{ backgroundColor: CARD_PLACEHOLDER_BG }}
    />
  );
}
