import {
  Cascader,
  Drawer,
  Group,
  Input,
  Select,
  Stack,
  Tabs,
  Textarea,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import {
  IconMessage,
  IconPaperclip,
  IconPhoto,
  IconSettings,
  IconStar,
  IconStarFilled,
} from "@tabler/icons-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IMAGE_MIME_TYPE } from "@mantine/dropzone";
import {
  PRODUCT_NAME_MAX,
  PRODUCT_NOTES_MAX,
  PRODUCT_TRACKINGS,
  isProductTracking,
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
  ProductTracking,
} from "@milo/shared";
import { api } from "../../api";
import { errorMessage, notifyError } from "../../lib/errors";
import { BARE_FIELDSET } from "../../lib/rights";
import { shrinkImage } from "../../lib/shrinkImage";
import { useFileDrag } from "../../lib/useFileDrag";
import { VARIANT_WORDS } from "../../lib/label-words";
import { NEUTRAL_HOVER } from "../../themes/colors";
import { tabStyle } from "../../themes/tabs";
import CardAttachments from "../board/CardAttachments";
import CardCovers from "../board/CardCovers";
import CommentThread from "../project/CommentThread";
import DeleteConfirmModal from "../ui/DeleteConfirmModal";
import DrawerFooter from "../ui/DrawerFooter";
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
// The record goes with "Sauvegarder". The photos and documents of an
// existing product go out on upload; those of a product being added wait for
// it to be created, then follow.

// The height of the label chips, as on a declared asset.
const CHIP_HEIGHT = 30;

/** As wide as an asset's. */
const DRAWER_WIDTH = 560;

/** The favorite star's button, at the name's right: square, as tall as the star needs. */
const STAR_BUTTON = 28;

const PHOTO_WORDS = { title: "Photos", one: "la photo", many: "photos" };
const DOCUMENT_WORDS = { title: "Pièces jointes", one: "la pièce jointe", many: "pièces jointes" };

const TABS = [
  { value: "settings", label: "Paramètres", icon: IconSettings },
  { value: "comments", label: "Commentaires", icon: IconMessage },
];

/** What the drawer edits: ids as the pickers hold them. */
interface Form {
  name: string;
  favorite: boolean;
  notes: string;
  tracking: ProductTracking;
  category: string;
  /** The variants, as the label groups editor holds them. */
  variants: GroupDraft[];
  label_ids: string[];
}

const EMPTY: Form = {
  name: "",
  favorite: false,
  notes: "",
  tracking: "none",
  category: "",
  variants: [],
  label_ids: [],
};

const formOf = (p: Product): Form => ({
  name: p.name,
  favorite: p.favorite,
  notes: p.notes,
  tracking: p.tracking,
  category: p.category,
  variants: p.variants.map((v) => ({
    key: newKey(),
    name: v.attribute,
    labels: v.values.map((x) => ({ key: newKey(), name: x.name, color: x.color })),
  })),
  label_ids: p.labels.map((l) => String(l.id)),
});

/** The variants to save: an attribute left empty, or a value without a name, is dropped. */
const variantsOf = (groups: GroupDraft[]): ProductVariant[] =>
  groups
    .map((g) => ({
      attribute: g.name.trim(),
      values: g.labels
        .filter((l) => l.name.trim())
        .map((l) => ({ name: l.name.trim(), color: l.color })),
    }))
    .filter((v) => v.attribute || v.values.length);

const inputOf = (f: Form): ProductInput => ({
  name: f.name.trim(),
  favorite: f.favorite,
  notes: f.notes.trim(),
  tracking: f.tracking,
  category: f.category,
  variants: variantsOf(f.variants),
  label_ids: f.label_ids.map(Number),
});

/**
 * A file waiting for its product to be created: shown like a sent one, a
 * negative id and a local address in place of the server's.
 */
interface Pending {
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
const pendingOf = (file: File): Pending => ({
  id: -++pendingCounter,
  name: file.name,
  size: file.size,
  url: URL.createObjectURL(file),
  created_at: new Date().toISOString(),
  is_image: file.type.startsWith("image/"),
  upload: file,
});

/** The list in the order of the ids received; an unknown id is ignored. */
const ordered = <T extends { id: Id }>(list: T[], ids: Id[]): T[] =>
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
  canSave: boolean;
  canDelete: boolean;
}

export default function ProductDrawer({
  opened,
  onClose,
  boardId,
  listKey,
  product,
  onSaved,
  canSave,
  canDelete,
}: ProductDrawerProps) {
  const [form, setForm] = useState<Form>(EMPTY);
  const [labels, setLabels] = useState<Label[]>([]);
  const [settings, setSettings] = useState<ProductSettings>({ categories: [] });
  // The board's categories tree, to pick the product's from.
  const categoryData = useMemo(() => locationTreeData(settings.categories), [settings.categories]);
  // The star's button, hovered: it takes the neutral gray.
  const [starHovered, setStarHovered] = useState(false);
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

  const readLabels = useCallback(async () => {
    try {
      setLabels(await api.getProductLabels(boardId));
    } catch (e) {
      notifyError(errorMessage(e));
    }
  }, [boardId]);

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
    setForm(product ? formOf(product) : EMPTY);
    setActiveTab("settings");
    setPhotos([]);
    setAttachments([]);
    setComments([]);
    void readLabels();
    api
      .getProductSettings(boardId)
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
  }, [opened, product, boardId, readLabels, readComments]);

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
      }
      onSaved();
      onClose();
    } catch (e) {
      notifyError(errorMessage(e));
    } finally {
      setSaving(false);
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
                    boardId={boardId}
                    onLabelsChanged={readLabels}
                    labelsApi={PRODUCT_LABELS_API}
                  />

                  {/* The name, its favorite star at its right: a filled,
                      yellow star marks a favorite. */}
                  <TextInput
                    label="Nom"
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
                      60 % and 40 % of it. */}
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
          onDelete={product && canDelete ? () => setConfirmDelete(true) : undefined}
          saving={saving}
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
