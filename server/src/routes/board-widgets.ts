// Les sections d'un tableau et les widgets qu'elles portent. Le serveur ne
// vérifie que le widget visé et la forme de sa configuration — un objet —,
// sans la relire : c'est le widget du client qui sait ce qu'elle veut dire.
//
// Chacun voit et modifie la structure qu'il regarde : la publique, ou la
// sienne (« Hérité » décoché). Une section ou un widget d'une autre structure
// est introuvable. Poser la structure publique demande de pouvoir organiser
// les tableaux (lib/droits.ts) ; sa propre structure n'est qu'à soi. Un widget,
// lui, ne se pose, ne se règle et ne s'enlève qu'avec « Modifier » sur son
// type.

import express, { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import {
  LIST_KEY,
  SECTIONS_GAP_DEFAULT,
  SECTIONS_GAP_MAX,
  listKey,
  isBoardWidgetType,
  isListWidgetType,
  isSectionWidthUnit,
  migrateWidgetConfig,
} from "@milo/shared";
import type { AccessMailDetail, Id, Resource, ImportResult } from "@milo/shared";
import type { BoardRow, BoardWidgetRow } from "../db/rows.js";
import { widgetAccess, requireOrganize, requireWidget } from "../lib/rights.js";
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
import { badRequest, notFound, orNotFound, toIds } from "../lib/http.js";
import { SIZE_MAX, writeMedia, inlineType, mediaUrl } from "../lib/media.js";
import { searchPlace, weatherCoordinates, weatherOf } from "../lib/weather.js";
import { columnsGap, requestedRank, widthUnit, widthValue } from "../lib/sections.js";
import { signalWrite, touch, touchNow } from "../middleware/events.js";
import { ensureDefaultType } from "./milestone-types.js";
import { reassignWorkstationContexts } from "../repositories/assets.js";
import { withNewKey, keyInBoard, keepKey, cleanLists } from "../repositories/lists.js";
import { receivedTags } from "../repositories/inboxes.js";
import { boardSections, boardWidgets, renderedWidget } from "../repositories/board-widgets.js";
import { openBoard } from "../repositories/boards.js";
import { personalLayouts, boardScope } from "../repositories/layouts.js";

const SECTION_NOT_FOUND = "Section introuvable";
const WIDGET_NOT_FOUND = "Widget introuvable";

/** Les conversions permises : la catégorie et la sous-catégorie partagent leur configuration. */
const CONVERSIONS: Record<string, string> = { category: "subcategory", subcategory: "category" };

type Account = Request["user"];

/**
 * La structure que ce compte regarde dans ce tableau : la publique (nul), ou
 * la sienne. Un tableau privé n'a que sa structure publique.
 */
const owner = (board: BoardRow, user: Account): Id | null =>
  board.is_private ? null : personalLayouts.owner(user.id, boardScope(board.id));

/** Le tableau ouvert, et la structure que ce compte y regarde. */
const openStructure = (boardId: unknown, user: Account) => {
  const board = openBoard(boardId, user);
  return { board, owner: owner(board, user) };
};

/** La section demandée, si elle est de la structure regardée ; et son tableau. */
const openedSection = (id: unknown, user: Account) => {
  const section = orNotFound(boardSections.byId(id), SECTION_NOT_FOUND);
  const { board, owner } = openStructure(section.board_id, user);
  if (section.owner_id !== owner) notFound(SECTION_NOT_FOUND);
  return { section, board, owner };
};

/**
 * Le widget demandé, et la section ouverte qui le porte. Il faut lire son
 * type — « Modifier » pour une écriture.
 */
const openWidget = (id: unknown, req: Request) => {
  const widget = orNotFound(boardWidgets.byId(id), WIDGET_NOT_FOUND);
  requireWidget(req, widget.type, req.method === "GET" ? "view" : "update");
  return { widget, ...openedSection(widget.section_id, req.user) };
};

/** Poser la structure publique demande de pouvoir organiser ; la sienne, non. */
const requireStructure = (req: Request, owner: Id | null): void => {
  if (owner === null) requireOrganize(req);
};

/** Les widgets dont le compte lit le type : les autres ne lui sont pas rendus. */
const allReadable = (req: Request, widgets: BoardWidgetRow[]) =>
  widgets.filter((w) => widgetAccess(req, w.type) !== "").map(renderedWidget);

/**
 * La configuration reçue, prête à ranger : un objet, rien d'autre — aux clés
 * d'aujourd'hui, si elle vient d'un presse-papiers ou d'une page d'avant
 * leur traduction (migrateWidgetConfig).
 */
const configuration = (type: string, value: unknown, defaultValue: string): string => {
  if (value === undefined) return defaultValue;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    badRequest("Configuration invalide");
  }
  return JSON.stringify(migrateWidgetConfig(type, value));
};

// --- Ce qu'un tableau porte -------------------------------------------------

/** Ses sections et ses widgets, lus par le tableau : « /api/boards/:id/… ». */
/**
 * Les éléments suivent les widgets de liste (repositories/listes.ts) : une
 * écriture qui enlève le dernier widget d'une liste — seul, avec sa section,
 * sa structure personnelle ou son tableau — emporte ses éléments. Les postes
 * suivent en plus les tags que les listes de postes reçoivent
 * (repositories/receptions.ts) : un widget réglé, posé ou enlevé les range à
 * nouveau.
 */
export const followLists = (req: Request, res: Response, next: NextFunction): void => {
  if (req.method === "GET") return next();
  const before = JSON.stringify(receivedTags());
  res.on("finish", () => {
    if (res.statusCode >= 400) return;
    const touchedResources: Resource[] = cleanLists();
    // Une adresse de réception neuve attend sa confirmation : sa boîte reçoit
    // le lien (lib/optin.ts).
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
  const { board, owner } = openStructure((req.params as { id: string }).id, req.user);
  res.json(boardSections.all(board.id, owner));
});

boardContentRoutes.post("/sections", (req, res) => {
  const { board, owner } = openStructure((req.params as { id: string }).id, req.user);
  requireStructure(req, owner);
  const unit = widthUnit(req.body.width_unit, "auto");
  const id = boardSections.create(
    board.id,
    owner,
    unit,
    widthValue(unit, req.body.width_value),
    columnsGap(req.body.gap, SECTIONS_GAP_DEFAULT),
    requestedRank(req.body.index),
  );
  res.status(201).json(boardSections.byId(id));
});

boardContentRoutes.put("/sections/reorder", (req, res) => {
  const { board, owner } = openStructure((req.params as { id: string }).id, req.user);
  requireStructure(req, owner);
  const ids = toIds(req.body.ids);
  const known = boardSections.all(board.id, owner).map((s) => s.id);
  if (
    ids.length !== known.length ||
    new Set(ids).size !== ids.length ||
    !known.every((id) => ids.includes(id))
  ) {
    badRequest("La liste des identifiants ne correspond pas aux sections");
  }
  boardSections.store(ids);
  res.json(boardSections.all(board.id, owner));
});

/** Un objet simple, ou rien : ce qu'une disposition reçue peut porter. */
const subject = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/**
 * La largeur et l'écart d'une section importée. Une disposition vient d'une
 * autre version, peut-être : ce qui ne se lit pas reprend la valeur par
 * défaut au lieu de refuser tout l'import.
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
 * Importer une disposition (DispositionExportee) : elle remplace la structure
 * que le compte regarde. Les droits sont ceux de qui importe, pas de qui a
 * exporté : un widget d'un type inconnu ou que le compte ne modifie pas est
 * écarté, et un widget de l'ancienne structure qu'il ne peut pas enlever est
 * gardé. Un widget de liste reprend sa clé — ses éléments — si un widget de
 * ce tableau la tient déjà ; sinon il en reçoit une neuve : la clé d'un autre
 * tableau ne désigne rien ici.
 */
boardContentRoutes.post("/import", (req, res) => {
  const { board, owner } = openStructure((req.params as { id: string }).id, req.user);
  requireStructure(req, owner);
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
      if (!isBoardWidgetType(type) || widgetAccess(req, type) !== "update") {
        discarded += 1;
        return [];
      }
      // Une disposition exportée avant la traduction des clés se lit encore.
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
  // Ce que le compte ne peut pas enlever reste — même ce qu'il ne voit pas.
  const keptCount = boardWidgets
    .all(board.id, owner)
    .filter((w) => widgetAccess(req, w.type) !== "update")
    .map((w) => w.id);
  boardSections.importSections(board.id, owner, sections, keptCount);
  const result: ImportResult = {
    placed: sections.reduce((n, s) => n + s.widgets.length, 0),
    discarded,
    keptCount: keptCount.length,
  };
  res.json(result);
});

boardContentRoutes.get("/widgets", (req, res) => {
  const { board, owner } = openStructure((req.params as { id: string }).id, req.user);
  res.json(allReadable(req, boardWidgets.all(board.id, owner)));
});

// --- Une section -------------------------------------------------------------

export const boardSectionRoutes = Router();

boardSectionRoutes.use(touch("board-widgets"), followLists);

boardSectionRoutes.put("/:id", (req, res) => {
  const { section: existing, owner } = openedSection(req.params.id, req.user);
  requireStructure(req, owner);
  const unit = widthUnit(req.body.width_unit, existing.width_unit);
  // Changer d'unité sans redire la valeur garderait l'ancienne, qui ne veut
  // plus rien dire : « 30 % » ne devient pas « 30 px ».
  const value = widthValue(
    unit,
    req.body.width_value ?? (unit === existing.width_unit ? existing.width_value : undefined),
  );
  boardSections.update.run(unit, value, columnsGap(req.body.gap, existing.gap), existing.id);
  res.json(boardSections.byId(existing.id));
});

boardSectionRoutes.post("/:id/duplicate", (req, res) => {
  const { section: existing, owner } = openedSection(req.params.id, req.user);
  requireStructure(req, owner);
  res.status(201).json(boardSections.byId(boardSections.duplicate(existing)));
});

boardSectionRoutes.delete("/:id", (req, res) => {
  const { section: existing, owner } = openedSection(req.params.id, req.user);
  requireStructure(req, owner);
  // Ce qu'elle portait part avec elle, par clé étrangère.
  boardSections.remove.run(existing.id);
  res.status(204).end();
});

// --- Un widget ---------------------------------------------------------------

export const boardWidgetRoutes = Router();

boardWidgetRoutes.use(touch("board-widgets"), followLists);

/**
 * Ranger les widgets d'une section. Le corps donne la section et, dans
 * l'ordre, tout ce qu'elle porte désormais : un widget venu d'une autre
 * section de la même structure y est admis, c'est ainsi qu'on le déplace.
 * Déclaré avant « /:id », sinon « reorder » serait pris pour un identifiant.
 */
boardWidgetRoutes.put("/reorder", (req, res) => {
  const { section, board, owner } = openedSection(req.body.section_id, req.user);
  requireStructure(req, owner);
  const ids = toIds(req.body.ids);
  // Seuls se rangent les widgets que le compte voit, de la même structure.
  const known = new Set(allReadable(req, boardWidgets.all(board.id, owner)).map((w) => w.id));
  if (ids.length !== new Set(ids).size || ids.some((id) => !known.has(id))) {
    badRequest("La liste des identifiants ne correspond pas aux widgets");
  }
  boardWidgets.store(section.id, ids);
  res.json(allReadable(req, boardWidgets.all(board.id, owner)));
});

boardWidgetRoutes.post("/", (req, res) => {
  const { section } = openedSection(req.body.section_id, req.user);
  const type: unknown = req.body.type;
  if (!isBoardWidgetType(type)) badRequest("Widget inconnu");
  requireWidget(req, type as string, "update");
  // Un widget de liste reçoit sa clé ici, neuve : celle d'une configuration
  // recopiée d'ailleurs ne vaut pas (repositories/listes.ts).
  const id = boardWidgets.create(
    section.id,
    type as string,
    configuration(type as string, req.body.config, "{}"),
  );
  // Un widget de projets pose le type de jalons « Défaut », que ses projets
  // reçoivent à leur création.
  if ((type as string).startsWith("project.") && ensureDefaultType()) {
    touchNow(res, "lookups", "projects");
  }
  res.status(201).json(renderedWidget(boardWidgets.byId(id)!));
});

// Le type d'un widget ne se change pas : ce serait un autre widget. Seule sa
// configuration bouge — sauf entre la catégorie et la sous-catégorie, qui
// partagent la leur.
boardWidgetRoutes.put("/:id", (req, res) => {
  const { widget } = openWidget(req.params.id, req);
  if (req.body.type !== undefined && req.body.type !== widget.type) {
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
  const { widget } = openWidget(req.params.id, req);
  // Un widget de liste possède ses éléments : il ne se duplique pas.
  if (isListWidgetType(widget.type)) badRequest("Ce widget ne se duplique pas");
  res.status(201).json(renderedWidget(boardWidgets.byId(boardWidgets.duplicate(widget))!));
});

boardWidgetRoutes.delete("/:id", (req, res) => {
  const { widget } = openWidget(req.params.id, req);
  boardWidgets.remove.run(widget.id);
  res.status(204).end();
});

/**
 * Ce que donne une adresse de flux, pour le tiroir d'un widget RSS : la
 * source est-elle joignable, et dans quel format répond-elle ? Déclaré comme
 * « /weather/places » : « feed » n'est pas un identifiant.
 */
boardWidgetRoutes.get("/feed/probe", (req, res, next) => {
  requireWidget(req, "rss", "update");
  probeFeed(String(req.query["url"] ?? "").trim())
    .then((probe) => res.json(probe))
    .catch(next);
});

/**
 * Le flux d'un widget RSS, tel que la base le garde (lib/feed.ts). La source
 * est relevée par le serveur, à l'intervalle que le widget règle : la page ne
 * l'attend pas, sauf quand la base n'a encore rien à montrer.
 *
 * Express 4 ne rattrape pas le rejet d'une fonction asynchrone : il passe par
 * « next ».
 */
boardWidgetRoutes.get("/:id/feed", (req, res, next) => {
  const { widget } = openWidget(req.params.id, req);
  if (widget.type !== "rss") badRequest("Ce widget n'est pas un flux RSS");
  feedOf(feedSettings(renderedWidget(widget).config))
    .then((feed) => res.json(feed))
    .catch(next);
});

/**
 * Les lieux qui répondent à ce qu'on tape, pour régler un widget Météo.
 * Déclaré comme « /:id/… » le serait : « weather » n'est pas un identifiant,
 * mais aucune route « GET /:id/places » ne vient le lui disputer.
 */
boardWidgetRoutes.get("/weather/places", (req, res, next) => {
  requireWidget(req, "weather", "update");
  searchPlace(String(req.query["q"] ?? ""))
    .then((places) => res.json(places))
    .catch(next);
});

/** La météo du lieu d'un widget Météo (lib/meteo.ts), gardée un quart d'heure par le serveur. */
boardWidgetRoutes.get("/:id/weather", (req, res, next) => {
  const { widget } = openWidget(req.params.id, req);
  if (widget.type !== "weather") badRequest("Ce widget n'est pas un widget Météo");
  const place = weatherCoordinates(renderedWidget(widget).config);
  if (!place) badRequest("Choisissez un lieu dans le réglage du widget");
  weatherOf(place!.latitude, place!.longitude)
    .then((weather) => res.json(weather))
    .catch(next);
});

/** La période la plus longue qu'un calendrier demande : six semaines, et de la marge. */
const PERIOD_MAX = 62 * 24 * 60 * 60 * 1000;

/**
 * Les rendez-vous de qui regarde, entre « start » et « end » : chacun voit
 * les siens, quel que soit le tableau. Ils viennent de son agenda Outlook,
 * par Graph (lib/entra.ts) ; un compte local n'en a pas.
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
 * Le compte Entra de qui regarde : le widget Mail et le Calendrier ne
 * montrent que ce qui est à lui.
 */
const entraAccount = (req: Request): string => {
  if (!entraConfigured()) badRequest("Milo n'est pas connecté à Entra");
  if (!req.user.entra_id) badRequest("Votre compte n'est pas relié à Entra");
  return req.user.entra_id;
};

/** Le widget Mail visé, et le compte dont il lit la boîte. */
const openMailbox = (req: Request) => {
  const { widget } = openWidget(req.params.id, req);
  if (widget.type !== "mail") badRequest("Ce widget n'est pas un widget Mail");
  return entraAccount(req);
};

/** Au plus, les e-mails d'une page : Graph n'en rend pas davantage d'un coup. */
const PAGE_MAX = 100;

/**
 * Une page de la boîte de réception de qui regarde (lib/entra.ts) : chacun
 * voit la sienne, quel que soit le tableau. « skip » dit où elle commence —
 * la grille demande la suivante quand on arrive au bas de la liste.
 */
boardWidgetRoutes.get("/:id/mails", (req, res, next) => {
  const oid = openMailbox(req);
  const offset = Math.max(0, Math.floor(Number(req.query["skip"]) || 0));
  const howMany = Math.min(PAGE_MAX, Math.max(1, Math.floor(Number(req.query["top"]) || 10)));
  mailboxPage(oid, offset, howMany, req.query["unread"] === "1")
    .then((page) => res.json(page))
    .catch(next);
});

/** Un e-mail de la boîte, son corps nettoyé comme celui d'une demande reçue (lib/html.ts). */
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
 * Une pièce jointe d'un e-mail de la boîte, toujours en téléchargement : un
 * fichier reçu ne s'exécute jamais sur l'origine de Milo.
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
 * Une image déposée pour un widget Image. Comme celle d'une description, elle
 * ne laisse pas de ligne en base : c'est la configuration du widget qui la
 * cite, et le ménage des médias s'y fie (repositories/attachments.ts).
 *
 * Monté sous « /api/widget-images », hors des routes des widgets : un dépôt
 * ne change aucun tableau, il n'a pas à faire relire les leurs aux pages.
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
