import {
  ActionIcon,
  Cascader,
  Drawer,
  Group,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Text,
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
import { DatePickerInput } from "@mantine/dates";
import { useElementSize } from "@mantine/hooks";
import { IMAGE_MIME_TYPE } from "@mantine/dropzone";
import {
  DECLARED_ASSET_DESCRIPTION_MAX,
  DECLARED_ASSET_EXTRAS,
  DECLARED_ASSET_NAME_MAX,
  DECLARED_ASSET_PRICE_MAX,
  DECLARED_ASSET_QUANTITY_MAX,
  DECLARED_ASSET_SUPPLIER_SOURCES,
  DECLARED_ASSET_TYPED_VALUE_MAX,
  DECLARED_ASSET_VERSION_MAX,
  DECLARED_ASSET_WEBSITE_MAX,
  DECLARED_ASSET_WORDS,
  TAX_SOURCES,
  accessIncludes,
  sourcesOf,
} from "@milo/shared";
import type { TreeNodeData } from "@mantine/core";
import type {
  Contact,
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
import { listOf } from "../../lib/list-ref";
import { errorMessage, notifyError } from "../../lib/errors";
import { BARE_FIELDSET } from "../../lib/rights";
import { shrinkImage } from "../../lib/shrinkImage";
import { useSources } from "../../lib/sources";
import { taxChoice, useOfferedTaxes } from "../../lib/taxes";
import { createSupplier, useSuppliers } from "../../lib/suppliers";
import { useWidgetAccess } from "../../lib/rights";
import ContactDrawer from "../contacts/ContactDrawer";
import CreateFromSearch, { wideDropdown } from "../ui/CreateFromSearch";
import { useFileDrag } from "../../lib/useFileDrag";
import { useFilePaste } from "../../lib/useFilePaste";
import { useUsers } from "../../lib/users";
import CardAttachments from "../board/CardAttachments";
import CardCovers from "../board/CardCovers";
import { ACTOR_GAP } from "../ui/ActorAvatars";
import ActorPicker from "../ui/ActorPicker";
import DeleteConfirmModal from "../ui/DeleteConfirmModal";
import DrawerFooter from "../ui/DrawerFooter";
import DrawerScrollArea, { DRAWER_PADDING, DRAWER_STYLES } from "../ui/DrawerScroll";
import AddButton from "../ui/AddButton";
import { TREE_CASCADER, locationTreeData, treePath } from "../ui/EditableTree";
import { pluralize } from "../ui/DrawerRows";
import { ListRows } from "../ui/EditableRows";
import LabelPicker, { declaredAssetLabelsApi } from "../ui/LabelPicker";
import PrintLabelButton from "../ui/PrintLabelButton";
import AddDeclaredProductModal from "./AddDeclaredProductModal";
import AddDeclaredTreeNodeModal from "./AddDeclaredTreeNodeModal";
import GenerateNumberButton from "./GenerateNumberButton";

// A declared asset's drawer, laid out like a card's (CardDrawer): its actors
// and labels first, then its name; its product — a model, an application —,
// picked in a Cascader through its category and its maker — a device type
// and a brand; a software type and a publisher —, or added from under it;
// its supplier — a company of the Contact widgets its widget names —,
// quantity and price on another line; a description
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

/** The purchase date's width, beside the asset's number. */
const PURCHASE_DATE_WIDTH = 160;

/** The quantity, the price and its tax on the right, their labels too, as in the list. */
const NUMBER_STYLES = {
  label: { display: "block", textAlign: "right" as const },
  input: { textAlign: "right" as const },
};
/** The quantity, 10px away from its arrows. */
const QUANTITY_STYLES = {
  ...NUMBER_STYLES,
  input: { ...NUMBER_STYLES.input, paddingInlineEnd: "calc(var(--input-padding-inline-end) + 10px)" },
};

/** A device's places, as the window that adds one names them. */
const LOCATION_NOUN = { a: "un emplacement", ofThe: "de l'emplacement", none: "Aucun emplacement" };

const PHOTO_WORDS = { title: "Photos", one: "la photo", many: "photos" };
const DOCUMENT_WORDS = { title: "Documents", one: "le document", many: "documents" };

interface Form {
  name: string;
  actor_ids: string[];
  label_ids: string[];
  category: string;
  /** A company of the associated Contact widgets, by its id as a string. */
  supplier_id: string | null;
  /** The name kept by an asset from before the link, without an id. */
  supplier: string;
  maker: string;
  product: string;
  quantity: number | "";
  /** Before tax. */
  price: number | "";
  /** Its tax's rate, as a string — the choice's value —; null, none. */
  tax: string | null;
  /** "2026-10-12"; empty, none. */
  purchase_date: string;
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
  supplier_id: null,
  supplier: "",
  maker: "",
  product: "",
  quantity: 1,
  price: "",
  tax: null,
  purchase_date: "",
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
  supplier_id: asset.supplier_id == null ? null : String(asset.supplier_id),
  supplier: asset.supplier,
  maker: asset.maker,
  product: asset.product,
  quantity: asset.quantity,
  price: asset.price ?? "",
  tax: asset.tax == null ? null : String(asset.tax),
  purchase_date: asset.purchase_date ?? "",
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
  supplier_id: form.supplier_id ? Number(form.supplier_id) : null,
  actor_ids: form.actor_ids.map(Number),
  label_ids: form.label_ids.map(Number),
  quantity: form.quantity === "" ? 1 : form.quantity,
  price: form.price === "" ? null : form.price,
  tax: form.tax === null ? null : Number(form.tax),
});

/** The choice standing for the name an asset from before the link was given. */
const LEGACY_SUPPLIER = "legacy";

const NO_LISTS: DeclaredAssetSettings = { categories: [], suppliers: [], makers: [], products: [] };

/** A level of the products Cascader: a category, a maker, a product — unique in the tree. */
const categoryValue = (id: string) => JSON.stringify(["c", id]);
const makerValue = (categoryId: string, maker: string) => JSON.stringify(["m", categoryId, maker]);
const productValue = (p: { category: string; maker: string; name: string }) =>
  JSON.stringify(["p", p.category, p.maker, p.name]);

/**
 * The products as a Cascader reads them: the categories tree, under each
 * category the makers of its own products, under each maker its products.
 * A category with no product, even below, is left out: nothing to pick there.
 */
const productTreeData = (lists: DeclaredAssetSettings): TreeNodeData[] => {
  const childrenOf = (parent: string | null): TreeNodeData[] =>
    lists.categories
      .filter((c) => c.parent === parent)
      .map((c): TreeNodeData => {
        const own = lists.products.filter((p) => p.category === c.id);
        const makers = [...new Set(own.map((p) => p.maker))].map((maker) => ({
          value: makerValue(c.id, maker),
          label: maker,
          children: own
            .filter((p) => p.maker === maker)
            .map((p) => ({ value: productValue(p), label: p.name })),
        }));
        return { value: categoryValue(c.id), label: c.name, children: [...childrenOf(c.id), ...makers] };
      })
      .filter((c) => c.children!.length > 0);
  return childrenOf(null);
};

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
  /** Its widget's configuration: the Contact widgets its suppliers come from. */
  config: unknown;
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
  config,
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
  /** The window that adds a product to the board's lists. */
  const [addingProduct, setAddingProduct] = useState(false);
  /** The window that adds a place to the board's locations tree. */
  const [addingLocation, setAddingLocation] = useState(false);
  const photoField = useRef<HTMLInputElement>(null);
  const fileField = useRef<HTMLInputElement>(null);
  // Files dragged over the page: the drop zones show, even under full lists.
  const dragging = useFileDrag(opened && canSave);
  // Files pasted into the page: they join the attachments, as if dropped.
  useFilePaste(opened && canSave, (files) => void addAttachments(files));
  const readOnly = !canSave;

  // The suppliers: the companies of the Contact widgets its widget names.
  // The field's width: its dropdown is never narrower, and widens with what it shows.
  const { ref: supplierField, width: supplierWidth } = useElementSize();
  const supplierSources = useSources("contact.list", config, DECLARED_ASSET_SUPPLIER_SOURCES);
  // The taxes offered: those of the associated Taxes widgets, in their order.
  const taxes = useOfferedTaxes(config);
  const { suppliers, contacts } = useSuppliers(opened ? supplierSources : []);
  // What the supplier's search holds: a company not found is created from it,
  // in the first Contact widget named — opened afterwards, to be completed.
  const [supplierSearch, setSupplierSearch] = useState("");
  const [editedSupplier, setEditedSupplier] = useState<Contact | null>(null);
  const supplierWidget = supplierSources[0];
  const logistics = useWidgetAccess()("logistics");
  const canAddSupplier = !readOnly && Boolean(supplierWidget) && accessIncludes(logistics, "update");
  const createSupplierFromSearch = async (name: string, edit: boolean) => {
    if (!supplierWidget) return;
    try {
      const contact = await createSupplier(supplierWidget, name);
      setForm((f) => ({ ...f, supplier_id: String(contact.id), supplier: contact.name }));
      setSupplierSearch("");
      (document.activeElement as HTMLElement | null)?.blur();
      if (edit) setEditedSupplier(contact);
    } catch (e) {
      notifyError(errorMessage(e));
    }
  };
  const supplierData = useMemo(() => {
    const data = (suppliers ?? []).map((s) => ({ value: String(s.contact.id), label: s.contact.name }));
    // One no longer among them still shows, by its name; an asset from
    // before the link, the name it was given.
    if (form.supplier_id && !data.some((d) => d.value === form.supplier_id)) {
      data.unshift({ value: form.supplier_id, label: form.supplier || `#${form.supplier_id}` });
    } else if (!form.supplier_id && form.supplier) {
      data.unshift({ value: LEGACY_SUPPLIER, label: form.supplier });
    }
    return data;
  }, [suppliers, form.supplier_id, form.supplier]);

  // Its labels and lists are its widget's: the asset's own, or the one it is
  // added from.
  const list = useMemo(
    () => (asset ? listOf(asset) : { board: boardId, list: listKey }),
    [asset, boardId, listKey],
  );

  const readLabels = useCallback(async () => {
    try {
      setLabels(await api.getDeclaredAssetLabels(kind, list));
    } catch (e) {
      notifyError(errorMessage(e));
    }
  }, [kind, list]);

  // Each opening starts from the asset, and re-reads its widget's lists,
  // its labels and the asset's files.
  useEffect(() => {
    if (!opened) return;
    setForm(asset ? formOf(asset) : EMPTY);
    setPhotos([]);
    setAttachments([]);
    api
      .getDeclaredAssetSettings(kind, list)
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
  }, [opened, asset, kind, list, readLabels]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // The board's products, to pick the asset's from through its category and
  // its maker.
  const productData = useMemo(() => productTreeData(lists), [lists]);

  /** The asset's product as the Cascader's path: none for one no longer in the lists. */
  const productPath = (): string[] | null => {
    const chosen = lists.products.find(
      (p) => p.category === form.category && p.maker === form.maker && p.name === form.product,
    );
    if (!chosen) return null;
    return [
      ...treePath(lists.categories, chosen.category).map(categoryValue),
      makerValue(chosen.category, chosen.maker),
      productValue(chosen),
    ];
  };

  // The board's locations tree, to pick the device's place from. When the
  // asset carries a label a root is tied to, only those roots are offered,
  // with the roots tied to none — and the place it already has.
  const locationData = useMemo(() => {
    const locations = lists.locations ?? [];
    const tied = new Set(locations.flatMap((l) => (l.parent === null && l.label ? [String(l.label)] : [])));
    const carried = new Set(form.label_ids.filter((id) => tied.has(id)));
    if (carried.size === 0) return locationTreeData(locations);
    const current = form.location ? treePath(locations, form.location)[0] : undefined;
    const roots = new Set(
      locations
        .filter((l) => l.parent === null && (!l.label || carried.has(String(l.label)) || l.id === current))
        .map((l) => l.id),
    );
    // A parent comes before its children: what is under a kept root is kept.
    const kept = new Set<string>();
    for (const l of locations) if (l.parent === null ? roots.has(l.id) : kept.has(l.parent)) kept.add(l.id);
    return locationTreeData(locations.filter((l) => kept.has(l.id)));
  }, [lists.locations, form.label_ids, form.location]);

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
    if (!form.product) {
      notifyError(`Le champ « ${words.product.title} » est requis`);
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
                    list={list}
                    onLabelsChanged={readLabels}
                    labelsApi={declaredAssetLabelsApi(kind)}
                  />
                </div>
              </Group>

              {/* The asset's number, then on its right its purchase date. */}
              <Group align="flex-start" gap="md" wrap="nowrap">
                <TextInput
                  label="Asset"
                  placeholder="Asset"
                  style={{ flex: 1, minWidth: 0 }}
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
                        list={list}
                        labels={labels.filter((l) => form.label_ids.includes(String(l.id)))}
                        onGenerated={(number) => set("name", number)}
                        disabled={readOnly}
                      />
                      {asset && <PrintLabelButton kind={kind} list={list} assetId={asset.id} />}
                    </Group>
                  }
                />
                <DatePickerInput
                  label="Date d'achat"
                  placeholder="Choisir une date"
                  value={form.purchase_date || null}
                  onChange={(d) => set("purchase_date", d ? String(d).slice(0, 10) : "")}
                  valueFormat="DD/MM/YYYY"
                  clearable
                  popoverProps={{ withinPortal: true }}
                  w={PURCHASE_DATE_WIDTH}
                  style={{ flexShrink: 0 }}
                />
              </Group>

              {/* In columns, level after level — the category, the maker, the
                  product —: only a product may be chosen. One missing from the
                  lists is added from under the field, without leaving the asset. */}
              <div>
                <Cascader
                  label={words.product.title}
                  placeholder={`Choisir ${words.product.a}`}
                  data={productData}
                  value={productPath()}
                  onChange={(path) => {
                    const leaf = path?.at(-1);
                    const [level, category = "", maker = "", product = ""] = leaf
                      ? (JSON.parse(leaf) as string[])
                      : [];
                    if (level !== "p") return;
                    setForm((f) => ({ ...f, category, maker, product }));
                  }}
                  nothingFoundMessage={words.product.none}
                  {...TREE_CASCADER}
                  changeOnSelect={false}
                  searchable
                  required
                />
                {!readOnly && (
                  <AddButton
                    label={`Ajouter ${words.product.a}`}
                    onClick={() => setAddingProduct(true)}
                    mt={4}
                  />
                )}
              </div>

              {/* An application's version and website, under what names it. */}
              {extras.includes("version") && (
                // Three columns: the version in one, the website the rest.
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


              {/* A company of the Contact widgets its widget names, on its own
                  line; one typed and not found is created there. */}
              <div ref={supplierField}>
                <Select
                  label="Fournisseur"
                  {...wideDropdown(supplierWidth)}
                  placeholder={
                    suppliers === null && supplierSources.length ? "Lecture…" : "Choisir un fournisseur"
                  }
                  data={supplierData}
                  value={form.supplier_id ?? (form.supplier ? LEGACY_SUPPLIER : null)}
                  onChange={(v) =>
                    setForm((f) =>
                      v === LEGACY_SUPPLIER
                        ? f
                        : {
                            ...f,
                            supplier_id: v,
                            supplier: (v && supplierData.find((d) => d.value === v)?.label) || "",
                          },
                    )
                  }
                  onSearchChange={setSupplierSearch}
                  nothingFoundMessage={
                    // Not found: created from what is typed — at once, or opened to be completed.
                    supplierSearch.trim() && canAddSupplier ? (
                      <CreateFromSearch
                        typed={supplierSearch.trim()}
                        onCreate={(edit) => void createSupplierFromSearch(supplierSearch.trim(), edit)}
                      />
                    ) : (
                      // On the left, on one line — the dropdown widens to it —: it is centered otherwise.
                      <Text size="sm" ta="left" style={{ whiteSpace: "nowrap" }}>
                        {supplierSources.length ? "Aucune société" : "Aucun widget Contact associé"}
                      </Text>
                    )
                  }
                  clearable
                  searchable
                />
              </div>

              {/* Under it, its quantity, its price before tax and its tax, in three columns. */}
              <SimpleGrid cols={3} spacing="md">
                <NumberInput
                  label="Quantité"
                  value={form.quantity}
                  onChange={(v) => set("quantity", typeof v === "number" ? v : "")}
                  min={0}
                  max={DECLARED_ASSET_QUANTITY_MAX}
                  allowDecimal={false}
                  allowNegative={false}
                  styles={QUANTITY_STYLES}
                />
                <NumberInput
                  label="Prix HT"
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
                  styles={NUMBER_STYLES}
                />
                {/* The price's tax: one of the associated Taxes widgets'. */}
                <Select
                  label="TVA"
                  placeholder="—"
                  {...taxChoice(taxes, form.tax)}
                  value={form.tax}
                  onChange={(v) => set("tax", v)}
                  nothingFoundMessage={
                    <Text size="sm" ta="left" style={{ whiteSpace: "nowrap" }}>
                      {sourcesOf(config, TAX_SOURCES).length ? "Aucune taxe" : "Aucun widget Taxes associé"}
                    </Text>
                  }
                  styles={NUMBER_STYLES}
                />
              </SimpleGrid>

              {/* A device's place, then its identifications; an
                  application's license information: lists of typed values. */}
              {extras.includes("location") && (
                // In columns, level after level; any level may be chosen. The
                // device keeps the place's id, the field reads its path. One
                // missing from the tree is added from under the field.
                <div>
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
                  {!readOnly && (
                    <AddButton
                      label="Ajouter un emplacement"
                      onClick={() => setAddingLocation(true)}
                      mt={4}
                    />
                  )}
                </div>
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

      {supplierWidget && (
        <ContactDrawer
          // A supplier created from its search, to complete.
          opened={editedSupplier !== null}
          onClose={() => setEditedSupplier(null)}
          boardId={supplierWidget.board_id}
          listKey={supplierWidget.key}
          contact={editedSupplier}
          contacts={(contacts ?? []).filter((c) => c.board_id === supplierWidget.board_id)}
          initialType="company"
          onSaved={() => {}}
          canSave={canAddSupplier}
          canDelete={false}
        />
      )}

      <AddDeclaredProductModal
        kind={kind}
        opened={addingProduct}
        onClose={() => setAddingProduct(false)}
        list={list}
        lists={lists}
        onListsSaved={setLists}
        onSaved={(saved, added) => {
          // The asset takes the product just added.
          setLists(saved);
          setForm((f) => ({ ...f, category: added.category, maker: added.maker, product: added.name }));
        }}
      />
      <AddDeclaredTreeNodeModal
        kind={kind}
        tree="locations"
        noun={LOCATION_NOUN}
        opened={addingLocation}
        onClose={() => setAddingLocation(false)}
        list={list}
        lists={lists}
        parents={locationData}
        initialParent={form.location}
        onSaved={(saved, location) => {
          // The device takes the place just added.
          setLists(saved);
          set("location", location);
        }}
      />
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
