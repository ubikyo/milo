import { ActionIcon, Button, Group, Menu } from "@mantine/core";
import { IconChevronDown, IconTrash } from "@tabler/icons-react";
import type { ComponentType, CSSProperties } from "react";
import { RED } from "../../themes/colors";
import CloseButton from "./CloseButton";
import Footer from "./Footer";

// The footer of all drawers. It carries the three actions, always in the same
// place: delete on the left, "Fermer" and "Sauvegarder" on the right.
//
// Drawers used to save when closing — a click outside was enough. Nothing
// distinguished "I'm done" from "I just wanted to look", and there was no way
// to give up an edit. A drawer now saves only on "Sauvegarder" — not even on
// Enter, which validates a field without saying you are done.
interface DrawerFooterProps {
  /**
   * Without it — without the right to save —, the drawer only shows: only
   * "Fermer" remains.
   */
  onSave?: () => void | Promise<void>;
  onClose: () => void;
  /** Deletion: only when the object already exists. */
  onDelete?: () => void;
  /** True during the round trip to the server, to avoid saving twice. */
  saving?: boolean;
  /** True while the record is not complete enough to save: an order without products. */
  saveDisabled?: boolean;
  /**
   * Other ways to save, behind a chevron at the button's right — as Support's
   * "Envoyer": an order saved and its e-mail sent.
   */
  saveMenu?: { label: string; onClick: () => void }[];
  /** The button's own words: "Créer le devis", "Confirmer la commande". */
  saveLabel?: string;
  /**
   * In delete's place, when there is none: another action on the record — a
   * product an order cites, archived rather than deleted.
   */
  leftAction?: { label: string; icon: ComponentType<{ size?: number }>; onClick: () => void };
}

export default function DrawerFooter({
  onSave,
  onClose,
  onDelete,
  saving = false,
  saveDisabled = false,
  saveMenu,
  saveLabel = "Sauvegarder",
  leftAction,
}: DrawerFooterProps) {
  // With its menu, the button and its chevron read as one: a pixel apart, the
  // facing corners square.
  const corner = "var(--mantine-radius-default)";
  return (
    // Pinned to the bottom of the drawer, whatever the height of what precedes.
    <Footer justify="space-between" wrap="nowrap" pinned>
      {/* Always an element on the left, even without delete: without it, the
          other two buttons would recenter. */}
      {onDelete ? (
        <Button
          color={RED}
          variant="subtle"
          leftSection={<IconTrash size={16} />}
          onClick={onDelete}
        >
          Supprimer
        </Button>
      ) : leftAction ? (
        <CloseButton leftSection={<leftAction.icon size={16} />} onClick={leftAction.onClick}>
          {leftAction.label}
        </CloseButton>
      ) : (
        <span />
      )}

      <Group gap="var(--milo-settings-hstack-gap)" wrap="nowrap">
        <CloseButton onClick={onClose} />
        {onSave && !saveMenu?.length && (
          <Button color="teal" onClick={onSave} loading={saving} disabled={saveDisabled}>
            {saveLabel}
          </Button>
        )}
        {onSave && saveMenu?.length ? (
          <Group gap={1} wrap="nowrap">
            <Button
              color="teal"
              onClick={onSave}
              loading={saving}
              disabled={saveDisabled}
              style={{ borderRadius: `${corner} 0 0 ${corner}` } as CSSProperties}
            >
              {saveLabel}
            </Button>
            <Menu position="top-end" withinPortal shadow="md">
              <Menu.Target>
                <ActionIcon
                  color="teal"
                  variant="filled"
                  size={36}
                  disabled={saving || saveDisabled}
                  aria-label="Autres façons de sauvegarder"
                  style={{ borderRadius: `0 ${corner} ${corner} 0` }}
                >
                  <IconChevronDown size={14} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                {saveMenu.map((item) => (
                  <Menu.Item key={item.label} onClick={item.onClick}>
                    {item.label}
                  </Menu.Item>
                ))}
              </Menu.Dropdown>
            </Menu>
          </Group>
        ) : null}
      </Group>
    </Footer>
  );
}
