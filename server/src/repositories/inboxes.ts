// What widgets receive from outside: the support inboxes of a request list,
// the agent tags of a workstation list. A request list states its inboxes in
// its configuration, each with the Support label it sets on what arrives:
//
//   support.list : { "mailboxes": [{ "email": "support@…", "label_id": 12 }] }
//
// A workstation list receives the tags its board's asset labels name.
//
// An inbox received by two widgets goes to the first: the oldest.

import { listKey } from "@milo/shared";
import type { Id } from "@milo/shared";
import { selection } from "../db/query.js";
import { optins, pair } from "./optins.js";

interface ReceiverWidget {
  config: string;
  board_id: Id;
}

const receivers = selection<ReceiverWidget>(
  `SELECT w.config, s.board_id FROM board_widgets w
   JOIN board_sections s ON s.id = w.section_id
   WHERE w.type = ?
   ORDER BY w.id`,
);

/** What a widget receives, and the label it sets on it. */
export interface Inbox {
  /** The address or tag, as the widget states it. */
  value: string;
  /** The board of the widget that receives it. */
  board_id: Id;
  /** The Support label an inbox sets on its requests; null if it sets none. */
  label_id: Id | null;
  /** The list key of the widget that receives it: its items carry it. */
  list: string;
  /** The label's name, and its board's: where the inbox shows up. */
  usage: string;
  /**
   * True when the widget wants the polled e-mails to leave the inbox (a
   * support inbox); false, it keeps a copy.
   */
  remove: boolean;
}

/** The configuration key of a request list: delete what it polls. */
export const DELETION = "delete_after_import";

const boardOf = selection<{ name: string }>("SELECT name FROM boards WHERE id = ?");
const supportLabel = selection<{ id: Id; name: string }>(
  "SELECT id, name FROM support_labels WHERE id = ?",
);
const assetLabelsOf = selection<{ name: string }>(
  "SELECT name FROM asset_labels WHERE board_id = ? ORDER BY position, id",
);

/** A widget's configuration; null when it is unreadable. */
const parsed = (config: string): Record<string, unknown> | null => {
  try {
    return JSON.parse(config) as Record<string, unknown>;
  } catch {
    return null;
  }
};

/**
 * The inboxes of all request lists, one per value — case does not matter.
 * Without a label — none chosen, or the one named no longer exists —, what
 * arrives receives none.
 */
const inboxes = (
  type: string,
  field: string,
  key: string,
  /** What counts: without it, everything. Discarded, an inbox leaves its value to the next widget. */
  keep: (r: Inbox) => boolean = () => true,
  /** False: each widget keeps its inboxes, even a value another already receives. */
  uniquePerValue = true,
): Inbox[] => {
  const views = new Map<string, Inbox>();
  const all: Inbox[] = [];
  for (const widget of receivers.all(type)) {
    const config = parsed(widget.config);
    if (!config) continue;
    const list = Array.isArray(config[field]) ? (config[field] as Record<string, unknown>[]) : [];
    for (const entry of list) {
      const value = typeof entry?.[key] === "string" ? (entry[key] as string).trim() : "";
      if (!value || (uniquePerValue && views.has(value.toLowerCase()))) continue;
      const label = entry.label_id ? supportLabel.get(entry.label_id) : undefined;
      const board = boardOf.get(widget.board_id)?.name ?? "";
      const inbox: Inbox = {
        value,
        board_id: widget.board_id,
        label_id: label?.id ?? null,
        list: listKey(config),
        usage: label ? `${label.name} (${board})` : board,
        remove: config[DELETION] === true,
      };
      if (!keep(inbox)) continue;
      views.set(value.toLowerCase(), inbox);
      all.push(inbox);
    }
  }
  return uniquePerValue ? [...views.values()] : all;
};

/** The support inboxes that request lists state, confirmed or not. */
export const configuredMailboxes = (): Inbox[] => inboxes("support.list", "mailboxes", "email");

/** Each inbox of each list, without checking whether another already receives it: what gets confirmed. */
export const listMailboxes = (): Inbox[] =>
  inboxes("support.list", "mailboxes", "email", () => true, false);

/**
 * The support inboxes to poll, one per list that has confirmed it
 * (lib/optin.ts): an inbox received by several lists makes a request in each.
 * Each list carries the moment of its confirmation — nothing that arrived
 * before is imported into it.
 */
export const receivedMailboxes = (): (Inbox & { confirmed_at: string })[] => {
  const confirmed = optins.confirmed();
  const le = (b: Inbox) => confirmed.get(pair(b.list, b.value)) ?? "";
  // A list receives an inbox only once, even if stated by its personal copy —
  // which keeps its list key.
  const views = new Set<string>();
  return inboxes("support.list", "mailboxes", "email", (b) => Boolean(le(b)), false).flatMap(
    (b) => {
      const p = pair(b.list, b.value);
      if (views.has(p)) return [];
      views.add(p);
      return [{ ...b, confirmed_at: le(b) }];
    },
  );
};

/**
 * The agent tags that workstation lists receive: the names of their board's
 * asset labels. A tag named on two boards goes to the oldest list.
 */
export const receivedTags = (): Inbox[] => {
  const views = new Map<string, Inbox>();
  for (const widget of receivers.all("asset.list")) {
    const config = parsed(widget.config);
    if (!config) continue;
    const board = boardOf.get(widget.board_id)?.name ?? "";
    for (const { name } of assetLabelsOf.all(widget.board_id)) {
      const value = name.trim();
      if (!value || views.has(value.toLowerCase())) continue;
      views.set(value.toLowerCase(), {
        value,
        board_id: widget.board_id,
        label_id: null,
        list: listKey(config),
        usage: board,
        remove: false,
      });
    }
  }
  return [...views.values()];
};

/** The list where a workstation of this tag goes; null if no list receives it. */
export const tagInbox = (tag: string): Inbox | null =>
  receivedTags().find((t) => t.value.toLowerCase() === tag.trim().toLowerCase()) ?? null;
