import { Drawer, TextInput } from "@mantine/core";
import { useEffect, useState } from "react";
import { VALUE_NAME_MAX } from "@milo/shared";
import type { ValueItem } from "@milo/shared";
import { errorMessage, notifyError } from "../../lib/errors";
import { BARE_FIELDSET } from "../../lib/rights";
import DeleteConfirmModal from "../ui/DeleteConfirmModal";
import DrawerFooter from "../ui/DrawerFooter";
import DrawerScrollArea, { DRAWER_PADDING, DRAWER_STYLES } from "../ui/DrawerScroll";

// An item's drawer, laid out like a warehouse's (WarehouseDrawer): its name,
// required, under the list's type — "Marque". It goes with "Sauvegarder"; its id, the server's, never changes.

/** As wide as a warehouse's. */
const DRAWER_WIDTH = 560;

interface ValueItemDrawerProps {
  opened: boolean;
  onClose: () => void;
  /** What the list holds: "Supprimer {type}". */
  type: string;
  /** Its field's label: what the list holds, as a title — "Marque". */
  title: string;
  /** The item shown; null to add one. */
  item: ValueItem | null;
  /** Writes the item's name, the list whole; throws on refusal. */
  onSave: (name: string) => Promise<void>;
  onDelete: () => Promise<void>;
  canSave: boolean;
  canDelete: boolean;
}

export default function ValueItemDrawer({
  opened,
  onClose,
  type,
  title,
  item,
  onSave,
  onDelete,
  canSave,
  canDelete,
}: ValueItemDrawerProps) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Each opening starts from the item, or blank.
  useEffect(() => {
    if (opened) setName(item?.name ?? "");
  }, [opened, item]);

  const persist = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave(name.trim());
      onClose();
    } catch (e) {
      notifyError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setConfirmDelete(false);
    try {
      await onDelete();
      onClose();
    } catch (e) {
      notifyError(errorMessage(e));
    }
  };

  return (
    <>
      <Drawer
        opened={opened}
        onClose={onClose}
        position="right"
        size={DRAWER_WIDTH}
        padding={DRAWER_PADDING}
        withCloseButton={false}
        styles={DRAWER_STYLES}
      >
        <DrawerScrollArea>
          {/* Read-only, the field is disabled. */}
          <fieldset disabled={!canSave} style={BARE_FIELDSET}>
            <TextInput
              label={title}
              placeholder={title}
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              maxLength={VALUE_NAME_MAX}
              required
              data-autofocus
            />
          </fieldset>
        </DrawerScrollArea>

        <DrawerFooter
          onSave={canSave ? persist : undefined}
          onClose={onClose}
          onDelete={item && canDelete ? () => setConfirmDelete(true) : undefined}
          saving={saving}
          // Without a name, nothing to save.
          saveDisabled={!name.trim()}
        />
      </Drawer>

      <DeleteConfirmModal
        opened={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
        title={`Supprimer ${type}`}
        message={
          <>
            Voulez-vous vraiment supprimer
            {item?.name ? ` « ${item.name} »` : ` ${type}`} ? Cette action est irréversible.
          </>
        }
      />
    </>
  );
}
