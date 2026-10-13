// What the server pushes to connected clients after each write.
//
// Before, there was only one counter: any write, by
// anyone, made all clients reload the eight data sets. Renaming a
// label reloaded the projects, companies, users and
// boards. Each write now names what it touched, and the client
// rereads only that.

export const RESOURCES = [
  /** Companies and accounts: the reference lists. */
  "lookups",
  /** The views of the bottom selector. */
  "views",
  /** The views' boards: their tabs. */
  "boards",
  /** The boards' sections, and the widgets they carry. */
  "board-widgets",
  "categories",
  "projects",
  "task-lists",
  "labels",
  "project-labels",
  /** Tickets, and the labels they carry. */
  "support-requests",
  "support-labels",
  /** Machines: what the inventory agents report. */
  "managed-device-assets",
  /** The declared assets, by kind: what is entered by hand (declared-assets.ts). */
  "unmanaged-device-assets",
  "application-assets",
  /** The contacts, and their labels (contacts.ts). */
  "contacts",
  /** The products, their labels and their comments (products.ts). */
  "products",
  /** The orders, their labels and their comments (orders.ts). */
  "orders",
  /** The warehouses, and their labels (warehouses.ts). */
  "warehouses",
  /** The locations, and their labels (locations.ts). */
  "locations",
  /** The styles the titles share. */
  "title-styles",
  /** The proxies, and whether each is connected (shared/proxies.ts). */
  "proxies",
] as const;

export type Resource = (typeof RESOURCES)[number];

/** The counter of each resource. It never goes backwards. */
export type ResourceVersions = Record<Resource, number>;

export interface VersionPayload {
  /** Sum of all counters: a write, wherever it is, makes it rise. */
  version: number;
  versions: ResourceVersions;
}

export const emptyVersions = (): ResourceVersions =>
  Object.fromEntries(RESOURCES.map((r) => [r, 0])) as ResourceVersions;
