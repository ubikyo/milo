// La recherche globale : le champ de la rangée d'onglets. Elle fouille les
// projets, les cartes, les tickets, les postes et les éléments du
// mode Accès, et n'en rend que ce que la personne voit ailleurs — un tableau
// ou une catégorie privés restent fermés aux autres ici aussi.

import { Router } from "express";
import type { Request } from "express";
import {
  PROJECT_REFERENCE_PREFIX,
  TASK_REFERENCE_PREFIX,
  REFERENCE_PREFIX,
  SEARCH_MIN_LENGTH,
  projectReference,
  taskReference,
  reference,
  supportStatusLabel,
} from "@milo/shared";
import type { Area, Id, SearchResult, SupportStatus } from "@milo/shared";
import db from "../db/index.js";
import { selection } from "../db/query.js";
import { VISIBLE_BOARDS_CLAUSE } from "../repositories/boards.js";
import { widgetAccess, requestCan } from "../lib/rights.js";

/** Ce que chaque sorte rend au plus : la liste reste lisible d'un coup d'œil. */
const PER_KIND = 6;

/**
 * Le texte tel qu'on le compare : sans balises (les descriptions sont en
 * HTML), sans accents, en minuscules. « Réseau » se trouve en tapant
 * « reseau », et « div » ne ramène pas toutes les descriptions.
 */
const fold = (value: unknown): string =>
  String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

// Déclarée avant les requêtes qui s'en servent : SQLite la cherche à la
// préparation.
db.function("milo_fold", { deterministic: true }, (value: unknown) => fold(value));

/** La référence « HLP-12 » (ou « PRJ-12 ») d'une ligne, quand elle en porte une. */
const matchesReference = (column: string, prefix = REFERENCE_PREFIX) =>
  `(${column} > 0 AND ${contains(`'${prefix}' || ${column}`)})`;

/** Le motif LIKE : les jokers tapés par la personne se cherchent tels quels. */
const pattern = (text: string): string => `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

const contains = (column: string) => `milo_fold(${column}) LIKE @q ESCAPE '\\'`;

interface FoundProject {
  id: Id;
  number: number;
  name: string;
  board: string;
  context: string | null;
}

const foundProjects = selection<FoundProject>(
  `SELECT p.id, p.number, p.name, b.name AS board, c.name AS context
     FROM projects p
     JOIN boards b ON b.id = p.board_id
     LEFT JOIN contexts c ON c.id = p.context_id
    WHERE ${VISIBLE_BOARDS_CLAUSE("p.board_id")}
      AND (${contains("p.name")} OR ${contains("p.description")} OR ${matchesReference("p.number", PROJECT_REFERENCE_PREFIX)})
    ORDER BY p.updated_at DESC
    LIMIT ${PER_KIND}`,
);

interface FoundCard {
  id: Id;
  number: number;
  text: string;
  list: string;
  board: string;
  context: string | null;
}

const foundCards = selection<FoundCard>(
  `SELECT tc.id, tc.number, tc.text, tl.name AS list, b.name AS board, c.name AS context
     FROM task_cards tc
     JOIN task_lists tl ON tl.id = tc.list_id
     JOIN boards b ON b.id = tl.board_id
     LEFT JOIN contexts c ON c.id = tc.context_id
    WHERE tc.kind = 'card'
      AND ${VISIBLE_BOARDS_CLAUSE("b.id")}
      AND (${contains("tc.text")} OR ${contains("tc.description")} OR ${matchesReference("tc.number", TASK_REFERENCE_PREFIX)})
    ORDER BY tc.created_at DESC
    LIMIT ${PER_KIND}`,
);

interface FoundRequest {
  id: Id;
  number: number;
  subject: string;
  status: SupportStatus;
  context: string | null;
  board: string;
}

const foundRequests = selection<FoundRequest>(
  `SELECT sr.id, sr.number, sr.subject, sr.status, c.name AS context, b.name AS board
     FROM support_requests sr
     JOIN boards b ON b.id = sr.board_id
     LEFT JOIN contexts c ON c.id = sr.context_id
    WHERE ${VISIBLE_BOARDS_CLAUSE("b.id")}
      AND (${contains("sr.subject")}
       OR ${contains("sr.sender_name")}
       OR ${contains("sr.sender_email")}
       OR ${matchesReference("sr.number")})
    ORDER BY sr.created_at DESC
    LIMIT ${PER_KIND}`,
);

interface FoundWorkstation {
  id: Id;
  name: string;
  last_user: string;
  context: string | null;
}

const foundWorkstations = selection<FoundWorkstation>(
  `SELECT a.id, a.name, a.last_user, c.name AS context
     FROM assets a
     LEFT JOIN contexts c ON c.id = a.context_id
    WHERE a.board_id IS NOT NULL AND ${VISIBLE_BOARDS_CLAUSE("a.board_id")}
      AND (${contains("a.name")} OR ${contains("a.last_user")} OR ${contains("a.tag")})
    ORDER BY a.name
    LIMIT ${PER_KIND}`,
);

interface VisibleBlock {
  id: Id;
  type: string;
  config: string;
  board_id: Id;
  board: string;
}

// Les widgets communs portent leur texte dans un JSON dont la forme dépend du
// widget : ils sont peu nombreux, on les lit tous et on les fouille ici
// plutôt qu'en SQL.
const visibleBlocks = selection<VisibleBlock>(
  `SELECT w.id, w.type, w.config, b.id AS board_id, b.name AS board
     FROM board_widgets w
     JOIN board_sections s ON s.id = w.section_id
     JOIN boards b ON b.id = s.board_id
    WHERE ${VISIBLE_BOARDS_CLAUSE("b.id")}
      AND w.type IN ('category', 'subcategory', 'link', 'number')
      -- La structure que ce compte voit : la sienne s'il en a une, sinon la
      -- publique. Un tableau privé n'a que la publique.
      AND s.owner_id IS (
        SELECT pl.user_id FROM personal_layouts pl
         WHERE pl.user_id = @me AND pl.scope = 'board:' || b.id AND b.is_private = 0
      )
    ORDER BY b.position, s.position, w.position, w.id`,
);

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

/** Ce qu'un élément du mode Accès montre, et donc ce qu'on y cherche. */
const readBlock = (
  type: string,
  config: Record<string, unknown>,
): { title: string; search: string[]; url?: string } | null => {
  switch (type) {
    case "category":
    case "subcategory": {
      const title = text(config.title);
      return title ? { title: title, search: [title] } : null;
    }
    case "link": {
      const label = text(config.label);
      const url = text(config.url);
      return { title: label || url, search: [label, url], url: url || undefined };
    }
    case "number": {
      const rows = Array.isArray(config.lines) ? (config.lines as Record<string, unknown>[]) : [];
      const chunks = rows.map((l) => [text(l?.label), text(l?.number)]);
      const title = chunks
        .map((m) => m.filter(Boolean).join(" "))
        .filter(Boolean)
        .join(" · ");
      return title ? { title, search: chunks.flat() } : null;
    }
    default:
      return null;
  }
};

const foundAccesses = (req: Request, folded: string): SearchResult[] => {
  const userId = req.user.id;
  const matches: SearchResult[] = [];
  for (const block of visibleBlocks.all({ me: userId })) {
    // Un élément dont le compte ne lit pas le type de widget ne se trouve pas.
    if (widgetAccess(req, block.type) === "") continue;
    let config: Record<string, unknown>;
    try {
      config = JSON.parse(block.config) ?? {};
    } catch {
      continue;
    }
    const readValue = readBlock(block.type, config);
    if (!readValue || !readValue.search.some((c) => fold(c).includes(folded))) continue;
    matches.push({
      kind: "access",
      id: block.id,
      title: readValue.title,
      context: block.board,
      board_id: block.board_id,
      url: readValue.url,
    });
    if (matches.length >= PER_KIND) break;
  }
  return matches;
};

const joinParts = (...chunks: (string | null | undefined)[]): string =>
  chunks.filter(Boolean).join(" · ");

export const searchRoutes = Router();

searchRoutes.get("/", (req, res) => {
  const folded = fold(req.query.q).trim();
  if (folded.length < SEARCH_MIN_LENGTH) return void res.json([]);

  // Chaque sorte ne cherche que si l'on en voit le type de widget.
  const params = { q: pattern(folded), me: req.user.id };
  const ifAllowed = <T>(area: Area, find: () => T[]): T[] => (requestCan(req, area, "view") ? find() : []);

  const results: SearchResult[] = [
    ...ifAllowed("projects", () => foundProjects.all(params)).map((p) => ({
      kind: "project" as const,
      id: p.id,
      title: p.name,
      context: joinParts(p.number > 0 ? projectReference(p.number) : null, p.context, p.board),
    })),
    ...ifAllowed("tasks", () => foundCards.all(params)).map((c) => ({
      kind: "card" as const,
      id: c.id,
      title: c.text,
      context: joinParts(c.number > 0 ? taskReference(c.number) : null, c.context, c.board, c.list),
    })),
    ...ifAllowed("support", () => foundRequests.all(params)).map((d) => ({
      kind: "support" as const,
      id: d.id,
      title: d.subject || "(sans objet)",
      context: joinParts(
        d.number > 0 ? reference(d.number) : null,
        d.context,
        d.board,
        supportStatusLabel(d.status),
      ),
    })),
    ...ifAllowed("assets", () => foundWorkstations.all(params)).map((a) => ({
      kind: "asset" as const,
      id: a.id,
      title: a.name,
      context: joinParts(a.context, a.last_user),
    })),
    ...(requestCan(req, "access", "view") ? foundAccesses(req, folded) : []),
  ];

  res.json(results);
});
