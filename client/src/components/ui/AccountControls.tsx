import { ActionIcon, Avatar, Group, Menu } from "@mantine/core";
import {
  IconBell,
  IconLogout,
  IconSettings,
  IconUserCog,
} from "@tabler/icons-react";
import { initialsOf } from "./ActorAvatars";
import { ROW_CONTROL_HEIGHT, ROW_MENU_OFFSET, TAB_MENU_STYLES } from "../../themes/menus";
import type { ReactNode } from "react";
import type { PublicUser, SearchResult } from "@milo/shared";
import type { ContextsMenuProps } from "./ContextsMenu";
import WorkspaceMenu from "./WorkspaceMenu";

// The open board's contexts and the account, at the end of each view's tab
// row. This used to be the header's content, which no longer exists: the
// tab row is now the first line of the screen, and carries what was
// there.
export interface AccountControlsProps {
  /**
   * The open board's contexts; absent without a board. They are no
   * longer placed here but in the active tab (BoardTabs), on trial.
   */
  contexts?: Omit<ContextsMenuProps, "visibleFrom">;
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

export default function AccountControls({
  user,
  onLogout,
  onOpenSettings,
  onOpenPreferences,
  onOpenNotifications,
  actions,
}: AccountControlsProps) {
  return (
    <Group gap="xs" wrap="nowrap">
      {actions}

      {/* The contexts are placed in the active tab, to the right of its name
          (BoardTabs): on trial. */}

      {/* The workspace, next to the account: only if there are several. */}
      <WorkspaceMenu user={user} />

      <Menu
        position="bottom-end"
        withinPortal
        offset={ROW_MENU_OFFSET}
        styles={TAB_MENU_STYLES}
      >
        <Menu.Target>
          {/* No tooltip, no hover background, no focus ring: the menu
              that opens already carries the name and address. */}
          {/* The same height as the row's two buttons: otherwise
              its menu would not land on the same line. */}
          <ActionIcon
            variant="transparent"
            size={ROW_CONTROL_HEIGHT}
            aria-label="Compte"
            style={{ outline: "none" }}
          >
            {/* A square with softened corners, not a circle: it sits
                like the row's other controls. */}
            <Avatar
              size={26}
              radius="sm"
              color="teal"
              variant="filled"
              src={user?.gravatar_url || null}
            >
              {initialsOf(user?.name)}
            </Avatar>
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            leftSection={<IconUserCog size={16} />}
            onClick={onOpenPreferences}
          >
            Profil
          </Menu.Item>
          <Menu.Item
            leftSection={<IconBell size={16} />}
            onClick={onOpenNotifications}
          >
            Notifications
          </Menu.Item>
          {/* Settings opens with the "Voir" right, or to manage
              workspaces. */}
          {(user.settings.view || user.manage_workspaces) && (
            <Menu.Item
              leftSection={<IconSettings size={16} />}
              onClick={onOpenSettings}
            >
              Paramétrage
            </Menu.Item>
          )}
          <Menu.Divider />
          <Menu.Item leftSection={<IconLogout size={16} />} onClick={onLogout}>
            Déconnexion
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </Group>
  );
}
