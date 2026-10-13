import { useMemo } from "react";
import { CONTACT_TYPES, ORDER_STATUSES, PRODUCT_TRACKINGS } from "@milo/shared";
import type { Contact, Order, Product } from "@milo/shared";
import { api } from "../../../api";
import { useSourceItems } from "../../../lib/sources";
import { CHART_COLORS } from "../../chart-colors";
import { actorsDimension, bandDimension, labelsDimension, named, plainDimension } from "../dimensions";
import { useTreePaths, widgetKey } from "../trees";
import type { IndicatorSource } from "../types";

// What the logistics give the indicators: the contacts, the products and the
// orders of the lists named, on any board one sees.

export const contactSource: IndicatorSource<Contact> = {
  data: "contact",
  label: "Contacts",
  sourceType: "contact.list",
  unit: "contacts",
  none: "Aucun contact",
  useItems: ({ sources }) => useSourceItems("contact", sources),
  measures: [
    { value: "total", label: "Nombre de contacts", weight: () => 1 },
    { value: "company", label: "Nombre de sociétés", weight: (c) => (c.type === "company" ? 1 : 0) },
    { value: "person", label: "Nombre de personnes", weight: (c) => (c.type === "person" ? 1 : 0) },
  ],
  dimensions: [
    plainDimension("type", "Types", (c) => [
      { key: c.type, name: CONTACT_TYPES.find((t) => t.value === c.type)?.label ?? c.type },
    ]),
    labelsDimension("/contact-labels", "contact.list", (c) => c.labels),
    plainDimension("payment_term", "Conditions de paiement", (c) => named(c.payment_term), {
      empty: "Non renseignées",
    }),
    plainDimension("currency", "Devises", (c) => named(c.currency), { empty: "Non renseignée" }),
  ],
  dates: [{ value: "created", label: "Date de création", title: "Contacts créés", of: (c) => c.created_at }],
};

/** A product, with its category's path, read in its widget's tree. */
type ProductItem = Product & { category_path: string };

export const productSource: IndicatorSource<ProductItem> = {
  data: "product",
  label: "Produits",
  sourceType: "product.list",
  unit: "produits",
  none: "Aucun produit",
  useItems: function useProducts({ sources }) {
    const products = useSourceItems("product", sources);
    const paths = useTreePaths(
      sources,
      async (s) => (await api.getProductSettings({ board: s.board_id, list: s.key })).categories,
      "products",
    );
    return useMemo(
      () =>
        products?.map((p) => ({
          ...p,
          category_path: paths.get(widgetKey(p.board_id, p.list_key))?.get(p.category) ?? "",
        })) ?? null,
      [products, paths],
    );
  },
  measures: [
    { value: "total", label: "Nombre de produits", weight: () => 1 },
    { value: "favorite", label: "Produits favoris", weight: (p) => (p.favorite ? 1 : 0) },
    { value: "variants", label: "Nombre de variantes", weight: (p) => Math.max(p.variants.length, 1) },
  ],
  dimensions: [
    // Its whole path: two categories of the same name under two parents stay apart.
    plainDimension(
      "categories",
      "Catégories",
      (p) => (p.category_path ? [{ key: p.category, name: p.category_path }] : []),
      { empty: "Sans catégorie" },
    ),
    plainDimension("tracking", "Suivi", (p) => [
      { key: p.tracking, name: PRODUCT_TRACKINGS.find((t) => t.value === p.tracking)?.label ?? p.tracking },
    ]),
    labelsDimension("/product-labels", "product.list", (p) => p.labels),
  ],
  dates: [{ value: "created", label: "Date de création", title: "Produits créés", of: (p) => p.created_at }],
};

/** The order statuses, in their order, each in its color. */
const ORDER_BANDS = ORDER_STATUSES.map((s) => ({
  key: `color_${s.value}`,
  slice: s.value,
  name: s.label,
  color: s.value === "quote" ? CHART_COLORS.orange : s.value === "order" ? CHART_COLORS.green : CHART_COLORS.gray5,
  what: `des « ${s.label} »`,
}));

export const orderSource: IndicatorSource<Order> = {
  data: "order",
  label: "Commandes",
  sourceType: "order.list",
  unit: "commandes",
  none: "Aucune commande",
  useItems: ({ sources }) => useSourceItems("order", sources),
  measures: [
    { value: "total", label: "Devis et commandes", weight: () => 1 },
    { value: "quote", label: "Devis", weight: (o) => (o.status === "quote" ? 1 : 0) },
    { value: "order", label: "Commandes", weight: (o) => (o.status === "order" ? 1 : 0) },
    { value: "cancelled", label: "Annulés", weight: (o) => (o.status === "cancelled" ? 1 : 0) },
  ],
  dimensions: [
    bandDimension("status", "Statuts", ORDER_BANDS, (o) => o.status),
    plainDimension("suppliers", "Fournisseurs", (o) => named(o.supplier_name), { empty: "Sans fournisseur" }),
    actorsDimension("actors", "Acteurs", (o) => o.actors),
    labelsDimension("/order-labels", "order.list", (o) => o.labels),
  ],
  dates: [
    { value: "created", label: "Date de création", title: "Demandes créées", of: (o) => o.created_at },
    { value: "ordered", label: "Date de commande", title: "Commandes passées", of: (o) => o.ordered_at || null },
  ],
};
