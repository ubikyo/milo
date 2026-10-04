import { Button, Group } from "@mantine/core";
import { IconTrash } from "@tabler/icons-react";
import { RED } from "../../themes/colors";
import CloseButton from "./CloseButton";

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
}

export default function DrawerFooter({
  onSave,
  onClose,
  onDelete,
  saving = false,
}: DrawerFooterProps) {
  return (
    // "mt: auto" pins the footer to the bottom of the drawer, whatever the
    // height of what precedes.
    <Group justify="space-between" wrap="nowrap" mt="auto" pt={40}>
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
      ) : (
        <span />
      )}

      <Group gap="sm" wrap="nowrap">
        <CloseButton onClick={onClose} />
        {onSave && (
          <Button color="teal" onClick={onSave} loading={saving}>
            Sauvegarder
          </Button>
        )}
      </Group>
    </Group>
  );
}
