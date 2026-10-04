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
  "assets",
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
