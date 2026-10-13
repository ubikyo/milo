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
  shownCalendarsOf,
  SECTIONS_GAP_DEFAULT,
  SECTIONS_GAP_MAX,
  accessIncludes,
  calendarKey,
  mailKey,
  shownFoldersOf,
  canUse,
  listKey,
  isBoardWidgetType,
  isListWidgetType,
  isMailMetric,
  APPOINTMENT_TYPES,
  INDICATOR_DATA,
  SOURCES,
  ownKeyOf,
  sourceTypeOf,
  sourcesOf,
  countedFoldersOf,
  isSectionWidthUnit,
  migrateWidgetConfig,
  currentWidget,
  widgetReference,
} from "@milo/shared";
import type { Id, NotificationScope } from "@milo/shared";
import { concerned, notifyBoard, root } from "../lib/notify.js";
import type {
  AccessCalendar,
  AccessCalendarEvent,
  AccessMail,
  AccessMailCount,
  AccessMailDetail,
  AccessMailFolderCounts,
  AccessMailPage,
  Resource,
  ImportResult,
} from "@milo/shared";
import type { BoardRow, BoardWidgetRow } from "../db/rows.js";
import { widgetAccess, requireLayout, requireOrganize, requireWidget } from "../lib/rights.js";
import {
  countMessages,
  deleteMail,
  entraAgenda,
  mailOfMailbox,
  entraConfigured,
  folderCounts,
  folderPage,
  mailboxAttachment,
} from "../lib/entra.js";
import { cleanEmail } from "../lib/html.js";
import { feedOf, feedSettings, probeFeed } from "../lib/feed.js";
import { askForConfirmations } from "../lib/optin.js";
import { askForCalendarConfirmations, confirmedCalendars } from "../lib/calendar-optin.js";
import { mailOptin } from "../lib/mail-optin.js";
import { badRequest, orNotFound, toIds } from "../lib/http.js";
import { SIZE_MAX, writeMedia, inlineType, mediaUrl } from "../lib/media.js";
import { searchPlace, weatherCoordinates, weatherOf } from "../lib/weather.js";
import { quoteOf, quoteSettings } from "../lib/quotes.js";
import { columnsGap, requestedRank, widthUnit, widthValue } from "../lib/sections.js";
import { signalWrite, touch, touchNow } from "../middleware/events.js";
import { byId, deleteWithUndo } from "../lib/undo.js";
import { reassignWorkstations } from "../repositories/managed-device-assets.js";
import { seedListWidget } from "../repositories/list-seeds.js";
import { readSources } from "./source-widgets.js";
import { withNewKey, keyInBoard, keepKey, cleanLists } from "../repositories/lists.js";
import { receivedTags } from "../repositories/inboxes.js";
import { boardSections, boardWidgets, renderedWidget } from "../repositories/board-widgets.js";
import { openBoard, requireBoardControl } from "../repositories/boards.js";
import { calendarResource, folderResource, watch } from "../lib/m365-webhooks.js";

const SECTION_NOT_FOUND = "Section introuvable";
const WIDGET_NOT_FOUND = "Widget introuvable";

type Account = Request["user"];

/** The requested section, if its board is seen; and that board. */
const openedSection = (id: unknown, user: Account) => {
  const section = orNotFound(boardSections.byId(id), SECTION_NOT_FOUND);
  return { section, board: openBoard(section.board_id, user) };
};

/**
 * The requested widget, and the open section that carries it. Anyone who sees
 * its board reads it; a write requires "Modifier" on its type, a deletion
 * "Supprimer".
 */
const openWidget = (id: unknown, req: Request) => {
  const widget = orNotFound(boardWidgets.byId(id), WIDGET_NOT_FOUND);
  if (req.method !== "GET") {
    requireWidget(req, widget.type, req.method === "DELETE" ? "delete" : "update");
  }
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

/** A board's widgets, all of them: anyone who sees the board reads them. */
const rendered = (widgets: BoardWidgetRow[]) => widgets.map(renderedWidget);

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

/**
 * A counting widget reads at least one widget (SOURCES): created without, it
 * reads those of its type on its board.
 */
const withSources = (type: string, config: string, boardId: Id): string => {
  const read = readConfig(config);
  const sourceType = sourceTypeOf(type, read);
  if (!sourceType || sourcesOf(read).length > 0) return config;
  const keys = boardWidgets
    .all(boardId)
    .filter((w) => w.type === sourceType)
    .map((w) => ownKeyOf(w.type, readConfig(w.config)))
    .filter((k) => k !== "");
  return JSON.stringify({ ...read, [SOURCES]: [...new Set(keys)] });
};

// --- What a board carries ---------------------------------------------------

/** Its sections and widgets, read by board: "/api/boards/:id/…". */
/**
 * Items follow list widgets (repositories/lists.ts): a write that removes a
 * list's last widget — alone, with its section, its personal structure or
 * its board — takes its items with it. Workstations also follow the tags
 * that workstation lists receive (repositories/inboxes.ts): a widget
 * configured, placed or removed files them again. And the board's contexts
 * follow the context groups its lists choose (repositories/contexts.ts): the
 * boards are re-read.
 */
export const followLists = (req: Request, res: Response, next: NextFunction): void => {
  if (req.method === "GET") return next();
  const before = JSON.stringify(receivedTags());
  res.on("finish", () => {
    if (res.statusCode >= 400) return;
    const touchedResources: Resource[] = [...cleanLists(), "boards"];
    // A new receiving address awaits its confirmation: its inbox receives
    // the code (lib/optin.ts) — as does a person a calendar or a Mail widget
    // names (lib/widget-optin.ts).
    askForConfirmations();
    askForCalendarConfirmations(req.user.name);
    mailOptin.askForConfirmations(req.user.name);
    if (JSON.stringify(receivedTags()) !== before) {
      reassignWorkstations();
      touchedResources.push("managed-device-assets");
    }
    signalWrite(...touchedResources);
  });
  next();
};

/**
 * A change of a board's layout, announced on it: a notification of edit,
 * unless `scope` says otherwise. Only the author is told — if they asked to
 * be —, unless items go with it: those they concern are told too.
 */
const announce = (
  req: Request,
  boardId: Id,
  message: string,
  { itemsGo = false, scope = "edit" }: { itemsGo?: boolean; scope?: NotificationScope } = {},
): void =>
  notifyBoard({
    boardId,
    message,
    author: req.user,
    base: root(req),
    scope,
    recipients: itemsGo
      ? [...concerned.board(boardId), ...concerned.projectBoard(boardId), ...concerned.supportBoard(boardId)]
      : [],
  });

/** A widget, as a notification names it: its name, or its reference. */
const widgetName = (widget: Pick<BoardWidgetRow, "type" | "config">): string => {
  let name = "";
  try {
    const config: unknown = JSON.parse(widget.config);
    if (config && typeof config === "object" && "name" in config) name = String(config.name ?? "").trim();
  } catch {
    // An unreadable configuration has no name.
  }
  const reference = widgetReference(widget.type, widget.config);
  return name ? `le widget « ${name} »` : reference ? `le widget ${reference}` : "un widget";
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
  announce(req, board.id, "a ajouté une section");
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
  if (ids.some((id, index) => id !== known[index])) announce(req, board.id, "a réorganisé les sections");
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
      // A subcategory, exported before it became a title in "H2", is one.
      const current = currentWidget(subject(w)?.type, subject(w)?.config);
      const widget = subject(current);
      const type = widget?.type;
      if (!isBoardWidgetType(type) || !canUse(widgetAccess(req, type))) {
        discarded += 1;
        return [];
      }
      // A layout exported before the keys were translated can still be read.
      const config = migrateWidgetConfig(type, widget!.config);
      // A calendar's consents stay with the widget they were given to: an
      // imported one receives a new key, without them.
      if (!isListWidgetType(type)) {
        return [{ type, config: withNewKey(type, JSON.stringify(config)) }];
      }
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
  const itemsGo = [...concerned.board(board.id), ...concerned.projectBoard(board.id), ...concerned.supportBoard(board.id)];
  boardSections.importSections(board.id, sections, keptCount);
  // A list that got a new key brings its own default labels; a counting
  // widget that names no widget — exported before they named theirs by key —
  // reads those of its type on the board.
  for (const widget of boardWidgets.all(board.id)) {
    if (isListWidgetType(widget.type) && !takenKeys.has(listKey(readConfig(widget.config)))) {
      touchNow(res, ...seedListWidget(widget.type, widget.config, board.id));
    }
    const config = withSources(widget.type, widget.config, board.id);
    if (config !== widget.config) boardWidgets.update.run(config, widget.id);
  }
  notifyBoard({
    boardId: board.id,
    message: "a importé une disposition",
    author: req.user,
    base: root(req),
    scope: "edit",
    recipients: itemsGo,
  });
  const result: ImportResult = {
    placed: sections.reduce((n, s) => n + s.widgets.length, 0),
    discarded,
    keptCount: keptCount.length,
  };
  res.json(result);
});

boardContentRoutes.get("/widgets", (req, res) => {
  const board = openBoard((req.params as { id: string }).id, req.user);
  res.json(rendered(boardWidgets.all(board.id)));
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
  announce(req, board.id, "a modifié une section");
  res.json(boardSections.byId(existing.id));
});

boardSectionRoutes.post("/:id/duplicate", (req, res) => {
  const { section: existing, board } = openedSection(req.params.id, req.user);
  requireStructure(req, board);
  const copy = boardSections.duplicate(existing);
  // Its lists got new keys: each brings its own default labels.
  for (const widget of boardWidgets.bySection(copy)) {
    touchNow(res, ...seedListWidget(widget.type, widget.config, board.id));
  }
  announce(req, board.id, "a dupliqué une section");
  res.status(201).json(boardSections.byId(copy));
});

boardSectionRoutes.delete("/:id", (req, res) => {
  const { section: existing, board } = openedSection(req.params.id, req.user);
  requireStructure(req, board);
  // What it carried goes with it, through the foreign key. The token undoes
  // it (lib/undo.ts).
  const holdsItems = boardWidgets
    .all(board.id)
    .some((w) => w.section_id === existing.id && isListWidgetType(w.type));
  announce(req, board.id, "a supprimé une section", { itemsGo: holdsItems });
  const undo = deleteWithUndo(req.user.id, [byId("board_sections", existing.id)], () =>
    boardSections.remove.run(existing.id),
  );
  res.json({ undo });
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
  // Only the widgets of the same structure are arranged.
  const known = new Set(boardWidgets.all(board.id).map((w) => w.id));
  if (ids.length !== new Set(ids).size || ids.some((id) => !known.has(id))) {
    badRequest("La liste des identifiants ne correspond pas aux widgets");
  }
  boardWidgets.store(section.id, ids);
  announce(req, board.id, "a réorganisé les widgets");
  res.json(rendered(boardWidgets.all(board.id)));
});

boardWidgetRoutes.post("/", (req, res) => {
  const { section, board } = openedSection(req.body.section_id, req.user);
  requireStructure(req, board);
  const type: unknown = req.body.type;
  if (!isBoardWidgetType(type)) badRequest("Widget inconnu");
  requireWidget(req, type as string, "view");
  // A list widget gets its key here, new: that of a configuration copied from
  // elsewhere is not valid (repositories/lists.ts).
  const id = boardWidgets.create(
    section.id,
    type as string,
    withSources(type as string, configuration(type as string, req.body.config, "{}"), board.id),
  );
  // A list widget brings its own default labels and milestone type
  // (repositories/list-seeds.ts).
  const created = boardWidgets.byId(id)!;
  touchNow(res, ...seedListWidget(created.type, created.config, board.id));
  announce(req, board.id, `a ajouté ${widgetName(created)}`);
  res.status(201).json(renderedWidget(created));
});

// A widget's type cannot be changed: that would be another widget. Only its
// configuration moves. Its configuration also carries what some widgets hold,
// a to-do list's items: it moves under a "read" share too.
boardWidgetRoutes.put("/:id", (req, res) => {
  const { widget, board } = openWidget(req.params.id, req);
  if (req.body.type !== undefined && req.body.type !== widget.type) {
    badRequest("Ce widget ne se convertit pas en ce type");
  }
  const config = keepKey(widget.type, widget.config, configuration(widget.type, req.body.config, widget.config));
  boardWidgets.update.run(config, widget.id);
  // The same configuration saved again is not a modification.
  // Changed in place, the edit mode off — a to-do list's items —, it is a
  // notification of use.
  if (config !== widget.config) {
    const inUse = req.body.in_use === true;
    announce(
      req,
      board.id,
      `a modifié ${inUse ? "le contenu de " : ""}${widgetName({ type: widget.type, config })}`,
      { scope: inUse ? "production" : "edit" },
    );
  }
  res.json(renderedWidget(boardWidgets.byId(widget.id)!));
});

boardWidgetRoutes.post("/:id/duplicate", (req, res) => {
  const { widget, board } = openWidget(req.params.id, req);
  requireStructure(req, board);
  // A list widget owns its items: it is not duplicated.
  if (isListWidgetType(widget.type)) badRequest("Ce widget ne se duplique pas");
  const copy = boardWidgets.duplicate(widget);
  announce(req, board.id, `a dupliqué ${widgetName(widget)}`);
  res.status(201).json(renderedWidget(boardWidgets.byId(copy)!));
});

/** What a list widget's items and settings are re-read through. */
const LIST_RESOURCES: Resource[] = [
  "categories",
  "projects",
  "task-lists",
  "labels",
  "project-labels",
  "support-requests",
  "support-labels",
  "managed-device-assets",
  "unmanaged-device-assets",
  "application-assets",
  "contacts",
  "products",
  "orders",
  "warehouses",
  "locations",
];

/**
 * Move a widget — cut, then pasted (client, lib/clipboard.ts) — into a
 * section of this board or of another, at the given place. It stays the same
 * widget: its configuration and its keys — a calendar its consents, a list
 * its items, which follow it to the other board. Taken from its board as by
 * a deletion: "Supprimer" on its type, and the structure of both boards.
 */
boardWidgetRoutes.put("/:id/move", (req, res) => {
  const { widget, board: from } = openWidget(req.params.id, req);
  requireWidget(req, widget.type, "delete");
  requireStructure(req, from);
  const { section, board: to } = openedSection(req.body.section_id, req.user);
  requireStructure(req, to);
  const index = Number(req.body.index);
  const key = listKey(readConfig(widget.config));
  // A list shown twice on its board — its key held by another widget —
  // cannot take its items away from the other.
  if (
    from.id !== to.id &&
    key !== "" &&
    boardWidgets
      .all(from.id)
      .some((w) => w.id !== widget.id && w.type === widget.type && listKey(readConfig(w.config)) === key)
  ) {
    badRequest("Cette liste est affichée ailleurs sur son tableau : elle ne peut pas changer de tableau");
  }
  boardWidgets.move(widget, from.id, section.id, to.id, Number.isFinite(index) ? index : Number.MAX_SAFE_INTEGER);
  if (from.id !== to.id) {
    announce(req, from.id, `a déplacé ${widgetName(widget)} vers un autre tableau`, {
      itemsGo: isListWidgetType(widget.type),
    });
    // Its items changed board: the tabs re-read them.
    if (isListWidgetType(widget.type)) touchNow(res, ...LIST_RESOURCES);
  }
  announce(req, to.id, `a déplacé ${widgetName(widget)}`);
  res.json(renderedWidget(boardWidgets.byId(widget.id)!));
});

boardWidgetRoutes.delete("/:id", (req, res) => {
  const { widget, board } = openWidget(req.params.id, req);
  requireStructure(req, board);
  announce(req, board.id, `a supprimé ${widgetName(widget)}`, { itemsGo: isListWidgetType(widget.type) });
  const undo = deleteWithUndo(req.user.id, [byId("board_widgets", widget.id)], () =>
    boardWidgets.remove.run(widget.id),
  );
  res.json({ undo });
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

/**
 * A Citation widget's quote or joke (lib/quotes.ts), kept by the server for
 * the interval the widget sets. "renew" draws another one: everyone in front
 * of the board then reads it, so it takes being able to modify the widget.
 */
boardWidgetRoutes.get("/:id/quote", (req, res, next) => {
  const { widget } = openWidget(req.params.id, req);
  if (widget.type !== "quote") badRequest("Ce widget n'est pas un widget Citation");
  const renew = req.query["renew"] === "1";
  if (renew) requireWidget(req, "quote", "update");
  quoteOf(String(widget.id), quoteSettings(renderedWidget(widget).config), renew)
    .then((quote) => res.json(quote))
    .catch(next);
});

/** The longest period a calendar requests: six weeks, and some margin. */
const PERIOD_MAX = 62 * 24 * 60 * 60 * 1000;

/** A widget's configuration, read; empty if unreadable. */
const readConfig = (config: string): Record<string, unknown> => {
  try {
    const value = JSON.parse(config) as unknown;
    return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

/** The period a calendar asks for, checked: at most PERIOD_MAX. */
const periodOf = (req: Request): { start: Date; end: Date } => {
  const start = new Date(String(req.query["start"] ?? ""));
  const end = new Date(String(req.query["end"] ?? ""));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    badRequest("Période invalide");
  }
  if (end.getTime() - start.getTime() > PERIOD_MAX) badRequest("Période trop longue");
  if (!entraConfigured()) badRequest("Milo n'est pas connecté à Entra");
  return { start, end };
};

/**
 * The appointments a Calendar widget reads between "start" and "end": those
 * of the people it names who have consented (lib/calendar-optin.ts). A
 * calendar that cannot be read says why, without hiding the others.
 */
const agendaOf = (
  req: Request,
  widget: { config: string },
  { start, end }: { start: Date; end: Date },
): Promise<AccessCalendar> => {
  const config = readConfig(widget.config);
  const confirmed = confirmedCalendars(calendarKey(config));
  // Each calendar chosen for a person who consented; none chosen, their main one.
  const calendars: { owner: string; resource: string; read: () => Promise<AccessCalendarEvent[]> }[] = [
    ...shownCalendarsOf(config),
  ]
    .filter(([email]) => confirmed.has(email))
    .flatMap(([email, ids]) =>
      (ids.length ? ids : [""]).map((id) => ({
        owner: email,
        resource: calendarResource(email, id),
        read: () => entraAgenda(email, start, end, email, id),
      })),
    );

  // The calendar is reread regularly: the viewer keeps being told of what
  // changes in these calendars (lib/m365-webhooks.ts).
  for (const c of calendars) if (c.resource) watch(req.user.id, "calendar", c.resource);

  return Promise.allSettled(calendars.map((c) => c.read())).then((results) => {
    const calendar: AccessCalendar = { events: [], errors: [] };
    results.forEach((r, i) => {
      if (r.status === "fulfilled") calendar.events.push(...r.value);
      // One reason per person, even when several of their calendars fail.
      else if (!calendar.errors.some((e) => e.owner === calendars[i]!.owner)) {
        calendar.errors.push({
          owner: calendars[i]!.owner,
          message: r.reason instanceof Error ? r.reason.message : String(r.reason),
        });
      }
    });
    return calendar;
  });
};

/** The appointments a Calendar widget marks on its month. */
boardWidgetRoutes.get("/:id/calendar", (req, res, next) => {
  const { widget } = openWidget(req.params.id, req);
  if (widget.type !== "calendar") badRequest("Ce widget n'est pas un calendrier");
  agendaOf(req, widget, periodOf(req))
    .then((calendar) => res.json(calendar))
    .catch(next);
});

/**
 * The appointments of a "Rendez-vous" widget, or of its "Indicateur": those of
 * the Calendar widgets it follows (SOURCES), on any board this person sees —
 * one since removed reads nothing. An appointment several of them read comes
 * several times: the client counts it once.
 */
boardWidgetRoutes.get("/:id/appointments", (req, res, next) => {
  const { widget } = openWidget(req.params.id, req);
  if (!(APPOINTMENT_TYPES as readonly string[]).includes(widget.type)) {
    badRequest("Ce widget ne lit pas de rendez-vous");
  }
  const period = periodOf(req);
  const calendars = readSources(req, "calendar", sourcesOf(readConfig(widget.config)));
  Promise.all(calendars.map((c) => agendaOf(req, c, period)))
    .then((agendas) => {
      const calendar: AccessCalendar = { events: [], errors: [] };
      for (const a of agendas) {
        calendar.events.push(...a.events);
        // One reason per person, even when several widgets read them.
        for (const e of a.errors) {
          if (!calendar.errors.some((known) => known.owner === e.owner)) calendar.errors.push(e);
        }
      }
      res.json(calendar);
    })
    .catch(next);
});

/** A folder a Mail widget reads: whose, in which mailbox, and under which name. */
interface MailSource {
  /** What designates it in the cursor. */
  id: string;
  /** The mailbox read: an Entra id or an address. */
  user: string;
  /** "inbox", or a folder's id. */
  folder: string;
  /** Whose e-mails they are: an address. */
  owner: string;
}

/**
 * What a Mail widget reads: the folders chosen of the people it names who have
 * consented (lib/mail-optin.ts) — none chosen, their inbox.
 */
const mailSourcesOf = (widget: { config: string }) => {
  const config = readConfig(widget.config);
  const confirmed = mailOptin.confirmed(mailKey(config));
  const others = [...shownFoldersOf(config)].filter(([email]) => confirmed.has(email));
  const sources: MailSource[] = others.flatMap(([email, ids]) =>
    (ids.length ? ids : ["inbox"]).map((folder) => ({
      id: `${email}|${folder}`,
      user: email,
      folder,
      owner: email,
    })),
  );
  return { sources, people: new Set(others.map(([email]) => email)) };
};

/** The targeted Mail widget and what it reads. */
const openMailbox = (req: Request) => {
  const { widget } = openWidget(req.params.id, req);
  if (widget.type !== "mail") badRequest("Ce widget n'est pas un widget Mail");
  if (!entraConfigured()) badRequest("Milo n'est pas connecté à Entra");
  return mailSourcesOf(widget);
};

/**
 * What a widget that counts reads: that of the Mail widgets it follows
 * (SOURCES), on any board this person sees, each folder once — one since
 * removed reads nothing. "folders", the folders it counts itself of each
 * person, among those the Mail widgets' consent covers.
 */
const openCounted = (
  req: Request,
  type: string,
  folders: (config: unknown) => Map<string, string[]> = () => new Map(),
): MailSource[] => {
  const { widget } = openWidget(req.params.id, req);
  const config = readConfig(widget.config);
  // An "Indicateurs" widget counts e-mails when it reads the Mail widgets.
  const indicator =
    widget.type.startsWith("indicator.") &&
    (config as Record<string, unknown> | null)?.[INDICATOR_DATA] === "mail";
  if (widget.type !== type && !indicator) badRequest("Ce widget ne compte pas d'e-mails");
  if (!entraConfigured()) badRequest("Milo n'est pas connecté à Entra");
  const read = readSources(req, "mail", sourcesOf(config)).map(mailSourcesOf);
  const sources = read.flatMap((r) => r.sources);
  const people = new Set(read.flatMap((r) => [...r.people]));
  const own = folders(config);
  const counted = [...people].flatMap((email) => {
    const ids = own.get(email) ?? [];
    return ids.length
      ? ids.map((folder) => ({ id: `${email}|${folder}`, user: email, folder, owner: email }))
      : sources.filter((s) => s.owner === email);
  });
  // A folder two Mail widgets read is counted once.
  return counted.filter((s, i) => counted.findIndex((t) => t.id === s.id) === i);
};

/** The reasons the mailboxes that failed give: one per person. */
const failuresOf = (
  results: PromiseSettledResult<unknown>[],
  ownerOf: (i: number) => string,
): { owner: string; message: string }[] => {
  const errors: { owner: string; message: string }[] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled" || errors.some((e) => e.owner === ownerOf(i))) return;
    errors.push({
      owner: ownerOf(i),
      message: r.reason instanceof Error ? r.reason.message : String(r.reason),
    });
  });
  return errors;
};

/** What a count is told of the folders it reads: what arrives there (lib/m365-webhooks.ts). */
const watchSources = (req: Request, sources: MailSource[]) => {
  for (const s of sources) watch(req.user.id, "mail", folderResource(s.user, s.folder));
};

/**
 * The count of an "Indicateur" (shared, MAIL_METRICS), summed over the folders
 * it reads. The unread ones and the total are kept by Exchange on the folder;
 * the others are counted by Graph ($count): no e-mail is read. "since", for
 * those received today, is the start of the viewer's day.
 */
boardWidgetRoutes.get("/:id/mail-count", (req, res, next) => {
  const sources = openCounted(req, "mail_count");
  const metric = isMailMetric(req.query["metric"]) ? req.query["metric"] : "unread";
  const since = new Date(String(req.query["since"] ?? ""));
  if (metric === "today" && Number.isNaN(since.getTime())) badRequest("Date de début invalide");
  watchSources(req, sources);
  const countOf = async (s: MailSource): Promise<number> => {
    switch (metric) {
      case "today":
        return countMessages(s.user, s.folder, `receivedDateTime ge ${since.toISOString()}`);
      case "flagged":
        return countMessages(s.user, s.folder, "flag/flagStatus eq 'flagged'");
      case "total":
        return (await folderCounts(s.user, s.folder)).total;
      default:
        return (await folderCounts(s.user, s.folder)).unread;
    }
  };
  Promise.allSettled(sources.map(countOf))
    .then((results) => {
      const count: AccessMailCount = {
        value: results.reduce((sum, r) => sum + (r.status === "fulfilled" ? r.value : 0), 0),
        errors: failuresOf(results, (i) => sources[i]!.owner),
      };
      res.json(count);
    })
    .catch(next);
});

/**
 * The folders of "Messages par dossier", each with its counts: those chosen in
 * its drawer, otherwise those its Mail widget reads. Exchange keeps the counts on each folder: no e-mail is read.
 */
boardWidgetRoutes.get("/:id/mail-folders", (req, res, next) => {
  const sources = openCounted(req, "mail_folders", countedFoldersOf);
  watchSources(req, sources);
  Promise.allSettled(sources.map((s) => folderCounts(s.user, s.folder)))
    .then((results) => {
      const counts: AccessMailFolderCounts = {
        folders: results.flatMap((r, i) =>
          r.status === "fulfilled" ? [{ ...r.value, owner: sources[i]!.owner }] : [],
        ),
        errors: failuresOf(results, (i) => sources[i]!.owner),
      };
      res.json(counts);
    })
    .catch(next);
});

/**
 * The mailbox an opened e-mail comes from: that of a person the widget
 * reads — only if they consented.
 */
const mailboxOf = (req: Request): { user: string; owner: string } => {
  const { people } = openMailbox(req);
  const owner = String(req.query["owner"] ?? "").trim().toLowerCase();
  if (!people.has(owner)) badRequest("Cette boîte n'est pas lue par ce widget");
  return { user: owner, owner };
};

/** At most, one page of e-mails: Graph does not return more at once. */
const PAGE_MAX = 100;

/** Where each folder's next page starts, as the client sends it back. */
const readCursor = (raw: unknown): Record<string, number> => {
  try {
    const value = JSON.parse(Buffer.from(String(raw ?? ""), "base64url").toString("utf8")) as unknown;
    return value && typeof value === "object" ? (value as Record<string, number>) : {};
  } catch {
    return {};
  }
};

/**
 * A page of the folders a Mail widget reads (lib/entra.ts), merged from most
 * recent to oldest. Each folder gives the first "top" of what it has left;
 * the most recent "top" of them all make the page, and the cursor says where
 * each folder resumes — the grid asks for the next page when reaching the
 * bottom of the list. A mailbox that cannot be read says why, without hiding
 * the others.
 */
boardWidgetRoutes.get("/:id/mails", (req, res, next) => {
  const { sources } = openMailbox(req);
  const howMany = Math.min(PAGE_MAX, Math.max(1, Math.floor(Number(req.query["top"]) || 10)));
  const unreadOnly = req.query["unread"] === "1";
  const first = !req.query["cursor"];
  const cursor = readCursor(req.query["cursor"]);
  const skipOf = (s: MailSource) => Math.max(0, Math.floor(Number(cursor[s.id]) || 0));
  // The first page is reread regularly: the viewer keeps being told what
  // arrives in these folders (lib/m365-webhooks.ts).
  if (first) {
    for (const s of sources) if (s.user) watch(req.user.id, "mail", folderResource(s.user, s.folder));
  }

  Promise.allSettled(
    sources.map((s) => {
      if (s.owner === "" && !s.user) {
        return Promise.reject(new Error("Votre compte n'est pas relié à Entra"));
      }
      return folderPage(s.user, s.folder, skipOf(s), howMany, unreadOnly, s.owner);
    }),
  )
    .then((results) => {
      const page: AccessMailPage = { messages: [], more: false, cursor: "", errors: [] };
      const candidates: { message: AccessMail; source: number }[] = [];
      let unread = 0;
      results.forEach((r, i) => {
        if (r.status === "fulfilled") {
          candidates.push(...r.value.messages.map((message) => ({ message, source: i })));
          unread += r.value.unread;
          if (r.value.more) page.more = true;
        } else if (!page.errors.some((e) => e.owner === sources[i]!.owner)) {
          // One reason per person, even when several of their folders fail.
          page.errors.push({
            owner: sources[i]!.owner,
            message: r.reason instanceof Error ? r.reason.message : String(r.reason),
          });
        }
      });
      candidates.sort((a, b) => b.message.received_at.localeCompare(a.message.received_at));
      const taken = candidates.slice(0, howMany);
      // What was read but not taken comes back on the next page.
      if (candidates.length > taken.length) page.more = true;
      const next: Record<string, number> = {};
      sources.forEach((s, i) => {
        next[s.id] = skipOf(s) + taken.filter((t) => t.source === i).length;
      });
      page.messages = taken.map((t) => t.message);
      page.cursor = Buffer.from(JSON.stringify(next), "utf8").toString("base64url");
      if (first) page.unread = unread;
      res.json(page);
    })
    .catch(next);
});

/** An e-mail from a mailbox, its body cleaned like that of a received request (lib/html.ts). */
boardWidgetRoutes.get("/:id/mails/:mail", (req, res, next) => {
  const { user, owner } = mailboxOf(req);
  mailOfMailbox(user, String(req.params.mail), owner)
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
 * Deletes an e-mail from a mailbox the widget reads: Graph puts it in its
 * deleted items, where it can still be found. It takes the right to delete on
 * the widget's type (openWidget, on a DELETE).
 */
boardWidgetRoutes.delete("/:id/mails/:mail", (req, res, next) => {
  const { user } = mailboxOf(req);
  deleteMail(user, String(req.params.mail))
    .then(() => res.status(204).end())
    .catch(next);
});

/**
 * An attachment of an e-mail from a mailbox, always as a download: a
 * received file never runs on Milo's origin.
 */
boardWidgetRoutes.get("/:id/mails/:mail/attachments/:attachment", (req, res, next) => {
  const { user } = mailboxOf(req);
  mailboxAttachment(user, String(req.params.mail), String(req.params.attachment))
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
