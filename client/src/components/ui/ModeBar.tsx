import { Box, Scroller, Tabs, rem } from "@mantine/core";
import type { CSSProperties, ReactNode } from "react";
import AccountControls from "./AccountControls";
import type { AccountSlot } from "./AccountControls";
import SearchBox from "./SearchBox";
import { TAB_ROW_HEIGHT } from "../../themes/tabs";
import { ROW_CONTROL_HEIGHT } from "../../themes/menus";
import { PAGE_GUTTER } from "../../themes/layout";

// The first line of the screen, in all modes: the logo, the mode's tabs, then
// the company and the account.
//
// There used to be a header above, across the full width. It only brought a
// logo and two settings, for 73 pixels: these joined the tab row, which already
// existed, and the whole page moves up by that much.
//
// Everything fits in Mantine's tab list, not beside it: the rule that closes it
// thus runs from edge to edge, under the logo as under the account, and nothing
// shifts vertically from one mode to another.
interface ModeBarProps {
  /** The open tab. A mode without tabs has none. */
  value?: string | null;
  onChange?: (value: string | null) => void;
  /** The mode's tabs. */
  children?: ReactNode;
  /** The mode's own menu — "Actions" —, placed between the company and the account. */
  actions?: ReactNode;
  /** What it takes to mount the row's end: the company, the mode's menu, the account. */
  account: AccountSlot;
  /** The search, shown unless there is nothing to search: no view, no board. */
  withSearch?: boolean;
}

// The Scroller's chevrons, and the fade that carries them: Mantine sizes both
// at 50 pixels, taller than the row itself.
const CHEVRON_SIZE = 24;

// The row's height, set rather than left to its content: a page without tabs
// — or before its boards arrive —, an open tab with its contexts list, would
// each give it a slightly different one, and the header would jump from page
// to page. A tab's is its inset, its line, and its text, at a line height of
// 1 (Mantine), at the larger of the two sizes the themes give; the controls
// at the row's end never go below theirs. The page's inset above is part of
// the row (tabs.css).
const ROW_HEIGHT = `max(${TAB_ROW_HEIGHT}px, calc(var(--tabs-bleed) + max(${ROW_CONTROL_HEIGHT}px, calc(2 * var(--mantine-spacing-xs) + 2 * var(--milo-tab-active-border-width) + max(var(--milo-tab-size), var(--milo-tab-active-size))))))`;

export default function ModeBar({
  value,
  onChange,
  children,
  actions,
  account,
  withSearch = true,
}: ModeBarProps) {
  return (
    // Tabs stay on a single line, whatever the window width: it is the search
    // that gives way first, not the row that wraps. Each tab keeps its whole
    // name, on one line; once the search has no room left, the tabs scroll.
    <Tabs
      value={value}
      onChange={onChange}
      mb={50}
      // The row's background takes in the page's margins above and on the
      // sides, up to the window's edges (tabs.css).
      className="milo-page-tabs"
      styles={{
        list: { flexWrap: "nowrap", "--tabs-bleed": rem(PAGE_GUTTER) } as CSSProperties,
        tab: { flexShrink: 0, whiteSpace: "nowrap" },
      }}
    >
      {/* The height is that of all modes and all pages (ROW_HEIGHT). */}
      <Tabs.List style={{ height: ROW_HEIGHT }}>
        {/* The mode's tabs scroll sideways once the row is full, with a
            chevron at each end that has more to show. Dragging the row does
            not scroll it: pressing a tab drags the tab itself (useTabReorder).
            The Scroller fills the row's height, so that the open tab still
            sits on its closing rule, and its chevrons stop just above it. */}
        {children && (
          <Scroller
            draggable={false}
            controlSize={CHEVRON_SIZE}
            style={{ flex: "0 1 auto", minWidth: 0, alignSelf: "stretch", alignItems: "stretch" }}
            styles={{
              container: { display: "flex" },
              content: { flexShrink: 0, alignItems: "stretch" },
              control: { bottom: 1 },
            }}
          >
            {children}
          </Scroller>
        )}

        {/* The search takes everything left between the last tab — or its "+" —
            and the row's end: it is what pushes the latter to the right edge. */}
        {/* No gap on either side: the search's field fills everything from the
            last tab to the menus and the account (SearchBox). */}
        <Box style={{ flex: 1, minWidth: 0, alignSelf: "stretch", display: "flex" }}>
          {withSearch && <SearchBox onOpen={account.onSearchOpen} />}
        </Box>

        {/* Everything on the right fits in a single box: the mode's menus, the
            company, the account. */}
        <Box
          ml="auto"
          // The full row's height: the account's frame stands on the row's line,
          // like a tab (AccountControls).
          style={{ alignSelf: "stretch", display: "flex", alignItems: "stretch", flexShrink: 0 }}
        >
          <AccountControls {...account} actions={actions} />
        </Box>
      </Tabs.List>
    </Tabs>
  );
}
