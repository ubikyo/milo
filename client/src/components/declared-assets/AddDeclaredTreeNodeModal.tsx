import { Button, Cascader, Modal, Stack, TextInput } from "@mantine/core";
import type { TreeNodeData } from "@mantine/core";
import { useEffect, useState } from "react";
import type { DeclaredAssetKind, DeclaredAssetSettings, ListRef } from "@milo/shared";
import { api } from "../../api";
import { errorMessage, notifyError } from "../../lib/errors";
import { themeWindow } from "../../lib/themeWindow";
import { MODAL_PADDING, modalHeaderStyles } from "../../themes/modals";
import CloseButton from "../ui/CloseButton";
import { TREE_CASCADER, TREE_NAME_MAX, treePath, withNode } from "../ui/EditableTree";
import Footer from "../ui/Footer";

// A place added from a device's drawer, or a category from the product's
// window, without leaving what is being typed: where it goes — under a node
// of the board's tree, at its root without one — and its name. It goes to the
// board's lists (DeclaredAssetTablesFields) on "Enregistrer", at the end of
// what is already under its parent, as the tree there adds it; "Fermer"
// leaves everything as before. A node already there under the same parent,
// case aside, is not added twice: it is the one taken.

const MODAL_WIDTH = 480;

/** The trees it adds to, and the name of each one's window. */
const WINDOWS = {
  locations: "declared-asset-location",
  categories: "declared-asset-category",
} as const;

/** What it adds, in its words: "un emplacement", "de l'emplacement", "Aucun emplacement". */
export interface TreeNodeNoun {
  a: string;
  ofThe: string;
  none: string;
}

interface AddDeclaredTreeNodeModalProps {
  kind: DeclaredAssetKind;
  /** The tree it adds to. */
  tree: keyof typeof WINDOWS;
  noun: TreeNodeNoun;
  opened: boolean;
  onClose: () => void;
  /** The asset's widget, whose lists these are. */
  list: ListRef;
  /** Its lists, as the drawer read them. */
  lists: DeclaredAssetSettings;
  /** The nodes to put it under: those the field it is added from offers. */
  parents: TreeNodeData[];
  /** Where it goes at first: the field's node, when it has one. */
  initialParent: string;
  /** Once saved: the lists as the server now holds them, and the node's id. */
  onSaved: (lists: DeclaredAssetSettings, id: string) => void;
}

export default function AddDeclaredTreeNodeModal({
  kind,
  tree,
  noun,
  opened,
  onClose,
  list,
  lists,
  parents,
  initialParent,
  onSaved,
}: AddDeclaredTreeNodeModalProps) {
  const [parent, setParent] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const nodes = lists[tree] ?? [];

  // Each opening starts with no name, under the field's node.
  useEffect(() => {
    if (!opened) return;
    setParent(initialParent);
    setName("");
  }, [opened, initialParent]);

  const save = async () => {
    const typed = name.trim();
    if (!typed) return;
    const under = parent || null;
    const known = nodes.find(
      (l) => l.parent === under && l.name.toLowerCase() === typed.toLowerCase(),
    );
    if (known) {
      onSaved(lists, known.id);
      onClose();
      return;
    }
    const added = { id: crypto.randomUUID(), parent: under, name: typed };
    setSaving(true);
    try {
      const saved = await api.updateDeclaredAssetSettings(kind, list, {
        [tree]: withNode(nodes, added),
      });
      onSaved(saved, added.id);
      onClose();
    } catch (e) {
      notifyError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      attributes={themeWindow(WINDOWS[tree])}
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
        <Cascader
          label="Dans"
          placeholder="À la racine"
          data={parents}
          value={parent ? treePath(nodes, parent) : null}
          onChange={(path) => setParent(path?.at(-1) ?? "")}
          nothingFoundMessage={noun.none}
          {...TREE_CASCADER}
          clearable
          searchable
        />
        <TextInput
          label="Nom"
          placeholder={`Nom ${noun.ofThe}`}
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void save();
          }}
          maxLength={TREE_NAME_MAX}
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
