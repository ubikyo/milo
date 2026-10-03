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
  CLE_DE_LISTE,
  SECTIONS_GAP_DEFAUT,
  SECTIONS_GAP_MAX,
  cleDeListe,
  isBoardWidgetType,
  isListWidgetType,
  isSectionWidthUnit,
} from "@milo/shared";
import type { AccessMailDetail, Id, Resource, ResultatImport } from "@milo/shared";
import type { BoardRow, BoardWidgetRow } from "../db/rows.js";
import { accesAuWidget, exigerOrganiser, exigerWidget } from "../lib/droits.js";
import {
  agendaEntra,
  courrierDeLaBoite,
  entraConfiguree,
  pageDeLaBoite,
  pieceDeLaBoite,
} from "../lib/entra.js";
import { emailPropre } from "../lib/html.js";
import { fluxDe, reglagesFlux, sonderFlux } from "../lib/feed.js";
import { demanderLesConfirmations } from "../lib/optin.js";
import { badRequest, notFound, orNotFound, toIds } from "../lib/http.js";
import { TAILLE_MAX, ecrireMedia, typeEnLigne, urlMedia } from "../lib/medias.js";
import { chercherUnLieu, coordonneesMeteo, meteoDe } from "../lib/meteo.js";
import { ecartColonnes, rangDemande, uniteLargeur, valeurLargeur } from "../lib/sections.js";
import { signalerEcriture, touch, touchNow } from "../middleware/events.js";
import { assurerTypeParDefaut } from "./milestone-types.js";
import { recontextualiserLesPostes } from "../repositories/assets.js";
import { avecCleNeuve, cleDansLeTableau, garderLaCle, nettoyerLesListes } from "../repositories/listes.js";
import { tagsRecus } from "../repositories/receptions.js";
import { boardSections, boardWidgets, widgetRendu } from "../repositories/board-widgets.js";
import { tableauOuvert } from "../repositories/boards.js";
import { personalLayouts, scopeTableau } from "../repositories/layouts.js";

const SECTION_INTROUVABLE = "Section introuvable";
const WIDGET_INTROUVABLE = "Widget introuvable";

/** Les conversions permises : la catégorie et la sous-catégorie partagent leur configuration. */
const CONVERSIONS: Record<string, string> = { category: "subcategory", subcategory: "category" };

type Compte = Request["user"];

/**
 * La structure que ce compte regarde dans ce tableau : la publique (nul), ou
 * la sienne. Un tableau privé n'a que sa structure publique.
 */
const proprietaire = (board: BoardRow, user: Compte): Id | null =>
  board.is_private ? null : personalLayouts.proprietaire(user.id, scopeTableau(board.id));

/** Le tableau ouvert, et la structure que ce compte y regarde. */
const structureOuverte = (boardId: unknown, user: Compte) => {
  const board = tableauOuvert(boardId, user);
  return { board, owner: proprietaire(board, user) };
};

/** La section demandée, si elle est de la structure regardée ; et son tableau. */
const sectionOuverte = (id: unknown, user: Compte) => {
  const section = orNotFound(boardSections.byId(id), SECTION_INTROUVABLE);
  const { board, owner } = structureOuverte(section.board_id, user);
  if (section.owner_id !== owner) notFound(SECTION_INTROUVABLE);
  return { section, board, owner };
};

/**
 * Le widget demandé, et la section ouverte qui le porte. Il faut lire son
 * type — « Modifier » pour une écriture.
 */
const widgetOuvert = (id: unknown, req: Request) => {
  const widget = orNotFound(boardWidgets.byId(id), WIDGET_INTROUVABLE);
  exigerWidget(req, widget.type, req.method === "GET" ? "view" : "update");
  return { widget, ...sectionOuverte(widget.section_id, req.user) };
};

/** Poser la structure publique demande de pouvoir organiser ; la sienne, non. */
const exigerStructure = (req: Request, owner: Id | null): void => {
  if (owner === null) exigerOrganiser(req);
};

/** Les widgets dont le compte lit le type : les autres ne lui sont pas rendus. */
const lisibles = (req: Request, widgets: BoardWidgetRow[]) =>
  widgets.filter((w) => accesAuWidget(req, w.type) !== "").map(widgetRendu);

/** La configuration reçue, prête à ranger : un objet, rien d'autre. */
const configuration = (valeur: unknown, defaut: string): string => {
  if (valeur === undefined) return defaut;
  if (!valeur || typeof valeur !== "object" || Array.isArray(valeur)) {
    badRequest("Configuration invalide");
  }
  return JSON.stringify(valeur);
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
export const suivreLesListes = (req: Request, res: Response, next: NextFunction): void => {
  if (req.method === "GET") return next();
  const avant = JSON.stringify(tagsRecus());
  res.on("finish", () => {
    if (res.statusCode >= 400) return;
    const touchees: Resource[] = nettoyerLesListes();
    // Une adresse de réception neuve attend sa confirmation : sa boîte reçoit
    // le lien (lib/optin.ts).
    demanderLesConfirmations();
    if (JSON.stringify(tagsRecus()) !== avant) {
      recontextualiserLesPostes();
      touchees.push("assets");
    }
    signalerEcriture(...touchees);
  });
  next();
};

export const boardContentRoutes = Router({ mergeParams: true });

boardContentRoutes.use(touch("board-widgets"), suivreLesListes);

boardContentRoutes.get("/sections", (req, res) => {
  const { board, owner } = structureOuverte((req.params as { id: string }).id, req.user);
  res.json(boardSections.all(board.id, owner));
});

boardContentRoutes.post("/sections", (req, res) => {
  const { board, owner } = structureOuverte((req.params as { id: string }).id, req.user);
  exigerStructure(req, owner);
  const unite = uniteLargeur(req.body.width_unit, "auto");
  const id = boardSections.create(
    board.id,
    owner,
    unite,
    valeurLargeur(unite, req.body.width_value),
    ecartColonnes(req.body.gap, SECTIONS_GAP_DEFAUT),
    rangDemande(req.body.index),
  );
  res.status(201).json(boardSections.byId(id));
});

boardContentRoutes.put("/sections/reorder", (req, res) => {
  const { board, owner } = structureOuverte((req.params as { id: string }).id, req.user);
  exigerStructure(req, owner);
  const ids = toIds(req.body.ids);
  const connues = boardSections.all(board.id, owner).map((s) => s.id);
  if (
    ids.length !== connues.length ||
    new Set(ids).size !== ids.length ||
    !connues.every((id) => ids.includes(id))
  ) {
    badRequest("La liste des identifiants ne correspond pas aux sections");
  }
  boardSections.ranger(ids);
  res.json(boardSections.all(board.id, owner));
});

/** Un objet simple, ou rien : ce qu'une disposition reçue peut porter. */
const objet = (valeur: unknown): Record<string, unknown> | null =>
  valeur && typeof valeur === "object" && !Array.isArray(valeur)
    ? (valeur as Record<string, unknown>)
    : null;

/**
 * La largeur et l'écart d'une section importée. Une disposition vient d'une
 * autre version, peut-être : ce qui ne se lit pas reprend la valeur par
 * défaut au lieu de refuser tout l'import.
 */
const sectionImportee = (recue: Record<string, unknown>) => {
  const unite = isSectionWidthUnit(recue.width_unit) ? recue.width_unit : "auto";
  const valeur = Number(recue.width_value);
  const lisible =
    unite !== "auto" && Number.isFinite(valeur) && valeur > 0 && (unite !== "percent" || valeur <= 100);
  const ecart = Number(recue.gap);
  return {
    unite: lisible ? unite : "auto",
    valeur: lisible ? valeur : null,
    ecart:
      recue.gap !== undefined && Number.isFinite(ecart) && ecart >= 0 && ecart <= SECTIONS_GAP_MAX
        ? Math.round(ecart)
        : SECTIONS_GAP_DEFAUT,
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
  const { board, owner } = structureOuverte((req.params as { id: string }).id, req.user);
  exigerStructure(req, owner);
  const corps = objet(req.body);
  if (!corps || corps.version !== 1 || !Array.isArray(corps.sections)) {
    badRequest("Disposition illisible");
  }
  let ecartes = 0;
  const clesPrises = new Set<string>();
  const sections = (corps!.sections as unknown[]).map((brute) => {
    const recue = objet(brute) ?? {};
    const widgets = (Array.isArray(recue.widgets) ? recue.widgets : []).flatMap((w: unknown) => {
      const widget = objet(w);
      const type = widget?.type;
      if (!isBoardWidgetType(type) || accesAuWidget(req, type) !== "update") {
        ecartes += 1;
        return [];
      }
      const config = objet(widget!.config) ?? {};
      if (!isListWidgetType(type)) return [{ type, config: JSON.stringify(config) }];
      const cle = cleDeListe(config);
      const tenue = cle !== "" && !clesPrises.has(cle) && cleDansLeTableau(board.id, type, cle) === cle;
      if (tenue) {
        clesPrises.add(cle);
        return [{ type, config: JSON.stringify(config) }];
      }
      const { [CLE_DE_LISTE]: _ancienne, ...reste } = config;
      return [{ type, config: avecCleNeuve(type, JSON.stringify(reste)) }];
    });
    return { ...sectionImportee(recue), widgets };
  });
  // Ce que le compte ne peut pas enlever reste — même ce qu'il ne voit pas.
  const gardes = boardWidgets
    .all(board.id, owner)
    .filter((w) => accesAuWidget(req, w.type) !== "update")
    .map((w) => w.id);
  boardSections.importer(board.id, owner, sections, gardes);
  const resultat: ResultatImport = {
    poses: sections.reduce((n, s) => n + s.widgets.length, 0),
    ecartes,
    gardes: gardes.length,
  };
  res.json(resultat);
});

boardContentRoutes.get("/widgets", (req, res) => {
  const { board, owner } = structureOuverte((req.params as { id: string }).id, req.user);
  res.json(lisibles(req, boardWidgets.all(board.id, owner)));
});

// --- Une section -------------------------------------------------------------

export const boardSectionRoutes = Router();

boardSectionRoutes.use(touch("board-widgets"), suivreLesListes);

boardSectionRoutes.put("/:id", (req, res) => {
  const { section: existing, owner } = sectionOuverte(req.params.id, req.user);
  exigerStructure(req, owner);
  const unite = uniteLargeur(req.body.width_unit, existing.width_unit);
  // Changer d'unité sans redire la valeur garderait l'ancienne, qui ne veut
  // plus rien dire : « 30 % » ne devient pas « 30 px ».
  const valeur = valeurLargeur(
    unite,
    req.body.width_value ?? (unite === existing.width_unit ? existing.width_value : undefined),
  );
  boardSections.update.run(unite, valeur, ecartColonnes(req.body.gap, existing.gap), existing.id);
  res.json(boardSections.byId(existing.id));
});

boardSectionRoutes.post("/:id/duplicate", (req, res) => {
  const { section: existing, owner } = sectionOuverte(req.params.id, req.user);
  exigerStructure(req, owner);
  res.status(201).json(boardSections.byId(boardSections.duplicate(existing)));
});

boardSectionRoutes.delete("/:id", (req, res) => {
  const { section: existing, owner } = sectionOuverte(req.params.id, req.user);
  exigerStructure(req, owner);
  // Ce qu'elle portait part avec elle, par clé étrangère.
  boardSections.remove.run(existing.id);
  res.status(204).end();
});

// --- Un widget ---------------------------------------------------------------

export const boardWidgetRoutes = Router();

boardWidgetRoutes.use(touch("board-widgets"), suivreLesListes);

/**
 * Ranger les widgets d'une section. Le corps donne la section et, dans
 * l'ordre, tout ce qu'elle porte désormais : un widget venu d'une autre
 * section de la même structure y est admis, c'est ainsi qu'on le déplace.
 * Déclaré avant « /:id », sinon « reorder » serait pris pour un identifiant.
 */
boardWidgetRoutes.put("/reorder", (req, res) => {
  const { section, board, owner } = sectionOuverte(req.body.section_id, req.user);
  exigerStructure(req, owner);
  const ids = toIds(req.body.ids);
  // Seuls se rangent les widgets que le compte voit, de la même structure.
  const connus = new Set(lisibles(req, boardWidgets.all(board.id, owner)).map((w) => w.id));
  if (ids.length !== new Set(ids).size || ids.some((id) => !connus.has(id))) {
    badRequest("La liste des identifiants ne correspond pas aux widgets");
  }
  boardWidgets.ranger(section.id, ids);
  res.json(lisibles(req, boardWidgets.all(board.id, owner)));
});

boardWidgetRoutes.post("/", (req, res) => {
  const { section } = sectionOuverte(req.body.section_id, req.user);
  const type: unknown = req.body.type;
  if (!isBoardWidgetType(type)) badRequest("Widget inconnu");
  exigerWidget(req, type as string, "update");
  // Un widget de liste reçoit sa clé ici, neuve : celle d'une configuration
  // recopiée d'ailleurs ne vaut pas (repositories/listes.ts).
  const id = boardWidgets.create(section.id, type as string, configuration(req.body.config, "{}"));
  // Un widget de projets pose le type de jalons « Défaut », que ses projets
  // reçoivent à leur création.
  if ((type as string).startsWith("project.") && assurerTypeParDefaut()) {
    touchNow(res, "lookups", "projects");
  }
  res.status(201).json(widgetRendu(boardWidgets.byId(id)!));
});

// Le type d'un widget ne se change pas : ce serait un autre widget. Seule sa
// configuration bouge — sauf entre la catégorie et la sous-catégorie, qui
// partagent la leur.
boardWidgetRoutes.put("/:id", (req, res) => {
  const { widget } = widgetOuvert(req.params.id, req);
  if (req.body.type !== undefined && req.body.type !== widget.type) {
    if (CONVERSIONS[widget.type] !== req.body.type) {
      badRequest("Ce widget ne se convertit pas en ce type");
    }
    boardWidgets.convertir.run(req.body.type, widget.id);
  }
  boardWidgets.update.run(
    garderLaCle(widget.type, widget.config, configuration(req.body.config, widget.config)),
    widget.id,
  );
  res.json(widgetRendu(boardWidgets.byId(widget.id)!));
});

boardWidgetRoutes.post("/:id/duplicate", (req, res) => {
  const { widget } = widgetOuvert(req.params.id, req);
  // Un widget de liste possède ses éléments : il ne se duplique pas.
  if (isListWidgetType(widget.type)) badRequest("Ce widget ne se duplique pas");
  res.status(201).json(widgetRendu(boardWidgets.byId(boardWidgets.duplicate(widget))!));
});

boardWidgetRoutes.delete("/:id", (req, res) => {
  const { widget } = widgetOuvert(req.params.id, req);
  boardWidgets.remove.run(widget.id);
  res.status(204).end();
});

/**
 * Ce que donne une adresse de flux, pour le tiroir d'un widget RSS : la
 * source est-elle joignable, et dans quel format répond-elle ? Déclaré comme
 * « /weather/places » : « feed » n'est pas un identifiant.
 */
boardWidgetRoutes.get("/feed/probe", (req, res, next) => {
  exigerWidget(req, "rss", "update");
  sonderFlux(String(req.query["url"] ?? "").trim())
    .then((sonde) => res.json(sonde))
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
  const { widget } = widgetOuvert(req.params.id, req);
  if (widget.type !== "rss") badRequest("Ce widget n'est pas un flux RSS");
  fluxDe(reglagesFlux(widgetRendu(widget).config))
    .then((flux) => res.json(flux))
    .catch(next);
});

/**
 * Les lieux qui répondent à ce qu'on tape, pour régler un widget Météo.
 * Déclaré comme « /:id/… » le serait : « weather » n'est pas un identifiant,
 * mais aucune route « GET /:id/places » ne vient le lui disputer.
 */
boardWidgetRoutes.get("/weather/places", (req, res, next) => {
  exigerWidget(req, "weather", "update");
  chercherUnLieu(String(req.query["q"] ?? ""))
    .then((lieux) => res.json(lieux))
    .catch(next);
});

/** La météo du lieu d'un widget Météo (lib/meteo.ts), gardée un quart d'heure par le serveur. */
boardWidgetRoutes.get("/:id/weather", (req, res, next) => {
  const { widget } = widgetOuvert(req.params.id, req);
  if (widget.type !== "weather") badRequest("Ce widget n'est pas un widget Météo");
  const lieu = coordonneesMeteo(widgetRendu(widget).config);
  if (!lieu) badRequest("Choisissez un lieu dans le réglage du widget");
  meteoDe(lieu!.latitude, lieu!.longitude)
    .then((meteo) => res.json(meteo))
    .catch(next);
});

/** La période la plus longue qu'un calendrier demande : six semaines, et de la marge. */
const PERIODE_MAX = 62 * 24 * 60 * 60 * 1000;

/**
 * Les rendez-vous de qui regarde, entre « start » et « end » : chacun voit
 * les siens, quel que soit le tableau. Ils viennent de son agenda Outlook,
 * par Graph (lib/entra.ts) ; un compte local n'en a pas.
 */
boardWidgetRoutes.get("/:id/calendar", (req, res, next) => {
  const { widget } = widgetOuvert(req.params.id, req);
  if (widget.type !== "calendar") badRequest("Ce widget n'est pas un calendrier");
  const debut = new Date(String(req.query["start"] ?? ""));
  const fin = new Date(String(req.query["end"] ?? ""));
  if (Number.isNaN(debut.getTime()) || Number.isNaN(fin.getTime()) || fin <= debut) {
    badRequest("Période invalide");
  }
  if (fin.getTime() - debut.getTime() > PERIODE_MAX) badRequest("Période trop longue");
  agendaEntra(compteEntra(req), debut, fin)
    .then((rendezVous) => res.json(rendezVous))
    .catch(next);
});

/**
 * Le compte Entra de qui regarde : le widget Mail et le Calendrier ne
 * montrent que ce qui est à lui.
 */
const compteEntra = (req: Request): string => {
  if (!entraConfiguree()) badRequest("Milo n'est pas connecté à Entra");
  if (!req.user.entra_id) badRequest("Votre compte n'est pas relié à Entra");
  return req.user.entra_id;
};

/** Le widget Mail visé, et le compte dont il lit la boîte. */
const boiteOuverte = (req: Request) => {
  const { widget } = widgetOuvert(req.params.id, req);
  if (widget.type !== "mail") badRequest("Ce widget n'est pas un widget Mail");
  return compteEntra(req);
};

/** Au plus, les e-mails d'une page : Graph n'en rend pas davantage d'un coup. */
const PAGE_MAX = 100;

/**
 * Une page de la boîte de réception de qui regarde (lib/entra.ts) : chacun
 * voit la sienne, quel que soit le tableau. « skip » dit où elle commence —
 * la grille demande la suivante quand on arrive au bas de la liste.
 */
boardWidgetRoutes.get("/:id/mails", (req, res, next) => {
  const oid = boiteOuverte(req);
  const decalage = Math.max(0, Math.floor(Number(req.query["skip"]) || 0));
  const combien = Math.min(PAGE_MAX, Math.max(1, Math.floor(Number(req.query["top"]) || 10)));
  pageDeLaBoite(oid, decalage, combien, req.query["unread"] === "1")
    .then((page) => res.json(page))
    .catch(next);
});

/** Un e-mail de la boîte, son corps nettoyé comme celui d'une demande reçue (lib/html.ts). */
boardWidgetRoutes.get("/:id/mails/:mail", (req, res, next) => {
  const oid = boiteOuverte(req);
  courrierDeLaBoite(oid, String(req.params.mail))
    .then((c) => {
      const detail: AccessMailDetail = {
        ...c.entete,
        to: c.to,
        cc: c.cc,
        html: emailPropre(c.body, c.body_type, c.images),
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
boardWidgetRoutes.get("/:id/mails/:mail/attachments/:piece", (req, res, next) => {
  const oid = boiteOuverte(req);
  pieceDeLaBoite(oid, String(req.params.mail), String(req.params.piece))
    .then(({ name, contenu }) => {
      res.type("application/octet-stream");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(name)}`);
      res.send(contenu);
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
  express.raw({ type: () => true, limit: TAILLE_MAX }),
  (req, res) => {
    exigerWidget(req, "image", "update");
    const contenu: unknown = req.body;
    if (!Buffer.isBuffer(contenu) || contenu.length === 0) badRequest("Fichier vide");
    const nom = String(req.query["name"] ?? "")
      .split(/[/\\]/)
      .pop()!
      .trim()
      .slice(0, 255);
    if (!(typeEnLigne(nom) ?? "").startsWith("image/")) badRequest("Ce format d'image n'est pas pris en charge");
    res.status(201).json({ url: urlMedia(ecrireMedia(contenu as Buffer, nom)) });
  },
);
