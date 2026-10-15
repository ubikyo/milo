import {
  ActionIcon,
  Button,
  Drawer,
  Group,
  Menu,
  Notification,
  Paper,
  ScrollArea,
  Select,
  Stack,
  Tabs,
  Text,
  Tooltip,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { notifications } from "@mantine/notifications";
import {
  IconCheck,
  IconChevronDown,
  IconEye,
  IconFileInvoice,
  IconMessage,
  IconMessages,
  IconPackage,
  IconPaperclip,
  IconReceipt,
  IconSettings,
  IconTable,
  IconX,
} from "@tabler/icons-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  ORDER_PRICE_MAX,
  ORDER_PRODUCT_SOURCES,
  ORDER_QUANTITY_MAX,
  ORDER_SUPPLIER_SOURCES,
  ORDER_WAREHOUSE_SOURCES,
  canDeleteOrder,
  formatAmount,
  isOrderLocked,
  ORDER_NUMBER_FORMATS,
  orderNumber,
  orderNumberFormat,
  fillSupportTemplate,
  orderLineName,
  orderMailView,
  orderTables,
  supplierPrice,
  supplierTier,
  orderTaxes,
  orderTotal,
  taxLabel,
} from "@milo/shared";
import type {
  Contact,
  Id,
  Label,
  Order,
  OrderAttachment,
  OrderCurrency,
  OrderInput,
  OrderContent,
  OrderContentEvent,
  OrderMessage,
  OrderLineKind,
  OrderNumberDraw,
  OrderNumberFormat,
  OrderStatus,
  Product,
} from "@milo/shared";
import { HttpError, api } from "../../api";
import { runOrderNumberCode } from "../../lib/assetNumber";
import { listOf } from "../../lib/list-ref";
import { errorMessage, notifyError } from "../../lib/errors";
import { BARE_FIELDSET } from "../../lib/rights";
import { lockedIds, senderIds, sentAddresses } from "../../lib/recipients";
import { useSourceItems, useSources } from "../../lib/sources";
import { taxChoice, useOfferedTaxes } from "../../lib/taxes";
import { useFileDrag } from "../../lib/useFileDrag";
import { useFilePaste } from "../../lib/useFilePaste";
import CardAttachments from "../board/CardAttachments";
import { ordered, pendingOf } from "../products/ProductDrawer";
import type { Pending } from "../products/ProductDrawer";
import { createSupplier, currencyUnit, useSuppliers } from "../../lib/suppliers";
import CreateFromSearch, { wideDropdown } from "../ui/CreateFromSearch";
import { useUsers } from "../../lib/users";
import { tabStyle } from "../../themes/tabs";
import ContactDrawer from "../contacts/ContactDrawer";
import CommentThread from "../project/CommentThread";
import type { ThreadItem } from "../project/CommentThread";
import SupportMessages, { SupportReply } from "../support/SupportMessages";
import EmptyPanel from "../ui/EmptyPanel";
import { ACTOR_GAP } from "../ui/ActorAvatars";
import ActorPicker from "../ui/ActorPicker";
import type { ContactActorOption } from "../ui/ActorPicker";
import AddButton from "../ui/AddButton";
import DeleteConfirmModal from "../ui/DeleteConfirmModal";
import DraftRows, { RowNumber, RowSelect } from "../ui/DraftRows";
import { HEADER_BACKGROUND, ROW_INSET } from "../ui/DrawerRows";
import ProductDrawer from "../products/ProductDrawer";
import LineText from "./LineText";
import DrawerFooter from "../ui/DrawerFooter";
import DrawerScrollArea, {
  DRAWER_PADDING,
  DRAWER_PANEL_STYLE,
  DRAWER_STYLES,
  DRAWER_TABS_STYLES,
} from "../ui/DrawerScroll";
import LabelPicker, { ORDER_LABELS_API } from "../ui/LabelPicker";
import { StatusBadge } from "./OrdersList";
import { useFollows } from "../../lib/follows-context";
import { useWriterFill } from "../../lib/orders";
import { ACTIONS_BUTTON_STYLE, DRAWER_MENU_OFFSET, TAB_MENU_STYLES } from "../../themes/menus";
import VariantQuantitiesModal, { variantKey } from "./VariantQuantitiesModal";

// An order's drawer: its actors and labels first — whoever adds it is its
// actor —, its number at their end, as a ticket's; its supplier — a company
// of the Contact widgets its widget names, "Créer un fournisseur" adds one
// there —, its due date, then its products: each
// line one the supplier sells (Product.suppliers), its quantity and its unit
// price — the product's at that supplier for the quantity, the tier it
// reaches (supplierPrice), until changed —, in the supplier's currency.
//
// Its status shows at the top, with what it may become: a quote is
// confirmed as an order or cancelled, an order cancelled — each asked for
// once. A cancelled order no longer changes; only a quote, or a cancelled
// one that never was an order, may be deleted.
//
// A quote's number is drawn when it is first saved, an order's when it
// becomes one: by the widget's format, with the next index of its count
// (shared, orders.ts). Taken meanwhile by another save, it is drawn again.
//
// As a product's, a second tab holds its thread: the team's comments, and
// Milo's notes — its creation, then what each save changed.

const CHIP_HEIGHT = 30;
// As a support request's (SupportRequestDrawer).
const DRAWER_WIDTH = 870;
const QUANTITY_WIDTH = 50;
/** The cost columns, one width: the unit price, the tax — "20 %" and its chevron —, the amount. */
const COST_WIDTH = 90;
const PRICE_WIDTH = COST_WIDTH;
const LINE_TOTAL_WIDTH = COST_WIDTH;
const LINE_TAX_WIDTH = COST_WIDTH;
const DUE_DATE_WIDTH = 150;
const SUPPLIER_WIDTH = 200;
const DOCUMENT_WORDS = { title: "Documents", one: "le document", many: "documents" };
const INVOICE_WORDS = { title: "Facture", one: "la facture", many: "factures" };

/** An order's invoice — a kept document is never one. */
const isInvoice = (a: OrderAttachment | Pending): boolean => "kind" in a && a.kind === "invoice";

const VARIANTS_BUTTON_SIZE = 28;
/** The exchanges' frame, above their editor: never less, whatever the editor holds. */
const EXCHANGES_MIN_HEIGHT = 240;
/** No exchange yet: the frame and its prompt, at this height. */
const EMPTY_EXCHANGES_HEIGHT = 115;
/** The variants button: the themes' dark gray ("Bouton foncé"), darker on hover. */
const VARIANTS_BUTTON_STYLE = {
  flexShrink: 0,
  "--ai-bg": "var(--milo-dark-button)",
  "--ai-hover": "var(--milo-dark-button-hover)",
  "--ai-color": "#ffffff",
} as CSSProperties;
/** Above and under a note's line: a section's gray. */
const NOTE_BORDER = `5px solid ${HEADER_BACKGROUND}`;

const TABS = [
  { value: "settings", label: "Paramètres", icon: IconSettings },
  { value: "exchanges", label: "Échanges", icon: IconMessages },
  { value: "comments", label: "Commentaires", icon: IconMessage },
];

/**
 * A line as the drawer holds it: its product's id as a string, its numbers as
 * typed — or a section's, a note's text.
 */
interface LineDraft {
  kind: OrderLineKind;
  text: string;
  product_id: string | null;
  /** Its name when last saved: it shows while the product is not read. */
  product_name: string;
  /** Its variant, for a product that has some (VariantQuantitiesModal). */
  variant: string[];
  quantity: number | "";
  unit_price: number | "";
  /** Its tax's rate, as a string — the choice's value —; null, none. */
  tax: string | null;
}

interface Form {
  supplier_id: string | null;
  due_date: string;
  warehouse_id: string | null;
  lines: LineDraft[];
  actor_ids: string[];
  /** Its supplier's contacts among its actors. */
  contact_actor_ids: string[];
  label_ids: string[];
}

const formOf = (o: Order): Form => ({
  supplier_id: o.supplier_id === null ? null : String(o.supplier_id),
  due_date: o.due_date,
  warehouse_id: o.warehouse_id === null ? null : String(o.warehouse_id),
  lines: o.lines.map((l) => ({
    kind: l.kind,
    text: l.text,
    product_id: l.kind === "product" ? String(l.product_id) : null,
    product_name: l.product_name,
    variant: l.variant,
    quantity: l.quantity,
    unit_price: l.unit_price ?? "",
    tax: l.tax === null ? null : String(l.tax),
  })),
  actor_ids: o.actors.map((a) => String(a.id)),
  contact_actor_ids: o.contact_actors.map((c) => String(c.id)),
  label_ids: o.labels.map((l) => String(l.id)),
});

/** A file's content in base 64, as an order's e-mail carries it. */
const base64Of = async (file: File): Promise<string> => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
};

/** A line of each kind, empty: a product to choose, a text to type. */
const emptyLine = (kind: OrderLineKind): LineDraft => ({
  kind,
  text: "",
  product_id: null,
  product_name: "",
  variant: [],
  quantity: kind === "product" ? 1 : "",
  unit_price: "",
  tax: null,
});

/** The lines to save: a line without its product, or without its text, is dropped. */
const linesOf = (lines: LineDraft[]): OrderInput["lines"] =>
  lines
    .filter((l) => (l.kind === "product" ? l.product_id : l.text.trim()))
    .map((l) => ({
      kind: l.kind,
      text: l.kind === "product" ? "" : l.text.trim(),
      product_id: Number(l.product_id ?? 0),
      variant: l.variant,
      quantity: l.quantity === "" ? 0 : l.quantity,
      unit_price: l.unit_price === "" ? null : l.unit_price,
      tax: l.tax === null ? null : Number(l.tax),
    }));

const inputOf = (f: Form, status: OrderStatus): OrderInput => ({
  status,
  supplier_id: f.supplier_id === null ? null : Number(f.supplier_id),
  due_date: f.due_date,
  warehouse_id: f.warehouse_id === null ? null : Number(f.warehouse_id),
  lines: linesOf(f.lines),
  actor_ids: f.actor_ids.map(Number),
  contact_actor_ids: f.contact_actor_ids.map(Number),
  label_ids: f.label_ids.map(Number),
});

/** What a status action asks before it goes. */
const MOVES: Record<
  Exclude<OrderStatus, "quote">,
  { title: string; message: string; confirm: string; color: string }
> = {
  order: {
    title: "Passer en commande",
    message: "Le devis devient une commande : il ne pourra plus être supprimé, ni repasser en devis.",
    confirm: "Passer en commande",
    color: "teal",
  },
  cancelled: {
    title: "Annuler",
    message: "Une fois annulée, elle ne pourra plus être modifiée, ni repasser en devis.",
    confirm: "Annuler",
    color: "red",
  },
};

interface OrderDrawerProps {
  opened: boolean;
  onClose: () => void;
  boardId: Id;
  /** The widget it is added from (LIST_KEY). */
  listKey: string;
  /** Its widget's configuration: the Contact and Produits widgets it reads. */
  config: unknown;
  /** The order shown; null to add one. */
  order: Order | null;
  /** The signed-in account: a new order's actor. */
  userId?: Id;
  onSaved: () => void;
  /** A new order just created, the drawer staying open: it shows it from then on. */
  onCreated?: (order: Order) => void;
  canSave: boolean;
  canDelete: boolean;
}

export default function OrderDrawer({
  opened,
  onClose,
  boardId,
  listKey,
  config,
  order,
  userId,
  onSaved,
  onCreated,
  canSave,
  canDelete,
}: OrderDrawerProps) {
  const users = useUsers();
  // What the person follows: the "Actions" menu's "Suivre".
  const follows = useFollows();
  const [form, setForm] = useState<Form>({
    supplier_id: null,
    due_date: "",
    warehouse_id: null,
    lines: [],
    actor_ids: [],
    contact_actor_ids: [],
    label_ids: [],
  });
  // "Répondre", folded, sticks under the exchanges (SupportReply).
  const [replyAttached, setReplyAttached] = useState(false);
  const [labels, setLabels] = useState<Label[]>([]);
  // Before its creation, the comments written live here, sent once it is saved.
  const [comments, setComments] = useState<ThreadItem[]>([]);
  const [messages, setMessages] = useState<OrderMessage[]>([]);
  // The default contents: an exchange's editor starts from them.
  const [contents, setContents] = useState<OrderContent[]>([]);
  // The writer's variables, filled in the editors.
  const writerFill = useWriterFill();
  const [activeTab, setActiveTab] = useState<string | null>("settings");
  // A new order just created from its exchanges: the drawer stays on that tab.
  const keepTab = useRef(false);
  const [saving, setSaving] = useState(false);
  // The deletion asked, waiting for its confirmation.
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [move, setMove] = useState<Exclude<OrderStatus, "quote"> | null>(null);
  // "Créer un fournisseur": the Contact widget a new supplier goes to, while its drawer is open.
  const [addingSupplier, setAddingSupplier] = useState(false);
  // "Créer un produit": the Produits widget's drawer, open, the supplier among its own.
  const [creatingProduct, setCreatingProduct] = useState(false);
  // A product just created from a row's search, opened to be completed.
  const [editedProduct, setEditedProduct] = useState<Product | null>(null);
  // What each row's product search holds, by rank: a product not found is created from it.
  const [searches, setSearches] = useState<Record<number, string>>({});
  // A product with variants just chosen on a row: its quantities by variant,
  // asked in a window; "previous", the row as it was, if the window is closed.
  const [picking, setPicking] = useState<{ rank: number; product: Product; previous: LineDraft } | null>(
    null,
  );
  // A supplier just created, until the Contact widgets are read again.
  const [created, setCreated] = useState<Contact | null>(null);
  // Its documents — a supplier's quote —: kept until a new order is created, as a product's.
  const [attachments, setAttachments] = useState<(OrderAttachment | Pending)[]>([]);
  const fileField = useRef<HTMLInputElement>(null);
  const invoiceField = useRef<HTMLInputElement>(null);
  // A file dragged over the page: the drop zone shows.
  const dragging = useFileDrag(opened && canSave);
  // Files pasted into the page: they join the attachments, as if dropped.
  useFilePaste(opened && canSave, (files) => void addAttachments(files));
  // What the supplier's search holds: a supplier not found is created from it.
  const [supplierSearch, setSupplierSearch] = useState("");
  // A supplier just created from its search, opened to be completed.
  const [editedSupplier, setEditedSupplier] = useState<Contact | null>(null);

  const status: OrderStatus = order?.status ?? "quote";
  const locked = order ? isOrderLocked(order) : false;
  const readOnly = !canSave || locked;

  // The suppliers and the products: those of the widgets its drawer names.
  const supplierSources = useSources("contact.list", config, ORDER_SUPPLIER_SOURCES);
  const productSources = useSources("product.list", config, ORDER_PRODUCT_SOURCES);
  const { suppliers, contacts } = useSuppliers(opened ? supplierSources : []);

  /**
   * The supplier's contacts an actor may be: the company, its people, those
   * with an e-mail address. One retained that no longer is still shows, to
   * be unchecked.
   */
  const contactOptions = useMemo((): ContactActorOption[] => {
    const option = (c: Contact): ContactActorOption => ({
      id: String(c.id),
      name: [c.first_name, c.name].filter(Boolean).join(" "),
      email: c.emails[0] ?? "",
      company: c.type === "company",
    });
    const company = (contacts ?? []).find((c) => String(c.id) === form.supplier_id);
    const offered = company
      ? [company, ...(contacts ?? []).filter((c) => company.member_ids.includes(c.id))]
          .filter((c) => c.emails.length > 0)
          .map(option)
      : [];
    const kept = (order?.contact_actors ?? [])
      .filter((c) => form.contact_actor_ids.includes(String(c.id)) && !offered.some((o) => o.id === String(c.id)))
      .map((c) => ({ id: String(c.id), name: c.name, email: c.email, company: c.type === "company" }));
    return [...offered, ...kept];
  }, [contacts, form.supplier_id, form.contact_actor_ids, order]);
  const products = useSourceItems("product", opened ? productSources : []);
  // The delivery warehouses: those of the Entrepôts widgets its drawer names.
  const warehouseSources = useSources("warehouse.list", config, ORDER_WAREHOUSE_SOURCES);
  const warehouses = useSourceItems("warehouse", opened ? warehouseSources : []);
  // The warehouses offered, by name; the order's still shows once it has left them.
  const warehouseData = useMemo(() => {
    const data = (warehouses ?? [])
      .map((w) => ({ value: String(w.id), label: w.name }))
      .sort((a, b) => a.label.localeCompare(b.label, "fr", { numeric: true }));
    const own = order?.warehouse_id;
    if (own != null && !data.some((d) => d.value === String(own))) {
      data.push({ value: String(own), label: order?.warehouse_name || "Entrepôt" });
    }
    return data;
  }, [warehouses, order]);

  const supplier = useMemo(
    () => suppliers?.find((s) => String(s.contact.id) === form.supplier_id) ?? null,
    [suppliers, form.supplier_id],
  );
  // The order's currency: its supplier's now; the one it was saved with, while it is not read.
  const currency: OrderCurrency | null = supplier?.currency ?? order?.currency ?? null;
  const unit = currencyUnit(currency);

  // The products the supplier sells: those with a price there, from some quantity.
  const supplierId = Number(form.supplier_id);
  const offered = useMemo(
    () =>
      (products ?? [])
        // An archived product is no longer ordered: one a line holds still shows (data).
        .filter((p) => !p.archived && p.suppliers.some((x) => x.contact_id === supplierId))
        .sort((a, b) => a.name.localeCompare(b.name, "fr", { numeric: true })),
    [products, supplierId],
  );
  /** A product's price at the supplier for a quantity: the tier it reaches. */
  const priceAt = (productId: string | null, quantity: number | ""): number | null => {
    const product = offered.find((p) => String(p.id) === productId);
    return product ? supplierPrice(product.suppliers, supplierId, quantity === "" ? 1 : quantity) : null;
  };

  /** A product's tax at the supplier for a quantity: its tier's, as a string; null, none. */
  const taxAt = (productId: string | null, quantity: number | ""): string | null => {
    const product = offered.find((p) => String(p.id) === productId);
    const tax = product ? supplierTier(product.suppliers, supplierId, quantity === "" ? 1 : quantity)?.tax : null;
    return tax == null ? null : String(tax);
  };
  // The taxes a line may take: those of the Taxes widgets the first Produits
  // widget is associated with — a line's still shows once it has left them.
  const taxes = useOfferedTaxes(productSources[0]?.config);

  /** A product's lines by variant: those of one with variants. */
  const isVariantLine = (l: LineDraft, productId: string) => l.product_id === productId && l.variant.length > 0;

  /**
   * The quantities given by variant replace the row the product was chosen
   * on and the lines of its variants already there, where the first of them
   * was: a line per variant given a quantity, at its price for it.
   */
  const applyVariants = (entries: { variant: string[]; quantity: number }[]) => {
    if (!picking) return;
    const { rank, product } = picking;
    const productId = String(product.id);
    setForm((f) => {
      const replaced = (l: LineDraft, i: number) => i === rank || isVariantLine(l, productId);
      const before = new Map(
        f.lines.filter((l) => isVariantLine(l, productId)).map((l) => [variantKey(l.variant), l]),
      );
      const first = f.lines.findIndex(replaced);
      const kept = f.lines.filter((l, i) => !replaced(l, i));
      const at = f.lines.slice(0, first).filter((l, i) => !replaced(l, i)).length;
      kept.splice(
        at,
        0,
        ...entries.map((e) => ({
          kind: "product" as const,
          text: "",
          product_id: productId,
          product_name: product.name,
          variant: e.variant,
          quantity: e.quantity,
          unit_price: priceAt(productId, e.quantity) ?? before.get(variantKey(e.variant))?.unit_price ?? "",
          tax: taxAt(productId, e.quantity) ?? before.get(variantKey(e.variant))?.tax ?? null,
        })),
      );
      return { ...f, lines: kept };
    });
    setPicking(null);
  };

  /** Closed without validating: the row goes back to what it was. */
  const cancelVariants = () => {
    if (!picking) return;
    const { rank, previous } = picking;
    setForm((f) => ({ ...f, lines: f.lines.map((l, i) => (i === rank ? previous : l)) }));
    setPicking(null);
  };

  const list = useMemo(
    () => (order ? listOf(order) : { board: boardId, list: listKey }),
    [order, boardId, listKey],
  );

  const readLabels = useCallback(async () => {
    try {
      setLabels(await api.getOrderLabels(list));
    } catch (e) {
      notifyError(errorMessage(e));
    }
  }, [list]);

  const readComments = useCallback(async () => {
    if (!order) return;
    try {
      setComments(await api.getOrderComments(order.id));
    } catch (e) {
      notifyError(errorMessage(e));
    }
  }, [order]);

  const readMessages = useCallback(async () => {
    if (!order) return;
    try {
      setMessages(await api.getOrderMessages(order.id));
    } catch (e) {
      notifyError(errorMessage(e));
    }
  }, [order]);

  // Each opening starts from the order — a new one has its author as actor —,
  // on its first tab. Its status changing, from here, keeps the drawer as is.
  const orderId = order?.id;
  useEffect(() => {
    if (!opened) return;
    setForm(
      order
        ? formOf(order)
        : {
            supplier_id: null,
            due_date: "",
            warehouse_id: null,
            lines: [],
            actor_ids: userId === undefined ? [] : [String(userId)],
            contact_actor_ids: [],
            label_ids: [],
          },
    );
    if (!keepTab.current) setActiveTab("settings");
    keepTab.current = false;
    setComments([]);
    setMessages([]);
    setCreated(null);
    setSupplierSearch("");
    setEditedSupplier(null);
    setAttachments([]);
    if (order) {
      api
        .getOrderAttachments(order.id)
        .then(setAttachments)
        .catch((e) => notifyError(errorMessage(e)));
    }
    void readLabels();
    void readComments();
    void readMessages();
    api.getOrderContents().then(setContents, () => setContents([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, orderId]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));

  // --- Documents -------------------------------------------------------------

  /** Chosen documents: sent at once for an order that exists, kept otherwise; the most recent first. */
  const addAttachments = async (files: File[]) => {
    for (const file of files) {
      if (!order) {
        setAttachments((already) => [pendingOf(file), ...already]);
        continue;
      }
      try {
        const attachment = await api.uploadOrderAttachment(order.id, file);
        setAttachments((already) => [attachment, ...already]);
      } catch (e) {
        notifyError(errorMessage(e));
      }
    }
  };

  /** An order's invoices: sent at once, the most recent first. */
  const addInvoices = async (files: File[]) => {
    if (!order) return;
    for (const file of files) {
      try {
        const invoice = await api.uploadOrderInvoice(order.id, file);
        setAttachments((already) => [invoice, ...already]);
      } catch (e) {
        notifyError(errorMessage(e));
      }
    }
  };

  /** The documents, or the invoices, in a new order: the others keep theirs, after them. */
  const arrangeAttachments = async (ids: Id[]) => {
    const rest = (all: (OrderAttachment | Pending)[]) => all.filter((a) => !ids.includes(a.id));
    setAttachments((already) => [...ordered(already, ids), ...rest(already)]);
    if (!order) return;
    try {
      const others = rest(attachments).map((a) => a.id);
      setAttachments(await api.reorderOrderAttachments(order.id, [...ids, ...others]));
    } catch (e) {
      notifyError(errorMessage(e));
    }
  };

  const deleteAttachment = async (attachment: OrderAttachment | Pending) => {
    try {
      if ("upload" in attachment) URL.revokeObjectURL(attachment.url);
      else await api.deleteOrderAttachment(attachment.id);
      setAttachments((already) => already.filter((a) => a.id !== attachment.id));
    } catch (e) {
      notifyError(errorMessage(e));
    }
  };

  /** The documents kept while adding, sent once the order exists: from the last, each placed first. */
  const sendPending = async (id: Id) => {
    for (const attachment of [...attachments].reverse()) {
      if (!("upload" in attachment)) continue;
      await api.uploadOrderAttachment(id, attachment.upload);
      URL.revokeObjectURL(attachment.url);
    }
  };

  // --- Comments --------------------------------------------------------------

  // Before creation, as a project's: the comments live locally, and go to
  // the server once the order is saved.
  const addComment = async (text: string) => {
    if (!order) {
      const at = new Date().toISOString();
      setComments((list) => [
        ...list,
        {
          id: `draft-${at}-${list.length}`,
          text,
          author: users.find((u) => u.id === userId) ?? null,
          created_at: at,
          updated_at: at,
        },
      ]);
      return;
    }
    try {
      await api.addOrderComment(order.id, text);
      await readComments();
    } catch (e) {
      notifyError(errorMessage(e));
    }
  };

  const updateComment = async (id: number | string, text: string) => {
    if (!order || typeof id !== "number") {
      setComments((list) =>
        list.map((c) => (c.id === id ? { ...c, text, updated_at: new Date().toISOString() } : c)),
      );
      return;
    }
    try {
      await api.updateOrderComment(Number(id), text);
      await readComments();
    } catch (e) {
      notifyError(errorMessage(e));
    }
  };

  const deleteComment = async (id: number | string) => {
    if (!order || typeof id !== "number") {
      setComments((list) => list.filter((c) => c.id !== id));
      return;
    }
    try {
      await api.deleteOrderComment(Number(id));
      await readComments();
    } catch (e) {
      notifyError(errorMessage(e));
    }
  };

  // --- Save, status and delete ---------------------------------------------

  /** The record goes with its status: the current one, or the one asked for. */
  /**
   * A number of this format, drawn by the widget's: with the next index of
   * its count. Null when the format fails — what went wrong is shown.
   */
  const drawNumber = async (format: OrderNumberFormat): Promise<OrderNumberDraw | null> => {
    const [{ templates }, { index }] = await Promise.all([
      api.getOrderNumberTemplates(list),
      api.getOrderNextIndex(list, format),
    ]);
    const label = ORDER_NUMBER_FORMATS.find((f) => f.value === format)!.label;
    const code = templates.find((t) => t.format === format)?.code ?? "";
    const run = await runOrderNumberCode(code, index);
    if (run.error !== null || !run.result?.trim()) {
      notifyError(`Format « ${label} » : ${run.error ?? "aucun numéro renvoyé"}`);
      return null;
    }
    return { format, index, value: run.result.trim() };
  };

  /** How many times a number taken meanwhile is drawn again. */
  const DRAWS = 3;

  /**
   * The record goes with its status: the current one, or the one asked for.
   * "after" follows the save, the order saved — its e-mail sent. True once
   * the order is saved.
   */
  const persist = async (
    next: OrderStatus = status,
    after?: (saved: Order) => Promise<void>,
    /** True: the drawer stays on the order — its quote request just sent. */
    keepOpen = false,
  ): Promise<boolean> => {
    if (linesOf(form.lines).some((l) => l.kind === "product" && !(l.quantity > 0))) {
      notifyError("Chaque produit demande une quantité");
      return false;
    }
    // The number its status asks for, when it has none yet.
    const format = orderNumberFormat(next);
    const numbered = !format || Boolean(order?.[`${format}_number`]);
    setSaving(true);
    try {
      let saved: Order;
      for (let draw = 1; ; draw++) {
        const number = numbered || !format ? undefined : await drawNumber(format);
        if (number === null) return false;
        const input = { ...inputOf(form, next), ...(number && { number }) };
        try {
          saved = order
            ? await api.updateOrder(order.id, input)
            : await api.createOrder({ ...input, board_id: boardId, list_key: listKey });
          // Created: the comments written before go with it, after Milo's note.
          if (!order) for (const c of comments) await api.addOrderComment(saved.id, c.text);
          break;
        } catch (e) {
          // Its index taken by another save meanwhile: another is drawn.
          if (e instanceof HttpError && e.status === 409 && draw < DRAWS) continue;
          throw e;
        }
      }
      if (!order) await sendPending(saved.id);
      onSaved();
      if (after) {
        try {
          await after(saved);
        } catch (e) {
          notifyError(`Le devis est enregistré, mais ${errorMessage(e)}`);
        }
      }
      // A status changed keeps the drawer open on the order, a save closes it —
      // unless asked to stay: a new order then shows as created.
      if (keepOpen) {
        if (!order) {
          // The drawer goes on with the order created, on the tab it was on.
          keepTab.current = true;
          onCreated?.(saved);
        }
        else {
          void readComments();
          void readMessages();
        }
      } else if (next === status || !order) onClose();
      else void readComments();
      return true;
    } catch (e) {
      notifyError(errorMessage(e));
      return false;
    } finally {
      setSaving(false);
    }
  };

  // --- The e-mail to the supplier --------------------------------------------

  // A quote whose actors hold supplier contacts with an address: it may be
  // saved and sent to them.
  const recipients = contactOptions.filter((c) => form.contact_actor_ids.includes(c.id) && c.email);
  // Its exchanges, as a request's, once a supplier contact is chosen among its
  // actors — saved or not —, and for good once it has some, the contact
  // removed since.
  const exchangeable = recipients.length > 0 || messages.length > 0;

  /**
   * A content as the editor shows it: the writer's variables, the order's,
   * its supplier's — and its contact's, when it goes to one alone. What only
   * the sending knows stays, filled then for each recipient: the tables, a
   * new quote's number, the contact's among several.
   */
  const exchangeFill = (html: string): string => {
    const company = (contacts ?? []).find((c) => String(c.id) === form.supplier_id);
    const contact =
      recipients.length === 1 ? (contacts ?? []).find((c) => String(c.id) === recipients[0]!.id) : undefined;
    const [y, m, d] = form.due_date.split("-");
    const values: Record<string, string> = {
      ...(order && orderNumber(order) && { "order.number": orderNumber(order) }),
      ...(company && {
        "order.supplier": company.name,
        "supplier.name": company.name,
        "supplier.email": company.emails[0] ?? "",
      }),
      ...(y && m && d && { "order.due_date": `${d}/${m}/${y}` }),
      ...(contact && {
        "supplier_contact.first_name": contact.type === "person" ? contact.first_name : "",
        "supplier_contact.last_name": contact.name,
        "supplier_contact.email": contact.emails[0] ?? "",
      }),
    };
    return fillSupportTemplate(writerFill(html), values);
  };
  // A quote's first message is its request: its template, its lines; the
  // others, messages.
  const exchangeKind = !messages.length && status === "quote" ? "order_quote_request" : "order_message";
  // The contents a message may take: its status's — a quote's request, an
  // order's confirmation, its cancellation —, the first message's, and every message's.
  const statusEvent: OrderContentEvent =
    status === "quote" ? "quote_request" : status === "order" ? "confirmation" : "cancellation";
  const offeredEvents: (OrderContentEvent | null)[] = [statusEvent, "new", "all"];
  // Its default text: its status's contents, "Nouveau message"'s once a
  // message went out in this status; then every message's — each in the
  // list's order.
  const statusSent = messages.some(
    (m) => m.order_status === status && (m.mail_status === "sent" || m.mail_status === "simulated"),
  );
  const exchangeTemplate = exchangeFill(
    [
      ...contents.filter((c) => c.event === (statusSent ? "new" : statusEvent)),
      ...contents.filter((c) => c.event === "all"),
    ]
      .map((c) => c.html)
      .join(""),
  );
  // The tables its variables stand for, as the editor shows them in their
  // place — the order as the drawer holds it, written out as its e-mail will.
  const supplierName = supplier?.contact.name ?? order?.supplier_name ?? "";
  const blocks = useMemo(
    () =>
      orderTables(
        orderMailView(
          {
            number: order ? orderNumber(order) : "",
            supplier_id: form.supplier_id === null ? null : Number(form.supplier_id),
            supplier_name: supplierName,
            currency,
            due_date: form.due_date,
            lines: form.lines
              .filter((l) => (l.kind === "product" ? l.product_id : l.text.trim()))
              .map((l) => ({
                kind: l.kind,
                text: l.text.trim(),
                product_id: Number(l.product_id ?? 0),
                product_name: l.product_name,
                variant: l.variant,
                quantity: l.quantity === "" ? 0 : l.quantity,
                unit_price: l.unit_price === "" ? null : l.unit_price,
              })),
          },
          (id) => (products ?? []).find((p) => p.id === id),
        ),
      ),
    [order, form.supplier_id, form.due_date, form.lines, supplierName, currency, products],
  );
  // The predefined replies, offered in the editor's toolbar, filled the same way.
  const snippets = contents.filter((c) => offeredEvents.includes(c.event)).map((c) => ({ value: String(c.id), label: c.name, html: exchangeFill(c.html) }));
  // "Commentaires" from the start — empty until the order is saved —; its exchanges as said.
  const tabs = TABS.filter((t) => t.value !== "exchanges" || exchangeable);

  /**
   * A message written in its exchanges: the order saved — created, if it is
   * new, the drawer staying on it —, then sent to its supplier contacts. A
   * refusal keeps the text in the editor.
   */
  const sendExchange = async (html: string, sending: { cc: string[]; bcc: string[]; files: File[] }) => {
    const kind = exchangeKind;
    let sent = false;
    // Its attachments, read as base 64: they go with every message.
    const files = await Promise.all(
      sending.files.map(async (f) => ({ name: f.name, mime: f.type, content: await base64Of(f) })),
    );
    const saved = await persist(
      status,
      async (o) => {
        const r = await api.sendOrderMail(o.id, {
          kind,
          html,
          copy: false,
          cc: sending.cc,
          bcc: sending.bcc,
          files,
        });
        sent = true;
        notifications.show({
          color: "teal",
          message: r.simulated
            ? "Envoi simulé : le message n'est pas parti"
            : kind === "order_quote_request"
              ? "Demande de devis envoyée"
              : "Message envoyé",
        });
      },
      true,
    );
    if (!saved || !sent) throw new Error("Message non envoyé");
  };

  const handleDelete = async () => {
    if (!order) return;
    setConfirmDelete(false);
    try {
      await api.deleteOrder(order.id);
      onSaved();
      onClose();
    } catch (e) {
      notifyError(errorMessage(e));
    }
  };

  // --- The supplier --------------------------------------------------------

  const supplierData = (suppliers ?? []).map((s) => ({
    value: String(s.contact.id),
    label: s.contact.name,
  }));
  // One not (yet) read still shows: just created, or saved with the order.
  if (form.supplier_id && !supplierData.some((d) => d.value === form.supplier_id)) {
    const name =
      created && String(created.id) === form.supplier_id
        ? created.name
        : order && String(order.supplier_id) === form.supplier_id
          ? order.supplier_name
          : `#${form.supplier_id}`;
    supplierData.unshift({ value: form.supplier_id, label: name });
  }
  // A new supplier goes to the first Contact widget named.
  const supplierWidget = supplierSources[0];
  /**
   * A supplier typed and not found, created in the first Contact widget as a
   * company with that name, then chosen; "edit", opened afterwards to be completed.
   */
  const createSupplierFromSearch = async (name: string, edit: boolean) => {
    if (!supplierWidget) return;
    try {
      const contact = await createSupplier(supplierWidget, name);
      setCreated(contact);
      setForm((f) => ({ ...f, supplier_id: String(contact.id), contact_actor_ids: [] }));
      setSupplierSearch("");
      (document.activeElement as HTMLElement | null)?.blur();
      if (edit) setEditedSupplier(contact);
    } catch (e) {
      notifyError(errorMessage(e));
    }
  };
  // A new product goes to the first Produits widget named.
  const productWidget = readOnly ? undefined : productSources[0];

  /**
   * A product typed on a row and not found, created in the first Produits
   * widget with that name — sold by the order's supplier, without a price —,
   * then chosen on the row; "edit", opened afterwards to be completed.
   */
  const createFromSearch = async (rank: number, name: string, edit: boolean) => {
    if (!productWidget) return;
    try {
      const product = await api.createProduct({
        sku: "",
        name,
        favorite: false,
        notes: "",
        tracking: "none",
        category: "",
        variants: [],
        suppliers: form.supplier_id ? [{ contact_id: supplierId, min_quantity: null, price: null, tax: null }] : [],
        label_ids: [],
        board_id: productWidget.board_id,
        list_key: productWidget.key,
      });
      setForm((f) => ({
        ...f,
        lines: f.lines.map((l, i) =>
          i === rank
            ? { ...l, product_id: String(product.id), product_name: product.name, variant: [], unit_price: "", tax: null }
            : l,
        ),
      }));
      setSearches((all) => ({ ...all, [rank]: "" }));
      (document.activeElement as HTMLElement | null)?.blur();
      if (edit) setEditedProduct(product);
    } catch (e) {
      notifyError(errorMessage(e));
    }
  };

  /**
   * A product just created becomes a line: at its price at the supplier — or,
   * with variants, its quantities by variant asked first.
   */
  const addCreated = (product: Product) => {
    const rank = form.lines.length;
    const line = { ...emptyLine("product"), product_id: String(product.id), product_name: product.name };
    if (product.variants.length) {
      set("lines", [...form.lines, line]);
      setPicking({ rank, product, previous: emptyLine("product") });
      return;
    }
    const tier = supplierTier(product.suppliers, supplierId, 1);
    set("lines", [
      ...form.lines,
      { ...line, unit_price: tier?.price ?? "", tax: tier?.tax == null ? null : String(tier.tax) },
    ]);
  };
  // Its products are the supplier's: it changes only once they are all removed.
  const supplierLocked = form.lines.some((l) => l.kind === "product" && l.product_id);
  const canAddSupplier = !readOnly && Boolean(supplierWidget) && !supplierLocked;

  const total = orderTotal(linesOf(form.lines));
  // Each rate's tax, and the total with them.
  const taxTotals = orderTaxes(linesOf(form.lines));
  const grandTotal =
    total === null ? null : Math.round((total + taxTotals.reduce((sum, t) => sum + t.amount, 0)) * 100) / 100;
  // The addresses its messages went to: their actors stay.
  const sent = sentAddresses(messages);
  // What it needs to be saved: a supplier, a delivery warehouse, a product.
  const complete =
    Boolean(form.supplier_id) && Boolean(form.warehouse_id) && linesOf(form.lines).some((l) => l.kind === "product");
  const deletable = Boolean(order) && canDelete && canDeleteOrder(order!);
  // A quote, new or not yet sent, becomes an order from the "Actions" menu.
  const transformable = !readOnly && status === "quote";
  // A saved quote, or an order — no longer deleted —, is cancelled from the "Actions" menu.
  const cancellable = Boolean(order) && canSave && (status === "quote" || status === "order");

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
        <Tabs value={activeTab} onChange={setActiveTab} style={DRAWER_PANEL_STYLE} styles={DRAWER_TABS_STYLES}>
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

            {/* At the end of the tab row, as a request's: "Suivre" once it
                exists; a quote, new or not yet sent, saved straight as an order. */}
            {((order && follows) || transformable || cancellable) && (
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
                    style={{ alignSelf: "center", ...ACTIONS_BUTTON_STYLE } as CSSProperties}
                  >
                    Actions
                  </Button>
                </Menu.Target>
                <Menu.Dropdown>
                  {/* The menu does not close, so the checkmark can be seen changing. */}
                  {order && follows && (
                    <Menu.Item
                      leftSection={<IconEye size={16} />}
                      rightSection={follows.follows.order.includes(order.id) ? <IconCheck size={14} /> : null}
                      onClick={() => follows.toggle("order", order.id)}
                      closeMenuOnClick={false}
                    >
                      Suivre
                    </Menu.Item>
                  )}
                  {transformable && (
                    <Menu.Item
                      leftSection={<IconReceipt size={16} />}
                      onClick={() => setMove("order")}
                      disabled={saving || !complete}
                    >
                      Transformer en commande
                    </Menu.Item>
                  )}
                  {/* Last, in a group of its own. */}
                  {cancellable && (
                    <>
                      {((order && follows) || transformable) && <Menu.Divider />}
                      <Menu.Item
                        className="milo-menu-danger"
                        leftSection={<IconX size={16} />}
                        color={MOVES.cancelled.color}
                        onClick={() => setMove("cancelled")}
                        disabled={saving}
                      >
                        {status === "quote" ? "Annuler le devis" : "Annuler la commande"}
                      </Menu.Item>
                    </>
                  )}
                </Menu.Dropdown>
              </Menu>
            )}
          </Tabs.List>

          <Tabs.Panel value="settings" style={DRAWER_PANEL_STYLE}>
            <DrawerScrollArea>
              <Stack gap="xl">
                {/* Read-only, all the fields are disabled at once. */}
                <fieldset disabled={readOnly} style={BARE_FIELDSET}>
                  <Stack gap="xl">
                    {/* The actors, as wide as the supplier under them, then the labels. */}
                    <Group align="flex-start" gap="md" wrap="nowrap">
                      <div style={{ width: SUPPLIER_WIDTH, flexShrink: 0 }}>
                        <ActorPicker
                          kind="logistics"
                          chipHeight={CHIP_HEIGHT}
                          chipGap={ACTOR_GAP}
                          label="Acteurs"
                          users={users}
                          value={form.actor_ids}
                          onChange={(ids) => set("actor_ids", ids)}
                          // Those a message went to, or who sent one, stay.
                          locked={[...lockedIds(users, sent), ...senderIds(messages)]}
                          // Its supplier's contacts too: the company, its people with an address.
                          contacts={
                            form.supplier_id
                              ? {
                                  title: supplierData.find((d) => d.value === form.supplier_id)?.label ?? "Fournisseur",
                                  options: contactOptions,
                                  value: form.contact_actor_ids,
                                  onChange: (ids) => set("contact_actor_ids", ids),
                                  locked: lockedIds(contactOptions, sent),
                                }
                              : undefined
                          }
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
                          labelsApi={ORDER_LABELS_API}
                        />
                      </div>
                      {/* Its type, at the end of the row, as a project's reference;
                        its number in the same badge, once it has one: its
                        order's once it was one, its quote's before. */}
                      <div style={{ flexShrink: 0, alignSelf: "center" }}>
                        <StatusBadge status={status} filled size="lg" number={order && orderNumber(order)} />
                      </div>
                    </Group>

                    {/* The supplier, "Créer un fournisseur" under it, then the delivery warehouse and the due date. */}
                    <Group align="flex-start" gap="md" wrap="nowrap">
                      <Stack gap={0} w={SUPPLIER_WIDTH} style={{ flexShrink: 0 }}>
                        <Select
                          label="Fournisseur"
                          placeholder={suppliers === null && supplierSources.length ? "Lecture…" : "Choisir un fournisseur"}
                          data={supplierData}
                          value={form.supplier_id}
                          onChange={(id) =>
                            // Another supplier: the former's contacts leave its actors.
                            setForm((f) => ({ ...f, supplier_id: id, contact_actor_ids: [] }))
                          }
                          onSearchChange={setSupplierSearch}
                          // Wider than the field, when its companies need it.
                          {...wideDropdown(SUPPLIER_WIDTH)}
                          nothingFoundMessage={
                            // Not found: created from what is typed — at once, or opened to be completed.
                            supplierSearch.trim() && canAddSupplier ? (
                              <CreateFromSearch
                                typed={supplierSearch.trim()}
                                onCreate={(edit) => void createSupplierFromSearch(supplierSearch.trim(), edit)}
                              />
                            ) : supplierSources.length ? (
                              "Aucune société"
                            ) : (
                              "Aucun widget fournisseurs choisi"
                            )
                          }
                          searchable
                          required
                          // Its products are this supplier's.
                          disabled={supplierLocked}
                        />
                        {!readOnly && (
                          <Tooltip
                            label="Choisissez d'abord un widget fournisseurs, en édition"
                            disabled={Boolean(supplierWidget)}
                          >
                            <div style={{ alignSelf: "flex-start" }}>
                              <AddButton
                                label="Créer un fournisseur"
                                onClick={() => setAddingSupplier(true)}
                                disabled={!canAddSupplier}
                                mt={4}
                              />
                            </div>
                          </Tooltip>
                        )}
                      </Stack>
                      <Select
                        label="Livrer à"
                        placeholder={warehouses === null && warehouseSources.length ? "Lecture…" : "Choisir un entrepôt"}
                        data={warehouseData}
                        value={form.warehouse_id}
                        onChange={(id) => set("warehouse_id", id)}
                        nothingFoundMessage={
                          warehouseSources.length ? "Aucun entrepôt" : "Aucun widget entrepôt choisi"
                        }
                        searchable
                        required
                        w={SUPPLIER_WIDTH}
                        style={{ flexShrink: 0 }}
                      />
                      <DatePickerInput
                        label="Échéance de livraison"
                        placeholder="Choisir une date"
                        value={form.due_date || null}
                        onChange={(d) => set("due_date", d ? String(d).slice(0, 10) : "")}
                        valueFormat="DD/MM/YYYY"
                        clearable
                        popoverProps={{ withinPortal: true }}
                        w={DUE_DATE_WIDTH}
                        style={{ flexShrink: 0 }}
                      />
                    </Group>

                    {/* Its products: each one the supplier sells, its quantity,
                        its unit price — the product's at that supplier —, and
                        the line's amount; the total under them. Only once a
                        supplier is chosen: it is what they sell. */}
                    {form.supplier_id && (
                      <DraftRows<LineDraft>
                        label={unit ? `Produits (${currency?.code || unit})` : "Produits"}
                        value={form.lines}
                        onChange={(lines) => set("lines", lines)}
                        emptyIcon={IconPackage}
                        emptyText="Aucun produit"
                        addLabel="Ajouter un produit"
                        newRow={() => emptyLine("product")}
                        nameOf={(l) =>
                          l.kind !== "product"
                            ? l.text || (l.kind === "section" ? "cette section" : "cette note")
                            : l.product_name
                              ? orderLineName(l)
                              : "ce produit"
                        }
                        // Under "Ajouter un produit": a section, a note; beside it, a product created.
                        moreAdds={[
                          {
                            label: "Créer un produit",
                            column: 2,
                            onClick: () => setCreatingProduct(true),
                            disabled: !productWidget,
                            disabledReason: "Choisissez d'abord un widget produits, en édition",
                          },
                          { label: "Ajouter une section", newRow: () => emptyLine("section") },
                          { label: "Ajouter une note", newRow: () => emptyLine("note") },
                        ]}
                        // A section's line on the label groups' gray (LabelGroupsEditor), a note's
                        // between two lines of that gray.
                        rowLook={(l) =>
                          l.kind === "section"
                            ? { backgroundColor: HEADER_BACKGROUND }
                            : l.kind === "note"
                              ? { borderTop: NOTE_BORDER, borderBottom: NOTE_BORDER }
                              : undefined
                        }
                        word="produit"
                        readOnly={readOnly}
                        footer={
                          // Its amount lined up with the lines': past their variants button. No
                          // product line yet, no total.
                          form.lines.some((l) => l.kind === "product") && (
                            <Stack
                              gap={2}
                              pr={`calc(${ROW_INSET}px + var(--mantine-spacing-xs) + ${VARIANTS_BUTTON_SIZE}px)`}
                            >
                              {/* Before tax, each rate's tax, then the total: the labels and
                                  the amounts each right-aligned, the amounts under the lines'. */}
                              {[
                                { label: "Montant hors taxe", amount: total, strong: false },
                                ...taxTotals.map((t) => ({ label: `TVA ${taxLabel(t.rate)}`, amount: t.amount, strong: false })),
                                { label: "Total", amount: grandTotal, strong: true },
                              ].map((r) => (
                                // The height of the "Ajouter" buttons beside the first.
                                <Group key={r.label} gap="xs" wrap="nowrap" justify="flex-end" style={{ lineHeight: "20px" }}>
                                  <Text size="sm" fw={r.strong ? 600 : undefined} ta="right" lh="20px">
                                    {r.label}
                                  </Text>
                                  <Text size="sm" fw={r.strong ? 600 : undefined} ta="right" lh="20px" w={LINE_TOTAL_WIDTH} truncate>
                                    {formatAmount(r.amount, currency) || "—"}
                                  </Text>
                                </Group>
                              ))}
                            </Stack>
                          )
                        }
                        fields={(line, change, autoFocus, rank) => {
                          // A section's title, a note's text: across the line, a double click edits it.
                          if (line.kind !== "product") {
                            return (
                              <LineText
                                kind={line.kind}
                                value={line.text}
                                onChange={(text) => change({ text })}
                                autoFocus={autoFocus}
                                readOnly={readOnly}
                              />
                            );
                          }
                          const data = offered.map((product) => ({
                            value: String(product.id),
                            label: product.name,
                          }));
                          // A product the supplier no longer sells, or not read, still shows.
                          if (line.product_id && !data.some((d) => d.value === line.product_id)) {
                            data.unshift({ value: line.product_id, label: line.product_name || `#${line.product_id}` });
                          }
                          // A variant's line reads its variant after its product.
                          const own = data.find((d) => d.value === line.product_id);
                          if (own && line.variant.length) {
                            own.label = orderLineName({ product_name: own.label, variant: line.variant });
                          }
                          // The product, if it has variants: their grid opens from the row.
                          const variantProduct = offered.find(
                            (p) => String(p.id) === line.product_id && p.variants.length > 0,
                          );
                          const amount =
                            line.quantity === "" || line.unit_price === ""
                              ? null
                              : Math.round(line.quantity * line.unit_price * 100) / 100;
                          return (
                            <>
                              <RowSelect
                                placeholder={products === null && productSources.length ? "Lecture…" : "Produit"}
                                aria-label="Produit"
                                data={data}
                                value={line.product_id}
                                onChange={(id) => {
                                  const chosen = offered.find((p) => String(p.id) === id);
                                  // A product with variants: its quantities by variant, in a window.
                                  if (chosen && chosen.variants.length) {
                                    change({ product_id: id, product_name: chosen.name, variant: [] });
                                    setPicking({ rank, product: chosen, previous: line });
                                    return;
                                  }
                                  const price = priceAt(id, line.quantity);
                                  change({
                                    product_id: id,
                                    product_name: chosen?.name ?? "",
                                    variant: [],
                                    // The product's price at the supplier, for the quantity, and its tax.
                                    ...(price !== null ? { unit_price: price } : {}),
                                    tax: taxAt(id, line.quantity),
                                  });
                                }}
                                onSearchChange={(text) => setSearches((all) => ({ ...all, [rank]: text }))}
                                nothingFoundMessage={(() => {
                                  const typed = (searches[rank] ?? "").trim();
                                  // Not found: created from what is typed — at once, or opened to be completed.
                                  if (typed && productWidget) {
                                    return (
                                      <CreateFromSearch
                                        typed={typed}
                                        onCreate={(edit) => void createFromSearch(rank, typed, edit)}
                                      />
                                    );
                                  }
                                  return productSources.length
                                    ? "Aucun produit de ce fournisseur"
                                    : "Aucun widget produits choisi";
                                })()}
                                autoFocus={autoFocus}
                                style={{ flex: 1, minWidth: 0 }}
                              />
                              <RowNumber
                                placeholder="Qté"
                                aria-label="Quantité"
                                value={line.quantity}
                                onChange={(v) => {
                                  const quantity = v === "" ? "" : Number(v);
                                  // Another quantity may reach another tier of the supplier's prices.
                                  const price = priceAt(line.product_id, quantity);
                                  change({ quantity, ...(price !== null ? { unit_price: price } : {}) });
                                }}
                                min={0}
                                max={ORDER_QUANTITY_MAX}
                                decimalScale={3}
                                w={QUANTITY_WIDTH}
                                alignRight
                                style={{ flexShrink: 0 }}
                              />
                              <RowNumber
                                placeholder="PU"
                                aria-label="Prix unitaire"
                                value={line.unit_price}
                                onChange={(v) => change({ unit_price: v === "" ? "" : Number(v) })}
                                min={0}
                                max={ORDER_PRICE_MAX}
                                decimalScale={2}
                                thousandSeparator=" "
                                suffix={unit ? ` ${unit}` : undefined}
                                w={PRICE_WIDTH}
                                alignRight
                                style={{ flexShrink: 0 }}
                              />
                              {/* Its tax: its price's at the supplier, or one of the Produits widget's Taxes widgets'. */}
                              <RowSelect
                                placeholder="TVA"
                                aria-label="TVA"
                                {...taxChoice(taxes, line.tax)}
                                value={line.tax}
                                onChange={(v) => change({ tax: v })}
                                searchable={false}
                                alignRight
                                allowDeselect={false}
                                // A narrow chevron: the rate shows whole.
                                rightSectionWidth={24}
                                w={LINE_TAX_WIDTH}
                                style={{ flexShrink: 0 }}
                              />
                              <Text size="sm" ta="right" w={LINE_TOTAL_WIDTH} style={{ flexShrink: 0 }} truncate>
                                {formatAmount(amount, currency) || "—"}
                              </Text>
                              {/* Its quantities by variant, on the dark gray of Support's
                                  "Envoyer": faded for a product without variants. */}
                              <ActionIcon
                                size={VARIANTS_BUTTON_SIZE}
                                variant="filled"
                                aria-label="Quantités par variante"
                                onClick={() =>
                                  variantProduct && setPicking({ rank, product: variantProduct, previous: line })
                                }
                                disabled={!variantProduct}
                                style={VARIANTS_BUTTON_STYLE}
                                // Disabled, Mantine would give it its own gray: it only fades.
                                styles={{
                                  root: variantProduct
                                    ? undefined
                                    : { backgroundColor: "var(--milo-dark-button)", color: "#ffffff", opacity: 0.35 },
                                }}
                              >
                                <IconTable size={16} />
                              </ActionIcon>
                            </>
                          );
                        }}
                      />
                    )}

                    {/* Its documents under its products — a supplier's quote. Read-only,
                        the disabled fieldset turns their actions off. */}
                    <CardAttachments
                      attachments={attachments.filter((a) => !isInvoice(a))}
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

                    {/* Once it is an order, its invoice; gone once it is cancelled. */}
                    {order && status === "order" && (
                      <CardAttachments
                        attachments={attachments.filter(isInvoice)}
                        onPick={() => invoiceField.current?.click()}
                        onReorder={arrangeAttachments}
                        onDelete={deleteAttachment}
                        drop={
                          readOnly
                            ? undefined
                            : {
                                icon: IconFileInvoice,
                                message: "Déposez la facture ici",
                                onDrop: (files) => void addInvoices(files),
                                shown: dragging,
                              }
                        }
                        words={INVOICE_WORDS}
                      />
                    )}
                  </Stack>
                </fieldset>
              </Stack>
            </DrawerScrollArea>
          </Tabs.Panel>

          {/* Its exchanges with the supplier, as a request's: the e-mails
              sent, the editor under them to write another at any time. */}
          {exchangeable && (
            <Tabs.Panel value="exchanges" style={DRAWER_PANEL_STYLE}>
              <DrawerScrollArea fill>
                <Stack gap="md" style={{ flex: 1, minHeight: 0 }}>
                  <Paper
                    bg="var(--mantine-color-default)"
                    // Its height its own: the editor under it does not squeeze it.
                    style={{
                      // "Répondre", folded, sticks under it: no rounded corners between them.
                      ...(replyAttached && { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }),
                      // No exchange yet: the empty frame at its own height.
                      ...(messages.length === 0
                        ? { flex: "0 0 auto", height: EMPTY_EXCHANGES_HEIGHT }
                        : { flex: 1, minHeight: EXCHANGES_MIN_HEIGHT }),
                      display: "flex",
                      flexDirection: "column",
                      overflow: "hidden",
                    }}
                  >
                    {messages.length === 0 ? (
                      <EmptyPanel icon={IconMessages} message="Aucun échange pour le moment." />
                    ) : (
                      <ScrollArea type="scroll" scrollbars="y" scrollbarSize={4} style={{ flex: 1, minHeight: 0 }}>
                        <Stack gap="md" p={30}>
                          {/* Sent from Milo, every message is the team's: nothing is deleted. */}
                          <SupportMessages messages={messages} senderEmail="" tight />
                        </Stack>
                      </ScrollArea>
                    )}
                  </Paper>
                  {canSave && (
                    <SupportReply
                      onAttachedChange={setReplyAttached}
                      template={exchangeTemplate}
                      snippets={snippets}
                      blocks={blocks}
                      // The e-mail as its first recipient will read it, the order as the drawer holds it.
                      preview={(html) =>
                        api
                          .previewOrderMail({
                            board_id: order?.board_id ?? boardId,
                            html,
                            supplier_id: form.supplier_id === null ? null : Number(form.supplier_id),
                            due_date: form.due_date,
                            lines: linesOf(form.lines).filter((l) => l.kind !== "product" || l.quantity > 0),
                            number: order ? orderNumber(order) : "",
                            recipient_id: recipients[0] ? Number(recipients[0].id) : null,
                          })
                          .then((r) => r.html)
                      }
                      byEmail
                      withFiles
                      withStatuses={false}
                      blockedReason={
                        !recipients.length
                          ? "Ajoutez aux acteurs un contact du fournisseur avec une adresse e-mail"
                          : !complete
                            ? "Choisissez un fournisseur, l'entrepôt de livraison et au moins un produit"
                            : undefined
                      }
                      // Saved first, then sent: the editor keeps a refused text.
                      onSend={sendExchange}
                    />
                  )}
                </Stack>
              </DrawerScrollArea>
            </Tabs.Panel>
          )}

          <Tabs.Panel value="comments" style={DRAWER_PANEL_STYLE}>
            <DrawerScrollArea fill>
              <Stack gap="md" style={{ flex: 1, minHeight: 0 }}>
                {/* Before its creation, the comments written wait for it. */}
                <CommentThread
                  comments={comments}
                  onAdd={(text) => void addComment(text)}
                  onUpdate={(id, text) => void updateComment(id, text)}
                  onDelete={(id) => void deleteComment(id)}
                  readOnly={!canSave}
                />
                {!order && comments.length > 0 && (
                  <Notification color="blue" withCloseButton={false} withBorder radius="md" mt={40}>
                    {comments.length > 1
                      ? `${comments.length} commentaires seront enregistrés avec le devis.`
                      : "Ce commentaire sera enregistré avec le devis."}
                  </Notification>
                )}
              </Stack>
            </DrawerScrollArea>
          </Tabs.Panel>
        </Tabs>

        <DrawerFooter
          onSave={readOnly ? undefined : () => void persist()}
          onClose={onClose}
          onDelete={deletable ? () => setConfirmDelete(true) : undefined}
          saving={saving}
          saveDisabled={!complete}
        />

        {/* The picker, reset afterwards: choosing the same file again must still be seen. */}
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
        <input
          ref={invoiceField}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            const files = Array.from(e.currentTarget.files ?? []);
            e.currentTarget.value = "";
            void addInvoices(files);
          }}
        />
      </Drawer>

      {productWidget && (
        <ProductDrawer
          // "Créer un produit", or a product created from a row's search, to complete:
          // closed or saved, back to the order, the product chosen.
          opened={creatingProduct || editedProduct !== null}
          onClose={() => {
            setCreatingProduct(false);
            setEditedProduct(null);
          }}
          boardId={productWidget.board_id}
          listKey={productWidget.key}
          product={editedProduct}
          initialSupplierId={form.supplier_id === null ? undefined : Number(form.supplier_id)}
          onSaved={() => {}}
          onCreated={addCreated}
          onDuplicated={() => {}}
          canSave={canSave}
          canDelete={false}
        />
      )}

      {supplierWidget && (
        <ContactDrawer
          // "Créer un fournisseur", or a supplier created from its search, to complete.
          opened={addingSupplier || editedSupplier !== null}
          onClose={() => {
            setAddingSupplier(false);
            setEditedSupplier(null);
          }}
          boardId={supplierWidget.board_id}
          listKey={supplierWidget.key}
          contact={editedSupplier}
          contacts={(contacts ?? []).filter((c) => c.board_id === supplierWidget.board_id)}
          initialType="company"
          onSaved={() => {}}
          onCreated={(contact) => {
            setCreated(contact);
            if (contact.type === "company") set("supplier_id", String(contact.id));
          }}
          canSave={canSave}
          canDelete={false}
        />
      )}

      {picking && (
        <VariantQuantitiesModal
          opened
          onClose={cancelVariants}
          productName={picking.product.name}
          variants={picking.product.variants}
          initial={
            new Map(
              form.lines
                .filter((l) => isVariantLine(l, String(picking.product.id)))
                .map((l) => [variantKey(l.variant), l.quantity === "" ? 0 : l.quantity]),
            )
          }
          onConfirm={applyVariants}
        />
      )}

      {move && (
        <DeleteConfirmModal
          opened
          onClose={() => setMove(null)}
          onConfirm={() => {
            const next = move;
            setMove(null);
            void persist(next);
          }}
          title={
            move === "order" ? MOVES.order.title : status === "quote" ? "Annuler le devis" : "Annuler la commande"
          }
          message={
            move === "cancelled" && status === "quote"
              ? "Une fois annulé, le devis ne pourra plus être modifié."
              : MOVES[move].message
          }
          confirmLabel={MOVES[move].confirm}
          confirmColor={MOVES[move].color}
          cancelLabel="Fermer"
        />
      )}

      <DeleteConfirmModal
        opened={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
        title="Supprimer le devis"
        message={
          <>
            Voulez-vous vraiment supprimer
            {order && orderNumber(order) ? ` « ${orderNumber(order)} »` : " ce devis"} ?
            {messages.length > 0 && " Ses échanges seront supprimés avec lui."} Cette action est irréversible.
          </>
        }
      />
    </>
  );
}
