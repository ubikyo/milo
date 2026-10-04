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

// Les contextes du tableau ouvert et le compte, au bout de la rangée d'onglets
// de chaque vue. C'était le contenu de l'entête, qui n'existe plus : la
// rangée d'onglets est désormais la première ligne de l'écran, et porte ce qui
// s'y trouvait.
export interface AccountControlsProps {
  /**
   * Les contextes du tableau ouvert ; absents sans tableau. Ils ne se posent
   * plus ici mais dans l'onglet actif (BoardTabs), à l'essai.
   */
  contexts?: Omit<ContextsMenuProps, "visibleFrom">;
  user: PublicUser;
  onLogout: () => void;
  onOpenSettings: () => void;
  onOpenPreferences: () => void;
  /** Le tiroir des dernières notifications reçues. */
  onOpenNotifications: () => void;
  /**
   * Le menu « Actions » du mode, à gauche des contextes : le compte reste
   * au bout, toujours au même endroit.
   */
  actions?: ReactNode;
}

// RESPONSIVE — les contextes sont ce qui tient le plus de place ici. En
// dessous de ce point d'arrêt, ils ont vocation à disparaître de la rangée
// pour rejoindre le menu du compte, qui lui reste toujours visible.
export const CONTEXT_SELECT_VISIBLE_FROM = "sm";

/**
 * Ce qu'une page transporte sans y toucher, de l'application jusqu'à la
 * rangée : le menu du mode, lui, est ajouté par ModeBar.
 */
export type AccountSlot = Omit<AccountControlsProps, "actions"> & {
  /**
   * Ouvre l'élément choisi dans la recherche, où qu'il se trouve. La recherche
   * est posée par ModeBar, devant ce bout de rangée.
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

      {/* Les contextes sont posés dans l'onglet actif, à droite de son nom
          (BoardTabs) : à l'essai. */}

      {/* Le workspace, contre le compte : seulement s'il y en a plusieurs. */}
      <WorkspaceMenu user={user} />

      <Menu
        position="bottom-end"
        withinPortal
        offset={ROW_MENU_OFFSET}
        styles={TAB_MENU_STYLES}
      >
        <Menu.Target>
          {/* Ni bulle d'aide, ni fond au survol, ni anneau de focus : le menu
              qui s'ouvre porte déjà le nom et l'adresse. */}
          {/* La même hauteur que les deux boutons de la rangée : sans quoi
              son menu ne tomberait pas sur le même filet. */}
          <ActionIcon
            variant="transparent"
            size={ROW_CONTROL_HEIGHT}
            aria-label="Compte"
            style={{ outline: "none" }}
          >
            {/* Un carré aux angles adoucis, et non un rond : il se pose
                comme les autres commandes de la rangée. */}
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
          {/* Le Paramétrage s'ouvre avec le droit « Voir », ou pour gérer
              les workspaces. */}
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
