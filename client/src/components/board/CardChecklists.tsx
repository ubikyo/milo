import {
  Group,
  Input,
  Box,
  Popover,
  Progress,
  Stack,
  Switch,
  Text,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import { DatePicker } from "@mantine/dates";
import {
  IconCalendar,
  IconUserPlus,
} from "@tabler/icons-react";
import dayjs from "dayjs";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { FIELD_ICON } from "../../themes/colors";
import { ACTOR_GAP, PersonAvatar } from "../ui/ActorAvatars";
import ActorPicker from "../ui/ActorPicker";
import DeleteConfirmModal from "../ui/DeleteConfirmModal";
import { DragHandle, InsertLine, useDraggableStack } from "../ui/DraggableStack";
import {
  ROUNDING,
  ROW_BACKGROUND,
  ROW_INSET,
  NAME_INSET,
  ListFooter,
  RowCheckbox,
  rowStyle,
  useRowSelection,
} from "../ui/DrawerRows";
import { errorMessage } from "../../lib/errors";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import type {
  Checklist as ChecklistType,
  ChecklistItemInput,
  ChecklistItem as Element,
  Id,
  PublicUser,
} from "@milo/shared";

// Diameter of the avatars placed on an item: smaller than those on the
// card, since the row is already full.
const ITEM_AVATAR_SIZE = 22;

// The date is styled like a card label (CardLabel): a barely rounded
// rectangle, with bold, tight text. The green is that of a checklist's
// progress and of a completed card's badge.
const DATE_TAG = {
  height: 20,
  borderRadius: 4,
  padding: "0 8px",
  fontSize: 11,
  fontWeight: 600,
  lineHeight: 1,
  whiteSpace: "nowrap" as const,
  backgroundColor: "var(--mantine-color-teal-filled)",
  color: "var(--mantine-color-white)",
};

// Height of the progress bar, and the width reserved for it in the
// header: it must not shift the title from one checklist to the next.
const PROGRESS_HEIGHT = 6;
const PROGRESS_WIDTH = 90;

// Gap between two rows of a checklist — the drawer background shows
// through, as between the categories and labels of a widget drawer —, and
// between two checklists.
const ITEM_GAP = 1;
const CHECKLIST_GAP = 16;

// Height of the inputs placed on an already written row — a checklist's
// title, an item's label. It matches the names of the categories and
// labels in a widget drawer ("xs"): rows have the same height from one
// drawer to the next, whether read or edited.
const INLINE_HEIGHT = 30;

// The height of a row: the input, plus the space the row keeps above
// and below it.
const ROW_HEIGHT = INLINE_HEIGHT + 2 * ROW_INSET;

// A checklist row: that of a widget drawer, but with as much space on the
// right as on the left — it ends with a date or a percentage, not a
// field flush against the edge.
const checklistRowStyle = (rank: number, total: number, held: boolean): CSSProperties => ({
  ...rowStyle(rank, total, held),
  paddingRight: NAME_INSET,
});

// A checklist header stands out from its items: a darker neutral gray on
// light; on dark, one step further from the drawer background.
const HEADER_BACKGROUND = "light-dark(#dcdcdc, var(--mantine-color-dark-5))";

// These inputs have no frame, not even the blue Mantine adds on focus:
// we are only continuing to read the same row, it must not get framed
// on click. This is the convention for board cards and lists.
const inlineInput = (extra?: CSSProperties) => ({
  input: {
    borderRadius: `var(--mantine-radius-${ROUNDING})`,
    "--input-bd": "transparent",
    "--input-bd-focus": "transparent",
    height: INLINE_HEIGHT,
    minHeight: INLINE_HEIGHT,
    ...extra,
  },
});

// A date is stored as "YYYY-MM-DD" and displayed in French format.
const showDate = (value: string | null | undefined): string | null =>
  value ? dayjs(value).format("DD/MM/YYYY") : null;

// How far along a checklist is, as a percentage. When empty, it is at
// zero: no checked box is not a finished piece of work.
const progress = (items: Element[]): number => {
  if (!items || items.length === 0) return 0;
  return Math.round((items.filter((i) => i.done).length / items.length) * 100);
};

// An item's due date: a badge that opens a calendar. Without a date,
// only the icon remains, discreet; with one, the day replaces the icon
// in a green label, easy to spot without reading.
interface ItemDateProps {
  value: string;
  onChange: (value: string) => void;
}

function ItemDate({ value, onChange }: ItemDateProps) {
  const [opened, setOpened] = useState(false);
  const text = showDate(value);

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="bottom-end"
      // Like the other lists in the drawer: left in place, it escapes the
      // drawer's focus trap; "fixed" keeps it out of the scrolling.
      withinPortal={false}
      floatingStrategy="fixed"
      shadow="md"
    >
      <Popover.Target>
        <UnstyledButton
          onClick={() => setOpened((o) => !o)}
          c={text ? undefined : FIELD_ICON}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            flexShrink: 0,
            ...(text ? DATE_TAG : null),
          }}
          aria-label="Date de l'élément"
        >
          {text ?? <IconCalendar size={16} />}
        </UnstyledButton>
      </Popover.Target>
      <Popover.Dropdown p="xs">
        <Stack gap="xs">
          <DatePicker
            value={value || null}
            onChange={(date) => {
              onChange(date || "");
              setOpened(false);
            }}
            // Clicking the selected date again removes it: it is the inverse gesture.
            allowDeselect
          />
          {value && (
            <UnstyledButton
              onClick={() => {
                onChange("");
                setOpened(false);
              }}
            >
              <Text size="xs" c="dimmed">
                Retirer la date
              </Text>
            </UnstyledButton>
          )}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}

// An item's members: their avatars, and the application-wide actor
// picker — favorites, search in Milo and in the directory — which opens
// on click. Adding and removing happen in the same place, as for a card's
// members.
interface ItemMembersProps {
  members: Element["members"];
  users: PublicUser[];
  onChange: (ids: number[]) => void;
}

function ItemMembers({ members, users, onChange }: ItemMembersProps) {
  const chosen = members || [];

  return (
    <ActorPicker
      label="Acteurs de l'élément"
      users={users}
      value={chosen.map((m) => String(m.id))}
      onChange={(ids) => onChange(ids.map(Number))}
      position="bottom-end"
      target={
        chosen.length === 0 ? (
          <Text span c={FIELD_ICON} style={{ display: "inline-flex" }}>
            <IconUserPlus size={16} />
          </Text>
        ) : (
          <Group gap={ACTOR_GAP} wrap="nowrap">
            {chosen.map((m) => (
              <span key={m.id} style={{ display: "inline-flex" }} aria-label={m.name}>
                <PersonAvatar person={m} size={ITEM_AVATAR_SIZE} />
              </span>
            ))}
          </Group>
        )
      }
    />
  );
}

// A checklist row: the handle to drag it, the selection box, the switch that
// marks it done, the label that is edited on click, the members and the date.
interface ChecklistItemProps {
  item: Element;
  users: PublicUser[];
  /** The row's style in the stack: its background, its rounded ends. */
  row: CSSProperties;
  /** Actors removed from the card, not yet saved: they are no longer shown. */
  hidden: string[];
  /**
   * True for the item just added: it opens in edit mode, with the cursor
   * inside.
   */
  autoEdit: boolean;
  onEditDone?: () => void;
  onPointerDown: (event: ReactPointerEvent) => void;
  onToggle: (done: boolean) => void;
  onRename: (text: string) => void;
  onDate: (date: string) => void;
  onMembers: (ids: number[]) => void;
  /** Checked for deletion — or its whole checklist is ("locked"). */
  checked: boolean;
  checkLocked: boolean;
  onCheck: (checked: boolean) => void;
}

function ChecklistItem({
  item,
  users,
  row,
  hidden,
  // True for the item just added: it opens in edit mode, with the cursor
  // inside. Without this, adding a row would give an "Sans libellé" that
  // would still have to be clicked to be written.
  autoEdit,
  onEditDone,
  onPointerDown,
  onToggle,
  onRename,
  onDate,
  onMembers,
  checked,
  checkLocked,
  onCheck,
}: ChecklistItemProps) {
  const [edited, setEdited] = useState<string | null>(autoEdit ? item.text : null);

  useEffect(() => {
    if (autoEdit) setEdited(item.text);
    // Depends only on the signal: the text follows the input, not the reverse.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoEdit]);

  const closeInput = () => {
    setEdited(null);
    onEditDone?.();
  };

  const validate = () => {
    const text = (edited ?? "").trim();
    closeInput();
    if (text && text !== item.text) onRename(text);
  };

  return (
    <Group
      gap="xs"
      wrap="nowrap"
      align="center"
      data-checklist-item={item.id}
      style={{ ...row, minHeight: ROW_HEIGHT }}
    >
      {/* Only the handle moves the row: everything else already responds to
          click, a row draggable from end to end would get in the way. */}
      <DragHandle onPointerDown={onPointerDown} label="Glisser pour réordonner" />

      {/* Within a checked checklist, the item goes with it: its box shows it,
          and cannot be unchecked on its own. */}
      <RowCheckbox
        label={`Sélectionner ${item.text || "l'élément"}`}
        checked={checked || checkLocked}
        onChange={onCheck}
        disabled={checkLocked}
        afterHandle
        gap="xs"
      />

      {/* Done or not: a switch, so it is not mistaken for the selection box. */}
      <Switch
        checked={Boolean(item.done)}
        onChange={(e) => onToggle(e.currentTarget.checked)}
        size="xs"
        color="teal"
        styles={{ track: { cursor: "pointer" } }}
        aria-label={`${item.text || "Élément de checklist"} : fait`}
      />

      {edited === null ? (
        <Text
          size="sm"
          onClick={() => setEdited(item.text)}
          // When checked, the label is struck through and faded: the row is done.
          td={item.done ? "line-through" : undefined}
          c={item.done ? "dimmed" : undefined}
          style={{ flex: 1, minWidth: 0, cursor: "pointer", wordBreak: "break-word" }}
        >
          {item.text || <Text span c="dimmed" size="sm" fs="italic">Sans libellé</Text>}
        </Text>
      ) : (
        <TextInput
          value={edited}
          onChange={(e) => setEdited(e.currentTarget.value)}
          onBlur={validate}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              validate();
            }
            if (e.key === "Escape") closeInput();
          }}
          size="sm"
          autoFocus
          placeholder="Libellé de l'élément"
          styles={inlineInput()}
          style={{ flex: 1, minWidth: 0 }}
          aria-label="Modifier l'élément"
        />
      )}

      <ItemMembers
        members={(item.members || []).filter((m) => !hidden.includes(String(m.id)))}
        users={users}
        onChange={onMembers}
      />
      <ItemDate value={item.due_date} onChange={onDate} />
    </Group>
  );
}

// A checklist: its header — editable title, progress —, its items
// and the link that adds one. It is always expanded. The header's box selects
// the whole checklist, the items' boxes the items: the button that replaces
// "Ajouter" deletes them.
interface ChecklistProps {
  checklist: ChecklistType;
  users: PublicUser[];
  onChanged: () => void | Promise<void>;
  onError?: (message: string) => void;
  dragged: boolean;
  onHandlePointerDown: (event: ReactPointerEvent) => void;
  onMembers?: (ids: number[]) => void;
  hidden: string[];
}

function Checklist({
  checklist,
  users,
  onChanged,
  onError,
  dragged,
  onHandlePointerDown,
  onMembers,
  hidden,
}: ChecklistProps) {
  /** The title being edited; "null" while it is not being modified. */
  const [title, setTitle] = useState<string | null>(null);
  // The item just added: it opens in edit mode.
  const [newItem, setNewItem] = useState<Id | null>(null);
  /** The whole checklist is checked for deletion. */
  const [allChecked, setAllChecked] = useState(false);
  /** The deletion awaiting confirmation: the checklist, or the checked items. */
  const [confirming, setConfirming] = useState(false);

  const items = checklist.items || [];
  const selection = useRowSelection(items.map((i) => i.id));
  const checkedItems = items.filter((i) => selection.isChecked(i.id));
  // The header opens the stack, the items follow it.
  const rows = items.length + 1;
  const percentage = progress(items);

  // Everything sent to the server goes through here: a failure is shown on
  // screen, instead of leaving the gesture with no apparent effect.
  const act = async (action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (e) {
      onError?.(errorMessage(e));
    }
  };

  // Items are dragged among themselves, within their checklist.
  const { zoneRef, drag, onPointerDown } = useDraggableStack({
    ids: items.map((i) => i.id),
    selector: "[data-checklist-item]",
    onReorder: (order) =>
      act(async () => {
        await api.reorderChecklistItems(checklist.id, order);
        await onChanged();
      }),
  });

  const validateTitle = async () => {
    const name = (title ?? "").trim();
    setTitle(null);
    if (!name || name === checklist.title) return;
    await act(async () => {
      await api.updateChecklist(checklist.id, { title: name });
      await onChanged();
    });
  };

  // The row is born without a label and opens at once in edit mode: it is
  // written right after the click, without having to reopen it.
  const addItem = () =>
    act(async () => {
      const created = await api.createChecklistItem(checklist.id);
      await onChanged();
      setNewItem(created.id);
    });

  const editItem = (item: Element, data: ChecklistItemInput) =>
    act(async () => {
      await api.updateChecklistItem(item.id, data);
      await onChanged();
    });

  /** Deletes what is checked: the whole checklist, or its checked items. */
  const deleteChecked = () => {
    setConfirming(false);
    return act(async () => {
      if (allChecked) {
        await api.deleteChecklist(checklist.id);
      } else {
        await Promise.all(checkedItems.map((i) => api.deleteChecklistItem(i.id)));
        selection.reset();
      }
      await onChanged();
    });
  };

  return (
    // A stack of rows on the drawer's gray background, like the categories and
    // labels in a widget's settings: the header first, the items below,
    // "Ajouter" at the end.
    <Box data-checklist={checklist.id} style={{ opacity: dragged ? 0.4 : 1 }}>
      <Stack gap={ITEM_GAP} ref={zoneRef}>
        {/* Header: the handle, the title, the progress. */}
        <Group
          gap="xs"
          wrap="nowrap"
          align="center"
          style={{ ...checklistRowStyle(0, rows, false), backgroundColor: HEADER_BACKGROUND }}
        >
          {/* The handle opens the header: it is what reorders the
              checklists among themselves. */}
          <DragHandle
            onPointerDown={onHandlePointerDown}
            label="Glisser pour réordonner la checklist"
          />
          <RowCheckbox
            label={`Sélectionner la checklist ${checklist.title}`}
            checked={allChecked}
            onChange={setAllChecked}
            afterHandle
            gap="xs"
          />
          {title === null ? (
            <Text
              fw={600}
              size="sm"
              onClick={() => setTitle(checklist.title)}
              style={{
                flex: 1,
                minWidth: 0,
                cursor: "pointer",
                wordBreak: "break-word",
                // The same height as the input that replaces it: the header does not
                // jump on click.
                lineHeight: `${INLINE_HEIGHT}px`,
              }}
            >
              {checklist.title}
            </Text>
          ) : (
            <TextInput
              value={title}
              onChange={(e) => setTitle(e.currentTarget.value)}
              onBlur={validateTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  validateTitle();
                }
                if (e.key === "Escape") setTitle(null);
              }}
              size="sm"
              autoFocus
              // The title keeps its weight in edit mode: nothing changes to the eye
              // except the cursor that lands in it.
              styles={inlineInput({ fontWeight: 600 })}
              style={{ flex: 1, minWidth: 0 }}
              aria-label="Renommer la checklist"
            />
          )}

          {/* Progress is readable at a glance, without scanning the
              rows. */}
          <Group gap={6} wrap="nowrap" style={{ flexShrink: 0 }}>
            <Progress
              value={percentage}
              color="teal"
              size={PROGRESS_HEIGHT}
              radius="xl"
              w={PROGRESS_WIDTH}
              // The bar's background is that of the checklist's items.
              styles={{ root: { backgroundColor: ROW_BACKGROUND } }}
            />
            <Text size="xs" c="dimmed" w={34} ta="right">
              {percentage}%
            </Text>
          </Group>
        </Group>

        {items.map((item, index) => (
          <div key={item.id}>
            {drag?.target === index && <InsertLine gap={ITEM_GAP} />}
            <ChecklistItem
              item={item}
              users={users}
              row={checklistRowStyle(index + 1, rows, drag?.id === item.id)}
              hidden={hidden}
              autoEdit={newItem === item.id}
              onEditDone={() => setNewItem(null)}
              onPointerDown={onPointerDown(item.id, index)}
              onToggle={(done) => editItem(item, { done })}
              onRename={(text) => editItem(item, { text })}
              onDate={(due_date) => editItem(item, { due_date })}
              onMembers={(member_ids) => {
                onMembers?.(member_ids);
                return editItem(item, { member_ids });
              }}
              checked={selection.isChecked(item.id)}
              checkLocked={allChecked}
              onCheck={(on) => selection.toggle(item.id, on)}
            />
          </div>
        ))}
        {drag && drag.target >= items.length && <InsertLine gap={ITEM_GAP} />}
      </Stack>

      {/* As close as possible to the stack it extends. */}
      <ListFooter
        addLabel="Ajouter un élément"
        onAdd={addItem}
        checkedCount={allChecked ? 1 : checkedItems.length}
        onDeleteChecked={() => setConfirming(true)}
      />

      <DeleteConfirmModal
        opened={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={deleteChecked}
        title={
          allChecked
            ? "Supprimer la checklist"
            : checkedItems.length > 1
              ? `Supprimer ${checkedItems.length} éléments`
              : "Supprimer l'élément"
        }
        message={
          allChecked ? (
            <>
              Voulez-vous vraiment supprimer « {checklist.title} » ?
              {items.length > 0 && (
                <>
                  {" "}
                  <strong>
                    {items.length} élément{items.length > 1 ? "s" : ""}
                  </strong>{" "}
                  {items.length > 1 ? "seront supprimés" : "sera supprimé"}.
                </>
              )}
            </>
          ) : checkedItems.length > 1 ? (
            <>Voulez-vous vraiment supprimer ces {checkedItems.length} éléments ?</>
          ) : (
            <>Voulez-vous vraiment supprimer « {checkedItems[0]?.text || "cet élément"} » ?</>
          )
        }
      />
    </Box>
  );
}

/**
 * A card's checklists, at the end of its details. They are added from the
 * drawer's "Actions" menu, and everything is saved as you go: a switched
 * item, a validated label or a moved row is sent to the server at once,
 * without waiting for "Enregistrer".
 */
interface CardChecklistsProps {
  cardId: Id;
  checklists: ChecklistType[];
  users: PublicUser[];
  onChanged: () => void | Promise<void>;
  onError?: (message: string) => void;
  /**
   * The people placed on an item: the card details add to its actors
   * those not yet in it — a part of a task is not entrusted to someone
   * who has no part in it.
   */
  onMembers?: (ids: number[]) => void;
  /**
   * Actors just removed from the card. The server removes them from the
   * items on "Sauvegarder"; until then, the items already no longer show
   * them.
   */
  hidden?: string[];
}

export default function CardChecklists({
  cardId,
  checklists,
  users,
  onChanged,
  onError,
  onMembers,
  hidden = [],
}: CardChecklistsProps) {
  const currentChecklists = checklists || [];

  // Checklists are dragged among themselves, by their header's handle.
  const { zoneRef, drag, onPointerDown } = useDraggableStack({
    ids: currentChecklists.map((c) => c.id),
    selector: "[data-checklist]",
    onReorder: async (order) => {
      try {
        await api.reorderChecklists(cardId, order);
        await onChanged();
      } catch (e) {
        onError?.(errorMessage(e));
      }
    },
  });

  if (currentChecklists.length === 0) return null;

  return (
    // The block carries its label like the other card fields — the title,
    // the description, the number —, and disappears with them when the card
    // has no checklist.
    <Input.Wrapper label="Checklist">
      <Stack gap={CHECKLIST_GAP} ref={zoneRef}>
        {currentChecklists.map((checklist, index) => (
          <div key={checklist.id}>
            {drag?.target === index && (
              <InsertLine gap={CHECKLIST_GAP} atEdge={index === 0} />
            )}
            <Checklist
              checklist={checklist}
              users={users}
              onChanged={onChanged}
              onError={onError}
              dragged={drag?.id === checklist.id}
              onHandlePointerDown={onPointerDown(checklist.id, index)}
              onMembers={onMembers}
              hidden={hidden}
            />
          </div>
        ))}
        {drag && drag.target >= currentChecklists.length && <InsertLine gap={CHECKLIST_GAP} />}
      </Stack>
    </Input.Wrapper>
  );
}
