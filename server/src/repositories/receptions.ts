// Ce que les widgets reçoivent du dehors : les boîtes de support d'une liste
// de demandes, les tags d'agent d'une liste de postes. Chaque widget associe
// ce qu'il reçoit à l'un des contextes de son tableau, dans sa configuration :
//
//   support.list : { "boites": [{ "email": "support@…", "contexte": 12 }] }
//   asset.list   : { "tags":   [{ "tag": "Arco Marketing", "contexte": 12 }] }
//
// Une même boîte reçue par deux widgets va au premier : celui de la structure
// publique d'abord, le plus ancien ensuite.

import { cleDeListe } from "@milo/shared";
import type { Id } from "@milo/shared";
import { selection } from "../db/query.js";
import { contexts } from "./contexts.js";
import { optins, paire } from "./optins.js";

interface WidgetRecepteur {
  config: string;
  board_id: Id;
}

const recepteurs = selection<WidgetRecepteur>(
  `SELECT w.config, s.board_id FROM board_widgets w
   JOIN board_sections s ON s.id = w.section_id
   WHERE w.type = ?
   ORDER BY s.owner_id IS NOT NULL, w.id`,
);

/** Ce qu'un widget reçoit, et le contexte où il le range. */
export interface Reception {
  /** L'adresse ou le tag, tel que le widget le dit. */
  valeur: string;
  /** Le tableau du widget qui la reçoit. */
  board_id: Id;
  /** Le contexte qu'il lui donne ; nul s'il ne lui en donne pas. */
  context_id: Id | null;
  /** La clé de liste du widget qui la reçoit : ses éléments la portent. */
  liste: string;
  /** Le nom du contexte, et celui de son tableau : où la réception se montre. */
  usage: string;
  /**
   * Vrai quand le widget veut que les e-mails relevés quittent la boîte (une
   * boîte de support) ; faux, elle en garde une copie.
   */
  supprimer: boolean;
}

/** La clé de la configuration d'une liste de demandes : supprimer ce qu'elle relève. */
export const SUPPRESSION = "suppression";

const tableauDe = selection<{ name: string }>("SELECT name FROM boards WHERE id = ?");

/**
 * Les réceptions de tous les widgets d'un type, une par valeur — la casse n'y
 * compte pas. Sans contexte — le tableau n'en a pas, ou celui qu'on avait
 * dit n'est plus —, ce qui arrive n'en a pas non plus.
 */
const receptions = (
  type: string,
  champ: string,
  cle: string,
  /** Ce qui compte : sans lui, tout. Écarté, une réception laisse sa valeur au widget suivant. */
  garder: (r: Reception) => boolean = () => true,
  /** Faux : chaque widget garde ses réceptions, même une valeur qu'un autre reçoit déjà. */
  uneParValeur = true,
): Reception[] => {
  const vues = new Map<string, Reception>();
  const toutes: Reception[] = [];
  for (const widget of recepteurs.all(type)) {
    let config: Record<string, unknown>;
    try {
      config = JSON.parse(widget.config) as Record<string, unknown>;
    } catch {
      continue;
    }
    const liste = Array.isArray(config[champ]) ? (config[champ] as Record<string, unknown>[]) : [];
    for (const entree of liste) {
      const valeur = typeof entree?.[cle] === "string" ? (entree[cle] as string).trim() : "";
      if (!valeur || (uneParValeur && vues.has(valeur.toLowerCase()))) continue;
      const trouve = entree.contexte ? contexts.byId.get(entree.contexte) : undefined;
      const contexte = trouve?.board_id === widget.board_id ? trouve : undefined;
      const tableau = tableauDe.get(widget.board_id)?.name ?? "";
      const reception: Reception = {
        valeur,
        board_id: widget.board_id,
        context_id: contexte?.id ?? null,
        liste: cleDeListe(config),
        usage: contexte ? `${contexte.name} (${tableau})` : tableau,
        supprimer: config[SUPPRESSION] === true,
      };
      if (!garder(reception)) continue;
      vues.set(valeur.toLowerCase(), reception);
      toutes.push(reception);
    }
  }
  return uneParValeur ? [...vues.values()] : toutes;
};

/** Les boîtes de support que les listes de demandes disent, confirmées ou non. */
export const boitesConfigurees = (): Reception[] => receptions("support.list", "boites", "email");

/** Chaque boîte de chaque liste, sans regarder si une autre la reçoit déjà : ce qui se confirme. */
export const boitesDesListes = (): Reception[] =>
  receptions("support.list", "boites", "email", () => true, false);

/**
 * Les boîtes de support qui se relèvent, une par liste qui l'a confirmée
 * (lib/optin.ts) : une boîte reçue par plusieurs listes fait une demande
 * dans chacune. Chaque liste porte le moment de sa confirmation — rien de ce
 * qui est arrivé avant n'y est importé.
 */
export const boitesRecues = (): (Reception & { confirmee_le: string })[] => {
  const confirmees = optins.confirmees();
  const le = (b: Reception) => confirmees.get(paire(b.liste, b.valeur)) ?? "";
  // Une liste ne reçoit qu'une fois une boîte, même dite par sa copie
  // personnelle — qui garde sa clé de liste.
  const vues = new Set<string>();
  return receptions("support.list", "boites", "email", (b) => Boolean(le(b)), false).flatMap(
    (b) => {
      const p = paire(b.liste, b.valeur);
      if (vues.has(p)) return [];
      vues.add(p);
      return [{ ...b, confirmee_le: le(b) }];
    },
  );
};

/** Les tags d'agent que les listes de postes reçoivent. */
export const tagsRecus = (): Reception[] => receptions("asset.list", "tags", "tag");

/** La liste et le contexte où va un poste de ce tag ; nul si aucune liste ne le reçoit. */
export const receptionDuTag = (tag: string): Reception | null =>
  tagsRecus().find((t) => t.valeur.toLowerCase() === tag.trim().toLowerCase()) ?? null;
