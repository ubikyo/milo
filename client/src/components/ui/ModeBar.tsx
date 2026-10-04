import { Box, Tabs } from "@mantine/core";
import type { ReactNode } from "react";
import AccountControls from "./AccountControls";
import type { AccountSlot } from "./AccountControls";
import Logo from "./Logo";
import logoClasses from "../../assets/styles/Logo.module.css";
import SearchBox from "./SearchBox";
import { TAB_ROW_HEIGHT } from "../../themes/tabs";
import { useDisplaySettings } from "../../lib/displaySettings";

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
}

// The logo fits in the row's height, without pushing it, and breathes a little
// from the left edge: the tabs already carry their own inset.
const LOGO_HEIGHT = 26;
const LOGO_PADDING_LEFT = 20;

export default function ModeBar({
  value,
  onChange,
  children,
  actions,
  account,
}: ModeBarProps) {
  // The logo can be hidden from the Settings ("Affichage").
  const { settings: display } = useDisplaySettings();
  return (
    // Tabs stay on a single line, whatever the window width: it is the search
    // that gives way, not the row that wraps. Each tab keeps its whole name, on
    // one line.
    <Tabs
      value={value}
      onChange={onChange}
      mb={50}
      styles={{
        list: { flexWrap: "nowrap" },
        tab: { flexShrink: 0, whiteSpace: "nowrap" },
      }}
    >
      {/* The height is that of all modes: elsewhere the "Actions" button gives
          it, here it is stated once and for all. */}
      <Tabs.List mih={TAB_ROW_HEIGHT}>
        {/* RESPONSIVE — the logo is the first thing that can give up its place
            on a narrow screen: it brings nothing the page does not already say. */}
        {!display.hideLogo && (
          <Box
            pl={LOGO_PADDING_LEFT}
            pr="md"
            className={logoClasses.brand}
            style={{ alignSelf: "center", display: "flex", flexShrink: 0 }}
          >
            <Logo variant={2} h={LOGO_HEIGHT} />
            {/* The version number, under the logo, for those who linger. */}
            <span className={logoClasses.version}>{__APP_VERSION__}</span>
          </Box>
        )}

        {children}

        {/* The search takes everything left between the last tab — or its "+" —
            and the row's end: it is what pushes the latter to the right edge. */}
        <Box pl="md" style={{ flex: 1, minWidth: 0, alignSelf: "center" }}>
          <SearchBox onOpen={account.onSearchOpen} />
        </Box>

        {/* Everything on the right fits in a single box: the mode's menus, the
            company, the account. */}
        <Box
          ml="auto"
          pl="md"
          style={{ alignSelf: "center", display: "flex", alignItems: "center", flexShrink: 0 }}
        >
          <AccountControls {...account} actions={actions} />
        </Box>
      </Tabs.List>
    </Tabs>
  );
}
