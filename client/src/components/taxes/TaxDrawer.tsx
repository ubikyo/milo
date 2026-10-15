import { Drawer, NumberInput, Stack, TextInput } from "@mantine/core";
import { useEffect, useState } from "react";
import { TAX_NAME_MAX, TAX_RATE_MAX } from "@milo/shared";
import type { Tax } from "@milo/shared";
import { errorMessage, notifyError } from "../../lib/errors";
import { BARE_FIELDSET } from "../../lib/rights";
import DeleteConfirmModal from "../ui/DeleteConfirmModal";
import DrawerFooter from "../ui/DrawerFooter";
import DrawerScrollArea, { DRAWER_PADDING, DRAWER_STYLES } from "../ui/DrawerScroll";

// A tax's drawer, laid out like a Liste item's (ValueItemDrawer): its name,
// optional, and its rate, required. It goes with "Sauvegarder"; the list goes
// whole to the server.

/** As wide as a warehouse's. */
const DRAWER_WIDTH = 560;

interface TaxDrawerProps {
  opened: boolean;
  onClose: () => void;
  /** The tax shown; null to add one. */
  tax: Tax | null;
  /** Writes the tax, the list whole; throws on refusal. */
  onSave: (tax: Tax) => Promise<void>;
  onDelete: () => Promise<void>;
  canSave: boolean;
  canDelete: boolean;
}

export default function TaxDrawer({ opened, onClose, tax, onSave, onDelete, canSave, canDelete }: TaxDrawerProps) {
  const [name, setName] = useState("");
  const [rate, setRate] = useState<number | "">("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Each opening starts from the tax, or blank.
  useEffect(() => {
    if (!opened) return;
    setName(tax?.name ?? "");
    setRate(tax?.rate ?? "");
  }, [opened, tax]);

  const persist = async () => {
    if (rate === "") return;
    setSaving(true);
    try {
      await onSave({ name: name.trim(), rate });
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
          {/* Read-only, the fields are disabled. */}
          <fieldset disabled={!canSave} style={BARE_FIELDSET}>
            <Stack>
              <TextInput
                label="Nom"
                placeholder="Nom"
                value={name}
                onChange={(e) => setName(e.currentTarget.value)}
                maxLength={TAX_NAME_MAX}
                data-autofocus
              />
              <NumberInput
                label="Taxe"
                placeholder="0 %"
                value={rate}
                onChange={(v) => setRate(typeof v === "number" ? v : "")}
                min={0}
                max={TAX_RATE_MAX}
                clampBehavior="strict"
                decimalScale={2}
                decimalSeparator=","
                allowNegative={false}
                suffix=" %"
                hideControls
                required
                w={120}
              />
            </Stack>
          </fieldset>
        </DrawerScrollArea>

        <DrawerFooter
          onSave={canSave ? persist : undefined}
          onClose={onClose}
          onDelete={tax && canDelete ? () => setConfirmDelete(true) : undefined}
          saving={saving}
          // Without a rate, nothing to save.
          saveDisabled={rate === ""}
        />
      </Drawer>

      <DeleteConfirmModal
        opened={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
        title="Supprimer la taxe"
        message={
          <>
            Voulez-vous vraiment supprimer
            {tax ? ` « ${tax.name || `${tax.rate.toLocaleString("fr-FR")} %`} »` : " la taxe"} ? Cette action est
            irréversible.
          </>
        }
      />
    </>
  );
}
