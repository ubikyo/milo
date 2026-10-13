import {
  IconAppWindow,
  IconApps,
  IconBuildingFactory2,
  IconBuildingStore,
  IconCategory,
  IconCertificate,
  IconDeviceLaptop,
  IconDevices,
  IconId,
  IconMapPin,
  IconTruckDelivery,
} from "@tabler/icons-react";
import type { ComponentType } from "react";
import { DECLARED_ASSET_SUPPLIER, DECLARED_ASSET_WORDS, capitalized } from "@milo/shared";
import type { DeclaredAssetKind, DeclaredAssetNoun, DeclaredAssetWords } from "@milo/shared";

// What the interface needs of each declared asset kind (shared,
// declared-assets.ts) beyond its words: its icons, and the sentences built
// from its nouns — agreed in gender: "Aucune marque", "L'éditeur … utilisé".

type Icon = ComponentType<{ size?: number }>;

export interface DeclaredAssetLook {
  words: DeclaredAssetWords;
  /** The widget's, the empty list's. */
  icon: Icon;
  categoryIcon: Icon;
  makerIcon: Icon;
  productIcon: Icon;
  /** Its labels, in the widget's drawer (LabelGroupFields). */
  labels: "unmanaged-device-asset-labels" | "application-asset-labels";
}

export const DECLARED_ASSET_LOOKS: Record<DeclaredAssetKind, DeclaredAssetLook> = {
  unmanaged_device_asset: {
    words: DECLARED_ASSET_WORDS.unmanaged_device_asset,
    icon: IconDevices,
    categoryIcon: IconCategory,
    makerIcon: IconBuildingFactory2,
    productIcon: IconDeviceLaptop,
    labels: "unmanaged-device-asset-labels",
  },
  application_asset: {
    words: DECLARED_ASSET_WORDS.application_asset,
    icon: IconApps,
    categoryIcon: IconCategory,
    makerIcon: IconBuildingStore,
    productIcon: IconAppWindow,
    labels: "application-asset-labels",
  },
};

export const SUPPLIER_ICON = IconTruckDelivery;

/** The agreement of a noun: "e" for a feminine one. */
export const agreement = (noun: DeclaredAssetNoun): string => (noun.feminine ? "e" : "");

/** "La marque « Dell » est utilisée": the start of a refusal to delete. */
export const usedBy = (noun: DeclaredAssetNoun, name: string): string =>
  `${capitalized(noun.the)} « ${name} » est utilisé${agreement(noun)}`;

export { DECLARED_ASSET_SUPPLIER, capitalized };

/** The extra lists of names: their title and words, as the drawer says them. */
export const EXTRA_ENTRY_LISTS = {
  identification_types: {
    title: "Types d'identification",
    icon: IconId,
    none: "Aucun type d'identification",
    add: "Ajouter un type",
    remove: "Supprimer le type",
    word: "type",
  },
  license_info_types: {
    title: "Types d'informations de licence",
    icon: IconCertificate,
    none: "Aucun type d'information de licence",
    add: "Ajouter un type",
    remove: "Supprimer le type",
    word: "type",
  },
} as const;

/** The locations tree, as the drawer says it. */
export const LOCATIONS_LOOK = {
  title: "Emplacements",
  icon: IconMapPin,
};
