import {
  ActionIcon,
  Checkbox,
  Group,
  Input,
  Popover,
  ScrollArea,
  Stack,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { PLUS_SIZE } from "../../themes/plus";
import type { FloatingPosition } from "@mantine/core";
import type { ReactNode } from "react";

// The time left for the second click of a double click before the first one
// checks the option.
const DOUBLE_CLICK_DELAY = 250;

/** The minimum an option must carry: enough to identify and name it. */
export interface ChipOption {
  id: number | string;
  name: string;
}

// Beyond this number of rows, the list scrolls rather than running to the
// bottom of the screen. Rows do not all have the same height — a name alone, a
// name and its address: the height is measured on the tenth, marked like the
// others with "data-row".
const VISIBLE_ROWS = 10;

/**
 * Multiple choice shown as chips: a title, under it what is retained,
 * then a "+". The "+" and any chip already placed open the
 * same list, where you check and uncheck. The list aligns with the left edge of the
 * title, not the button that opens it: it always starts from the same point,
 * whatever the number of chips.
 *
 * `options`: [{ id, ... }], `value`: the retained identifiers, as strings.
 * `render` draws an option in the list. `renderChip` draws it once
 * retained, when it shows differently there: a member only keeps its
 * bubble there, whereas the list must name the people.
 */
interface ChipPickerProps<T extends ChipOption> {
  label: string;
  options: T[];
  /** The retained identifiers, as strings. */
  value: string[];
  onChange: (value: string[]) => void;
  render: (option: T) => ReactNode;
  renderChip?: (option: T) => ReactNode;
  emptyText?: string;
  chipHeight?: number;
  chipGap?: number;
  footer?: ReactNode;
  /**
   * Rows added under the options, within their scroll: the people
   * found in the directory. Each carries "data-row" to be counted.
   */
  listFooter?: ReactNode;
  onOptionClick?: (option: T) => void;
  fullWidthOptions?: boolean;
  plusRadius?: string | number;
  onClose?: () => void;
  closeBlocked?: boolean;
  /**
   * As long as this is true, Escape leaves the list open: it belongs to an
   * input in progress, which it cancels.
   */
  escapeBlocked?: boolean;
  /**
   * Chips placed in front of the others, which cannot be chosen: a
   * fact rather than a choice — the sender of a request received by e-mail.
   */
  leadingChips?: ReactNode;
  /**
   * What the list shows, when it is not all the options: a list
   * filtered by a search, or reordered. The chips, for their part, are always read
   * from `options` — a retained option does not disappear because the
   * search rules it out.
   */
  listOptions?: T[];
  /** Placed above the list, outside its scroll: a search field. */
  header?: ReactNode;
  /** The list's width, in pixels. */
  dropdownWidth?: number;
  /** A border under each option: two-level rows read better with it. */
  separated?: boolean;
  /**
   * Replaces the title, chips and "+": a compact trigger, for
   * an already full row — the members of a checklist item. The title
   * then only serves to name it.
   */
  target?: ReactNode;
  /** Where the list opens; under the title's left edge by default. */
  position?: FloatingPosition;
  /**
   * The list's height limit, in pixels, past which it scrolls. Without it,
   * the list shows ten rows.
   */
  listMaxHeight?: number;
  /**
   * Draws the list itself, in place of the options' rows: the labels, gathered
   * in their groups. The chips are still read from `options`.
   */
  list?: ReactNode;
}

export default function ChipPicker<T extends ChipOption>({
  label,
  options,
  value,
  onChange,
  render,
  renderChip = render,
  emptyText,
  // Height of the chips: the "+" aligns with it, so the row is of
  // a piece.
  chipHeight = 22,
  // Gap between two neighboring chips, in pixels. Member bubbles
  // are tight; labels, which carry text, breathe more.
  chipGap = 6,
  // Placed under the list, outside its scroll: labels put
  // what is needed to add one there.
  footer,
  listFooter,
  // If provided, clicking an option does this instead of checking it; the checkbox
  // keeps selecting. Labels are edited this way.
  onOptionClick,
  // The option then takes the whole width of the list.
  fullWidthOptions = false,
  // The "+" takes the shape of what it adds: round for bubbles, with barely
  // broken corners for labels.
  plusRadius = "xl",
  // Called when the list closes. What it contained disappears with
  // it: an input in progress no longer has a chance to conclude, so it is
  // validated here.
  onClose,
  // As long as this is true, the list refuses to close. A confirmation
  // modal opened on top is an "outside" click: without this, the
  // list would go away, and you would return to the card once the modal
  // is closed.
  closeBlocked = false,
  escapeBlocked = false,
  leadingChips,
  listOptions = options,
  header,
  dropdownWidth = 260,
  separated = false,
  target,
  position = "bottom-start",
  listMaxHeight,
  list,
}: ChipPickerProps<T>) {
  // When separated, the options run from edge to edge of the list, and their
  // border too; the last one has none — there is nothing to separate below.
  const rule = (rank: number) =>
    separated && rank < listOptions.length - 1
      ? { borderBottom: "1px solid var(--mantine-color-default-border)" }
      : undefined;
  const SEPARATED_INSET = 10;
  const [opened, setOpened] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const [maxHeight, setMaxHeight] = useState<number | undefined>(undefined);

  // The open list is measured on every render: a search, a response from the
  // directory changes its rows. Before being painted, so that it never
  // appears fully unrolled. With no dependencies, on purpose: the measurement does not
  // move with the height set, so the comparison stops the loop on the
  // second pass.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const rows = content.querySelectorAll("[data-row]");
    const height =
      rows.length > VISIBLE_ROWS
        ? Math.ceil(
            rows[VISIBLE_ROWS - 1]!.getBoundingClientRect().bottom -
              content.getBoundingClientRect().top,
          )
        : undefined;
    if (height !== maxHeight) setMaxHeight(height);
  });

  const toggleOpen = (isOpen: boolean) => {
    if (!isOpen && closeBlocked) return;
    setOpened(isOpen);
    if (!isOpen) onClose?.();
  };

  const chosen = value
    .map((id) => options.find((o) => String(o.id) === String(id)))
    .filter((o): o is T => Boolean(o));

  // A click on an option with its own role waits to know whether it is the first
  // of a double click: otherwise, opening the option would check it in passing.
  const pendingClick = useRef<ReturnType<typeof setTimeout> | null>(null);
  const forgetClick = () => {
    if (pendingClick.current) clearTimeout(pendingClick.current);
    pendingClick.current = null;
  };
  useEffect(() => forgetClick, []);

  const toggle = (id: number | string) => {
    const key = String(id);
    onChange(
      value.includes(key) ? value.filter((v) => v !== key) : [...value, key],
    );
  };

  return (
    <Popover
      opened={opened}
      onChange={toggleOpen}
      position={position}
      // No portal: this choice opens inside a drawer, whose focus trap
      // does not yield control to what has moved outside of it — an input
      // field placed in the list could never have been filled. Left in
      // place, it is properly inside the drawer; "fixed" keeps it out of reach
      // of the surrounding scroll.
      withinPortal={false}
      closeOnEscape={!escapeBlocked}
      floatingStrategy="fixed"
      shadow="md"
      // The anchor is the whole block: the list thus drops under the title.
      width={dropdownWidth}
    >
      <Popover.Target>
        {target ? (
          <UnstyledButton
            onClick={() => toggleOpen(!opened)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              flexShrink: 0,
            }}
            aria-label={label}
          >
            {target}
          </UnstyledButton>
        ) : (
          // The column bounds the width: the chips line up in it, and
          // wrap when room runs out. It does not extend
          // beyond them: a click on the empty space to their right is an outside
          // click, which closes the list — the anchor never is one.
          // The title and the space between chips close it too.
          <div
            style={{ minWidth: 0, width: "fit-content", maxWidth: "100%" }}
            onClick={(e) => {
              if (opened && !(e.target as Element).closest("button"))
                toggleOpen(false);
            }}
          >
            <Input.Label>{label}</Input.Label>
            <Group gap={chipGap} align="center" wrap="wrap">
              {leadingChips}
              {chosen.map((option) => (
                // Clicking a chip reopens the same list: you add and
                // remove in the same place.
                <UnstyledButton
                  key={option.id}
                  onClick={() => toggleOpen(!opened)}
                  // Never compressed: too cramped, the chip drops to the
                  // next line rather than being squashed.
                  style={{
                    display: "inline-flex",
                    maxWidth: "100%",
                    flexShrink: 0,
                  }}
                >
                  {renderChip(option)}
                </UnstyledButton>
              ))}
              <ActionIcon
                variant="default"
                size={chipHeight}
                radius={plusRadius}
                style={{ flexShrink: 0 }}
                onClick={() => toggleOpen(!opened)}
                aria-label={`Choisir : ${label}`}
              >
                <IconPlus size={PLUS_SIZE} />
              </ActionIcon>
            </Group>
          </div>
        )}
      </Popover.Target>

      <Popover.Dropdown p={separated ? 0 : 6}>
        {/* When separated, the rows are also separated from the search: a border
            from edge to edge under the header. */}
        {separated
          ? header && (
              <div
                style={{
                  padding: 6,
                  borderBottom: "1px solid var(--mantine-color-default-border)",
                }}
              >
                {header}
              </div>
            )
          : header}
        {/* An empty text says nothing: the room goes to what follows the list. */}
        {!list && listOptions.length === 0 && emptyText && (
          <Text size="sm" c="dimmed" p="xs">
            {emptyText}
          </Text>
        )}
        {/* The thin bar of the application's other lists (ListItems). */}
        <ScrollArea.Autosize
          mah={listMaxHeight ?? maxHeight}
          type="auto"
          scrollbars="y"
          scrollbarSize={2}
          // A scroll area's content usually widens to its
          // text ("min-width: min-content"): a long address pushed
          // the end of the row — the directory origin — out of the list.
          // Held to its width, it truncates.
          styles={{ content: { display: "block", minWidth: 0 } }}
          // A list drawn by the caller runs to the dropdown's edges, so its bar
          // sits against the border, as in the separated lists (ActorPicker).
          mx={list && !separated ? -6 : undefined}
        >
          <div ref={contentRef} style={list && !separated ? { padding: "0 6px" } : undefined}>
            {list}
            {!list && listOptions.length > 0 && (
              <Stack gap={separated ? 0 : 2}>
                {listOptions.map((option, rank) =>
                  // Two layouts. Without its own click role, the element is
                  // the checkbox's label: clicking either checks. With
                  // its own role (labels are edited), the element lives
                  // beside the checkbox and keeps its own clicks — an input
                  // field housed in a checkbox label could be neither
                  // filled nor selected.
                  onOptionClick ? (
                    <Group
                      key={option.id}
                      gap={8}
                      wrap="nowrap"
                      align="center"
                      px={separated ? SEPARATED_INSET : 4}
                      py={separated ? 8 : 4}
                      style={rule(rank)}
                      data-row
                    >
                      <Checkbox
                        checked={value.includes(String(option.id))}
                        onChange={() => toggle(option.id)}
                        size="xs"
                        styles={{ input: { cursor: "pointer" } }}
                        aria-label={option.name}
                      />
                      {/* A click checks, as on the checkbox; a double click
                          opens the own role without checking anything. */}
                      <div
                        onClick={(e) => {
                          forgetClick();
                          if (e.detail > 1) return;
                          pendingClick.current = setTimeout(() => {
                            pendingClick.current = null;
                            toggle(option.id);
                          }, DOUBLE_CLICK_DELAY);
                        }}
                        onDoubleClick={() => {
                          forgetClick();
                          onOptionClick(option);
                        }}
                        style={{
                          flex: fullWidthOptions ? 1 : undefined,
                          minWidth: 0,
                        }}
                      >
                        {render(option)}
                      </div>
                    </Group>
                  ) : (
                    <Checkbox
                      key={option.id}
                      checked={value.includes(String(option.id))}
                      onChange={() => toggle(option.id)}
                      label={render(option)}
                      size="xs"
                      styles={{
                        body: { alignItems: "center", width: "100%" },
                        labelWrapper: {
                          minWidth: 0,
                          flex: fullWidthOptions ? 1 : undefined,
                        },
                        label: {
                          cursor: "pointer",
                          paddingLeft: 8,
                          minWidth: 0,
                        },
                        input: { cursor: "pointer" },
                      }}
                      px={separated ? SEPARATED_INSET : 4}
                      py={separated ? 8 : 4}
                      style={rule(rank)}
                      // The rest of the attributes goes to the checkbox itself: the
                      // row mark is placed on its container.
                      wrapperProps={{ "data-row": true }}
                    />
                  ),
                )}
              </Stack>
            )}
            {listFooter}
          </div>
        </ScrollArea.Autosize>

        {footer}
      </Popover.Dropdown>
    </Popover>
  );
}
