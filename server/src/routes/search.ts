// Global search: the field in the tab row. It searches projects, cards,
// tickets, workstations and the Access mode's items, and only returns what
// the person sees elsewhere — a board not shared with them stays closed here
// too.

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

/** The most each kind returns: the list stays readable at a glance. */
const PER_KIND = 6;

/**
 * The text as it is compared: without tags (descriptions are HTML), without
 * accents, in lowercase. "Réseau" is found by typing "reseau", and "div"
 * does not bring back every description.
 */
const fold = (value: unknown): string =>
  String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

// Declared before the queries that use it: SQLite looks it up at
// preparation.
db.function("milo_fold", { deterministic: true }, (value: unknown) => fold(value));

/** The "HLP-12" (or "PRJ-12") reference of a row, when it carries one. */
const matchesReference = (column: string, prefix = REFERENCE_PREFIX) =>
  `(${column} > 0 AND ${contains(`'${prefix}' || ${column}`)})`;

/** The LIKE pattern: wildcards typed by the person are searched for as is. */
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
  `SELECT p.id, p.number, p.name, b.name AS board, NULL AS context
     FROM projects p
     JOIN boards b ON b.id = p.board_id
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
  `SELECT tc.id, tc.number, tc.text, tl.name AS list, b.name AS board, NULL AS context
     FROM task_cards tc
     JOIN task_lists tl ON tl.id = tc.list_id
     JOIN boards b ON b.id = tl.board_id
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
  `SELECT sr.id, sr.number, sr.subject, sr.status, NULL AS context, b.name AS board
     FROM support_requests sr
     JOIN boards b ON b.id = sr.board_id
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
  `SELECT a.id, a.name, a.last_user, b.name AS context
     FROM assets a
     JOIN boards b ON b.id = a.board_id
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

// Shared widgets carry their text in JSON whose shape depends on the
// widget: there are few of them, we read them all and search them here
// rather than in SQL.
const visibleBlocks = selection<VisibleBlock>(
  `SELECT w.id, w.type, w.config, b.id AS board_id, b.name AS board
     FROM board_widgets w
     JOIN board_sections s ON s.id = w.section_id
     JOIN boards b ON b.id = s.board_id
    WHERE ${VISIBLE_BOARDS_CLAUSE("b.id")}
      AND w.type IN ('category', 'link', 'number')
    ORDER BY b.position, s.position, w.position, w.id`,
);

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

/** What an Access mode item shows, and therefore what is searched in it. */
const readBlock = (
  type: string,
  config: Record<string, unknown>,
): { title: string; search: string[]; url?: string } | null => {
  switch (type) {
    case "category": {
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
    // An item whose widget type the account does not read is not found.
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

  // Each kind only searches if its widget type is visible.
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
