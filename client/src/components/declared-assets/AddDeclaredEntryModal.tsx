import { Button, Modal, Stack, TextInput } from "@mantine/core";
import { useEffect, useState } from "react";
import { DECLARED_ASSET_NAME_MAX } from "@milo/shared";
import type {
  DeclaredAssetKind,
  DeclaredAssetNoun,
  DeclaredAssetSettings,
  ListRef,
} from "@milo/shared";
import { api } from "../../api";
import { errorMessage, notifyError } from "../../lib/errors";
import { themeWindow } from "../../lib/themeWindow";
import { MODAL_PADDING, modalHeaderStyles } from "../../themes/modals";
import CloseButton from "../ui/CloseButton";
import Footer from "../ui/Footer";

// A supplier added from an asset's drawer, or a maker from the product's
// window, without leaving what is being typed: its name. It goes to the
// board's lists (DeclaredAssetTablesFields) on "Enregistrer"; "Fermer" leaves
// everything as before. One already listed, case aside, is not added twice:
// the asset takes it as it is spelled.

const MODAL_WIDTH = 420;

/** The lists of plain names it adds to, and the name of each one's window. */
const WINDOWS = {
  suppliers: "declared-asset-supplier",
  makers: "declared-asset-maker",
} as const;

interface AddDeclaredEntryModalProps {
  kind: DeclaredAssetKind;
  /** The list it adds to. */
  entries: keyof typeof WINDOWS;
  /** What it adds, in its words. */
  noun: DeclaredAssetNoun;
  opened: boolean;
  onClose: () => void;
  /** The asset's widget, whose lists these are. */
  list: ListRef;
  /** Its lists, as the drawer read them. */
  lists: DeclaredAssetSettings;
  /** Once saved: the lists as the server now holds them, and the name added. */
  onSaved: (lists: DeclaredAssetSettings, name: string) => void;
}

export default function AddDeclaredEntryModal({
  kind,
  entries,
  noun,
  opened,
  onClose,
  list,
  lists,
  onSaved,
}: AddDeclaredEntryModalProps) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  // Each opening starts empty.
  useEffect(() => {
    if (opened) setName("");
  }, [opened]);

  const save = async () => {
    const typed = name.trim();
    if (!typed) return;
    const known = lists[entries].find((s) => s.name.toLowerCase() === typed.toLowerCase());
    if (known) {
      onSaved(lists, known.name);
      onClose();
      return;
    }
    setSaving(true);
    try {
      const saved = await api.updateDeclaredAssetSettings(kind, list, {
        [entries]: [...lists[entries], { name: typed }],
      });
      onSaved(saved, typed);
      onClose();
    } catch (e) {
      notifyError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      attributes={themeWindow(WINDOWS[entries])}
      opened={opened}
      onClose={onClose}
      title={`Ajouter ${noun.a}`}
      centered
      size={MODAL_WIDTH}
      padding={MODAL_PADDING}
      withCloseButton={false}
      styles={modalHeaderStyles(MODAL_PADDING)}
    >
      <Stack gap="md">
        <TextInput
          label={noun.title}
          placeholder={noun.title}
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void save();
          }}
          maxLength={DECLARED_ASSET_NAME_MAX}
          data-autofocus
          required
        />
        <Footer parentGap="var(--mantine-spacing-md)">
          <CloseButton onClick={onClose} />
          <Button color="teal" onClick={() => void save()} loading={saving} disabled={!name.trim()}>
            Enregistrer
          </Button>
        </Footer>
      </Stack>
    </Modal>
  );
}
