import { useMemo } from "react";
import { DECLARED_ASSET_RESOURCES, DECLARED_ASSET_SUPPLIER, DECLARED_ASSET_WORDS } from "@milo/shared";
import type { DeclaredAsset, DeclaredAssetKind, LabelsBase } from "@milo/shared";
import { api } from "../../../api";
import { useSourceItems } from "../../../lib/sources";
import { labelsDimension, named, plainDimension } from "../dimensions";
import { useTreePaths, widgetKey } from "../trees";
import type { IndicatorSource } from "../types";

// What the declared assets give the indicators: the assets of the lists
// named, each with its category's path — read in its widget's tree —; how
// many, their quantity, their value; by supplier, category, maker, product —
// in the kind's words: device types, brands and models; software types,
// publishers and applications.

/** An asset with its category's path. */
type Item = DeclaredAsset & { category_path: string };

/** A price as it reads in France: "1 250,00 €". */
const PRICE_FORMAT = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });

const LABELS: Record<DeclaredAssetKind, LabelsBase> = {
  unmanaged_device_asset: "/unmanaged-device-asset-labels",
  application_asset: "/application-asset-labels",
};

const declaredAssetSource = (kind: DeclaredAssetKind): IndicatorSource<Item> => {
  const { label, category, maker, product } = DECLARED_ASSET_WORDS[kind];
  return {
    data: kind,
    label,
    sourceType: `${kind}.list`,
    unit: "assets",
    none: "Aucun asset",
    useItems: function useDeclaredAssets({ sources }) {
      const assets = useSourceItems(kind, sources);
      const paths = useTreePaths(
        sources,
        async (s) => (await api.getDeclaredAssetSettings(kind, { board: s.board_id, list: s.key })).categories,
        DECLARED_ASSET_RESOURCES[kind],
      );
      return useMemo(
        () =>
          assets?.map((a) => ({
            ...a,
            category_path: paths.get(widgetKey(a.board_id, a.list_key))?.get(a.category) ?? "",
          })) ?? null,
        [assets, paths],
      );
    },
    measures: [
      { value: "assets", label: "Nombre d'assets", weight: () => 1 },
      { value: "quantity", label: "Quantité totale", weight: (a) => a.quantity },
      {
        value: "value",
        label: "Valeur totale",
        weight: (a) => (a.price ?? 0) * a.quantity,
        format: (v) => PRICE_FORMAT.format(v),
      },
    ],
    dimensions: [
      plainDimension("supplier", DECLARED_ASSET_SUPPLIER.titles, (a) => named(a.supplier), {
        empty: DECLARED_ASSET_SUPPLIER.none,
      }),
      // Its whole path: two types of the same name under two parents stay apart.
      plainDimension(
        "category",
        category.titles,
        (a) => (a.category_path ? [{ key: a.category, name: a.category_path }] : []),
        { empty: category.none },
      ),
      plainDimension("maker", maker.titles, (a) => named(a.maker), { empty: maker.none }),
      // A product is told apart by its maker: "Dell P2723".
      plainDimension(
        "product",
        product.titles,
        (a) => (a.product ? [{ key: `${a.maker}\n${a.product}`, name: `${a.maker} ${a.product}`.trim() }] : []),
        { empty: product.none },
      ),
      labelsDimension(LABELS[kind], `${kind}.list`, (a) => a.labels),
    ],
    dates: [{ value: "created", label: "Date de création", title: "Assets créés", of: (a) => a.created_at }],
  };
};

export const unmanagedDeviceAssetSource = declaredAssetSource("unmanaged_device_asset");
export const applicationAssetSource = declaredAssetSource("application_asset");
