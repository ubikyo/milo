// Le mode Assets : les postes, et la porte par laquelle les agents
// d'inventaire les déposent.
//
// Deux routeurs, parce que deux publics : « inventoryRoutes » est ouverte, car
// un agent n'a pas de session — c'est un service qui tourne sur un poste, pas
// quelqu'un qui se connecte ; « assetRoutes » est derrière la session, comme
// tout le reste de l'API.
//
// Le dialogue est celui d'OCS, que FusionInventory et GLPI Agent parlent tous
// les deux : l'agent annonce sa venue (PROLOG), le serveur lui dit d'envoyer,
// l'agent envoie son inventaire (INVENTORY), le serveur accuse réception. Rien
// d'autre n'est attendu de lui.

import express, { Router } from "express";
import type { Request } from "express";
import { HttpError, badRequest, notFound, orNotFound } from "../lib/http.js";
import { require, requestCan } from "../lib/rights.js";
import { endOfSupport } from "../lib/endoflife.js";
import { decompresser, readXml, textOf } from "../lib/inventory.js";
import { parisTime, now } from "../lib/time.js";
import { touch } from "../middleware/events.js";
import {
  WORKSTATION_NOT_FOUND,
  assetDetail,
  assetOf,
  assets,
  contentUser,
} from "../repositories/assets.js";
import { readableBoard, boards, openBoard } from "../repositories/boards.js";
import { boardContext } from "../repositories/contexts.js";
import { tagInbox } from "../repositories/inboxes.js";

/**
 * Un inventaire de poste pèse quelques centaines de kilo-octets — six cents
 * logiciels, chacun avec sa version et sa date. Compressé il en fait le
 * dixième, mais l'agent ne comprime pas toujours : la limite vaut pour le
 * corps tel qu'il arrive.
 */
const SIZE_MAX = "20mb";

/** Le corps est du XML, parfois compressé : on le prend brut, quoi qu'il annonce. */
const agentBody = express.raw({ type: () => true, limit: SIZE_MAX });

const header = '<?xml version="1.0" encoding="UTF-8"?>';

/**
 * La réponse au PROLOG : « envoie ». « PROLOG_FREQ » dit au bout de combien
 * d'heures l'agent doit se représenter — il s'y tient de lui-même, sans que
 * rien ne le rappelle.
 */
const RESPONSE_PROLOG = `${header}\n<REPLY>\n  <PROLOG_FREQ>24</PROLOG_FREQ>\n  <RESPONSE>SEND</RESPONSE>\n</REPLY>`;

/** La réponse à un inventaire reçu : rien à redire. */
const EMPTY_RESPONSE = `${header}\n<REPLY></REPLY>`;

const respond = (res: express.Response, xml: string) =>
  res.type("application/xml").send(xml);

export const inventoryRoutes = Router();

inventoryRoutes.use(touch("assets"));

/**
 * Le dépôt d'un inventaire. Un agent qui se présente pour la première fois
 * crée le poste ; les envois suivants le remplacent — c'est un état, pas un
 * journal : on veut savoir ce qu'est la machine aujourd'hui, pas ce qu'elle
 * était.
 */
inventoryRoutes.post("/", agentBody, (req: Request, res) => {
  const body: unknown = req.body;
  if (!Buffer.isBuffer(body) || body.length === 0) badRequest("Inventaire vide");

  let tree;
  try {
    tree = readXml(decompresser(body as Buffer));
  } catch {
    badRequest("Inventaire illisible");
    return;
  }

  const query = tree.REQUEST;
  const deviceid = textOf(query, "DEVICEID");
  if (!deviceid) badRequest("DEVICEID manquant");

  // Premier temps du dialogue : l'agent s'annonce et demande s'il doit
  // envoyer. Rien n'est encore arrivé, rien n'est donc enregistré.
  if (textOf(query, "QUERY") === "PROLOG") {
    respond(res, RESPONSE_PROLOG);
    return;
  }

  const content =
    query !== undefined && typeof query !== "string" && !Array.isArray(query)
      ? query.CONTENT
      : undefined;
  if (!content || typeof content === "string" || Array.isArray(content)) {
    badRequest("CONTENT manquant");
    return;
  }

  // Le nom que la machine se donne. À défaut, son identifiant d'agent : une
  // ligne sans rien dans la seule colonne de la liste ne se cliquerait pas.
  const name = textOf(content, "HARDWARE", "NAME") || deviceid;

  // Le tag passé à l'agent (option « tag ») voyage dans ACCOUNTINFO, sous la
  // clé « TAG ». C'est le seul endroit où l'agent peut porter quelque chose de
  // Milo : c'est donc lui qui dit la société.
  const infoItems = content.ACCOUNTINFO;
  const rows = Array.isArray(infoItems) ? infoItems : infoItems ? [infoItems] : [];
  const tag = rows
    .map((row) => (textOf(row, "KEYNAME") === "TAG" ? textOf(row, "KEYVALUE") : ""))
    .find((value) => value !== "") ?? "";

  // L'heure où l'agent a fait son tour de machine (ACCESSLOG/LOGDATE), plutôt
  // que celle où l'envoi est arrivé : un agent qui n'a pas pu joindre le
  // serveur renvoie plus tard un inventaire qui a déjà quelques heures. Elle
  // est à l'heure du poste, qu'on suppose être celle de Paris.
  const timestamp = parisTime(textOf(content, "ACCESSLOG", "LOGDATE")) ?? now();
  const existing = assets.byDeviceId.get(deviceid);
  // La liste de postes qui reçoit son tag, et le contexte qu'elle lui donne.
  const inbox = tagInbox(tag);
  const json = JSON.stringify(content);
  const user = contentUser(content);

  if (existing) {
    assets.update.run(
      name,
      tag,
      inbox?.board_id ?? null,
      inbox?.context_id ?? null,
      inbox?.list ?? "",
      json,
      user,
      timestamp,
      existing.id,
    );
  } else {
    assets.create.run(
      deviceid,
      name,
      tag,
      inbox?.board_id ?? null,
      inbox?.context_id ?? null,
      inbox?.list ?? "",
      json,
      user,
      timestamp,
      timestamp,
    );
  }

  respond(res, EMPTY_RESPONSE);
});

// --- Ce que le client lit ---------------------------------------------------

export const assetRoutes = Router();

assetRoutes.use(touch("assets"));

/** Le poste, si l'on voit les assets et le tableau de son contexte. */
const visibleWorkstation = (req: Request, id: unknown) => {
  const workstation = orNotFound(assets.byId.get(id), WORKSTATION_NOT_FOUND);
  require(req, "assets", "view", WORKSTATION_NOT_FOUND);
  if (!readableBoard(boards.byId.get(workstation.board_id), req.user)) notFound(WORKSTATION_NOT_FOUND);
  return workstation;
};

/**
 * Les postes d'un tableau : de l'un de ses contextes, ou de tous. Un poste
 * dont le tag n'est reçu par aucune liste ne se montre nulle part.
 */
assetRoutes.get("/", (req, res) => {
  if (!requestCan(req, "assets", "view")) return void res.json([]);
  const board = openBoard(req.query.board, req.user);
  const context = req.query.context;
  res.json(
    assets.ofBoard
      .all({
        board: board.id,
        context: context && context !== "all" ? boardContext(board.id, context) : null,
      })
      .map((row) => assetOf(row)),
  );
});

/**
 * Un poste ouvert, avec la fin de support de son système. Elle vient
 * d'endoflife.date, d'où l'attente — et « next », qu'Express 4 demande pour
 * une fonction asynchrone. Elle ne fait jamais échouer la fiche : sans elle,
 * le poste s'ouvre quand même.
 */
assetRoutes.get("/:id", (req, res, next) => {
  const detail = assetDetail(visibleWorkstation(req, req.params.id));
  endOfSupport(detail.os)
    .then((support) => res.json({ ...detail, support }))
    .catch(next);
});

/**
 * Le serveur embarqué de l'agent, et le temps qu'on lui laisse pour répondre.
 * Le port est celui que l'agent écoute par défaut (option « httpd-port ») ;
 * cinq secondes suffisent — l'agent accuse réception tout de suite, l'
 * inventaire, lui, repart derrière et arrivera par la porte habituelle.
 */
const PORT_AGENT = 62354;
const AGENT_TIMEOUT = 5_000;

/**
 * « Inventorie-toi maintenant. » L'agent avance simplement son prochain
 * rendez-vous : il recommence son tour de machine et renvoie le résultat à
 * « /api/inventory », comme il l'aurait fait de lui-même quelques heures plus
 * tard. Rien ne revient par ici — d'où les trois refus, qui disent chacun quoi
 * corriger.
 */
const requestInventory = async (address: string): Promise<void> => {
  const url = `http://${address}:${PORT_AGENT}/now`;

  let response: Awaited<ReturnType<typeof fetch>>;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(AGENT_TIMEOUT) });
  } catch {
    throw new HttpError(
      502,
      `Agent injoignable sur ${address}:${PORT_AGENT}. Le poste est-il allumé, `
        + `et son serveur embarqué actif (no-httpd = 0) ?`,
    );
  }

  // L'agent ne répond « maintenant » qu'aux adresses qu'on lui a désignées.
  if (response.status === 403) {
    throw new HttpError(
      403,
      `L'agent de ${address} refuse la demande : l'adresse de ce serveur doit `
        + `figurer dans son option « httpd-trust ».`,
    );
  }
  if (!response.ok) {
    throw new HttpError(502, `L'agent de ${address} a répondu ${response.status}.`);
  }
};

/**
 * Redemander l'inventaire d'un poste, sans attendre son prochain passage.
 *
 * La partie synchrone lève comme partout ailleurs ; ce qui suit l'attente
 * passe par « next », car Express 4 ne rattrape pas les rejets d'une fonction
 * asynchrone — le reste du serveur, lui, est synchrone et n'a pas ce souci.
 */
assetRoutes.post("/:id/refresh", (req, res, next) => {
  const workstation = visibleWorkstation(req, req.params.id);
  const { address } = assetDetail(workstation);
  if (!address) {
    badRequest("Aucune adresse connue pour ce poste : son inventaire n'en déclare aucune.");
  }

  requestInventory(address)
    .then(() => res.json({ address }))
    .catch(next);
});

/** Un poste qui n'existe plus : c'est le seul geste qu'on ait sur lui. */
assetRoutes.delete("/:id", (req, res) => {
  assets.remove.run(visibleWorkstation(req, req.params.id).id);
  res.status(204).end();
});
