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
import { exiger, peut } from "../lib/droits.js";
import { finDeSupport } from "../lib/endoflife.js";
import { decompresser, lireXml, texteDe } from "../lib/inventory.js";
import { heureDeParis, now } from "../lib/time.js";
import { touch } from "../middleware/events.js";
import {
  POSTE_INTROUVABLE,
  assetDetail,
  assetOf,
  assets,
  utilisateurDuContenu,
} from "../repositories/assets.js";
import { boardLisible, boards, tableauOuvert } from "../repositories/boards.js";
import { contexteDuTableau } from "../repositories/contexts.js";
import { receptionDuTag } from "../repositories/receptions.js";

/**
 * Un inventaire de poste pèse quelques centaines de kilo-octets — six cents
 * logiciels, chacun avec sa version et sa date. Compressé il en fait le
 * dixième, mais l'agent ne comprime pas toujours : la limite vaut pour le
 * corps tel qu'il arrive.
 */
const TAILLE_MAX = "20mb";

/** Le corps est du XML, parfois compressé : on le prend brut, quoi qu'il annonce. */
const corpsAgent = express.raw({ type: () => true, limit: TAILLE_MAX });

const entete = '<?xml version="1.0" encoding="UTF-8"?>';

/**
 * La réponse au PROLOG : « envoie ». « PROLOG_FREQ » dit au bout de combien
 * d'heures l'agent doit se représenter — il s'y tient de lui-même, sans que
 * rien ne le rappelle.
 */
const REPONSE_PROLOG = `${entete}\n<REPLY>\n  <PROLOG_FREQ>24</PROLOG_FREQ>\n  <RESPONSE>SEND</RESPONSE>\n</REPLY>`;

/** La réponse à un inventaire reçu : rien à redire. */
const REPONSE_VIDE = `${entete}\n<REPLY></REPLY>`;

const repondre = (res: express.Response, xml: string) =>
  res.type("application/xml").send(xml);

export const inventoryRoutes = Router();

inventoryRoutes.use(touch("assets"));

/**
 * Le dépôt d'un inventaire. Un agent qui se présente pour la première fois
 * crée le poste ; les envois suivants le remplacent — c'est un état, pas un
 * journal : on veut savoir ce qu'est la machine aujourd'hui, pas ce qu'elle
 * était.
 */
inventoryRoutes.post("/", corpsAgent, (req: Request, res) => {
  const corps: unknown = req.body;
  if (!Buffer.isBuffer(corps) || corps.length === 0) badRequest("Inventaire vide");

  let arbre;
  try {
    arbre = lireXml(decompresser(corps as Buffer));
  } catch {
    badRequest("Inventaire illisible");
    return;
  }

  const requete = arbre.REQUEST;
  const deviceid = texteDe(requete, "DEVICEID");
  if (!deviceid) badRequest("DEVICEID manquant");

  // Premier temps du dialogue : l'agent s'annonce et demande s'il doit
  // envoyer. Rien n'est encore arrivé, rien n'est donc enregistré.
  if (texteDe(requete, "QUERY") === "PROLOG") {
    repondre(res, REPONSE_PROLOG);
    return;
  }

  const contenu =
    requete !== undefined && typeof requete !== "string" && !Array.isArray(requete)
      ? requete.CONTENT
      : undefined;
  if (!contenu || typeof contenu === "string" || Array.isArray(contenu)) {
    badRequest("CONTENT manquant");
    return;
  }

  // Le nom que la machine se donne. À défaut, son identifiant d'agent : une
  // ligne sans rien dans la seule colonne de la liste ne se cliquerait pas.
  const name = texteDe(contenu, "HARDWARE", "NAME") || deviceid;

  // Le tag passé à l'agent (option « tag ») voyage dans ACCOUNTINFO, sous la
  // clé « TAG ». C'est le seul endroit où l'agent peut porter quelque chose de
  // Milo : c'est donc lui qui dit la société.
  const infos = contenu.ACCOUNTINFO;
  const lignes = Array.isArray(infos) ? infos : infos ? [infos] : [];
  const tag = lignes
    .map((ligne) => (texteDe(ligne, "KEYNAME") === "TAG" ? texteDe(ligne, "KEYVALUE") : ""))
    .find((valeur) => valeur !== "") ?? "";

  // L'heure où l'agent a fait son tour de machine (ACCESSLOG/LOGDATE), plutôt
  // que celle où l'envoi est arrivé : un agent qui n'a pas pu joindre le
  // serveur renvoie plus tard un inventaire qui a déjà quelques heures. Elle
  // est à l'heure du poste, qu'on suppose être celle de Paris.
  const horodatage = heureDeParis(texteDe(contenu, "ACCESSLOG", "LOGDATE")) ?? now();
  const existant = assets.byDeviceId.get(deviceid);
  // La liste de postes qui reçoit son tag, et le contexte qu'elle lui donne.
  const reception = receptionDuTag(tag);
  const json = JSON.stringify(contenu);
  const utilisateur = utilisateurDuContenu(contenu);

  if (existant) {
    assets.update.run(
      name,
      tag,
      reception?.board_id ?? null,
      reception?.context_id ?? null,
      reception?.liste ?? "",
      json,
      utilisateur,
      horodatage,
      existant.id,
    );
  } else {
    assets.create.run(
      deviceid,
      name,
      tag,
      reception?.board_id ?? null,
      reception?.context_id ?? null,
      reception?.liste ?? "",
      json,
      utilisateur,
      horodatage,
      horodatage,
    );
  }

  repondre(res, REPONSE_VIDE);
});

// --- Ce que le client lit ---------------------------------------------------

export const assetRoutes = Router();

assetRoutes.use(touch("assets"));

/** Le poste, si l'on voit les assets et le tableau de son contexte. */
const posteVisible = (req: Request, id: unknown) => {
  const poste = orNotFound(assets.byId.get(id), POSTE_INTROUVABLE);
  exiger(req, "assets", "view", POSTE_INTROUVABLE);
  if (!boardLisible(boards.byId.get(poste.board_id), req.user)) notFound(POSTE_INTROUVABLE);
  return poste;
};

/**
 * Les postes d'un tableau : de l'un de ses contextes, ou de tous. Un poste
 * dont le tag n'est reçu par aucune liste ne se montre nulle part.
 */
assetRoutes.get("/", (req, res) => {
  if (!peut(req, "assets", "view")) return void res.json([]);
  const board = tableauOuvert(req.query.board, req.user);
  const contexte = req.query.context;
  res.json(
    assets.ofBoard
      .all({
        board: board.id,
        context: contexte && contexte !== "all" ? contexteDuTableau(board.id, contexte) : null,
      })
      .map((ligne) => assetOf(ligne)),
  );
});

/**
 * Un poste ouvert, avec la fin de support de son système. Elle vient
 * d'endoflife.date, d'où l'attente — et « next », qu'Express 4 demande pour
 * une fonction asynchrone. Elle ne fait jamais échouer la fiche : sans elle,
 * le poste s'ouvre quand même.
 */
assetRoutes.get("/:id", (req, res, next) => {
  const detail = assetDetail(posteVisible(req, req.params.id));
  finDeSupport(detail.os)
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
const DELAI_AGENT = 5_000;

/**
 * « Inventorie-toi maintenant. » L'agent avance simplement son prochain
 * rendez-vous : il recommence son tour de machine et renvoie le résultat à
 * « /api/inventory », comme il l'aurait fait de lui-même quelques heures plus
 * tard. Rien ne revient par ici — d'où les trois refus, qui disent chacun quoi
 * corriger.
 */
const demanderInventaire = async (adresse: string): Promise<void> => {
  const url = `http://${adresse}:${PORT_AGENT}/now`;

  let reponse: Awaited<ReturnType<typeof fetch>>;
  try {
    reponse = await fetch(url, { signal: AbortSignal.timeout(DELAI_AGENT) });
  } catch {
    throw new HttpError(
      502,
      `Agent injoignable sur ${adresse}:${PORT_AGENT}. Le poste est-il allumé, `
        + `et son serveur embarqué actif (no-httpd = 0) ?`,
    );
  }

  // L'agent ne répond « maintenant » qu'aux adresses qu'on lui a désignées.
  if (reponse.status === 403) {
    throw new HttpError(
      403,
      `L'agent de ${adresse} refuse la demande : l'adresse de ce serveur doit `
        + `figurer dans son option « httpd-trust ».`,
    );
  }
  if (!reponse.ok) {
    throw new HttpError(502, `L'agent de ${adresse} a répondu ${reponse.status}.`);
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
  const poste = posteVisible(req, req.params.id);
  const { address } = assetDetail(poste);
  if (!address) {
    badRequest("Aucune adresse connue pour ce poste : son inventaire n'en déclare aucune.");
  }

  demanderInventaire(address)
    .then(() => res.json({ address }))
    .catch(next);
});

/** Un poste qui n'existe plus : c'est le seul geste qu'on ait sur lui. */
assetRoutes.delete("/:id", (req, res) => {
  assets.remove.run(posteVisible(req, req.params.id).id);
  res.status(204).end();
});
