import {
  ActionIcon,
  Box,
  Group,
  Menu,
  ScrollArea,
  Paper,
  TextInput,
} from "@mantine/core";
import { IconCornerDownLeft } from "@tabler/icons-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { RED } from "../../themes/colors";
import EmptyPanel from "./EmptyPanel";
import type { ComponentType, MouseEvent, ReactNode } from "react";

// A row's height: the label and its edit field fit in it without frame or card.
export const ROW_HEIGHT = 34;

// The add row, slightly taller than the others: it is a field.
export const ADD_ROW_HEIGHT = ROW_HEIGHT + 6;

// The rows' inset on the left and right: Mantine's "xs" spacing.
export const ROW_PADDING = 10;

// Number of rows visible before the list scrolls within its frame, rather than
// occupying the whole height of the screen that hosts it. Each list can raise
// or lower this cap ("maxRows"). It is an exact multiple of a row's height, and
// the list has no inner inset: otherwise the last visible row would be cut off
// by the cap.

// Background and rule of Mantine's input fields: the list reads like a field,
// values are added and modified in it.
const FIELD_BG = "var(--mantine-color-default)";
const FIELD_LINE = "1px solid var(--mantine-color-default-border)";

// Background of the hovered row: one step above the field's background, to show
// which row the menu applies to.
const ROW_HOVER_BG = "var(--milo-field-hover)";

// Size of the Enter symbol at the end of the add row: that of the "+" of the
// add actions (themes/plus.ts), which it replaces here.
const ENTER_SIZE = 14;

// Thin scrollbar, flush against the frame's right edge.
const SCROLLBAR_SIZE = 2;

/**
 * A row menu action. "danger" puts it at the bottom, after a rule, in red:
 * deletion.
 */
export interface RowAction {
  label: string;
  icon: ComponentType<{ size?: number }>;
  onClick: () => void;
  danger?: boolean;
}

/**
 * A list row. Its actions (`actions`) are not displayed: they open on right
 * click, as a menu placed under the mouse — like the projects' one
 * (ProjectTable). The keyboard's "Menu" key opens it too, at the right end of
 * the row.
 *
 * The row tracks its hover and passes it to its content (`{(active) => …}`); it
 * stays "active" as long as its menu is open, otherwise the menu would float
 * without showing which row it applies to.
 */
interface RowProps {
  height?: number;
  /** The right inset, if it differs from the left one: see LookupManager. */
  paddingRight?: number;
  actions?: RowAction[];
  /** Either a content, or a function that receives its row's hover. */
  children: ReactNode | ((active: boolean) => ReactNode);
}

function Row({
  height = ROW_HEIGHT,
  paddingRight,
  actions,
  children,
}: RowProps) {
  const [hover, setHovering] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const active = hover || menu !== null;

  const openMenu = (e: MouseEvent<HTMLDivElement>) => {
    if (!actions?.length) return;
    e.preventDefault();
    // From the keyboard, the event has no position: the menu is placed at the
    // right end of the row.
    if (e.clientX === 0 && e.clientY === 0) {
      const r = e.currentTarget.getBoundingClientRect();
      setMenu({ x: r.right - ROW_PADDING, y: r.bottom });
    } else {
      setMenu({ x: e.clientX, y: e.clientY });
    }
  };

  const regularActions = actions?.filter((a) => !a.danger) ?? [];
  const dangers = actions?.filter((a) => a.danger) ?? [];
  const item = ({ label, icon: Icon, onClick, danger }: RowAction) => (
    <Menu.Item
      key={label}
      color={danger ? RED : undefined}
      leftSection={<Icon size={16} />}
      onClick={onClick}
    >
      {label}
    </Menu.Item>
  );

  return (
    <Group
      gap="xs"
      wrap="nowrap"
      h={height}
      px="xs"
      pr={paddingRight}
      // Never compressed: in a frame that is too short, rows keep their height
      // rather than being squashed.
      style={{
        flexShrink: 0,
        backgroundColor: active ? ROW_HOVER_BG : undefined,
      }}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onFocusCapture={() => setHovering(true)}
      onBlurCapture={() => setHovering(false)}
      onContextMenu={openMenu}
    >
      {typeof children === "function" ? children(active) : children}

      {/* The anchor, an invisible point in place of the click, is carried
          outside the window: in a modal, the transform of its content would
          skew the "fixed" position. */}
      {menu &&
        createPortal(
          <Menu
            opened
            onChange={(isOpen) => !isOpen && setMenu(null)}
            position="bottom-start"
            withinPortal
            shadow="md"
          >
            <Menu.Target>
              <div
                style={{
                  position: "fixed",
                  left: menu.x,
                  top: menu.y,
                  width: 1,
                  height: 1,
                }}
              />
            </Menu.Target>
            <Menu.Dropdown>
              {regularActions.map(item)}
              {regularActions.length > 0 && dangers.length > 0 && <Menu.Divider />}
              {dangers.map(item)}
            </Menu.Dropdown>
          </Menu>,
          document.body,
        )}
    </Group>
  );
}

/**
 * Inline-editable list, on an input field's background but without frame: tight
 * rows that scroll beyond fifteen, and an add row separated by a rule, outside
 * the scroll area so it stays visible.
 *
 * Used for companies and categories (LookupManager) as well as users
 * (UsersTab).
 *
 * `add` describes the add row: { placeholder, value, onChange, onSubmit,
 * onCancel, type, disabled, section }. "section" slides in before the field:
 * labels put their color choice there, milestones their percentage. At the end
 * of the row, the Enter key symbol says how to validate.
 */
/** The add row, at the bottom of the list. */
export interface AddRow {
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  type?: string;
  disabled?: boolean;
  /** Slides in before the field: labels put their color there. */
  section?: ReactNode;
  /**
   * Slides in after the field, before Enter: the event of a default answer, in
   * the place its own occupies on the rows.
   */
  end?: ReactNode;
}

interface ListItemsProps {
  children?: ReactNode;
  isEmpty?: boolean;
  /** Without it, the list has no empty state: the accounts one always has one. */
  emptyIcon?: ComponentType<{ size?: number }>;
  emptyText?: ReactNode;
  /**
   * The add row: a text field validated by Enter (AddRow), or a field supplied
   * as is — the directory search, for instance, which adds as soon as one is
   * chosen.
   */
  add?: AddRow | { input: ReactNode };
  maxRows?: number;
  /** Height reserved even when the list is shorter, in rows. */
  minRows?: number;
  rowHeight?: number;
}

export default function ListItems({
  children,
  isEmpty,
  emptyIcon,
  emptyText,
  add,
  maxRows = 15,
  minRows,
  // All rows of a list have the same height: the users' one is taller, its cap
  // follows.
  rowHeight = ROW_HEIGHT,
}: ListItemsProps) {
  return (
    // An input field's background, without frame: only a rule separates the add
    // row from the others.
    <Paper
      radius="sm"
      style={{ backgroundColor: FIELD_BG, overflow: "hidden", flexShrink: 0 }}
    >
      {/* "Autosize" and not a plain area: bounded by a simple "max-height", it
          did not scroll — its inner area, 100% of a height that was not fixed,
          grew with the content. The bar runs along the rows, on the right, as
          soon as they exceed the cap. */}
      <ScrollArea.Autosize
        mah={maxRows * rowHeight}
        mih={minRows && minRows * rowHeight}
        type="auto"
        scrollbars="y"
        scrollbarSize={SCROLLBAR_SIZE}
      >
        {isEmpty && emptyIcon ? (
          // Empty list: the same prompt as the application's empty screens,
          // without action — the add is done in the row just below.
          <Box
            py="md"
            mih={minRows && minRows * rowHeight}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <EmptyPanel
              icon={emptyIcon}
              message={emptyText}
              size="sm"
              fill={false}
            />
          </Box>
        ) : (
          children
        )}
      </ScrollArea.Autosize>

      {add && (
        <Group
          // The add row takes the other rows' spacing: what it carries lines up
          // in the same columns.
          gap="xs"
          wrap="nowrap"
          h={ADD_ROW_HEIGHT}
          px={ROW_PADDING}
          style={{ borderTop: FIELD_LINE }}
        >
          {"input" in add ? (
            add.input
          ) : (
            <>
              {add.section}
              <TextInput
                placeholder={add.placeholder}
                type={add.type}
                value={add.value}
                onChange={(e) => add.onChange(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    add.onSubmit();
                  }
                  if (e.key === "Escape") add.onCancel?.();
                }}
                variant="unstyled"
                size="sm"
                style={{ flex: 1, minWidth: 0 }}
                disabled={add.disabled}
                aria-label={add.placeholder}
              />
              {add.end}
              {/* At the end, the key that validates: Enter adds. It can also be
                  clicked, for those who prefer the mouse. */}
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                onClick={add.onSubmit}
                disabled={add.disabled}
                style={{ flexShrink: 0, opacity: 0.5 }}
                aria-label={`Ajouter (${add.placeholder})`}
              >
                <IconCornerDownLeft size={ENTER_SIZE} />
              </ActionIcon>
            </>
          )}
        </Group>
      )}
    </Paper>
  );
}

ListItems.Row = Row;
