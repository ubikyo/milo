import { ActionIcon, Avatar, Button, Group, Menu } from "@mantine/core";
import {
  IconBell,
  IconChevronDown,
  IconLogout,
  IconSettings,
  IconUserCog,
} from "@tabler/icons-react";
import { initialsOf } from "./ActorAvatars";
import { NEUTRAL_HOVER } from "../../themes/colors";
import {
  ROW_CONTROL_HEIGHT,
  ROW_MENU_OFFSET,
  TAB_MENU_STYLES,
} from "../../themes/menus";
import type { CSSProperties, ReactNode } from "react";
import type { Company, Mode, PublicUser, SearchResult } from "@milo/shared";

// La société et le compte, au bout de la rangée d'onglets de chaque mode.
// C'était le contenu de l'entête, qui n'existe plus : la rangée d'onglets est
// désormais la première ligne de l'écran, et porte ce qui s'y trouvait.
export interface AccountControlsProps {
  companies: Company[];
  companyFilter: string;
  onCompanyFilterChange: (value: string) => void;
  user: PublicUser;
  onLogout: () => void;
  onOpenSettings: () => void;
  onOpenPreferences: () => void;
  /** Le tiroir des dernières notifications reçues. */
  onOpenNotifications: () => void;
  mode: Mode;
  /**
   * Le menu « Actions » du mode, à gauche de la société : le compte reste
   * au bout, toujours au même endroit.
   */
  actions?: ReactNode;
}

// RESPONSIVE — la société est ce qui tient le plus de place ici. En dessous
// de ce point d'arrêt, elle a vocation à disparaître de la rangée pour
// rejoindre le menu du compte, qui lui reste toujours visible.
export const COMPANY_SELECT_VISIBLE_FROM = "sm";

/** « Toutes les sociétés » : la valeur que prend le filtre quand il ne filtre pas. */
const TOUTES = "all";

/**
 * Ce qu'une page transporte sans y toucher, de l'application jusqu'à la
 * rangée : le menu du mode, lui, est ajouté par ModeBar.
 */
export type AccountSlot = Omit<AccountControlsProps, "actions"> & {
  /**
   * Ouvre l'élément choisi dans la recherche, où qu'il se trouve. La recherche
   * est posée par ModeBar, devant ce bout de rangée.
   */
  onSearchOpen: (resultat: SearchResult) => void;
};

export default function AccountControls({
  companies,
  companyFilter,
  onCompanyFilterChange,
  user,
  onLogout,
  onOpenSettings,
  onOpenPreferences,
  onOpenNotifications,
  mode,
  actions,
}: AccountControlsProps) {
  // Le mode Accès ne connaît pas les sociétés : ses catégories ne pendent à
  // rien. La liste n'y aurait aucun effet, elle ne s'y montre donc pas.
  const avecSocietes = mode !== "access";

  // « Toutes les sociétés » existe partout sauf en mode Tâche : une liste
  // appartient à un tableau, qui appartient à une société, et « toutes » n'y
  // désignerait rien. Ailleurs — projets, demandes de support, postes —, c'est
  // au contraire la vue par laquelle le mode s'ouvre.
  const uneSeuleSociete = mode === "tasks";
  const companyOptions = [
    ...(uneSeuleSociete
      ? []
      : [{ value: TOUTES, label: "Toutes les sociétés" }]),
    ...companies.map((c) => ({ value: String(c.id), label: c.name })),
  ];

  // Ce que le bouton affiche : la société choisie, ou le premier mot du menu
  // quand le filtre ne filtre pas.
  const societeCourante =
    companyOptions.find((o) => o.value === companyFilter)?.label ?? "Société";

  return (
    <Group gap="xs" wrap="nowrap">
      {actions}

      {avecSocietes && (
        // Le même bouton que le menu « Actions » de la rangée : c'est un menu,
        // il se présente comme les autres plutôt qu'en champ de formulaire.
        <Menu
          position="bottom-end"
          withinPortal
          shadow="md"
          offset={ROW_MENU_OFFSET}
          styles={TAB_MENU_STYLES}
        >
          <Menu.Target>
            <Button
              variant="subtle"
              color="gray"
              size="xs"
              rightSection={<IconChevronDown size={14} />}
              aria-label="Société"
              visibleFrom={COMPANY_SELECT_VISIBLE_FROM}
              style={{ "--button-hover": NEUTRAL_HOVER } as CSSProperties}
            >
              {societeCourante}
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            {companyOptions.map((option) => (
              <Menu.Item
                key={option.value}
                onClick={() => onCompanyFilterChange(option.value)}
                // La société ouverte se lit d'un coup d'œil dans la liste.
                fw={option.value === companyFilter ? 600 : undefined}
              >
                {option.label}
              </Menu.Item>
            ))}
          </Menu.Dropdown>
        </Menu>
      )}

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
          {/* Le Paramétrage s'ouvre avec le droit « Voir » d'un rôle. */}
          {user.settings.view && (
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
