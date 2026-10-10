import {
  ActionIcon,
  Cascader,
  Drawer,
  Group,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Textarea,
  TextInput,
} from "@mantine/core";
import {
  IconCertificate,
  IconExternalLink,
  IconId,
  IconPaperclip,
  IconPhoto,
} from "@tabler/icons-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IMAGE_MIME_TYPE } from "@mantine/dropzone";
import {
  DECLARED_ASSET_DESCRIPTION_MAX,
  DECLARED_ASSET_EXTRAS,
  DECLARED_ASSET_NAME_MAX,
  DECLARED_ASSET_PRICE_MAX,
  DECLARED_ASSET_QUANTITY_MAX,
  DECLARED_ASSET_TYPED_VALUE_MAX,
  DECLARED_ASSET_VERSION_MAX,
  DECLARED_ASSET_WEBSITE_MAX,
  DECLARED_ASSET_WORDS,
} from "@milo/shared";
import type {
  DeclaredAsset,
  DeclaredAssetAttachment,
  DeclaredAssetInput,
  DeclaredAssetKind,
  DeclaredAssetPhoto,
  DeclaredAssetSettings,
  DeclaredAssetTypedValue,
  Id,
  Label,
} from "@milo/shared";
import { api } from "../../api";
import { errorMessage, notifyError } from "../../lib/errors";
import { BARE_FIELDSET } from "../../lib/rights";
import { shrinkImage } from "../../lib/shrinkImage";
import { useFileDrag } from "../../lib/useFileDrag";
import { useUsers } from "../../lib/users";
import CardAttachments from "../board/CardAttachments";
import CardCovers from "../board/CardCovers";
import { ACTOR_GAP } from "../ui/ActorAvatars";
import ActorPicker from "../ui/ActorPicker";
import DeleteConfirmModal from "../ui/DeleteConfirmModal";
import DrawerFooter from "../ui/DrawerFooter";
import DrawerScrollArea, { DRAWER_PADDING, DRAWER_STYLES } from "../ui/DrawerScroll";
import { TREE_CASCADER, locationTreeData, treePath } from "../ui/EditableTree";
import { pluralize } from "../ui/DrawerRows";
import { ListRows } from "../ui/EditableRows";
import LabelPicker, { declaredAssetLabelsApi } from "../ui/LabelPicker";
import PrintLabelButton from "../ui/PrintLabelButton";
import GenerateNumberButton from "./GenerateNumberButton";

// A declared asset's drawer, laid out like a card's (CardDrawer): its actors
// and labels first, then its name; its category, maker and product on one
// line — a device type, a brand and a model; a software type, a publisher and
// an application —, its supplier, quantity and price on another — the names
// chosen in the board's lists (DeclaredAssetTablesFields) —; a description
// and notes. A device has more after its supplier: its location — a place of
// its board's locations tree, Société > Bâtiment > Baie > Position, picked in
// a Cascader —, and its identifications — typed values, a serial number, a
// service tag —; an application, under what names it, its version and
// website, and after its supplier, its license information, typed values too;
// then its photos and documents, in the same blocks as a card's covers and
// attachments. Empty, each shows a drop zone; with files, the zones come back
// while files are dragged over the drawer.
//
// The record goes with "Sauvegarder". The photos and documents of an
// existing asset go out on upload, as a card's; those of an asset being
// added wait for it to be created, then follow.

// The height of the actor and label chips, as on a card.
const CHIP_HEIGHT = 30;

/** The width of a typed value's type, before its value. */
const TYPE_WIDTH = 200;

/**
 * The lists of typed values: a device's identifications — their types from
 * the board's identification types —, an application's license information.
 */
const TYPED_LISTS = [
  {
    field: "identifications",
    types: "identification_types",
    title: "Identification",
    icon: IconId,
    none: "Aucune identification",
    add: "Ajouter une identification",
    remove: "Supprimer l'identification",
    word: "identification",
  },
  {
    field: "license_infos",
    types: "license_info_types",
    title: "Informations de licence",
    icon: IconCertificate,
    none: "Aucune information de licence",
    add: "Ajouter une information",
    remove: "Supprimer l'information",
    word: "information",
  },
] as const;

/** A website as typed — "editeur.fr" —, as a link opens it. */
const websiteHref = (typed: string): string =>
  /^[a-z][a-z0-9+.-]*:/i.test(typed.trim()) ? typed.trim() : `https://${typed.trim()}`;

/**
 * The asset field's buttons — generate, print —: two "md" ones (28 px), apart
 * and away from the field's edge by the same gap.
 */
const NAME_BUTTONS_GAP = 4;
const NAME_BUTTONS_WIDTH = 2 * 28 + 2 * NAME_BUTTONS_GAP;

// The widths of the quantity and the price, on the supplier's line.
const QUANTITY_WIDTH = 100;
const PRICE_WIDTH = 140;

const PHOTO_WORDS = { title: "Photos", one: "la photo", many: "photos" };
const DOCUMENT_WORDS = { title: "Documents", one: "le document", many: "documents" };

interface Form {
  name: string;
  actor_ids: string[];
  label_ids: string[];
  category: string;
  supplier: string;
  maker: string;
  product: string;
  quantity: number | "";
  price: number | "";
  description: string;
  notes: string;
  /** A device's identifications and place; an application's version, website and license information. */
  identifications: DeclaredAssetTypedValue[];
  location: string;
  version: string;
  website: string;
  license_infos: DeclaredAssetTypedValue[];
}

const EMPTY: Form = {
  name: "",
  actor_ids: [],
  label_ids: [],
  category: "",
  supplier: "",
  maker: "",
  product: "",
  quantity: 1,
  price: "",
  description: "",
  notes: "",
  identifications: [],
  location: "",
  version: "",
  website: "",
  license_infos: [],
};

const formOf = (asset: DeclaredAsset): Form => ({
  name: asset.name,
  actor_ids: asset.actors.map((a) => String(a.id)),
  label_ids: asset.labels.map((l) => String(l.id)),
  category: asset.category,
  supplier: asset.supplier,
  maker: asset.maker,
  product: asset.product,
  quantity: asset.quantity,
  price: asset.price ?? "",
  description: asset.description,
  notes: asset.notes,
  identifications: asset.identifications ?? [],
  location: asset.location ?? "",
  version: asset.version ?? "",
  website: asset.website ?? "",
  license_infos: asset.license_infos ?? [],
});

/** What the server receives: the extra fields of the kind only. */
const inputOf = (kind: DeclaredAssetKind, form: Form): DeclaredAssetInput => ({
  ...form,
  identifications: undefined,
  location: undefined,
  version: undefined,
  website: undefined,
  license_infos: undefined,
  ...Object.fromEntries(DECLARED_ASSET_EXTRAS[kind].map((f) => [f, form[f]])),
  actor_ids: form.actor_ids.map(Number),
  label_ids: form.label_ids.map(Number),
  quantity: form.quantity === "" ? 1 : form.quantity,
  price: form.price === "" ? null : form.price,
});

const NO_LISTS: DeclaredAssetSettings = { categories: [], suppliers: [], makers: [], products: [] };

/**
 * A choice among names, which keeps the current one even if it has left its
 * list: an asset keeps the maker it was given.
 */
const options = (names: string[], current: string): string[] =>
  current && !names.includes(current) ? [current, ...names] : names;

/**
 * A file waiting for its asset to be created: shown like a sent one, a
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

interface DeclaredAssetDrawerProps {
  kind: DeclaredAssetKind;
  opened: boolean;
  onClose: () => void;
  boardId: Id;
  /** The widget it is added from (LIST_KEY). */
  listKey: string;
  /** The asset shown; null to add one. */
  asset: DeclaredAsset | null;
  /** After a write: the list re-reads. */
  onSaved: () => void;
  canSave: boolean;
  canDelete: boolean;
}

export default function DeclaredAssetDrawer({
  kind,
  opened,
  onClose,
  boardId,
  listKey,
  asset,
  onSaved,
  canSave,
  canDelete,
}: DeclaredAssetDrawerProps) {
  // The kind's words: a device type, a brand and a model; a software type, a
  // publisher and an application.
  const words = DECLARED_ASSET_WORDS[kind];
  const extras = DECLARED_ASSET_EXTRAS[kind];
  const users = useUsers();
  const [form, setForm] = useState<Form>(EMPTY);
  const [lists, setLists] = useState<DeclaredAssetSettings>(NO_LISTS);
  const [labels, setLabels] = useState<Label[]>([]);
  const [photos, setPhotos] = useState<(DeclaredAssetPhoto | Pending)[]>([]);
  const [attachments, setAttachments] = useState<(DeclaredAssetAttachment | Pending)[]>([]);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const photoField = useRef<HTMLInputElement>(null);
  const fileField = useRef<HTMLInputElement>(null);
  // Files dragged over the page: the drop zones show, even under full lists.
  const dragging = useFileDrag(opened && canSave);
  const readOnly = !canSave;

  const readLabels = useCallback(async () => {
    try {
      setLabels(await api.getDeclaredAssetLabels(kind, boardId));
    } catch (e) {
      notifyError(errorMessage(e));
    }
  }, [kind, boardId]);

  // Each opening starts from the asset, and re-reads the board's lists,
  // its labels and the asset's files.
  useEffect(() => {
    if (!opened) return;
    setForm(asset ? formOf(asset) : EMPTY);
    setPhotos([]);
    setAttachments([]);
    api
      .getDeclaredAssetSettings(kind, boardId)
      .then(setLists)
      .catch((e) => notifyError(errorMessage(e)));
    void readLabels();
    if (asset) {
      api
        .getDeclaredAssetFiles(kind, asset.id)
        .then((files) => {
          setPhotos(files.photos);
          setAttachments(files.attachments);
        })
        .catch((e) => notifyError(errorMessage(e)));
    }
  }, [opened, asset, kind, boardId, readLabels]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // With a category chosen, only the makers that have a product of it;
  // all of them otherwise.
  const makers = form.category
    ? lists.makers
        .map((b) => b.name)
        .filter((name) =>
          lists.products.some((m) => m.maker === name && m.category === form.category),
        )
    : lists.makers.map((b) => b.name);

  // The products of the chosen maker and category — all of them while none is chosen.
  // The board's locations tree, to pick the device's place from.
  const locationData = useMemo(() => locationTreeData(lists.locations ?? []), [lists.locations]);

  const products = lists.products
    .filter(
      (m) =>
        (!form.maker || m.maker === form.maker) &&
        (!form.category || m.category === form.category),
    )
    .map((m) => m.name);

  // --- Photos and attachments ----------------------------------------------

  /** Chosen photos: sent at once for an asset that exists, kept otherwise. */
  const addPhotos = async (files: File[]) => {
    for (const file of files) {
      const shrunk = await shrinkImage(file);
      if (!asset) {
        setPhotos((already) => [...already, pendingOf(shrunk)]);
        continue;
      }
      try {
        const photo = await api.uploadDeclaredAssetPhoto(kind, asset.id, shrunk);
        setPhotos((already) => [...already, photo]);
      } catch (e) {
        notifyError(errorMessage(e));
      }
    }
  };

  /** Chosen attachments: the most recent first, as the server places them. */
  const addAttachments = async (files: File[]) => {
    for (const file of files) {
      if (!asset) {
        setAttachments((already) => [pendingOf(file), ...already]);
        continue;
      }
      try {
        const attachment = await api.uploadDeclaredAssetAttachment(kind, asset.id, file);
        setAttachments((already) => [attachment, ...already]);
      } catch (e) {
        notifyError(errorMessage(e));
      }
    }
  };

  const arrangePhotos = async (ids: Id[]) => {
    setPhotos((already) => ordered(already, ids));
    if (!asset) return;
    try {
      setPhotos(await api.reorderDeclaredAssetPhotos(kind, asset.id, ids));
    } catch (e) {
      notifyError(errorMessage(e));
    }
  };

  const arrangeAttachments = async (ids: Id[]) => {
    setAttachments((already) => ordered(already, ids));
    if (!asset) return;
    try {
      setAttachments(await api.reorderDeclaredAssetAttachments(kind, asset.id, ids));
    } catch (e) {
      notifyError(errorMessage(e));
    }
  };

  const deletePhoto = async (photo: DeclaredAssetPhoto | Pending) => {
    try {
      if ("upload" in photo) URL.revokeObjectURL(photo.url);
      else await api.deleteDeclaredAssetPhoto(kind, photo.id);
      setPhotos((already) => already.filter((p) => p.id !== photo.id));
    } catch (e) {
      notifyError(errorMessage(e));
    }
  };

  const deleteAttachment = async (attachment: DeclaredAssetAttachment | Pending) => {
    try {
      if ("upload" in attachment) URL.revokeObjectURL(attachment.url);
      else await api.deleteDeclaredAssetAttachment(kind, attachment.id);
      setAttachments((already) => already.filter((a) => a.id !== attachment.id));
    } catch (e) {
      notifyError(errorMessage(e));
    }
  };

  /**
   * The files kept while adding, sent once the asset exists: the photos
   * in their order; the attachments from the last, each placed first.
   */
  const sendPending = async (id: Id) => {
    for (const photo of photos) {
      if (!("upload" in photo)) continue;
      await api.uploadDeclaredAssetPhoto(kind, id, photo.upload);
      URL.revokeObjectURL(photo.url);
    }
    for (const attachment of [...attachments].reverse()) {
      if (!("upload" in attachment)) continue;
      await api.uploadDeclaredAssetAttachment(kind, id, attachment.upload);
      URL.revokeObjectURL(attachment.url);
    }
  };

  // --- Save and delete -----------------------------------------------------

  const persist = async () => {
    if (!form.name.trim()) {
      notifyError("Le champ « Asset » est requis");
      return;
    }
    setSaving(true);
    try {
      if (asset) {
        await api.updateDeclaredAsset(kind, asset.id, inputOf(kind, form));
      } else {
        const created = await api.createDeclaredAsset(kind, {
          ...inputOf(kind, form),
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
    if (!asset) return;
    setConfirmDelete(false);
    try {
      await api.deleteDeclaredAsset(kind, asset.id);
      onSaved();
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
        size={560}
        padding={DRAWER_PADDING}
        withCloseButton={false}
        styles={DRAWER_STYLES}
      >
        <DrawerScrollArea>
          {/* Read-only, all the fields are disabled at once. */}
          <fieldset disabled={readOnly} style={BARE_FIELDSET}>
            <Stack gap="xl">
              {/* As on a card: the actors and the labels open the form,
                  the width split 30 / 70, in proportions. */}
              <Group align="flex-start" gap="md" wrap="nowrap">
                <div style={{ flex: "3 1 0", minWidth: 0 }}>
                  <ActorPicker
                    kind={kind}
                    chipHeight={CHIP_HEIGHT}
                    chipGap={ACTOR_GAP}
                    label="Acteurs"
                    users={users}
                    value={form.actor_ids}
                    onChange={(ids) => set("actor_ids", ids)}
                  />
                </div>
                <div style={{ flex: "7 1 0", minWidth: 0 }}>
                  <LabelPicker
                    chipHeight={CHIP_HEIGHT}
                    labels={labels}
                    value={form.label_ids}
                    onChange={(ids) => set("label_ids", ids)}
                    boardId={boardId}
                    onLabelsChanged={readLabels}
                    labelsApi={declaredAssetLabelsApi(kind)}
                  />
                </div>
              </Group>

              <TextInput
                label="Asset"
                placeholder="Asset"
                value={form.name}
                onChange={(e) => set("name", e.currentTarget.value)}
                maxLength={DECLARED_ASSET_NAME_MAX}
                required
                // On the right, a number drawn from the board's formats, from
                // the labels chosen — a new asset's too —, then the saved
                // asset's label, printed from the board's templates.
                rightSectionWidth={NAME_BUTTONS_WIDTH}
                rightSection={
                  <Group gap={NAME_BUTTONS_GAP} wrap="nowrap" justify="flex-end" w="100%" pr={NAME_BUTTONS_GAP}>
                    <GenerateNumberButton
                      kind={kind}
                      boardId={boardId}
                      labels={labels.filter((l) => form.label_ids.includes(String(l.id)))}
                      onGenerated={(number) => set("name", number)}
                      disabled={readOnly}
                    />
                    {asset && <PrintLabelButton kind={kind} boardId={boardId} assetId={asset.id} />}
                  </Group>
                }
              />

              <Group align="flex-start" gap="md" wrap="nowrap">
                <Select
                  label={words.category.title}
                  placeholder={`Choisir ${words.category.a}`}
                  data={options(
                    lists.categories.map((t) => t.name),
                    form.category,
                  )}
                  value={form.category || null}
                  onChange={(v) =>
                    // Another category: the maker and product chosen stay only if
                    // they still go with it.
                    setForm((f) => {
                      const type = v ?? "";
                      const fits = (maker: string, product?: string) =>
                        !type ||
                        lists.products.some(
                          (m) =>
                            m.category === type &&
                            m.maker === maker &&
                            (product === undefined || m.name === product),
                        );
                      const maker = f.maker && fits(f.maker) ? f.maker : "";
                      const product = maker && f.product && fits(maker, f.product) ? f.product : "";
                      return { ...f, category: type, maker, product };
                    })
                  }
                  nothingFoundMessage={words.category.none}
                  clearable
                  searchable
                  style={{ flex: 1, minWidth: 0 }}
                />
                <Select
                  label={words.maker.title}
                  placeholder={`Choisir ${words.maker.a}`}
                  data={options(makers, form.maker)}
                  value={form.maker || null}
                  onChange={(v) =>
                    // Another maker: the product chosen is no longer one of its.
                    setForm((f) => ({
                      ...f,
                      maker: v ?? "",
                      product: lists.products.some((m) => m.maker === v && m.name === f.product)
                        ? f.product
                        : "",
                    }))
                  }
                  nothingFoundMessage={words.maker.none}
                  clearable
                  searchable
                  style={{ flex: 1, minWidth: 0 }}
                />
                <Select
                  label={words.product.title}
                  placeholder={`Choisir ${words.product.a}`}
                  data={options([...new Set(products)], form.product)}
                  value={form.product || null}
                  onChange={(v) => {
                    const chosen = lists.products.find(
                      (m) => m.name === v && (!form.maker || m.maker === form.maker),
                    );
                    // A product chosen first brings its maker and its category.
                    setForm((f) => ({
                      ...f,
                      product: v ?? "",
                      maker: f.maker || chosen?.maker || "",
                      category: f.category || chosen?.category || "",
                    }));
                  }}
                  nothingFoundMessage={words.product.none}
                  clearable
                  searchable
                  style={{ flex: 1, minWidth: 0 }}
                />
              </Group>

              {/* An application's version and website, under what names it. */}
              {extras.includes("version") && (
                // Three columns, as the line above: the version as wide as
                // the category, the website the rest.
                <SimpleGrid cols={3} spacing="md">
                  <TextInput
                    label="Version"
                    placeholder="Version"
                    value={form.version}
                    onChange={(e) => set("version", e.currentTarget.value)}
                    maxLength={DECLARED_ASSET_VERSION_MAX}
                  />
                  <TextInput
                    label="Site web"
                    placeholder="https://"
                    value={form.website}
                    onChange={(e) => set("website", e.currentTarget.value)}
                    maxLength={DECLARED_ASSET_WEBSITE_MAX}
                    style={{ gridColumn: "span 2", minWidth: 0 }}
                    // The site opens from the field — an anchor, which a
                    // read-only record does not turn off.
                    rightSection={
                      form.website.trim() ? (
                        <ActionIcon
                          component="a"
                          href={websiteHref(form.website)}
                          target="_blank"
                          rel="noopener noreferrer"
                          variant="subtle"
                          color="gray"
                          aria-label="Ouvrir le site web"
                        >
                          <IconExternalLink size={16} />
                        </ActionIcon>
                      ) : null
                    }
                  />
                </SimpleGrid>
              )}


              <Group align="flex-start" gap="md" wrap="nowrap">
                <Select
                  label="Fournisseur"
                  placeholder="Choisir un fournisseur"
                  data={options(
                    lists.suppliers.map((s) => s.name),
                    form.supplier,
                  )}
                  value={form.supplier || null}
                  onChange={(v) => set("supplier", v ?? "")}
                  nothingFoundMessage="Aucun fournisseur"
                  clearable
                  searchable
                  style={{ flex: 1, minWidth: 0 }}
                />
                <NumberInput
                  label="Quantité"
                  value={form.quantity}
                  onChange={(v) => set("quantity", typeof v === "number" ? v : "")}
                  min={0}
                  max={DECLARED_ASSET_QUANTITY_MAX}
                  allowDecimal={false}
                  allowNegative={false}
                  w={QUANTITY_WIDTH}
                />
                <NumberInput
                  label="Prix"
                  placeholder="0,00"
                  value={form.price}
                  onChange={(v) => set("price", typeof v === "number" ? v : "")}
                  min={0}
                  max={DECLARED_ASSET_PRICE_MAX}
                  decimalScale={2}
                  decimalSeparator=","
                  thousandSeparator=" "
                  allowNegative={false}
                  suffix=" €"
                  hideControls
                  w={PRICE_WIDTH}
                />
              </Group>

              {/* A device's place, then its identifications; an
                  application's license information: lists of typed values. */}
              {extras.includes("location") && (
                // In columns, level after level; any level may be chosen. The
                // device keeps the place's id, the field reads its path.
                <Cascader
                  label="Emplacement"
                  placeholder="Choisir un emplacement"
                  data={locationData}
                  value={form.location ? treePath(lists.locations ?? [], form.location) : null}
                  onChange={(path) => set("location", path?.at(-1) ?? "")}
                  nothingFoundMessage="Aucun emplacement"
                  {...TREE_CASCADER}
                  clearable
                  searchable
                />
              )}
              {TYPED_LISTS.filter((l) => extras.includes(l.field)).map((l) => {
                const types = (lists[l.types] ?? []).map((t) => t.name);
                // A type no longer in the board's list still shows on its rows.
                const used = form[l.field].map((v) => v.type).filter((t) => !types.includes(t));
                return (
                  <ListRows
                    key={l.field}
                    title={l.title}
                    columns={[
                      {
                        label: "Type",
                        maxLength: DECLARED_ASSET_NAME_MAX,
                        width: TYPE_WIDTH,
                        options: [...new Set([...types, ...used])],
                      },
                      { label: "Valeur", maxLength: DECLARED_ASSET_TYPED_VALUE_MAX },
                    ]}
                    rows={form[l.field].map((v) => [v.type, v.value])}
                    save={async (rows) => {
                      set(
                        l.field,
                        rows.map(([type = "", value = ""]) => ({ type, value })),
                      );
                      return true;
                    }}
                    emptyIcon={l.icon}
                    emptyText={l.none}
                    addLabel={l.add}
                    deleteTitle={l.remove}
                    several={(n) => pluralize(n, l.word)}
                    nameOf={([type = "", value = ""]) => `${type} ${value}`}
                  />
                );
              })}
              <Textarea
                label="Description"
                placeholder="Description"
                value={form.description}
                onChange={(e) => set("description", e.currentTarget.value)}
                maxLength={DECLARED_ASSET_DESCRIPTION_MAX}
                autosize
                minRows={3}
              />
              <Textarea
                label="Notes"
                placeholder="Notes"
                value={form.notes}
                onChange={(e) => set("notes", e.currentTarget.value)}
                maxLength={DECLARED_ASSET_DESCRIPTION_MAX}
                autosize
                minRows={3}
              />

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
                        message: "Déposez des documents ici",
                        onDrop: (files) => void addAttachments(files),
                        shown: dragging,
                      }
                }
                words={DOCUMENT_WORDS}
              />
            </Stack>
          </fieldset>
        </DrawerScrollArea>

        <DrawerFooter
          onSave={canSave ? persist : undefined}
          onClose={onClose}
          onDelete={asset && canDelete ? () => setConfirmDelete(true) : undefined}
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
        title="Supprimer l'asset"
        message={
          <>
            Voulez-vous vraiment supprimer
            {form.name ? ` « ${form.name} »` : " cet asset"} ? Cette action est irréversible.
          </>
        }
      />
    </>
  );
}
