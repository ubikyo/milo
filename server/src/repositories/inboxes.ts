// Ce que les widgets reçoivent du dehors : les boîtes de support d'une liste
// de demandes, les tags d'agent d'une liste de postes. Chaque widget associe
// ce qu'il reçoit à l'un des contextes de son tableau, dans sa configuration :
//
//   support.list : { "mailboxes": [{ "email": "support@…", "context_id": 12 }] }
//   asset.list   : { "tags":      [{ "tag": "Arco Marketing", "context_id": 12 }] }
//
// Une même boîte reçue par deux widgets va au premier : celui de la structure
// publique d'abord, le plus ancien ensuite.

import { listKey } from "@milo/shared";
import type { Id } from "@milo/shared";
import { selection } from "../db/query.js";
import { contexts } from "./contexts.js";
import { optins, pair } from "./optins.js";

interface ReceiverWidget {
  config: string;
  board_id: Id;
}

const receivers = selection<ReceiverWidget>(
  `SELECT w.config, s.board_id FROM board_widgets w
   JOIN board_sections s ON s.id = w.section_id
   WHERE w.type = ?
   ORDER BY s.owner_id IS NOT NULL, w.id`,
);

/** Ce qu'un widget reçoit, et le contexte où il le range. */
export interface Inbox {
  /** L'adresse ou le tag, tel que le widget le dit. */
  value: string;
  /** Le tableau du widget qui la reçoit. */
  board_id: Id;
  /** Le contexte qu'il lui donne ; nul s'il ne lui en donne pas. */
  context_id: Id | null;
  /** La clé de liste du widget qui la reçoit : ses éléments la portent. */
  list: string;
  /** Le nom du contexte, et celui de son tableau : où la réception se montre. */
  usage: string;
  /**
   * Vrai quand le widget veut que les e-mails relevés quittent la boîte (une
   * boîte de support) ; faux, elle en garde une copie.
   */
  remove: boolean;
}

/** La clé de la configuration d'une liste de demandes : supprimer ce qu'elle relève. */
export const DELETION = "delete_after_import";

const boardOf = selection<{ name: string }>("SELECT name FROM boards WHERE id = ?");

/**
 * Les réceptions de tous les widgets d'un type, une par valeur — la casse n'y
 * compte pas. Sans contexte — le tableau n'en a pas, ou celui qu'on avait
 * dit n'est plus —, ce qui arrive n'en a pas non plus.
 */
const inboxes = (
  type: string,
  field: string,
  key: string,
  /** Ce qui compte : sans lui, tout. Écarté, une réception laisse sa valeur au widget suivant. */
  keep: (r: Inbox) => boolean = () => true,
  /** Faux : chaque widget garde ses réceptions, même une valeur qu'un autre reçoit déjà. */
  uniquePerValue = true,
): Inbox[] => {
  const views = new Map<string, Inbox>();
  const all: Inbox[] = [];
  for (const widget of receivers.all(type)) {
    let config: Record<string, unknown>;
    try {
      config = JSON.parse(widget.config) as Record<string, unknown>;
    } catch {
      continue;
    }
    const list = Array.isArray(config[field]) ? (config[field] as Record<string, unknown>[]) : [];
    for (const entry of list) {
      const value = typeof entry?.[key] === "string" ? (entry[key] as string).trim() : "";
      if (!value || (uniquePerValue && views.has(value.toLowerCase()))) continue;
      const found = entry.context_id ? contexts.byId.get(entry.context_id) : undefined;
      const context = found?.board_id === widget.board_id ? found : undefined;
      const board = boardOf.get(widget.board_id)?.name ?? "";
      const inbox: Inbox = {
        value,
        board_id: widget.board_id,
        context_id: context?.id ?? null,
        list: listKey(config),
        usage: context ? `${context.name} (${board})` : board,
        remove: config[DELETION] === true,
      };
      if (!keep(inbox)) continue;
      views.set(value.toLowerCase(), inbox);
      all.push(inbox);
    }
  }
  return uniquePerValue ? [...views.values()] : all;
};

/** Les boîtes de support que les listes de demandes disent, confirmées ou non. */
export const configuredMailboxes = (): Inbox[] => inboxes("support.list", "mailboxes", "email");

/** Chaque boîte de chaque liste, sans regarder si une autre la reçoit déjà : ce qui se confirme. */
export const listMailboxes = (): Inbox[] =>
  inboxes("support.list", "mailboxes", "email", () => true, false);

/**
 * Les boîtes de support qui se relèvent, une par liste qui l'a confirmée
 * (lib/optin.ts) : une boîte reçue par plusieurs listes fait une demande
 * dans chacune. Chaque liste porte le moment de sa confirmation — rien de ce
 * qui est arrivé avant n'y est importé.
 */
export const receivedMailboxes = (): (Inbox & { confirmed_at: string })[] => {
  const confirmed = optins.confirmed();
  const le = (b: Inbox) => confirmed.get(pair(b.list, b.value)) ?? "";
  // Une liste ne reçoit qu'une fois une boîte, même dite par sa copie
  // personnelle — qui garde sa clé de liste.
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

/** Les tags d'agent que les listes de postes reçoivent. */
export const receivedTags = (): Inbox[] => inboxes("asset.list", "tags", "tag");

/** La liste et le contexte où va un poste de ce tag ; nul si aucune liste ne le reçoit. */
export const tagInbox = (tag: string): Inbox | null =>
  receivedTags().find((t) => t.value.toLowerCase() === tag.trim().toLowerCase()) ?? null;
