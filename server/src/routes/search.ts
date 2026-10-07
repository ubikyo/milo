// Global search: the field in the tab row. This hands over everything it
// searches — projects, cards, tickets, workstations and the Access mode's
// items —, only what the person sees elsewhere: a board not shared with them
// stays closed here too. The client searches it itself, fuzzily (Spotlight,
// Fuse.js).

import { Router } from "express";
import type { Request } from "express";
import {
  projectReference,
  taskReference,
  reference,
  supportStatusLabel,
  linkEntries,
} from "@milo/shared";
import type { Area, Id, SearchResult, SupportStatus } from "@milo/shared";
import db from "../db/index.js";
import { selection } from "../db/query.js";
import { VISIBLE_BOARDS_CLAUSE } from "../repositories/boards.js";
import { requestCan } from "../lib/rights.js";

/**
 * The text as it is compared: without tags, without accents, in lowercase.
 * Used by SQL searches elsewhere (repositories/links.ts) as "milo_fold".
 */
const fold = (value: unknown): string =>
  String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

// Declared before the queries that use it: SQLite looks it up at
// preparation.
db.function("milo_fold", { deterministic: true }, (value: unknown) => fold(value));

/** How much of a description is searched: its start says what it is about. */
const DESCRIPTION_LENGTH = 300;

/** A description's text, without its tags (they are HTML), cut short. */
const plain = (value: unknown): string =>
  String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, DESCRIPTION_LENGTH);

interface FoundProject {
  id: Id;
  number: number;
  name: string;
  description: string | null;
  board: string;
  context: string | null;
}

const foundProjects = selection<FoundProject>(
  `SELECT p.id, p.number, p.name, p.description, b.name AS board, NULL AS context
     FROM projects p
     JOIN boards b ON b.id = p.board_id
    WHERE ${VISIBLE_BOARDS_CLAUSE("p.board_id")}
    ORDER BY p.updated_at DESC`,
);

interface FoundCard {
  id: Id;
  number: number;
  text: string;
  description: string | null;
  list: string;
  board: string;
  context: string | null;
}

const foundCards = selection<FoundCard>(
  `SELECT tc.id, tc.number, tc.text, tc.description, tl.name AS list, b.name AS board, NULL AS context
     FROM task_cards tc
     JOIN task_lists tl ON tl.id = tc.list_id
     JOIN boards b ON b.id = tl.board_id
    WHERE tc.kind = 'card'
      AND ${VISIBLE_BOARDS_CLAUSE("b.id")}
    ORDER BY tc.created_at DESC`,
);

interface FoundRequest {
  id: Id;
  number: number;
  subject: string;
  sender_name: string | null;
  sender_email: string | null;
  status: SupportStatus;
  context: string | null;
  board: string;
}

const foundRequests = selection<FoundRequest>(
  `SELECT sr.id, sr.number, sr.subject, sr.sender_name, sr.sender_email, sr.status,
          NULL AS context, b.name AS board
     FROM support_requests sr
     JOIN boards b ON b.id = sr.board_id
    WHERE ${VISIBLE_BOARDS_CLAUSE("b.id")}
    ORDER BY sr.created_at DESC`,
);

interface FoundWorkstation {
  id: Id;
  name: string;
  last_user: string;
  tag: string | null;
  context: string | null;
}

const foundWorkstations = selection<FoundWorkstation>(
  `SELECT a.id, a.name, a.last_user, a.tag, b.name AS context
     FROM assets a
     JOIN boards b ON b.id = a.board_id
    WHERE a.board_id IS NOT NULL AND ${VISIBLE_BOARDS_CLAUSE("a.board_id")}
    ORDER BY a.name`,
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

/**
 * What an Access mode item shows, and therefore what is searched in it: one
 * entry per element — each link, each figure — so that a search finds the
 * element, not the whole widget.
 */
const readBlock = (
  type: string,
  config: Record<string, unknown>,
): { title: string; keywords: string; url?: string }[] => {
  switch (type) {
    case "category": {
      const title = text(config.title);
      return title ? [{ title, keywords: "" }] : [];
    }
    case "link":
      // A switched-off link is not found; each other one opens itself.
      return linkEntries(config)
        .filter((l) => l.opening !== "off")
        .map((l) => ({ label: text(l.label), url: text(l.url) }))
        .filter((l) => l.label || l.url)
        .map((l) => ({ title: l.label || l.url, keywords: l.url, url: l.url || undefined }));
    case "number": {
      const rows = Array.isArray(config.lines) ? (config.lines as Record<string, unknown>[]) : [];
      return rows
        .map((l) => [text(l?.label), text(l?.number)].filter(Boolean).join(" "))
        .filter(Boolean)
        .map((title) => ({ title, keywords: "" }));
    }
    default:
      return [];
  }
};

const foundAccesses = (req: Request): SearchResult[] => {
  const userId = req.user.id;
  const found: SearchResult[] = [];
  for (const block of visibleBlocks.all({ me: userId })) {
    let config: Record<string, unknown>;
    try {
      config = JSON.parse(block.config) ?? {};
    } catch {
      continue;
    }
    for (const entry of readBlock(block.type, config)) {
      found.push({
        kind: "access",
        id: block.id,
        title: entry.title,
        context: block.board,
        board_id: block.board_id,
        url: entry.url,
        keywords: entry.keywords,
      });
    }
  }
  return found;
};

const joinParts = (...chunks: (string | null | undefined)[]): string =>
  chunks.filter(Boolean).join(" · ");

export const searchRoutes = Router();

searchRoutes.get("/", (req, res) => {
  // Each kind only comes if its widget type is visible.
  const params = { me: req.user.id };
  const ifAllowed = <T>(area: Area, find: () => T[]): T[] => (requestCan(req, area, "view") ? find() : []);

  const results: SearchResult[] = [
    ...ifAllowed("projects", () => foundProjects.all(params)).map((p) => ({
      kind: "project" as const,
      id: p.id,
      title: p.name,
      context: joinParts(p.number > 0 ? projectReference(p.number) : null, p.context, p.board),
      keywords: plain(p.description),
    })),
    ...ifAllowed("tasks", () => foundCards.all(params)).map((c) => ({
      kind: "card" as const,
      id: c.id,
      title: c.text,
      context: joinParts(c.number > 0 ? taskReference(c.number) : null, c.context, c.board, c.list),
      keywords: plain(c.description),
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
      keywords: joinParts(d.sender_name, d.sender_email),
    })),
    ...ifAllowed("assets", () => foundWorkstations.all(params)).map((a) => ({
      kind: "asset" as const,
      id: a.id,
      title: a.name,
      context: joinParts(a.context, a.last_user),
      keywords: a.tag ?? "",
    })),
    ...(requestCan(req, "access", "view") ? foundAccesses(req) : []),
  ];

  res.json(results);
});
