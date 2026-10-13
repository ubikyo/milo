import {
  Button,
  Cascader,
  Drawer,
  Group,
  Input,
  Menu,
  Select,
  Stack,
  Tabs,
  Textarea,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import {
  IconArchive,
  IconArchiveOff,
  IconChevronDown,
  IconCopy,
  IconMessage,
  IconPaperclip,
  IconPhoto,
  IconSettings,
  IconStar,
  IconStarFilled,
  IconTruck,
} from "@tabler/icons-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IMAGE_MIME_TYPE } from "@mantine/dropzone";
import {
  PRODUCT_NAME_MAX,
  PRODUCT_SKU_MAX,
  PRODUCT_NOTES_MAX,
  PRODUCT_PRICE_MAX,
  PRODUCT_QUANTITY_MAX,
  PRODUCT_TRACKINGS,
  isProductTracking,
  taxLabel,
} from "@milo/shared";
import type {
  Id,
  Label,
  Product,
  ProductAttachment,
  ProductComment,
  ProductInput,
  ProductVariant,
  ProductPhoto,
  ProductSettings,
  ProductSupplier,
  ProductTracking,
} from "@milo/shared";
import { api } from "../../api";
import { listOf } from "../../lib/list-ref";
import { errorMessage, notifyError } from "../../lib/errors";
import { BARE_FIELDSET } from "../../lib/rights";
import { shrinkImage } from "../../lib/shrinkImage";
import { useFileDrag } from "../../lib/useFileDrag";
import { useSourceWidgets } from "../../lib/sources";
import { currencyUnit, useSuppliers } from "../../lib/suppliers";
import { VARIANT_WORDS } from "../../lib/label-words";
import { NEUTRAL_HOVER } from "../../themes/colors";
import { ACTIONS_BUTTON_STYLE, DRAWER_MENU_OFFSET, TAB_MENU_STYLES } from "../../themes/menus";
import { tabStyle } from "../../themes/tabs";
import CardAttachments from "../board/CardAttachments";
import CardCovers from "../board/CardCovers";
import CommentThread from "../project/CommentThread";
import DeleteConfirmModal from "../ui/DeleteConfirmModal";
import DrawerFooter from "../ui/DrawerFooter";
import DraftRows, { RowNumber, RowSelect, alignedEnd } from "../ui/DraftRows";
import DrawerScrollArea, {
  DRAWER_PADDING,
  DRAWER_PANEL_STYLE,
  DRAWER_STYLES,
  DRAWER_TABS_STYLES,
} from "../ui/DrawerScroll";
import { LabelGroupsDraft, newKey } from "../ui/LabelGroupsEditor";
import type { GroupDraft } from "../ui/LabelGroupsEditor";
import { TREE_CASCADER, locationTreeData, treePath } from "../ui/EditableTree";
import LabelPicker, { PRODUCT_LABELS_API } from "../ui/LabelPicker";

// A product's drawer, laid out like a declared asset's (DeclaredAssetDrawer):
// its labels first, then its name — the star at its right marks it as a
// favorite —, its notes, its category — a place of its board's categories
// tree, picked in a Cascader as a declared device's location — beside how
// its stock is tracked, its variants — its own
// attributes and their colored values, in the editor of a board's label groups
// (LabelGroupsDraft) —, then its photos and documents, in the same blocks as a
// card's covers and attachments.
//
// As a card's and a project's, a second tab holds its thread: the team's
// comments, and Milo's notes — its creation, then what each save changed. A
// product being added has none yet.
//
// The "Actions" menu, at the end of the tabs, duplicates a product: the copy,
// "(copie)" after its name, opens in its place.
//
// The record goes with "Sauvegarder". The photos and documents of an
// existing product go out on upload; those of a product being added wait for
// it to be created, then follow.

// The height of the label chips, as on a declared asset.
const CHIP_HEIGHT = 30;

/** Wide enough for its suppliers' prices and its variants side by side. */
const DRAWER_WIDTH = 820;

/** The favorite star's button, at the name's right: square, as tall as the star needs. */
const STAR_BUTTON = 28;

/** The SKU, left of the name: a short reference. */
const SKU_WIDTH = 140;

const PHOTO_WORDS = { title: "Photos", one: "la photo", many: "photos" };
const DOCUMENT_WORDS = { title: "Pièces jointes", one: "la pièce jointe", many: "pièces jointes" };

const TABS = [
  { value: "settings", label: "Paramètres", icon: IconSettings },
  { value: "comments", label: "Commentaires", icon: IconMessage },
];

/** The share of the line "Suivi inventaire" takes, beside "Catégorie": a supplier's price lines up with it. */
const TRACKING_SHARE = 2 / 5;

/** The width of a price's minimum quantity, beside it, and of its tax, after it. */
const MIN_QUANTITY_WIDTH = 90;
const TAX_WIDTH = 90;

/**
 * A price at a supplier as the drawer holds it: its contact's id as a string,
 * its minimum quantity and its price as typed.
 */
interface SupplierDraft {
  contact_id: string | null;
  min_quantity: number | "";
  price: number | "";
  /** Its tax's rate, as a string — the choice's value —; null, none. */
  tax: string | null;
}

/** What the drawer edits: ids as the pickers hold them. */
interface Form {
  sku: string;
  name: string;
  favorite: boolean;
  notes: string;
  tracking: ProductTracking;
  category: string;
  /** The variants, as the label groups editor holds them. */
  variants: GroupDraft[];
  suppliers: SupplierDraft[];
  label_ids: string[];
}

const EMPTY: Form = {
  sku: "",
  name: "",
  favorite: false,
  notes: "",
  tracking: "none",
  category: "",
  variants: [],
  suppliers: [],
  label_ids: [],
};

const formOf = (p: Product): Form => ({
  sku: p.sku,
  name: p.name,
  favorite: p.favorite,
  notes: p.notes,
  tracking: p.tracking,
  category: p.category,
  variants: p.variants.map((v) => ({
    key: newKey(),
    name: v.attribute,
    labels: v.values.map((x) => ({ key: newKey(), name: x.name, color: x.color, sku: x.sku })),
  })),
  suppliers: p.suppliers.map((x) => ({
    contact_id: String(x.contact_id),
    min_quantity: x.min_quantity ?? "",
    price: x.price ?? "",
    tax: x.tax === null ? null : String(x.tax),
  })),
  label_ids: p.labels.map((l) => String(l.id)),
});

/** A price from a quantity, left out: it is required. */
const missingPrice = (r: SupplierDraft): boolean =>
  Boolean(r.contact_id) && r.min_quantity !== "" && r.price === "";

/** The prices to save: a row without its company is dropped. */
const suppliersOf = (rows: SupplierDraft[]): ProductSupplier[] =>
  rows
    .filter((r) => r.contact_id)
    .map((r) => ({
      contact_id: Number(r.contact_id),
      min_quantity: r.min_quantity === "" ? null : r.min_quantity,
      price: r.price === "" ? null : r.price,
      tax: r.tax === null ? null : Number(r.tax),
    }));

/** The variants to save: an attribute left empty, or a value without a name, is dropped. */
const variantsOf = (groups: GroupDraft[]): ProductVariant[] =>
  groups
    .map((g) => ({
      attribute: g.name.trim(),
      values: g.labels
        .filter((l) => l.name.trim())
        .map((l) => ({ name: l.name.trim(), color: l.color, sku: (l.sku ?? "").trim() })),
    }))
    .filter((v) => v.attribute || v.values.length);

const inputOf = (f: Form): ProductInput => ({
  sku: f.sku.trim(),
  name: f.name.trim(),
  favorite: f.favorite,
  notes: f.notes.trim(),
  tracking: f.tracking,
  category: f.category,
  variants: variantsOf(f.variants),
  suppliers: suppliersOf(f.suppliers),
  label_ids: f.label_ids.map(Number),
});

/**
 * A file waiting for its product to be created: shown like a sent one, a
 * negative id and a local address in place of the server's.
 */
export interface Pending {
  id: Id;
  name: string;
  size: number;
  url: string;
  created_at: string;
  is_image: boolean;
  /** The file to send. */
  upload: File;
}

let pendingCounter = 0;
export const pendingOf = (file: File): Pending => ({
  id: -++pendingCounter,
  name: file.name,
  size: file.size,
  url: URL.createObjectURL(file),
  created_at: new Date().toISOString(),
  is_image: file.type.startsWith("image/"),
  upload: file,
});

/** The list in the order of the ids received; an unknown id is ignored. */
export const ordered = <T extends { id: Id }>(list: T[], ids: Id[]): T[] =>
  ids.map((id) => list.find((f) => f.id === id)).filter((f): f is T => Boolean(f));

interface ProductDrawerProps {
  opened: boolean;
  onClose: () => void;
  boardId: Id;
  /** The widget it is added from (LIST_KEY). */
  listKey: string;
  /** The product shown; null to add one. */
  product: Product | null;
  /** After a write: the list re-reads. */
  onSaved: () => void;
  /** After a duplication: the copy, to show in place of the original. */
  onDuplicated: (copy: Product) => void;
  canSave: boolean;
  canDelete: boolean;
  /** A new product's first supplier: an order's, whose "Créer un produit" opens it. */
  initialSupplierId?: Id;
  /** After a creation: the product created — an order's line takes it. */
  onCreated?: (product: Product) => void;
}

export default function ProductDrawer({
  opened,
  onClose,
  boardId,
  listKey,
  product,
  onSaved,
  onDuplicated,
  canSave,
  canDelete,
  initialSupplierId,
  onCreated,
}: ProductDrawerProps) {
  const [form, setForm] = useState<Form>(EMPTY);
  const [labels, setLabels] = useState<Label[]>([]);
  const [settings, setSettings] = useState<ProductSettings>({ categories: [], taxes: [] });
  // The board's categories tree, to pick the product's from.
  // The taxes offered, in the widget's order; a price's still shows once it has left them.
  const taxData = (own: string | null) => {
    const data = settings.taxes.map((t) => ({ value: String(t.rate), label: taxLabel(t.rate) }));
    if (own !== null && !data.some((d) => d.value === own)) data.push({ value: own, label: taxLabel(Number(own)) });
    return data;
  };
  const defaultTax = settings.taxes[0] ? String(settings.taxes[0].rate) : null;
  const categoryData = useMemo(() => locationTreeData(settings.categories), [settings.categories]);
  // The star's button, hovered: it takes the neutral gray.
  const [starHovered, setStarHovered] = useState(false);
  // The suppliers to pick from: the companies of every Contact widget one sees.
  const contactWidgets = useSourceWidgets(opened ? "contact.list" : null);
  const { suppliers } = useSuppliers(contactWidgets ?? []);
  const supplierById = useMemo(
    () => new Map((suppliers ?? []).map((s) => [String(s.contact.id), s])),
    [suppliers],
  );
  /**
   * The quantities held twice by a supplier, as "id\nquantity": their rows
   * show in red, and the product does not save.
   */
  const quantityKey = (r: SupplierDraft) => `${r.contact_id}\n${r.min_quantity}`;
  const doubled = useMemo(() => {
    const seen = new Set<string>();
    const twice = new Set<string>();
    for (const r of form.suppliers) {
      if (!r.contact_id) continue;
      const key = quantityKey(r);
      if (seen.has(key)) twice.add(key);
      seen.add(key);
    }
    return twice;
  }, [form.suppliers]);

  /** The prices' order: by supplier, then quantity; a row without its supplier last. */
  const bySupplier = (a: SupplierDraft, b: SupplierDraft): number => {
    if (!a.contact_id || !b.contact_id) return Number(!a.contact_id) - Number(!b.contact_id);
    const name = (r: SupplierDraft) => supplierById.get(r.contact_id!)?.contact.name ?? "";
    return (
      name(a).localeCompare(name(b), "fr", { numeric: true }) ||
      Number(a.contact_id) - Number(b.contact_id) ||
      Number(a.min_quantity || 0) - Number(b.min_quantity || 0)
    );
  };
  const [photos, setPhotos] = useState<(ProductPhoto | Pending)[]>([]);
  const [attachments, setAttachments] = useState<(ProductAttachment | Pending)[]>([]);
  const [comments, setComments] = useState<ProductComment[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>("settings");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const photoField = useRef<HTMLInputElement>(null);
  const fileField = useRef<HTMLInputElement>(null);
  // Files dragged over the page: the drop zones show, even under full lists.
  const dragging = useFileDrag(opened && canSave);
  const readOnly = !canSave;
  // A product being added has no thread yet.
  const tabs = TABS.filter((t) => t.value === "settings" || product);

  // Its labels and lists are its widget's: the product's own, or the one it is
  // added from.
  const list = useMemo(
    () => (product ? listOf(product) : { board: boardId, list: listKey }),
    [product, boardId, listKey],
  );

  const readLabels = useCallback(async () => {
    try {
      setLabels(await api.getProductLabels(list));
    } catch (e) {
      notifyError(errorMessage(e));
    }
  }, [list]);

  const readComments = useCallback(async () => {
    if (!product) return;
    try {
      setComments(await api.getProductComments(product.id));
    } catch (e) {
      notifyError(errorMessage(e));
    }
  }, [product]);

  // Each opening starts from the product, on its first tab, and re-reads its
  // board's labels and categories, its files and its thread.
  useEffect(() => {
    if (!opened) return;
    setForm(
      product
        ? formOf(product)
        : initialSupplierId === undefined
          ? EMPTY
          : { ...EMPTY, suppliers: [{ contact_id: String(initialSupplierId), min_quantity: "", price: "", tax: null }] },
    );
    setActiveTab("settings");
    setPhotos([]);
    setAttachments([]);
    setComments([]);
    void readLabels();
    api
      .getProductSettings(list)
      .then(setSettings)
      .catch((e) => notifyError(errorMessage(e)));
    if (product) {
      api
        .getProductFiles(product.id)
        .then((files) => {
          setPhotos(files.photos);
          setAttachments(files.attachments);
        })
        .catch((e) => notifyError(errorMessage(e)));
      void readComments();
    }
  }, [opened, product, list, readLabels, readComments]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // --- Photos and attachments ----------------------------------------------

  /** Chosen photos: sent at once for a product that exists, kept otherwise. */
  const addPhotos = async (files: File[]) => {
    for (const file of files) {
      const shrunk = await shrinkImage(file);
      if (!product) {
        setPhotos((already) => [...already, pendingOf(shrunk)]);
        continue;
      }
      try {
        const photo = await api.uploadProductPhoto(product.id, shrunk);
        setPhotos((already) => [...already, photo]);
      } catch (e) {
        notifyError(errorMessage(e));
      }
    }
  };

  /** Chosen attachments: the most recent first, as the server places them. */
  const addAttachments = async (files: File[]) => {
    for (const file of files) {
      if (!product) {
        setAttachments((already) => [pendingOf(file), ...already]);
        continue;
      }
      try {
        const attachment = await api.uploadProductAttachment(product.id, file);
        setAttachments((already) => [attachment, ...already]);
      } catch (e) {
        notifyError(errorMessage(e));
      }
    }
  };

  const arrangePhotos = async (ids: Id[]) => {
    setPhotos((already) => ordered(already, ids));
    if (!product) return;
    try {
      setPhotos(await api.reorderProductPhotos(product.id, ids));
    } catch (e) {
      notifyError(errorMessage(e));
    }
  };

  const arrangeAttachments = async (ids: Id[]) => {
    setAttachments((already) => ordered(already, ids));
    if (!product) return;
    try {
      setAttachments(await api.reorderProductAttachments(product.id, ids));
    } catch (e) {
      notifyError(errorMessage(e));
    }
  };

  const deletePhoto = async (photo: ProductPhoto | Pending) => {
    try {
      if ("upload" in photo) URL.revokeObjectURL(photo.url);
      else await api.deleteProductPhoto(photo.id);
      setPhotos((already) => already.filter((p) => p.id !== photo.id));
    } catch (e) {
      notifyError(errorMessage(e));
    }
  };

  const deleteAttachment = async (attachment: ProductAttachment | Pending) => {
    try {
      if ("upload" in attachment) URL.revokeObjectURL(attachment.url);
      else await api.deleteProductAttachment(attachment.id);
      setAttachments((already) => already.filter((a) => a.id !== attachment.id));
    } catch (e) {
      notifyError(errorMessage(e));
    }
  };

  /**
   * The files kept while adding, sent once the product exists: the photos
   * in their order; the attachments from the last, each placed first.
   */
  const sendPending = async (id: Id) => {
    for (const photo of photos) {
      if (!("upload" in photo)) continue;
      await api.uploadProductPhoto(id, photo.upload);
      URL.revokeObjectURL(photo.url);
    }
    for (const attachment of [...attachments].reverse()) {
      if (!("upload" in attachment)) continue;
      await api.uploadProductAttachment(id, attachment.upload);
      URL.revokeObjectURL(attachment.url);
    }
  };

  // --- Comments --------------------------------------------------------------

  const addComment = async (text: string) => {
    if (!product) return;
    try {
      await api.addProductComment(product.id, text);
      await readComments();
    } catch (e) {
      notifyError(errorMessage(e));
    }
  };

  const updateComment = async (id: number | string, text: string) => {
    try {
      await api.updateProductComment(Number(id), text);
      await readComments();
    } catch (e) {
      notifyError(errorMessage(e));
    }
  };

  const deleteComment = async (id: number | string) => {
    try {
      await api.deleteProductComment(Number(id));
      await readComments();
    } catch (e) {
      notifyError(errorMessage(e));
    }
  };

  // --- Save and delete -----------------------------------------------------

  const persist = async () => {
    if (!form.name.trim()) {
      notifyError("Le champ « Nom » est requis");
      return;
    }
    if (variantsOf(form.variants).some((v) => !v.attribute)) {
      notifyError(VARIANT_WORDS.missingName);
      return;
    }
    // Each price from its quantity, once per supplier — one without —: it
    // would be read twice. From a quantity, the price is required.
    const nameOf = (r: SupplierDraft) => supplierById.get(r.contact_id!)?.contact.name ?? "Un fournisseur";
    const twice = form.suppliers.find((r) => doubled.has(quantityKey(r)));
    if (twice) {
      notifyError(
        twice.min_quantity === ""
          ? `« ${nameOf(twice)} » : un seul prix sans quantité minimum`
          : `« ${nameOf(twice)} » : la quantité ${twice.min_quantity.toLocaleString("fr-FR")} figure deux fois`,
      );
      return;
    }
    const unpriced = form.suppliers.find(missingPrice);
    if (unpriced) {
      notifyError(`« ${nameOf(unpriced)} » : un prix à partir d'une quantité demande son prix`);
      return;
    }
    setSaving(true);
    try {
      if (product) {
        await api.updateProduct(product.id, inputOf(form));
      } else {
        const created = await api.createProduct({
          ...inputOf(form),
          board_id: boardId,
          list_key: listKey,
        });
        await sendPending(created.id);
        onCreated?.(created);
      }
      onSaved();
      onClose();
    } catch (e) {
      notifyError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  /** The copy is made from the product as saved: what is being typed stays here. */
  const handleDuplicate = async () => {
    if (!product) return;
    try {
      onDuplicated(await api.duplicateProduct(product.id));
    } catch (e) {
      notifyError(errorMessage(e));
    }
  };

  /** Archived, or back; the drawer closes, the list re-reads. */
  const toggleArchived = async () => {
    if (!product) return;
    try {
      await api.archiveProduct(product.id, !product.archived);
      onSaved();
      onClose();
    } catch (e) {
      notifyError(errorMessage(e));
    }
  };

  const handleDelete = async () => {
    if (!product) return;
    setConfirmDelete(false);
    try {
      await api.deleteProduct(product.id);
      onSaved();
      onClose();
    } catch (e) {
      notifyError(errorMessage(e));
    }
  };

  const favoriteLabel = form.favorite ? "Retirer des favoris" : "Ajouter aux favoris";

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
        <Tabs
          value={activeTab}
          onChange={setActiveTab}
          style={DRAWER_PANEL_STYLE}
          styles={DRAWER_TABS_STYLES}
        >
          <Tabs.List mb="md">
            {tabs.map(({ value, label, icon: Icon }) => (
              <Tabs.Tab
                key={value}
                value={value}
                leftSection={<Icon size={16} />}
                style={tabStyle(activeTab === value)}
              >
                {label}
              </Tabs.Tab>
            ))}

            {/* At the end of the tab row, as on a card. A product being added,
                or one only read, has nothing to duplicate: no menu. */}
            {product && canSave && (
              <Menu
                position="bottom-end"
                withinPortal
                shadow="md"
                offset={DRAWER_MENU_OFFSET}
                styles={TAB_MENU_STYLES}
              >
                <Menu.Target>
                  <Button
                    variant="subtle"
                    color="gray"
                    rightSection={<IconChevronDown size={14} />}
                    ml="auto"
                    mb={4}
                    style={{ alignSelf: "center", ...ACTIONS_BUTTON_STYLE }}
                  >
                    Actions
                  </Button>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item
                    leftSection={<IconCopy size={16} />}
                    onClick={() => void handleDuplicate()}
                  >
                    Dupliquer
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            )}
          </Tabs.List>

          <Tabs.Panel value="settings" style={DRAWER_PANEL_STYLE}>
            <DrawerScrollArea>
              {/* Read-only, all the fields are disabled at once. */}
              <fieldset disabled={readOnly} style={BARE_FIELDSET}>
                <Stack gap="xl">
                  <LabelPicker
                    chipHeight={CHIP_HEIGHT}
                    labels={labels}
                    value={form.label_ids}
                    onChange={(ids) => set("label_ids", ids)}
                    list={list}
                    onLabelsChanged={readLabels}
                    labelsApi={PRODUCT_LABELS_API}
                  />

                  {/* Its SKU, then the name, its favorite star at its right: a
                      filled, yellow star marks a favorite. */}
                  <Group align="flex-start" gap="md" wrap="nowrap">
                    <TextInput
                      label="SKU"
                      placeholder="SKU"
                      value={form.sku}
                      onChange={(e) => set("sku", e.currentTarget.value)}
                      maxLength={PRODUCT_SKU_MAX}
                      w={SKU_WIDTH}
                      style={{ flexShrink: 0 }}
                    />
                    <TextInput
                      label="Nom"
                      style={{ flex: 1, minWidth: 0 }}
                      placeholder="Nom"
                      value={form.name}
                      onChange={(e) => set("name", e.currentTarget.value)}
                      maxLength={PRODUCT_NAME_MAX}
                      required
                      rightSectionPointerEvents="all"
                      rightSection={
                        <UnstyledButton
                          aria-label={favoriteLabel}
                          onClick={() => set("favorite", !form.favorite)}
                          onMouseEnter={() => setStarHovered(true)}
                          onMouseLeave={() => setStarHovered(false)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: STAR_BUTTON,
                            height: STAR_BUTTON,
                            borderRadius: "var(--mantine-radius-sm)",
                            backgroundColor: starHovered ? NEUTRAL_HOVER : "transparent",
                          }}
                        >
                          {form.favorite ? (
                            <IconStarFilled size={16} color="var(--mantine-color-yellow-5)" />
                          ) : (
                            <IconStar size={16} color="var(--mantine-color-dimmed)" />
                          )}
                        </UnstyledButton>
                      }
                    />
                  </Group>

                  <Textarea
                    label="Notes"
                    placeholder="Notes"
                    value={form.notes}
                    onChange={(e) => set("notes", e.currentTarget.value)}
                    maxLength={PRODUCT_NOTES_MAX}
                    autosize
                    minRows={3}
                  />

                  {/* Its category, then how its stock is tracked, on one line:
                      60 % and 40 % of it (TRACKING_SHARE). */}
                  <Group align="flex-start" gap="md" wrap="nowrap">
                    {/* In columns, level after level; any level may be chosen.
                        The product keeps the category's id. */}
                    <Cascader
                      label="Catégorie"
                      placeholder="Choisir une catégorie"
                      data={categoryData}
                      value={form.category ? treePath(settings.categories, form.category) : null}
                      onChange={(path) => set("category", path?.at(-1) ?? "")}
                      nothingFoundMessage="Aucune catégorie"
                      {...TREE_CASCADER}
                      clearable
                      searchable
                      style={{ flex: 3, minWidth: 0 }}
                    />
                    <Select
                      label="Suivi inventaire"
                      data={PRODUCT_TRACKINGS.map((t) => ({ value: t.value, label: t.label }))}
                      value={form.tracking}
                      onChange={(v) => {
                        if (isProductTracking(v)) set("tracking", v);
                      }}
                      allowDeselect={false}
                      style={{ flex: 2, minWidth: 0 }}
                    />
                  </Group>

                  {/* Its prices at its suppliers — companies of the Contact
                      widgets —, each from a minimum quantity, in the
                      supplier's currency: an order's line takes the one its
                      quantity reaches. Sorted by supplier, then quantity. */}
                  <DraftRows<SupplierDraft>
                    label="Fournisseurs"
                    value={form.suppliers}
                    onChange={(rows) => set("suppliers", rows)}
                    emptyIcon={IconTruck}
                    emptyText="Aucun fournisseur"
                    addLabel="Ajouter un fournisseur"
                    // A new price takes the widget's first tax.
                    newRow={() => ({ contact_id: null, min_quantity: "", price: "", tax: defaultTax })}
                    reorderable={false}
                    sort={bySupplier}
                    // Sorted once its supplier and its price are there, and its quantity is its own.
                    ready={(r) => Boolean(r.contact_id) && r.price !== "" && !doubled.has(quantityKey(r))}
                    nameOf={(r) =>
                      (r.contact_id && supplierById.get(r.contact_id)?.contact.name) || "ce fournisseur"
                    }
                    word="fournisseur"
                    readOnly={readOnly}
                    fields={(row, change, autoFocus) => {
                      const supplier = row.contact_id ? supplierById.get(row.contact_id) : undefined;
                      // A company may come back: another price, from another quantity.
                      const data = (suppliers ?? []).map((s) => ({
                        value: String(s.contact.id),
                        label: s.contact.name,
                      }));
                      // One no longer read still shows, by its id.
                      if (row.contact_id && !supplier) {
                        data.unshift({ value: row.contact_id, label: `#${row.contact_id}` });
                      }
                      return (
                        <RowSelect
                          placeholder={suppliers === null ? "Lecture…" : "Fournisseur"}
                          aria-label="Fournisseur"
                          data={data}
                          value={row.contact_id}
                          onChange={(id) => change({ contact_id: id })}
                          nothingFoundMessage="Aucune société"
                          autoFocus={autoFocus}
                          style={{ flex: 1, minWidth: 0 }}
                        />
                      );
                    }}
                    // The quantity and the price under "Suivi inventaire", the
                    // supplier ending with "Catégorie": their 60 / 40.
                    trailing={(row, change) => {
                      const supplier = row.contact_id ? supplierById.get(row.contact_id) : undefined;
                      const unit = currencyUnit(supplier?.currency);
                      return (
                        <Group gap="xs" wrap="nowrap" style={alignedEnd(TRACKING_SHARE)}>
                          <RowNumber
                            placeholder="Qté min."
                            aria-label="Quantité minimum"
                            value={row.min_quantity}
                            onChange={(v) => change({ min_quantity: v === "" ? "" : Number(v) })}
                            min={0}
                            max={PRODUCT_QUANTITY_MAX}
                            decimalScale={3}
                            thousandSeparator=" "
                            prefix="≥ "
                            invalid={doubled.has(quantityKey(row))}
                            w={MIN_QUANTITY_WIDTH}
                            style={{ flexShrink: 0 }}
                          />
                          <RowNumber
                            placeholder="Prix"
                            invalid={missingPrice(row)}
                            aria-label="Prix"
                            value={row.price}
                            onChange={(v) => change({ price: v === "" ? "" : Number(v) })}
                            min={0}
                            max={PRODUCT_PRICE_MAX}
                            decimalScale={2}
                            thousandSeparator=" "
                            suffix={unit ? ` ${unit}` : undefined}
                            style={{ flex: 1, minWidth: 0 }}
                          />
                          <RowSelect
                            placeholder="TVA"
                            aria-label="TVA"
                            data={taxData(row.tax)}
                            value={row.tax}
                            onChange={(v) => change({ tax: v })}
                            searchable={false}
                            alignRight
                            allowDeselect={false}
                            // A narrow chevron: the rate shows whole.
                            rightSectionWidth={24}
                            w={TAX_WIDTH}
                            style={{ flexShrink: 0 }}
                          />
                        </Group>
                      );
                    }}
                  />

                  {/* Its attributes and their values, as a board's label groups:
                      "Couleur", then "Noir", "Rouge"… They go with the product. */}
                  <Input.Wrapper label="Variantes">
                    <LabelGroupsDraft
                      groups={form.variants}
                      onChange={(change) =>
                        setForm((f) => ({
                          ...f,
                          variants: typeof change === "function" ? change(f.variants) : change,
                        }))
                      }
                      words={VARIANT_WORDS}
                      withSku
                    />
                  </Input.Wrapper>

                  <CardCovers
                    covers={photos}
                    onPick={() => photoField.current?.click()}
                    onReorder={arrangePhotos}
                    onDelete={deletePhoto}
                    readOnly={readOnly}
                    words={PHOTO_WORDS}
                    drop={
                      readOnly
                        ? undefined
                        : {
                            icon: IconPhoto,
                            message: "Déposez des photos ici",
                            onDrop: (files) => void addPhotos(files),
                            accept: IMAGE_MIME_TYPE,
                            rejected: "Seules les images peuvent servir de photo",
                            shown: dragging,
                          }
                    }
                  />
                  {/* Read-only, the disabled fieldset turns its actions off; an
                      empty list then has nothing to show, nor a zone to drop on. */}
                  <CardAttachments
                    attachments={attachments}
                    onPick={() => fileField.current?.click()}
                    onReorder={arrangeAttachments}
                    onDelete={deleteAttachment}
                    drop={
                      readOnly
                        ? undefined
                        : {
                            icon: IconPaperclip,
                            message: "Déposez des fichiers ici",
                            onDrop: (files) => void addAttachments(files),
                            shown: dragging,
                          }
                    }
                    words={DOCUMENT_WORDS}
                  />
                </Stack>
              </fieldset>
            </DrawerScrollArea>
          </Tabs.Panel>

          {/* The panel takes all the free height: the empty thread spreads out in it. */}
          {product && (
            <Tabs.Panel value="comments" style={DRAWER_PANEL_STYLE}>
              <DrawerScrollArea fill>
                <Stack gap="md" style={{ flex: 1, minHeight: 0 }}>
                  <CommentThread
                    comments={comments}
                    onAdd={(text) => void addComment(text)}
                    onUpdate={(id, text) => void updateComment(id, text)}
                    onDelete={(id) => void deleteComment(id)}
                    readOnly={readOnly}
                  />
                </Stack>
              </DrawerScrollArea>
            </Tabs.Panel>
          )}
        </Tabs>

        <DrawerFooter
          onSave={canSave ? persist : undefined}
          onClose={onClose}
          // A product an order cites is not deleted: it is archived, or back.
          onDelete={product && canDelete && !product.used ? () => setConfirmDelete(true) : undefined}
          leftAction={
            product && product.used && canSave
              ? {
                  label: product.archived ? "Désarchiver" : "Archiver",
                  icon: product.archived ? IconArchiveOff : IconArchive,
                  onClick: () => void toggleArchived(),
                }
              : undefined
          }
          saving={saving}
          // Its name is required: without it, nothing to save.
          saveDisabled={!form.name.trim()}
        />

        {/* The pickers, reset afterwards: choosing the same file again must
            still be seen. */}
        <input
          ref={photoField}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            const files = Array.from(e.currentTarget.files ?? []);
            e.currentTarget.value = "";
            void addPhotos(files);
          }}
        />
        <input
          ref={fileField}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            const files = Array.from(e.currentTarget.files ?? []);
            e.currentTarget.value = "";
            void addAttachments(files);
          }}
        />
      </Drawer>

      <DeleteConfirmModal
        opened={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
        title="Supprimer le produit"
        message={
          <>
            Voulez-vous vraiment supprimer
            {form.name ? ` « ${form.name} »` : " ce produit"} ? Cette action est irréversible.
          </>
        }
      />
    </>
  );
}
