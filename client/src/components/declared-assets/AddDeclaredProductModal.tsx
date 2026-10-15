import { Button, Cascader, Modal, Select, Stack, TextInput } from "@mantine/core";
import { useEffect, useMemo, useState } from "react";
import { DECLARED_ASSET_NAME_MAX, DECLARED_ASSET_WORDS } from "@milo/shared";
import type {
  DeclaredAssetKind,
  DeclaredAssetProduct,
  DeclaredAssetSettings,
  ListRef,
} from "@milo/shared";
import { api } from "../../api";
import { errorMessage, notifyError } from "../../lib/errors";
import { themeWindow } from "../../lib/themeWindow";
import { MODAL_PADDING, modalHeaderStyles } from "../../themes/modals";
import AddButton from "../ui/AddButton";
import CloseButton from "../ui/CloseButton";
import { TREE_CASCADER, locationTreeData, treePath } from "../ui/EditableTree";
import Footer from "../ui/Footer";
import AddDeclaredEntryModal from "./AddDeclaredEntryModal";
import AddDeclaredTreeNodeModal from "./AddDeclaredTreeNodeModal";

// A product added from an asset's drawer — a model, an application —,
// without leaving the asset being typed: its category, picked in the board's
// tree, its maker, chosen among the board's, and its name. A category or a
// maker missing from the lists is added from under its field, in a window of
// its own, and joins them at once. The product goes to the board's lists
// (DeclaredAssetTablesFields) on "Enregistrer"; "Fermer" leaves it out.

const MODAL_WIDTH = 480;

interface AddDeclaredProductModalProps {
  kind: DeclaredAssetKind;
  opened: boolean;
  onClose: () => void;
  /** The asset's widget, whose lists these are. */
  list: ListRef;
  /** Its lists, as the drawer read them. */
  lists: DeclaredAssetSettings;
  /** A category or a maker added: the lists as the server now holds them. */
  onListsSaved: (lists: DeclaredAssetSettings) => void;
  /** Once saved: the lists as the server now holds them, and the product added. */
  onSaved: (lists: DeclaredAssetSettings, product: DeclaredAssetProduct) => void;
}

export default function AddDeclaredProductModal({
  kind,
  opened,
  onClose,
  list,
  lists,
  onListsSaved,
  onSaved,
}: AddDeclaredProductModalProps) {
  const { category, maker, product } = DECLARED_ASSET_WORDS[kind];
  const [form, setForm] = useState<DeclaredAssetProduct>({
    category: "",
    maker: "",
    name: "",
  });
  const [saving, setSaving] = useState(false);
  const [addingCategory, setAddingCategory] = useState(false);
  const [addingMaker, setAddingMaker] = useState(false);

  // Each opening starts empty.
  useEffect(() => {
    if (opened) setForm({ category: "", maker: "", name: "" });
  }, [opened]);

  const categoryData = useMemo(() => locationTreeData(lists.categories), [lists.categories]);

  const complete = Boolean(form.category && form.maker.trim() && form.name.trim());

  const save = async () => {
    if (!complete) return;
    const added: DeclaredAssetProduct = {
      category: form.category,
      maker: form.maker,
      name: form.name.trim(),
    };
    setSaving(true);
    try {
      const saved = await api.updateDeclaredAssetSettings(kind, list, {
        products: [...lists.products, added],
      });
      onSaved(saved, added);
      onClose();
    } catch (e) {
      notifyError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      attributes={themeWindow("declared-asset-product")}
      opened={opened}
      onClose={onClose}
      title={`Ajouter ${product.a}`}
      centered
      size={MODAL_WIDTH}
      padding={MODAL_PADDING}
      withCloseButton={false}
      styles={modalHeaderStyles(MODAL_PADDING)}
    >
      <Stack gap="md">
        <div>
          <Cascader
            label={category.title}
            placeholder={`Choisir ${category.a}`}
            data={categoryData}
            value={form.category ? treePath(lists.categories, form.category) : null}
            onChange={(path) => setForm((f) => ({ ...f, category: path?.at(-1) ?? "" }))}
            nothingFoundMessage={category.none}
            {...TREE_CASCADER}
            // The field's width: its levels share it, rather than cut short
            // inside the modal.
            comboboxProps={{ ...TREE_CASCADER.comboboxProps, width: "target" }}
            columnWidth={undefined}
            // Focused as the modal opens: it waits for a click or a key.
            openOnFocus={false}
            styles={{
              ...TREE_CASCADER.styles,
              column: { flex: "1 1 0", width: "auto", minWidth: 0 },
            }}
            searchable
            required
          />
          <AddButton
            label={`Ajouter ${category.a}`}
            onClick={() => setAddingCategory(true)}
            mt={4}
          />
        </div>
        <div>
          <Select
            label={maker.title}
            placeholder={`Choisir ${maker.a}`}
            data={lists.makers.map((m) => m.name)}
            value={form.maker || null}
            onChange={(value) => setForm((f) => ({ ...f, maker: value ?? "" }))}
            nothingFoundMessage={maker.none}
            searchable
            required
          />
          <AddButton label={`Ajouter ${maker.a}`} onClick={() => setAddingMaker(true)} mt={4} />
        </div>
        <TextInput
          label={product.title}
          placeholder={product.title}
          value={form.name}
          onChange={(e) => {
            const { value } = e.currentTarget;
            setForm((f) => ({ ...f, name: value }));
          }}
          maxLength={DECLARED_ASSET_NAME_MAX}
          required
        />
        <Footer parentGap="var(--mantine-spacing-md)">
          <CloseButton onClick={onClose} />
          <Button color="teal" onClick={() => void save()} loading={saving} disabled={!complete}>
            Enregistrer
          </Button>
        </Footer>
      </Stack>

      <AddDeclaredTreeNodeModal
        kind={kind}
        tree="categories"
        noun={category}
        opened={addingCategory}
        onClose={() => setAddingCategory(false)}
        list={list}
        lists={lists}
        parents={categoryData}
        initialParent={form.category}
        onSaved={(saved, id) => {
          // The product takes the category just added.
          onListsSaved(saved);
          setForm((f) => ({ ...f, category: id }));
        }}
      />
      <AddDeclaredEntryModal
        kind={kind}
        entries="makers"
        noun={maker}
        opened={addingMaker}
        onClose={() => setAddingMaker(false)}
        list={list}
        lists={lists}
        onSaved={(saved, name) => {
          // The product takes the maker just added.
          onListsSaved(saved);
          setForm((f) => ({ ...f, maker: name }));
        }}
      />
    </Modal>
  );
}
