// The declared assets: entered by hand in a board's widget, unlike the
// supervised workstations (managed_device_asset), which their agent reports.
// Two kinds share everything but their words: the declared equipment
// (unmanaged_device_asset) and the applications (application_asset). Each
// has its own widget type, permission, tables, routes and labels; the
// interface names its lists in its own words — a device type, a brand and a
// model; a software type, a publisher and an application.

import type { LabelsBase } from "./api.js";
import type { Actor, DefaultListColumn, Id, Label } from "./domain.js";
import type { Resource } from "./events.js";

export const DECLARED_ASSET_KINDS = ["unmanaged_device_asset", "application_asset"] as const;

export type DeclaredAssetKind = (typeof DECLARED_ASSET_KINDS)[number];

export const isDeclaredAssetKind = (value: unknown): value is DeclaredAssetKind =>
  DECLARED_ASSET_KINDS.includes(value as DeclaredAssetKind);

/** The list widget of each kind: the one that owns its assets (LIST_KEY). */
export const declaredAssetListType = (kind: DeclaredAssetKind): string => `${kind}.list`;

/** Each kind's routes: "/api/<assets>", "/api/<asset>-labels", "/api/<asset>-settings". */
export const DECLARED_ASSET_ROUTES = {
  unmanaged_device_asset: {
    assets: "/unmanaged-device-assets",
    labels: "/unmanaged-device-asset-labels",
    settings: "/unmanaged-device-asset-settings",
  },
  application_asset: {
    assets: "/application-assets",
    labels: "/application-asset-labels",
    settings: "/application-asset-settings",
  },
} as const satisfies Record<
  DeclaredAssetKind,
  { assets: string; labels: LabelsBase; settings: string }
>;

/** What the server signals when a kind's assets change. */
export const DECLARED_ASSET_RESOURCES = {
  unmanaged_device_asset: "unmanaged-device-assets",
  application_asset: "application-assets",
} as const satisfies Record<DeclaredAssetKind, Resource>;

// --- Their words -------------------------------------------------------------

/** A noun of the lists, in each form the interface and the messages need. */
export interface DeclaredAssetNoun {
  /** "Marque": a field's label, a column's header. */
  title: string;
  /** "Marques": a list's title. */
  titles: string;
  /** "marque": after a count — "3 marques". */
  word: string;
  /** "une marque", "la marque", "de marque", "de la marque". */
  a: string;
  the: string;
  of: string;
  ofThe: string;
  /** "Aucune marque": an empty list, a choice with nothing to offer. */
  none: string;
  /** "Toutes": a filter that retains nothing. */
  all: string;
  /** For the agreements: "configurées", "utilisée". */
  feminine: boolean;
}

export interface DeclaredAssetWords {
  /** The kind, as its widget and permission are named. */
  label: string;
  /** What groups the products: a device type, a software type. */
  category: DeclaredAssetNoun;
  /** What makes them: a brand, a publisher. */
  maker: DeclaredAssetNoun;
  /** A model, an application. */
  product: DeclaredAssetNoun;
}

const noun = (
  title: string,
  titles: string,
  word: string,
  forms: { a: string; the: string; of: string; ofThe: string; none: string },
  feminine: boolean,
): DeclaredAssetNoun => ({ title, titles, word, ...forms, all: feminine ? "Toutes" : "Tous", feminine });

/** The suppliers: the same for every kind. */
export const DECLARED_ASSET_SUPPLIER = noun(
  "Fournisseur",
  "Fournisseurs",
  "fournisseur",
  {
    a: "un fournisseur",
    the: "le fournisseur",
    of: "de fournisseur",
    ofThe: "du fournisseur",
    none: "Aucun fournisseur",
  },
  false,
);

export const DECLARED_ASSET_WORDS: Record<DeclaredAssetKind, DeclaredAssetWords> = {
  unmanaged_device_asset: {
    label: "Équipements déclarés",
    category: noun(
      "Type de périphérique",
      "Types de périphérique",
      "type",
      {
        a: "un type de périphérique",
        the: "le type de périphérique",
        of: "de type de périphérique",
        ofThe: "du type de périphérique",
        none: "Aucun type de périphérique",
      },
      false,
    ),
    maker: noun(
      "Marque",
      "Marques",
      "marque",
      { a: "une marque", the: "la marque", of: "de marque", ofThe: "de la marque", none: "Aucune marque" },
      true,
    ),
    product: noun(
      "Modèle",
      "Modèles",
      "modèle",
      { a: "un modèle", the: "le modèle", of: "de modèle", ofThe: "du modèle", none: "Aucun modèle" },
      false,
    ),
  },
  application_asset: {
    label: "Applications",
    category: noun(
      "Type d'application",
      "Types d'application",
      "type",
      {
        a: "un type d'application",
        the: "le type d'application",
        of: "de type d'application",
        ofThe: "du type d'application",
        none: "Aucun type d'application",
      },
      false,
    ),
    maker: noun(
      "Éditeur",
      "Éditeurs",
      "éditeur",
      { a: "un éditeur", the: "l'éditeur", of: "d'éditeur", ofThe: "de l'éditeur", none: "Aucun éditeur" },
      false,
    ),
    product: noun(
      "Application",
      "Applications",
      "application",
      {
        a: "une application",
        the: "l'application",
        of: "d'application",
        ofThe: "de l'application",
        none: "Aucune application",
      },
      true,
    ),
  },
};

/** "Marque" → the same with a capital, for the start of a sentence: "La marque". */
export const capitalized = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

// --- The board's lists -------------------------------------------------------

/** An entry of a list: its name alone. */
export interface DeclaredAssetEntry {
  name: string;
}

/**
 * A product — a model, an application —, its category — a device type, a
 * software type: a node of the board's categories tree, by its id — and its
 * maker — a brand, a publisher —, by its name.
 */
export interface DeclaredAssetProduct {
  category: string;
  maker: string;
  name: string;
}

/**
 * A place of the board's locations tree — a company, a building, a rack, a
 * position —: its parent's id, none at the root. The tree is stored flat, a
 * parent always before its children, in the order it is shown.
 */
export interface DeclaredAssetLocation {
  /** Drawn by the client; what a device stores to designate its place. */
  id: string;
  parent: string | null;
  name: string;
  /**
   * A root place may be tied to one of the widget's labels — a company —:
   * an asset that carries a label tied to a root is offered only the places
   * under those roots, and under the roots tied to none. Absent elsewhere.
   */
  label?: Id | null;
}

/**
 * The lists of a board's widgets of one kind, shared by all of them. The
 * categories are a tree, stored as the locations: "Écran > Moniteur".
 */
export interface DeclaredAssetSettings extends DeclaredAssetExtraLists {
  categories: DeclaredAssetLocation[];
  suppliers: DeclaredAssetEntry[];
  makers: DeclaredAssetEntry[];
  products: DeclaredAssetProduct[];
}

/** The lists, in the order the drawer shows them. */
export const DECLARED_ASSET_LISTS = ["categories", "suppliers", "makers", "products"] as const;

/**
 * The lists only some kinds have, after the others: a device's
 * identification types and its locations tree; an application's license
 * information types.
 */
export const DECLARED_ASSET_EXTRA_LIST_KEYS = [
  "identification_types",
  "locations",
  "license_info_types",
] as const;

export type DeclaredAssetExtraList = (typeof DECLARED_ASSET_EXTRA_LIST_KEYS)[number];

export const DECLARED_ASSET_EXTRA_LISTS: Record<DeclaredAssetKind, readonly DeclaredAssetExtraList[]> = {
  unmanaged_device_asset: ["identification_types", "locations"],
  application_asset: ["license_info_types"],
};

export interface DeclaredAssetExtraLists {
  identification_types?: DeclaredAssetEntry[];
  locations?: DeclaredAssetLocation[];
  license_info_types?: DeclaredAssetEntry[];
}

/** What a board's extra list holds before it records its own. */
export const DECLARED_ASSET_EXTRA_LIST_DEFAULTS: Record<
  DeclaredAssetExtraList,
  DeclaredAssetEntry[] | DeclaredAssetLocation[]
> = {
  identification_types: [
    { name: "Numéro de série" },
    { name: "Service tag" },
    { name: "Service express" },
    { name: "Numéro de modèle / SKU" },
    { name: "Adresse MAC" },
  ],
  locations: [],
  license_info_types: [{ name: "Clé de licence" }, { name: "Code d'autorisation" }],
};

/** The group of a device's status labels: its default columns show it. */
export const DECLARED_ASSET_STATUS_GROUP = "Status";

/**
 * The labels a new widget of a kind brings, group by group: its status, in
 * the project's colors (those of the projects' priorities).
 * Labels like the others: renamed, recolored, deleted at will.
 */
export const DECLARED_ASSET_DEFAULT_LABELS: Record<
  DeclaredAssetKind,
  readonly { group: string; labels: readonly { name: string; color: string }[] }[]
> = {
  unmanaged_device_asset: [
    {
      group: DECLARED_ASSET_STATUS_GROUP,
      labels: [
        { name: "En service", color: "green.8" },
        { name: "En réserve", color: "blue.8" },
        { name: "En stock", color: "blue.8" },
        { name: "En préparation", color: "blue.8" },
        { name: "En attente de retrait", color: "orange.8" },
        { name: "En commande", color: "orange.8" },
        { name: "Réformé", color: "red.8" },
        { name: "Cédé", color: "red.8" },
        { name: "Hors service", color: "red.8" },
        { name: "Perdu", color: "red.8" },
      ],
    },
  ],
  application_asset: [
    {
      group: DECLARED_ASSET_STATUS_GROUP,
      labels: [
        { name: "En service", color: "green.8" },
        { name: "En réserve", color: "blue.8" },
        { name: "En stock", color: "blue.8" },
        { name: "En préparation", color: "blue.8" },
        { name: "En attente d'exploitation", color: "orange.8" },
        { name: "En commande", color: "orange.8" },
        { name: "Suspendue", color: "red.8" },
        { name: "Expirée", color: "red.8" },
        { name: "Résiliée", color: "red.8" },
      ],
    },
  ],
};

/** The columns a new widget of a kind shows, its status labels among them. */
export const DECLARED_ASSET_DEFAULT_COLUMNS: Record<DeclaredAssetKind, readonly DefaultListColumn[]> = {
  unmanaged_device_asset: [
    { key: "name", width: 110 },
    { key: "category", width: 220, format: "leaf" },
    { key: "supplier", width: 150 },
    { key: "maker", width: 150 },
    { key: "product" },
    { key: "labels", width: 120, groupName: DECLARED_ASSET_STATUS_GROUP },
    { key: "location", format: "path" },
  ],
  application_asset: [
    { key: "name", width: 110 },
    { key: "category", width: 220, format: "leaf" },
    { key: "supplier", width: 150 },
    { key: "maker", width: 150 },
    { key: "product" },
    { key: "labels", width: 120, groupName: DECLARED_ASSET_STATUS_GROUP },
  ],
};

/**
 * The categories tree a new widget of a kind brings, each node by its path
 * — a parent before its children.
 */
export const DECLARED_ASSET_DEFAULT_CATEGORIES: Record<DeclaredAssetKind, readonly string[][]> = {
  unmanaged_device_asset: [
    ["Infrastructure & Rack"],
    ["Infrastructure & Rack", "Baie informatique"],
    ["Infrastructure & Rack", "Coffret réseau"],
    ["Infrastructure & Rack", "Panneau de brassage"],
    ["Infrastructure & Rack", "Tiroir optique"],
    ["Infrastructure & Rack", "KVM"],
    ["Infrastructure & Rack", "KMM"],
    ["Infrastructure & Rack", "Console rackable"],
    ["Infrastructure & Rack", "Console série"],
    ["Infrastructure & Rack", "Capteur environnemental"],
    ["Énergie"],
    ["Énergie", "Onduleur (UPS)"],
    ["Énergie", "PDU"],
    ["Énergie", "PDU intelligent"],
    ["Énergie", "ATS"],
    ["Énergie", "Alimentation redondante"],
    ["Énergie", "Batterie externe"],
    ["Réseau"],
    ["Réseau", "Switch"],
    ["Réseau", "Routeur"],
    ["Réseau", "Point d'accès Wi-Fi"],
    ["Réseau", "Contrôleur Wi-Fi"],
    ["Réseau", "Modem"],
    ["Réseau", "Passerelle"],
    ["Réseau", "Convertisseur de média"],
    ["Réseau", "Répéteur"],
    ["Serveurs & Stockage"],
    ["Serveurs & Stockage", "Serveur rack"],
    ["Serveurs & Stockage", "Serveur tour"],
    ["Serveurs & Stockage", "Serveur lame"],
    ["Serveurs & Stockage", "Appliance"],
    ["Serveurs & Stockage", "NAS"],
    ["Serveurs & Stockage", "SAN"],
    ["Serveurs & Stockage", "Baie de stockage"],
    ["Serveurs & Stockage", "Bibliothèque de bandes"],
    ["Sécurité"],
    ["Sécurité", "Pare-feu"],
    ["Sécurité", "Appliance VPN"],
    ["Sécurité", "Appliance de sécurité"],
    ["Sécurité", "Contrôleur d'accès"],
    ["Sécurité", "Caméra IP"],
    ["Sécurité", "Enregistreur vidéo (NVR)"],
    ["Endpoints"],
    ["Endpoints", "Ordinateur fixe"],
    ["Endpoints", "Ordinateur portable"],
    ["Endpoints", "Station de travail"],
    ["Endpoints", "Client léger"],
    ["Endpoints", "Tablette"],
    ["Endpoints", "Smartphone"],
    ["Endpoints", "Terminal mobile"],
    ["Endpoints", "Terminal industriel"],
    ["Périphériques"],
    ["Périphériques", "Écran"],
    ["Périphériques", "Clavier"],
    ["Périphériques", "Souris"],
    ["Périphériques", "Webcam"],
    ["Périphériques", "Casque & Microphone"],
    ["Périphériques", "Station d'accueil"],
    ["Périphériques", "Hub USB"],
    ["Périphériques", "Lecteur de codes-barres"],
    ["Périphériques", "Lecteur de cartes"],
    ["Périphériques", "Scanner"],
    ["Périphériques", "Imprimante"],
    ["Périphériques", "Imprimante d'étiquettes"],
    ["Périphériques", "Imprimante 3D"],
    ["Périphériques", "Multifonction"],
    ["Téléphonie"],
    ["Téléphonie", "Téléphone IP"],
    ["Téléphonie", "Téléphone DECT"],
    ["Téléphonie", "Base DECT"],
    ["Téléphonie", "Standard téléphonique (IPBX)"],
    ["Téléphonie", "Passerelle VoIP"],
    ["Téléphonie", "Équipement de conférence"],
    ["Audiovisuel"],
    ["Audiovisuel", "Vidéoprojecteur"],
    ["Audiovisuel", "Téléviseur"],
    ["Audiovisuel", "Écran interactif"],
    ["Audiovisuel", "Écran d'affichage dynamique"],
    ["Audiovisuel", "Système de visioconférence"],
    ["Audiovisuel", "Barre de visioconférence"],
    ["Audiovisuel", "Caméra de conférence"],
    ["Composants"],
    ["Composants", "Processeur"],
    ["Composants", "Mémoire RAM"],
    ["Composants", "Disque HDD"],
    ["Composants", "Disque SSD"],
    ["Composants", "Carte réseau"],
    ["Composants", "Carte graphique"],
    ["Composants", "Carte contrôleur"],
    ["Composants", "Alimentation"],
  ],
  application_asset: [
    ["Bureautique & Collaboration"],
    ["Bureautique & Collaboration", "Suite bureautique"],
    ["Bureautique & Collaboration", "Messagerie & Agenda"],
    ["Bureautique & Collaboration", "Communication & Visioconférence"],
    ["Bureautique & Collaboration", "Gestion documentaire"],
    ["Bureautique & Collaboration", "Prise de notes"],
    ["Internet"],
    ["Internet", "Navigateur Web"],
    ["Internet", "Transfert de fichiers"],
    ["Multimédia & Création"],
    ["Multimédia & Création", "Suite graphique"],
    ["Multimédia & Création", "Édition PDF"],
    ["Multimédia & Création", "Lecture multimédia"],
    ["Multimédia & Création", "CAO / DAO"],
    ["Multimédia & Création", "Modélisation 3D"],
    ["Gestion d'entreprise"],
    ["Gestion d'entreprise", "ERP"],
    ["Gestion d'entreprise", "CRM"],
    ["Gestion d'entreprise", "Comptabilité & Finance"],
    ["Gestion d'entreprise", "Achats & Stocks"],
    ["Gestion d'entreprise", "Facturation"],
    ["Ressources humaines"],
    ["Ressources humaines", "SIRH"],
    ["Ressources humaines", "Paie"],
    ["Ressources humaines", "Gestion des temps & Congés"],
    ["Organisation & Projets"],
    ["Organisation & Projets", "Gestion de projets & Tâches"],
    ["Organisation & Projets", "Wiki & Base de connaissances"],
    ["Sécurité"],
    ["Sécurité", "Suite de sécurité"],
    ["Sécurité", "VPN"],
    ["Sécurité", "Gestion des identités"],
    ["Sécurité", "Gestion des mots de passe"],
    ["Système & Maintenance"],
    ["Système & Maintenance", "Utilitaires système"],
    ["Système & Maintenance", "Compression & Archivage"],
    ["Système & Maintenance", "Sauvegarde & Restauration"],
    ["Système & Maintenance", "Accès distant"],
    ["Informatique & Développement"],
    ["Informatique & Développement", "Suite de développement"],
    ["Informatique & Développement", "Administration système & Réseau"],
    ["Informatique & Développement", "Bases de données"],
    ["Informatique & Développement", "Supervision"],
    ["Analyse & Intelligence artificielle"],
    ["Analyse & Intelligence artificielle", "BI & Reporting"],
    ["Analyse & Intelligence artificielle", "Assistant IA"],
    ["Analyse & Intelligence artificielle", "IA générative"],
    ["Applications métier"],
    ["Applications métier", "Production & Maintenance"],
    ["Applications métier", "Logistique"],
    ["Applications métier", "Applications spécialisées"],
  ],
};

/**
 * The field of a widget's configuration naming the Contact widgets its
 * suppliers come from: their companies.
 */
export const DECLARED_ASSET_SUPPLIER_SOURCES = "supplier_sources";

/** The lists a widget may take from "Liste" widgets (value-lists.ts) rather than its own. */
export type DeclaredAssetSourcedList = "makers" | "identification_types" | "license_info_types";

/**
 * The field of a widget's configuration naming the Liste widgets each of
 * those lists comes from — their items' names, in their order —, by kind:
 * a device's brands and identification types, an application's publishers
 * and license information types. Named, the widget's own list gives way.
 */
export const DECLARED_ASSET_LIST_SOURCES: Record<
  DeclaredAssetKind,
  Partial<Record<DeclaredAssetSourcedList, string>>
> = {
  unmanaged_device_asset: { makers: "maker_sources", identification_types: "identification_type_sources" },
  application_asset: { makers: "maker_sources", license_info_types: "license_info_type_sources" },
};

/** The places of a locations tree, each with its path: "Société > Bâtiment > Baie". */
export const locationPaths = (locations: DeclaredAssetLocation[]): Map<string, string> => {
  const byId = new Map(locations.map((l) => [l.id, l]));
  const paths = new Map<string, string>();
  for (const location of locations) {
    // A parent comes before its children: its path is already known.
    const parent = location.parent ? byId.get(location.parent) : undefined;
    const above = parent ? paths.get(parent.id) : undefined;
    paths.set(location.id, above ? `${above} > ${location.name}` : location.name);
  }
  return paths;
};

// --- The assets --------------------------------------------------------------

/**
 * The fields only some kinds carry: a device's identifications and location;
 * an application's version, website and license information.
 */
export const DECLARED_ASSET_EXTRA_FIELDS = [
  "identifications",
  "location",
  "version",
  "website",
  "license_infos",
] as const;

export type DeclaredAssetExtraField = (typeof DECLARED_ASSET_EXTRA_FIELDS)[number];

export const DECLARED_ASSET_EXTRAS: Record<DeclaredAssetKind, readonly DeclaredAssetExtraField[]> = {
  unmanaged_device_asset: ["identifications", "location"],
  application_asset: ["version", "website", "license_infos"],
};

/**
 * A typed value: an identification — its type "Numéro de série", its value —,
 * a piece of license information — "Clé de licence", the key. The types come
 * from the board's lists.
 */
export interface DeclaredAssetTypedValue {
  type: string;
  value: string;
}

/** The extra fields, as an asset carries them: only those of its kind. */
export interface DeclaredAssetExtras {
  /** In their order; none, an empty list. */
  identifications?: DeclaredAssetTypedValue[];
  /** Where a device is: a place of its board's locations tree, by its id; empty, none. */
  location?: string;
  version?: string;
  website?: string;
  /** In their order; none, an empty list. */
  license_infos?: DeclaredAssetTypedValue[];
}

export interface DeclaredAsset extends DeclaredAssetExtras {
  id: Id;
  board_id: Id;
  /** The widget that shows it (shared, LIST_KEY). */
  list_key: string;
  name: string;
  actors: Actor[];
  /** Those of its board, in their order. */
  labels: Label[];
  /** A node of the board's categories tree, by its id; empty, none. */
  category: string;
  /**
   * The supplier: a company of a Contact widget, by its id — null when none
   * is chosen. "supplier" is its name; an asset from before the link keeps
   * the name it was given, without an id.
   */
  supplier_id: Id | null;
  supplier: string;
  /** Names from the board's lists; empty when not chosen. */
  maker: string;
  product: string;
  quantity: number;
  /** Before tax; null when not given. */
  price: number | null;
  /** Its tax's rate, in percent — one of its widget's Taxes widgets' (TAX_SOURCES) —; null, none. */
  tax: number | null;
  /** "2026-10-12"; empty when not given. */
  purchase_date: string;
  description: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

/** What the drawer sends: everything but what the server sets. */
export interface DeclaredAssetInput extends DeclaredAssetExtras {
  board_id?: Id;
  list_key?: string;
  name: string;
  actor_ids: Id[];
  label_ids: Id[];
  category: string;
  /** A company of a Contact widget; without one, the name kept from before. */
  supplier_id: Id | null;
  supplier: string;
  maker: string;
  product: string;
  quantity: number;
  price: number | null;
  tax: number | null;
  purchase_date: string;
  description: string;
  notes: string;
}

/** A photo of an asset: an image of the media folder, in its order. */
export interface DeclaredAssetPhoto {
  id: Id;
  asset_id: Id;
  file: string;
  name: string;
  size: number;
  position: number;
  created_at: string;
  /** Where to read it: "/api/media/<file>". */
  url: string;
}

/** A document of an asset, as a card's attachment. */
export interface DeclaredAssetAttachment extends DeclaredAssetPhoto {
  mime: string;
  /** True for the images the server returns as is. */
  is_image: boolean;
}

/** An asset's files, read when its drawer opens. */
export interface DeclaredAssetFiles {
  photos: DeclaredAssetPhoto[];
  attachments: DeclaredAssetAttachment[];
}

/** Beyond this, a name is no longer one. */
export const DECLARED_ASSET_NAME_MAX = 120;

/** Beyond these, a typed value is no longer one, and an asset has enough of them. */
export const DECLARED_ASSET_TYPED_VALUE_MAX = 1000;
export const DECLARED_ASSET_TYPED_VALUES_MAX = 200;

/** Beyond this, a version is no longer one. */
export const DECLARED_ASSET_VERSION_MAX = 120;

/** Beyond this, a website's address is no longer one. */
export const DECLARED_ASSET_WEBSITE_MAX = 2000;

/** Beyond this, a description or notes are no longer one. */
export const DECLARED_ASSET_DESCRIPTION_MAX = 4000;

/** The largest quantity and price an asset takes. */
export const DECLARED_ASSET_QUANTITY_MAX = 1_000_000;
export const DECLARED_ASSET_PRICE_MAX = 100_000_000;
