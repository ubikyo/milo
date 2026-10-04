import { Button, Divider, Popover, Text } from "@mantine/core";
import { IconChevronDown } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties, MouseEvent } from "react";
import { NEUTRAL_HOVER } from "../../themes/colors";
import { ROW_MENU_OFFSET, TAB_MENU_STYLES } from "../../themes/menus";
import classes from "../../assets/styles/ContextsMenu.module.css";
import { ALL_CONTEXTS, ALL_CONTEXT_GROUPS, NO_CONTEXT } from "@milo/shared";

// The contexts of the open board: the list in its tab. In interface editing,
// it chooses the board's context group — "Aucun", "Tous les contextes" — all
// its labels, whatever their group —, or one of its label groups, by name:
// "Société", "Priorité" (shared, contexts.ts) —, and a double click
// renames "Tous les contextes". Outside editing, it offers "Tous les
// contextes", then the labels of that group.
//
// A click immediately selects the context being viewed. The list itself waits a
// moment before closing, so that a double click can still rename; without the
// right to rename, it closes right away.

/** The bounds of the list width. */
const WIDTH_MIN = 240;
const WIDTH_MAX = 320;

/** What the list calls a context group: all of them, or its name. */
const groupName = (group: string) => (group === ALL_CONTEXT_GROUPS ? ALL_CONTEXTS : group);

/** How long a click waits before selecting: a double click beats it. */
const DOUBLE_CLICK_THRESHOLD = 250;

export interface ContextsMenuProps {
  /** The board's contexts: label names, in order. */
  items: string[];
  /** The label of "Tous les contextes", as the board carries it. */
  all: string;
  /** The context being viewed, or null for all. */
  value: string | null;
  onChange: (value: string | null) => void;
  /** Rename "Tous les contextes". Without it, the list only selects. */
  onRenameAll?: (name: string) => Promise<void>;
  /** The board's context group, by its name; null for none. */
  group?: string | null;
  /** The label groups the board can choose. */
  groupOptions?: string[];
  /** The contexts under the name of their group: shown so with all groups. */
  sections?: { group: string; contexts: string[] }[];
  /**
   * Choose the context group: in interface editing, for whoever may change the
   * board. With it, the list offers the groups instead of the contexts.
   */
  onChangeGroup?: (name: string | null) => Promise<void>;
  visibleFrom?: string;
  /**
   * Placed in the board's tab, to the right of its name: the tab is already a
   * button, the target is not another one, and the list starts from its left.
   */
  inTab?: boolean;
}

export default function ContextsMenu({
  items,
  all: receivedAll,
  value,
  onChange,
  onRenameAll,
  group = null,
  groupOptions = [],
  sections = [],
  onChangeGroup,
  visibleFrom,
  inTab = false,
}: ContextsMenuProps) {
  const [isOpen, setOpened] = useState(false);
  // In the tab, the list lands on the row's rule and starts from the tab's left
  // edge. The target is only as tall as its text, to the right of the name:
  // both gaps are measured on opening, from the target to the tab.
  const [tabGap, setTabOffset] = useState({
    mainAxis: ROW_MENU_OFFSET,
    crossAxis: 0,
  });
  // The tab's width, measured as well: the list takes it, and only grows wider
  // if its content requires it.
  const [tabWidth, setTabWidth] = useState(0);
  /** The target, captured on opening: the measurement follows it as long as the list is open. */
  const targetRef = useRef<HTMLElement | null>(null);
  const measure = (target: HTMLElement) => {
    const tab = target.closest('[role="tab"]')?.getBoundingClientRect();
    const button = target.getBoundingClientRect();
    if (!tab) return;
    // Minus one pixel: the top line of the list sits on the rule's line,
    // instead of falling below it.
    setTabOffset({
      mainAxis: tab.bottom - button.bottom - 1,
      crossAxis: tab.left - button.left,
    });
    setTabWidth(tab.width);
  };
  const toggle = (target: HTMLElement) => {
    if (inTab && !isOpen) {
      targetRef.current = target;
      measure(target);
    }
    setOpened((o) => !o);
  };
  // With the list open, the tab can change size — "Tous les …" renamed, the
  // target's label changing: the list follows.
  useEffect(() => {
    const target = targetRef.current;
    const tab = target?.closest('[role="tab"]');
    if (!inTab || !isOpen || !target || !tab) return;
    const following = new ResizeObserver(() => measure(target));
    following.observe(tab);
    // Experimental: the tab takes the background and border of the open list
    // (ContextsMenu.module.css, data-contexts-open). The row too: its rule
    // lightens along with it.
    const band = tab.closest('[role="tablist"]');
    tab.setAttribute("data-contexts-open", "");
    band?.setAttribute("data-contexts-open", "");
    return () => {
      following.disconnect();
      tab.removeAttribute("data-contexts-open");
      band?.removeAttribute("data-contexts-open");
    };
  }, [inTab, isOpen]);
  /** "Tous les contextes" being renamed: the name in its field. */
  const [renamed, setRenamed] = useState<string | null>(null);
  // The validated name, shown while the server responds and the board comes
  // back re-read: without it, the old name would briefly reappear.
  const [provisional, setProvisional] = useState<string | null>(null);
  // With all groups, "Tous les contextes" says it as it is: the board's
  // label names one group's.
  const allGroups = group === ALL_CONTEXT_GROUPS;
  const all = allGroups ? ALL_CONTEXTS : (provisional ?? receivedAll);
  const click = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const finished = useRef(false);

  useEffect(() => () => clearTimeout(click.current), []);

  // Choosing the group, the target names it. Otherwise, with no context, the
  // list says so instead of offering "Tous" out of nothing.
  const current = onChangeGroup
    ? group === null
      ? NO_CONTEXT
      : groupName(group)
    : items.length === 0
      ? NO_CONTEXT
      : (value ?? all);

  /** A group row: "Aucun" (null), all groups, or a group name. */
  const groupRow = (name: string | null) => {
    const selected = (group ?? null) === name;
    return (
      <div
        key={name ?? ""}
        className={classes.row}
        onClick={() => {
          setOpened(false);
          if (!selected) void onChangeGroup?.(name);
        }}
        style={{ display: "flex", alignItems: "center", padding: "4px 8px", minHeight: 32 }}
      >
        <Text size="sm" fw={selected ? 600 : undefined} style={{ flex: 1, minWidth: 0 }} truncate>
          {name === null ? "Aucun" : groupName(name)}
        </Text>
      </div>
    );
  };

  const select = (picked: string | null) => {
    clearTimeout(click.current);
    if (picked !== value) onChange(picked);
    if (!onRenameAll) return setOpened(false);
    click.current = setTimeout(() => setOpened(false), DOUBLE_CLICK_THRESHOLD);
  };

  const openRename = () => {
    if (!onRenameAll) return;
    clearTimeout(click.current);
    finished.current = false;
    setRenamed(all);
  };

  const finishRename = async (validate: boolean) => {
    if (renamed === null || finished.current || !onRenameAll) return;
    finished.current = true;
    const trimmedName = renamed.trim();
    setRenamed(null);
    if (!validate || !trimmedName || trimmedName === all) return;
    setProvisional(trimmedName);
    try {
      await onRenameAll(trimmedName);
    } finally {
      setProvisional(null);
    }
  };

  /** A row: its name — or, for "Tous" being renamed, its input. */
  const row = (key: string | null, name: string) => {
    const selected = value === key;
    const inInput = key === null && renamed !== null;
    return (
      <div
        key={key ?? ""}
        className={classes.row}
        data-editing={inInput || undefined}
        onClick={() => !inInput && select(key)}
        onDoubleClick={() => key === null && openRename()}
        style={{ display: "flex", alignItems: "center", padding: "4px 8px", minHeight: 32 }}
      >
        {inInput ? (
          <input
            value={renamed}
            onChange={(e) => setRenamed(e.currentTarget.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") {
                e.preventDefault();
                void finishRename(true);
              }
              if (e.key === "Escape") {
                e.preventDefault();
                void finishRename(false);
              }
            }}
            onBlur={() => void finishRename(true)}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            onFocus={(e) => e.currentTarget.select()}
            autoFocus
            aria-label={`Renommer ${name}`}
            // "size" at 1: without it, the field claims room for twenty
            // characters outright, and the list would widen accordingly. It
            // fills the row through "flex".
            size={1}
            style={{
              flex: 1,
              minWidth: 0,
              font: "inherit",
              fontSize: "var(--mantine-font-size-sm)",
              color: "inherit",
              background: "transparent",
              border: "none",
              outline: "none",
              padding: 0,
            }}
          />
        ) : (
          <Text size="sm" fw={selected ? 600 : undefined} style={{ flex: 1, minWidth: 0 }} truncate>
            {name}
          </Text>
        )}
      </div>
    );
  };

  return (
    <>
      <Popover
        opened={isOpen}
        onChange={setOpened}
        position={inTab ? "bottom-start" : "bottom-end"}
        withinPortal
        shadow="md"
        offset={inTab ? tabGap : ROW_MENU_OFFSET}
        // Outside the tab, the list connects to the rule: no top border and no
        // top corners. In the tab, it keeps its top border — the line that
        // separates it from the tab (classes.tabDropdown) —, without top
        // corners.
        styles={
          inTab
            ? {
                dropdown: {
                  borderTopLeftRadius: 0,
                  borderTopRightRadius: 0,
                  borderTopStyle: "dotted",
                },
              }
            : TAB_MENU_STYLES
        }
      >
        <Popover.Target>
          {/* The same button as the "Actions" menu of the row. */}
          <Button
            component={inTab ? "span" : "button"}
            role={inTab ? "button" : undefined}
            // In the tab, lighter than the board's name; no background or inset
            // — hover changes the text color (tabTarget).
            fw={inTab ? 300 : undefined}
            // The chevron tight against the label.
            styles={inTab ? { section: { marginInlineStart: 2 } } : undefined}
            variant={inTab ? "transparent" : "subtle"}
            color="gray"
            size="xs"
            px={inTab ? 0 : undefined}
            // At the height of the text: the button's 30 px would enlarge the
            // tab as soon as the list appears — in edit mode, for example.
            h={inTab ? "auto" : undefined}
            className={inTab ? classes.tabTarget : undefined}
            rightSection={<IconChevronDown size={14} />}
            aria-label="Contexte"
            visibleFrom={visibleFrom}
            onClick={(e: MouseEvent<HTMLElement>) => toggle(e.currentTarget)}
            style={
              inTab ? undefined : ({ "--button-hover": NEUTRAL_HOVER } as CSSProperties)
            }
          >
            {current}
          </Button>
        </Popover.Target>
        <Popover.Dropdown
          p={4}
          className={inTab ? classes.tabDropdown : undefined}
          // In the tab, at least its width: the list only widens if its content
          // requires it — with no context, it always fits. Elsewhere, its own
          // bounds.
          {...(inTab && tabWidth > 0
            ? { miw: tabWidth, maw: Math.max(WIDTH_MAX, tabWidth) }
            : { miw: WIDTH_MIN, maw: WIDTH_MAX })}
        >
          {onChangeGroup ? (
            <>
              {groupRow(null)}
              {groupOptions.length > 0 && groupRow(ALL_CONTEXT_GROUPS)}
              {groupOptions.length > 0 && <Divider my={4} />}
              {groupOptions.map((name) => groupRow(name))}
              {/* "Tous les …", which a double click renames, once a group gives
                  contexts. */}
              {group !== null && !allGroups && onRenameAll && (
                <>
                  <Divider my={4} label="Libellé de « Tous »" labelPosition="left" />
                  {row(null, all)}
                </>
              )}
            </>
          ) : (
            <>
              {row(null, all)}
              {allGroups
                ? // Under the name of their group.
                  sections.map((section) => (
                    <div key={section.group}>
                      <Divider my={4} />
                      {/* At the rows' inset: the name lines up with its labels. */}
                      <Text size="xs" c="dimmed" fw={600} px={8} pt={4} pb={2} truncate>
                        {section.group}
                      </Text>
                      {section.contexts.map((name) => row(name, name))}
                    </div>
                  ))
                : items.length > 0 && <Divider my={4} />}
              {!allGroups && items.map((name) => row(name, name))}
            </>
          )}
        </Popover.Dropdown>
      </Popover>

    </>
  );
}
