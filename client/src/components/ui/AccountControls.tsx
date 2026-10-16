import { ActionIcon, Avatar, Box, Group, Menu, Text } from "@mantine/core";
import {
  IconBell,
  IconChevronDown,
  IconLogout,
  IconSettings,
  IconUserCog,
} from "@tabler/icons-react";
import { initialsOf } from "./ActorAvatars";
import { useDisplaySettings } from "../../lib/displaySettings";
import {
  MENU_DROP,
  ROW_CONTROL_HEIGHT,
  SEPARATOR_COLOR,
  ROW_MENU_OFFSET,
  TAB_MENU_STYLES,
} from "../../themes/menus";
import { TAB_ACTIVE_BG, TAB_ACTIVE_BORDER_WIDTH } from "../../themes/colors";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { PublicUser, SearchResult } from "@milo/shared";
import Logo from "./Logo";
import WorkspaceMenu from "./WorkspaceMenu";
import { PANEL_PADDING_RIGHT } from "./SubviewsPanel";
import contextsClasses from "../../assets/styles/ContextsMenu.module.css";

// The account, at the end of the views' tab row. This used to be the header's content, which no longer exists: the
// tab row is now the first line of the screen, and carries what was
// there.
export interface AccountControlsProps {
  user: PublicUser;
  onLogout: () => void;
  onOpenSettings: () => void;
  onOpenPreferences: () => void;
  /** The drawer of the latest notifications received. */
  onOpenNotifications: () => void;
  /**
   * The mode's "Actions" menu, to the left of the contexts: the account stays
   * at the end, always in the same place.
   */
  actions?: ReactNode;
}

// RESPONSIVE — the contexts take up the most room here. Below
// this breakpoint, they are meant to disappear from the row
// and join the account menu, which always stays visible.
export const CONTEXT_SELECT_VISIBLE_FROM = "sm";

/**
 * What a page carries untouched, from the application down to the
 * row: the mode's menu, for its part, is added by ModeBar.
 */
export type AccountSlot = Omit<AccountControlsProps, "actions"> & {
  /**
   * Opens the item chosen in the search, wherever it is. The search
   * is placed by ModeBar, in front of this end of the row.
   */
  onSearchOpen: (result: SearchResult) => void;
};

/** The account's menu: Milo's logo, then its entries. */
const PROFILE_MENU_WIDTH = 300;
const PROFILE_LOGO_HEIGHT = 80;

/**
 * The account's frame: drawn like the open tab — its background, its line
 * on top and on the sides, its rounded top corners —, standing on the row's
 * line, which its background covers. In the main window's row, these are
 * that row's settings (tabs.css).
 */
const PROFILE_FRAME: CSSProperties = {
  alignSelf: "stretch",
  display: "flex",
  alignItems: "center",
  position: "relative",
  // TEST: the avatar on the left side, the tabs' own inset on the right
  // (Mantine's Tabs: spacing md).
  paddingInlineStart: 0,
  paddingInlineEnd: "var(--mantine-spacing-md)",
  backgroundColor: TAB_ACTIVE_BG,
  // Its line transparent: the background, painted under it, gives it its own
  // color exactly — even a translucent one, which would otherwise add up to
  // a lighter outline.
  border: `${TAB_ACTIVE_BORDER_WIDTH} solid transparent`,
  backgroundClip: "border-box",
  borderBottom: "none",
  borderRadius: "var(--tabs-radius) var(--tabs-radius) 0 0",
};

/**
 * The frame with its menu open: the background of the tab holding the open
 * contexts list, under its transparent border too (ContextsMenu.module.css).
 */
const PROFILE_FRAME_OPEN: CSSProperties = {
  backgroundColor: "var(--contexts-open-tab-bg)",
};

export default function AccountControls({
  user,
  onLogout,
  onOpenSettings,
  onOpenPreferences,
  onOpenNotifications,
  actions,
}: AccountControlsProps) {
  const { settings: display } = useDisplaySettings();
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ");
  const [isOpen, setOpened] = useState(false);
  // Like the contexts list: the menu lands on the row's rule and ends at the
  // frame's right edge. Both gaps are measured on opening, from the avatar.
  const [gap, setGap] = useState({ mainAxis: ROW_MENU_OFFSET, crossAxis: 0 });
  const frameRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef<HTMLButtonElement>(null);
  const toggle = (opened: boolean) => {
    const frame = frameRef.current?.getBoundingClientRect();
    const target = targetRef.current?.getBoundingClientRect();
    const row = targetRef.current?.closest('[role="tablist"]')?.getBoundingClientRect();
    if (opened && frame && target) {
      // Minus one pixel, the menu's top would sit on the rule's line: it
      // opens MENU_DROP under it, as the sub-views' list (BoardTabs).
      setGap({
        mainAxis: (row?.bottom ?? frame.bottom) - target.bottom - 1 + MENU_DROP,
        crossAxis: frame.right - target.right,
      });
    }
    setOpened(opened);
  };
  // A press anywhere else closes the menu, even where it is stopped before
  // reaching the document — the contexts list in its tab keeps its presses
  // (BoardTabs): Mantine's click outside would not hear it. Listened to on
  // the way down, before anything can stop it.
  useEffect(() => {
    if (!isOpen) return;
    const close = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (frameRef.current?.contains(target) || target?.closest("[data-profile-menu]")) return;
      setOpened(false);
    };
    document.addEventListener("pointerdown", close, true);
    return () => document.removeEventListener("pointerdown", close, true);
  }, [isOpen]);
  return (
    <Group gap="xs" wrap="nowrap" align="center">
      {actions}

      {/* The workspace, next to the account: only if there are several. */}
      <WorkspaceMenu user={user} />

      {/* Its menu open, the frame takes the open contexts tab's colors. */}
      <Box
        ref={frameRef}
        style={isOpen ? { ...PROFILE_FRAME, ...PROFILE_FRAME_OPEN } : PROFILE_FRAME}
      >
        {/* The same look as the contexts list (ContextsMenu): its radius,
            shadow, padding, width, border and rows. */}
        <Menu
          opened={isOpen}
          onChange={toggle}
          position="bottom-end"
          withinPortal
          shadow="md"
          // The contexts list's: Mantine's default radius ("md"), not the
          // menus' "xs" (main.tsx).
          radius="md"
          offset={gap}
          // The menus' own background, and no border, as the sub-views' list
          // (BoardTabs).
          styles={{ dropdown: { ...TAB_MENU_STYLES.dropdown, border: "none" } }}
          classNames={{ item: contextsClasses.menuItem }}
          // Focus stays where it is on closing: handed back to the avatar,
          // it would highlight the frame.
          returnFocus={false}
        >
          <Menu.Target>
            {/* No tooltip, no hover background, no focus ring: the menu
                that opens already carries the name and address. */}
            {/* The same height as the row's two buttons: otherwise
                its menu would not land on the same line. */}
            <ActionIcon
              ref={targetRef}
              className={contextsClasses.profileTarget}
              variant="transparent"
              size={ROW_CONTROL_HEIGHT}
              aria-label="Compte"
              // Square at the bottom: only the frame's top-left corner is
              // rounded.
              radius={0}
              // The frame's full height, its line included: drawn over the
              // frame's top and left line, the avatar is set from its edges.
              style={{
                outline: "none",
                // Mantine's ActionIcon keeps a 1px border, transparent here:
                // it would leave a gap between the avatar and the frame's edges.
                border: 0,
                width: "auto",
                minWidth: 0,
                alignSelf: "stretch",
                height: "auto",
                minHeight: 0,
                marginTop: `calc(-1 * ${TAB_ACTIVE_BORDER_WIDTH})`,
                marginInlineStart: `calc(-1 * ${TAB_ACTIVE_BORDER_WIDTH})`,
                borderStartStartRadius: "var(--tabs-radius)",
              }}
            >
              {/* TEST: a rounded square 5px inside the frame's left side, top
                  and bottom. Spaced from the name as a board tab's text is
                  from its edge (Mantine's Tabs: spacing md). */}
              <Avatar
                size={26}
                // Rounder than the frame's corner (the tabs' "sm").
                radius={6}
                style={{
                  height: "calc(100% - 10px)",
                  width: "auto",
                  minWidth: 0,
                  aspectRatio: "1",
                  marginBlock: 5,
                  marginInlineStart: 5,
                  marginInlineEnd: "var(--mantine-spacing-md)",
                }}
                color="teal"
                variant="filled"
                src={(display.showGravatars && user?.gravatar_url) || null}
              >
                {initialsOf(user?.name)}
              </Avatar>
              {/* TEST: the first and last name, to the right of the avatar:
                  part of the target, they open the menu too. */}
              {fullName && (
                <Text component="span" size="sm" c="var(--mantine-color-text)">
                  {fullName}
                </Text>
              )}
              {/* A chevron at the end, like the row's other
                  menus: it says the account opens a list. */}
              <IconChevronDown
                size={14}
                color="var(--mantine-color-text)"
                // Half the tabs' inset from the name.
                style={{ marginLeft: "calc(var(--mantine-spacing-md) / 2)" }}
              />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown
            data-profile-menu
            // The sub-views' inset's side padding (SubviewsPanel), on all four
            // sides; its line crosses it (menus.css).
            p={PANEL_PADDING_RIGHT}
            w={PROFILE_MENU_WIDTH}
            className={contextsClasses.dropdown}
            style={{ "--milo-menu-px": `${PANEL_PADDING_RIGHT}px` } as CSSProperties}
          >
            {/* TEST: two columns, Milo's logo on the left, the menu on the right. */}
            <Group gap={0} wrap="nowrap" align="stretch">
              <Box style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Logo variant={1} h={PROFILE_LOGO_HEIGHT} />
              </Box>
              <Box style={{ flex: 1, minWidth: 0 }}>
                <Menu.Item
                  leftSection={<IconUserCog size={16} />}
                  onClick={onOpenPreferences}
                >
                  Profil
                </Menu.Item>
                {/* Only for whoever receives notifications on screen in their
                    workspace (Accès). */}
                {user.notifications.screen && (
                  <Menu.Item
                    leftSection={<IconBell size={16} />}
                    onClick={onOpenNotifications}
                  >
                    Notifications
                  </Menu.Item>
                )}
                {/* Settings opens with "Gestion du paramétrage" only. */}
                {user.settings.view && (
                  <Menu.Item
                    leftSection={<IconSettings size={16} />}
                    onClick={onOpenSettings}
                  >
                    Paramétrage
                  </Menu.Item>
                )}
                {/* The page's background, as the sub-views' list's lines (BoardTabs). */}
                <Menu.Divider style={{ borderColor: SEPARATOR_COLOR }} />
                <Menu.Item leftSection={<IconLogout size={16} />} onClick={onLogout}>
                  Déconnexion
                </Menu.Item>
              </Box>
            </Group>
          </Menu.Dropdown>
        </Menu>
      </Box>
    </Group>
  );
}
