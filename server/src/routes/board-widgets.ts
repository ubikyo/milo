// A board's sections and the widgets they carry. The server only checks the
// targeted widget and the shape of its configuration — an object —, without
// reading it: it is the client's widget that knows what it means.
//
// A board has one structure, seen by all who see the board. Setting it
// requires being able to organize boards (lib/rights.ts) and controlling the
// board — owning it, or a "full" share: "read" leaves its layout as it is. A
// widget, in turn, can only be placed, configured and removed with "Modifier"
// on its type.

import express, { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import {
  LIST_KEY,
  SECTIONS_GAP_DEFAULT,
  SECTIONS_GAP_MAX,
  accessIncludes,
  canUpdate,
  listKey,
  isBoardWidgetType,
  isListWidgetType,
  isSectionWidthUnit,
  migrateWidgetConfig,
} from "@milo/shared";
import type { AccessMailDetail, Resource, ImportResult } from "@milo/shared";
import type { BoardRow, BoardWidgetRow } from "../db/rows.js";
import { widgetAccess, requireLayout, requireOrganize, requireWidget } from "../lib/rights.js";
import {
  entraAgenda,
  mailOfMailbox,
  entraConfigured,
  mailboxPage,
  mailboxAttachment,
} from "../lib/entra.js";
import { cleanEmail } from "../lib/html.js";
import { feedOf, feedSettings, probeFeed } from "../lib/feed.js";
import { askForConfirmations } from "../lib/optin.js";
import { badRequest, orNotFound, toIds } from "../lib/http.js";
import { SIZE_MAX, writeMedia, inlineType, mediaUrl } from "../lib/media.js";
import { searchPlace, weatherCoordinates, weatherOf } from "../lib/weather.js";
import { columnsGap, requestedRank, widthUnit, widthValue } from "../lib/sections.js";
import { signalWrite, touch, touchNow } from "../middleware/events.js";
import { ensureDefaultType } from "./milestone-types.js";
import { reassignWorkstationContexts } from "../repositories/assets.js";
import { withNewKey, keyInBoard, keepKey, cleanLists } from "../repositories/lists.js";
import { receivedTags } from "../repositories/inboxes.js";
import { boardSections, boardWidgets, renderedWidget } from "../repositories/board-widgets.js";
import { openBoard, requireBoardControl } from "../repositories/boards.js";

const SECTION_NOT_FOUND = "Section introuvable";
const WIDGET_NOT_FOUND = "Widget introuvable";

/** Allowed conversions: category and subcategory share their configuration. */
const CONVERSIONS: Record<string, string> = { category: "subcategory", subcategory: "category" };

type Account = Request["user"];

/** The requested section, if its board is seen; and that board. */
const openedSection = (id: unknown, user: Account) => {
  const section = orNotFound(boardSections.byId(id), SECTION_NOT_FOUND);
  return { section, board: openBoard(section.board_id, user) };
};

/**
 * The requested widget, and the open section that carries it. Its type must
 * be readable — "Modifier" for a write.
 */
const openWidget = (id: unknown, req: Request) => {
  const widget = orNotFound(boardWidgets.byId(id), WIDGET_NOT_FOUND);
  requireWidget(
    req,
    widget.type,
    req.method === "GET" ? "view" : req.method === "DELETE" ? "delete" : "update",
  );
  return { widget, ...openedSection(widget.section_id, req.user) };
};

/**
 * Setting a board's structure requires being able to organize, and
 * controlling the board: a "read" share leaves it as it is.
 */
const requireStructure = (req: Request, board: BoardRow): void => {
  requireOrganize(req);
  requireBoardControl(board, req.user);
};

/** The widgets whose type the account reads: the others are not returned to it. */
const allReadable = (req: Request, widgets: BoardWidgetRow[]) =>
  widgets.filter((w) => widgetAccess(req, w.type) !== "").map(renderedWidget);

/**
 * The received configuration, ready to store: an object, nothing else — with
 * today's keys, if it comes from a clipboard or a page from before their
 * translation (migrateWidgetConfig).
 */
const configuration = (type: string, value: unknown, defaultValue: string): string => {
  if (value === undefined) return defaultValue;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    badRequest("Configuration invalide");
  }
  return JSON.stringify(migrateWidgetConfig(type, value));
};

// --- What a board carries ---------------------------------------------------

/** Its sections and widgets, read by board: "/api/boards/:id/…". */
/**
 * Items follow list widgets (repositories/lists.ts): a write that removes a
 * list's last widget — alone, with its section, its personal structure or
 * its board — takes its items with it. Workstations also follow the tags
 * that workstation lists receive (repositories/inboxes.ts): a widget
 * configured, placed or removed files them again.
 */
export const followLists = (req: Request, res: Response, next: NextFunction): void => {
  if (req.method === "GET") return next();
  const before = JSON.stringify(receivedTags());
  res.on("finish", () => {
    if (res.statusCode >= 400) return;
    const touchedResources: Resource[] = cleanLists();
    // A new receiving address awaits its confirmation: its inbox receives
    // the link (lib/optin.ts).
    askForConfirmations();
    if (JSON.stringify(receivedTags()) !== before) {
      reassignWorkstationContexts();
      touchedResources.push("assets");
    }
    signalWrite(...touchedResources);
  });
  next();
};

export const boardContentRoutes = Router({ mergeParams: true });

boardContentRoutes.use(touch("board-widgets"), followLists);

boardContentRoutes.get("/sections", (req, res) => {
  const board = openBoard((req.params as { id: string }).id, req.user);
  res.json(boardSections.all(board.id));
});

boardContentRoutes.post("/sections", (req, res) => {
  const board = openBoard((req.params as { id: string }).id, req.user);
  requireStructure(req, board);
  const unit = widthUnit(req.body.width_unit, "auto");
  const id = boardSections.create(
    board.id,
    unit,
    widthValue(unit, req.body.width_value),
    columnsGap(req.body.gap, SECTIONS_GAP_DEFAULT),
    requestedRank(req.body.index),
  );
  res.status(201).json(boardSections.byId(id));
});

boardContentRoutes.put("/sections/reorder", (req, res) => {
  const board = openBoard((req.params as { id: string }).id, req.user);
  requireStructure(req, board);
  const ids = toIds(req.body.ids);
  const known = boardSections.all(board.id).map((s) => s.id);
  if (
    ids.length !== known.length ||
    new Set(ids).size !== ids.length ||
    !known.every((id) => ids.includes(id))
  ) {
    badRequest("La liste des identifiants ne correspond pas aux sections");
  }
  boardSections.store(ids);
  res.json(boardSections.all(board.id));
});

/** A plain object, or nothing: what a received layout can carry. */
const subject = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/**
 * The width and gap of an imported section. A layout may come from another
 * version: whatever cannot be read takes the default value instead of
 * rejecting the whole import.
 */
const importedSection = (received: Record<string, unknown>) => {
  const unit = isSectionWidthUnit(received.width_unit) ? received.width_unit : "auto";
  const value = Number(received.width_value);
  const readable =
    unit !== "auto" && Number.isFinite(value) && value > 0 && (unit !== "percent" || value <= 100);
  const gap = Number(received.gap);
  return {
    unit: readable ? unit : "auto",
    value: readable ? value : null,
    gap:
      received.gap !== undefined && Number.isFinite(gap) && gap >= 0 && gap <= SECTIONS_GAP_MAX
        ? Math.round(gap)
        : SECTIONS_GAP_DEFAULT,
  };
};

/**
 * Import a layout (ExportedLayout): it replaces the structure the account
 * is looking at. Rights are those of the importer, not the exporter: a widget
 * of an unknown type or one the account cannot edit is dropped, and a widget
 * of the old structure it cannot remove is kept. A list widget keeps its key
 * — its items — if a widget of this board already holds it; otherwise it
 * gets a new one: another board's key designates nothing here.
 */
boardContentRoutes.post("/import", (req, res) => {
  const board = openBoard((req.params as { id: string }).id, req.user);
  requireLayout(req);
  requireStructure(req, board);
  const body = subject(req.body);
  if (!body || body.version !== 1 || !Array.isArray(body.sections)) {
    badRequest("Disposition illisible");
  }
  let discarded = 0;
  const takenKeys = new Set<string>();
  const sections = (body!.sections as unknown[]).map((raw) => {
    const received = subject(raw) ?? {};
    const widgets = (Array.isArray(received.widgets) ? received.widgets : []).flatMap((w: unknown) => {
      const widget = subject(w);
      const type = widget?.type;
      if (!isBoardWidgetType(type) || !canUpdate(widgetAccess(req, type))) {
        discarded += 1;
        return [];
      }
      // A layout exported before the keys were translated can still be read.
      const config = migrateWidgetConfig(type, widget!.config);
      if (!isListWidgetType(type)) return [{ type, config: JSON.stringify(config) }];
      const key = listKey(config);
      const keyHeld = key !== "" && !takenKeys.has(key) && keyInBoard(board.id, type, key) === key;
      if (keyHeld) {
        takenKeys.add(key);
        return [{ type, config: JSON.stringify(config) }];
      }
      const { [LIST_KEY]: _removed, ...rest } = config;
      return [{ type, config: withNewKey(type, JSON.stringify(rest)) }];
    });
    return { ...importedSection(received), widgets };
  });
  // What the account cannot remove stays — even what it does not see.
  const keptCount = boardWidgets
    .all(board.id)
    .filter((w) => !accessIncludes(widgetAccess(req, w.type), "delete"))
    .map((w) => w.id);
  boardSections.importSections(board.id, sections, keptCount);
  const result: ImportResult = {
    placed: sections.reduce((n, s) => n + s.widgets.length, 0),
    discarded,
    keptCount: keptCount.length,
  };
  res.json(result);
});

boardContentRoutes.get("/widgets", (req, res) => {
  const board = openBoard((req.params as { id: string }).id, req.user);
  res.json(allReadable(req, boardWidgets.all(board.id)));
});

// --- A section ---------------------------------------------------------------

export const boardSectionRoutes = Router();

boardSectionRoutes.use(touch("board-widgets"), followLists);

boardSectionRoutes.put("/:id", (req, res) => {
  const { section: existing, board } = openedSection(req.params.id, req.user);
  requireStructure(req, board);
  const unit = widthUnit(req.body.width_unit, existing.width_unit);
  // Changing unit without restating the value would keep the old one, which
  // no longer means anything: "30 %" does not become "30 px".
  const value = widthValue(
    unit,
    req.body.width_value ?? (unit === existing.width_unit ? existing.width_value : undefined),
  );
  boardSections.update.run(unit, value, columnsGap(req.body.gap, existing.gap), existing.id);
  res.json(boardSections.byId(existing.id));
});

boardSectionRoutes.post("/:id/duplicate", (req, res) => {
  const { section: existing, board } = openedSection(req.params.id, req.user);
  requireStructure(req, board);
  res.status(201).json(boardSections.byId(boardSections.duplicate(existing)));
});

boardSectionRoutes.delete("/:id", (req, res) => {
  const { section: existing, board } = openedSection(req.params.id, req.user);
  requireStructure(req, board);
  // What it carried goes with it, through the foreign key.
  boardSections.remove.run(existing.id);
  res.status(204).end();
});

// --- A widget ---------------------------------------------------------------

export const boardWidgetRoutes = Router();

boardWidgetRoutes.use(touch("board-widgets"), followLists);

/**
 * Arrange a section's widgets. The body gives the section and, in order,
 * everything it now carries: a widget coming from another section of the
 * same structure is admitted, which is how it gets moved. Declared before
 * "/:id", otherwise "reorder" would be taken for an id.
 */
boardWidgetRoutes.put("/reorder", (req, res) => {
  const { section, board } = openedSection(req.body.section_id, req.user);
  requireStructure(req, board);
  const ids = toIds(req.body.ids);
  // Only the widgets the account sees, of the same structure, are arranged.
  const known = new Set(allReadable(req, boardWidgets.all(board.id)).map((w) => w.id));
  if (ids.length !== new Set(ids).size || ids.some((id) => !known.has(id))) {
    badRequest("La liste des identifiants ne correspond pas aux widgets");
  }
  boardWidgets.store(section.id, ids);
  res.json(allReadable(req, boardWidgets.all(board.id)));
});

boardWidgetRoutes.post("/", (req, res) => {
  const { section, board } = openedSection(req.body.section_id, req.user);
  requireStructure(req, board);
  const type: unknown = req.body.type;
  if (!isBoardWidgetType(type)) badRequest("Widget inconnu");
  requireWidget(req, type as string, "update");
  // A list widget gets its key here, new: that of a configuration copied from
  // elsewhere is not valid (repositories/lists.ts).
  const id = boardWidgets.create(
    section.id,
    type as string,
    configuration(type as string, req.body.config, "{}"),
  );
  // A projects widget sets the "Défaut" milestone type, which its projects
  // receive on creation.
  if ((type as string).startsWith("project.") && ensureDefaultType()) {
    touchNow(res, "lookups", "projects");
  }
  res.status(201).json(renderedWidget(boardWidgets.byId(id)!));
});

// A widget's type cannot be changed: that would be another widget. Only its
// configuration moves — except between category and subcategory, which
// share theirs. Its configuration also carries what some widgets hold, a to-do
// list's items: it moves under a "read" share too.
boardWidgetRoutes.put("/:id", (req, res) => {
  const { widget, board } = openWidget(req.params.id, req);
  if (req.body.type !== undefined && req.body.type !== widget.type) {
    requireStructure(req, board);
    if (CONVERSIONS[widget.type] !== req.body.type) {
      badRequest("Ce widget ne se convertit pas en ce type");
    }
    boardWidgets.convert.run(req.body.type, widget.id);
  }
  boardWidgets.update.run(
    keepKey(widget.type, widget.config, configuration(widget.type, req.body.config, widget.config)),
    widget.id,
  );
  res.json(renderedWidget(boardWidgets.byId(widget.id)!));
});

boardWidgetRoutes.post("/:id/duplicate", (req, res) => {
  const { widget, board } = openWidget(req.params.id, req);
  requireStructure(req, board);
  // A list widget owns its items: it is not duplicated.
  if (isListWidgetType(widget.type)) badRequest("Ce widget ne se duplique pas");
  res.status(201).json(renderedWidget(boardWidgets.byId(boardWidgets.duplicate(widget))!));
});

boardWidgetRoutes.delete("/:id", (req, res) => {
  const { widget, board } = openWidget(req.params.id, req);
  requireStructure(req, board);
  boardWidgets.remove.run(widget.id);
  res.status(204).end();
});

/**
 * What a feed address gives, for an RSS widget's drawer: is the source
 * reachable, and in what format does it answer? Declared like
 * "/weather/places": "feed" is not an id.
 */
boardWidgetRoutes.get("/feed/probe", (req, res, next) => {
  requireWidget(req, "rss", "update");
  probeFeed(String(req.query["url"] ?? "").trim())
    .then((probe) => res.json(probe))
    .catch(next);
});

/**
 * An RSS widget's feed, as the database keeps it (lib/feed.ts). The source
 * is polled by the server, at the interval the widget sets: the page does not
 * wait for it, except when the database has nothing to show yet.
 *
 * Express 4 does not catch the rejection of an async function: it goes
 * through "next".
 */
boardWidgetRoutes.get("/:id/feed", (req, res, next) => {
  const { widget } = openWidget(req.params.id, req);
  if (widget.type !== "rss") badRequest("Ce widget n'est pas un flux RSS");
  feedOf(feedSettings(renderedWidget(widget).config))
    .then((feed) => res.json(feed))
    .catch(next);
});

/**
 * The places matching what is typed, to configure a Weather widget.
 * Declared as "/:id/…" would be: "weather" is not an id, but no
 * "GET /:id/places" route comes to contest it.
 */
boardWidgetRoutes.get("/weather/places", (req, res, next) => {
  requireWidget(req, "weather", "update");
  searchPlace(String(req.query["q"] ?? ""))
    .then((places) => res.json(places))
    .catch(next);
});

/** The weather of a Weather widget's place (lib/weather.ts), kept by the server for a quarter hour. */
boardWidgetRoutes.get("/:id/weather", (req, res, next) => {
  const { widget } = openWidget(req.params.id, req);
  if (widget.type !== "weather") badRequest("Ce widget n'est pas un widget Météo");
  const place = weatherCoordinates(renderedWidget(widget).config);
  if (!place) badRequest("Choisissez un lieu dans le réglage du widget");
  weatherOf(place!.latitude, place!.longitude)
    .then((weather) => res.json(weather))
    .catch(next);
});

/** The longest period a calendar requests: six weeks, and some margin. */
const PERIOD_MAX = 62 * 24 * 60 * 60 * 1000;

/**
 * The viewer's appointments, between "start" and "end": everyone sees their
 * own, whatever the board. They come from their Outlook calendar, through
 * Graph (lib/entra.ts); a local account has none.
 */
boardWidgetRoutes.get("/:id/calendar", (req, res, next) => {
  const { widget } = openWidget(req.params.id, req);
  if (widget.type !== "calendar") badRequest("Ce widget n'est pas un calendrier");
  const start = new Date(String(req.query["start"] ?? ""));
  const end = new Date(String(req.query["end"] ?? ""));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    badRequest("Période invalide");
  }
  if (end.getTime() - start.getTime() > PERIOD_MAX) badRequest("Période trop longue");
  entraAgenda(entraAccount(req), start, end)
    .then((appointments) => res.json(appointments))
    .catch(next);
});

/**
 * The viewer's Entra account: the Mail widget and the Calendar only show
 * what is theirs.
 */
const entraAccount = (req: Request): string => {
  if (!entraConfigured()) badRequest("Milo n'est pas connecté à Entra");
  if (!req.user.entra_id) badRequest("Votre compte n'est pas relié à Entra");
  return req.user.entra_id;
};

/** The targeted Mail widget, and the account whose inbox it reads. */
const openMailbox = (req: Request) => {
  const { widget } = openWidget(req.params.id, req);
  if (widget.type !== "mail") badRequest("Ce widget n'est pas un widget Mail");
  return entraAccount(req);
};

/** At most, one page of e-mails: Graph does not return more at once. */
const PAGE_MAX = 100;

/**
 * A page of the viewer's inbox (lib/entra.ts): everyone sees their own,
 * whatever the board. "skip" says where it starts — the grid asks for the
 * next one when reaching the bottom of the list.
 */
boardWidgetRoutes.get("/:id/mails", (req, res, next) => {
  const oid = openMailbox(req);
  const offset = Math.max(0, Math.floor(Number(req.query["skip"]) || 0));
  const howMany = Math.min(PAGE_MAX, Math.max(1, Math.floor(Number(req.query["top"]) || 10)));
  mailboxPage(oid, offset, howMany, req.query["unread"] === "1")
    .then((page) => res.json(page))
    .catch(next);
});

/** An e-mail from the inbox, its body cleaned like that of a received request (lib/html.ts). */
boardWidgetRoutes.get("/:id/mails/:mail", (req, res, next) => {
  const oid = openMailbox(req);
  mailOfMailbox(oid, String(req.params.mail))
    .then((c) => {
      const detail: AccessMailDetail = {
        ...c.header,
        to: c.to,
        cc: c.cc,
        html: cleanEmail(c.body, c.body_type, c.images),
        attachments: c.attachments,
        url: c.url,
      };
      res.json(detail);
    })
    .catch(next);
});

/**
 * An attachment of an e-mail from the inbox, always as a download: a
 * received file never runs on Milo's origin.
 */
boardWidgetRoutes.get("/:id/mails/:mail/attachments/:attachment", (req, res, next) => {
  const oid = openMailbox(req);
  mailboxAttachment(oid, String(req.params.mail), String(req.params.attachment))
    .then(({ name, content }) => {
      res.type("application/octet-stream");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(name)}`);
      res.send(content);
    })
    .catch(next);
});

/**
 * An image uploaded for an Image widget. Like a description's, it leaves no
 * row in the database: the widget's configuration cites it, and the media
 * cleanup relies on that (repositories/attachments.ts).
 *
 * Mounted under "/api/widget-images", outside the widgets' routes: an upload
 * changes no board, so it need not make pages re-read theirs.
 */
export const widgetImageRoutes = Router();

widgetImageRoutes.post(
  "/",
  express.raw({ type: () => true, limit: SIZE_MAX }),
  (req, res) => {
    requireWidget(req, "image", "update");
    const content: unknown = req.body;
    if (!Buffer.isBuffer(content) || content.length === 0) badRequest("Fichier vide");
    const name = String(req.query["name"] ?? "")
      .split(/[/\\]/)
      .pop()!
      .trim()
      .slice(0, 255);
    if (!(inlineType(name) ?? "").startsWith("image/")) badRequest("Ce format d'image n'est pas pris en charge");
    res.status(201).json({ url: mediaUrl(writeMedia(content as Buffer, name)) });
  },
);
