// The Assets mode: the workstations, and the door through which inventory
// agents drop them off.
//
// Two routers, because two audiences: "inventoryRoutes" is open, since an
// agent has no session — it is a service running on a workstation, not
// someone signing in; "managedDeviceAssetRoutes" sits behind the session, like the rest of
// the API.
//
// The dialogue is OCS's, which FusionInventory and GLPI Agent both speak: the
// agent announces itself (PROLOG), the server tells it to send, the agent
// sends its inventory (INVENTORY), the server acknowledges. Nothing else is
// expected of it.

import express, { Router } from "express";
import type { Request } from "express";
import { HttpError, badRequest, notFound, orNotFound } from "../lib/http.js";
import { require, requestCan } from "../lib/rights.js";
import { endOfSupport } from "../lib/endoflife.js";
import { decompress, readXml, textOf } from "../lib/inventory.js";
import { parisTime, now } from "../lib/time.js";
import { touch } from "../middleware/events.js";
import {
  WORKSTATION_NOT_FOUND,
  managedDeviceAssetDetail,
  managedDeviceAssetOf,
  assets,
  contentUser,
} from "../repositories/managed-device-assets.js";
import { readableBoard, boards, openBoard } from "../repositories/boards.js";
import { tagInbox, widgetInbox } from "../repositories/inboxes.js";

/**
 * A workstation inventory weighs a few hundred kilobytes — six hundred
 * software entries, each with its version and date. Compressed it is a tenth
 * of that, but the agent doesn't always compress: the limit applies to the
 * body as it arrives.
 */
const SIZE_MAX = "20mb";

/** The body is XML, sometimes compressed: we take it raw, whatever it claims. */
const agentBody = express.raw({ type: () => true, limit: SIZE_MAX });

const header = '<?xml version="1.0" encoding="UTF-8"?>';

/**
 * The reply to PROLOG: "send". "PROLOG_FREQ" says after how many hours the
 * agent must show up again — it keeps to that on its own, with nothing
 * calling it back.
 */
const RESPONSE_PROLOG = `${header}\n<REPLY>\n  <PROLOG_FREQ>24</PROLOG_FREQ>\n  <RESPONSE>SEND</RESPONSE>\n</REPLY>`;

/** The reply to a received inventory: nothing to add. */
const EMPTY_RESPONSE = `${header}\n<REPLY></REPLY>`;

const respond = (res: express.Response, xml: string) =>
  res.type("application/xml").send(xml);

export const inventoryRoutes = Router();

inventoryRoutes.use(touch("managed-device-assets"));

/**
 * Dropping off an inventory. An agent showing up for the first time creates
 * the workstation; later submissions replace it — it is a state, not a log:
 * we want to know what the machine is today, not what it used to be.
 */
inventoryRoutes.post(["/", "/:widget"], agentBody, (req: Request, res) => {
  // An agent given a widget's address — its reference, "6WF6" — files there,
  // whatever its tag; one given "/api/inventory" alone, by its tag.
  const widget = typeof req.params.widget === "string" ? req.params.widget : "";
  const widgetList = widget ? widgetInbox(widget) : null;
  if (widget && !widgetList) notFound("Widget introuvable");

  const body: unknown = req.body;
  if (!Buffer.isBuffer(body) || body.length === 0) badRequest("Inventaire vide");

  let tree;
  try {
    tree = readXml(decompress(body as Buffer));
  } catch {
    badRequest("Inventaire illisible");
    return;
  }

  const query = tree.REQUEST;
  const deviceid = textOf(query, "DEVICEID");
  if (!deviceid) badRequest("DEVICEID manquant");

  // First step of the dialogue: the agent announces itself and asks whether
  // it should send. Nothing has arrived yet, so nothing is recorded.
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

  // The name the machine gives itself. Failing that, its agent id: a row
  // with nothing in the list's only column could not be clicked.
  const name = textOf(content, "HARDWARE", "NAME") || deviceid;

  // The tag passed to the agent ("tag" option) travels in ACCOUNTINFO, under
  // the "TAG" key. It is the only place where the agent can carry something
  // from Milo: so it is what names the company.
  const infoItems = content.ACCOUNTINFO;
  const rows = Array.isArray(infoItems) ? infoItems : infoItems ? [infoItems] : [];
  const tag = rows
    .map((row) => (textOf(row, "KEYNAME") === "TAG" ? textOf(row, "KEYVALUE") : ""))
    .find((value) => value !== "") ?? "";

  // The time the agent made its round of the machine (ACCESSLOG/LOGDATE),
  // rather than the time the submission arrived: an agent that could not
  // reach the server later sends an inventory that is already a few hours
  // old. It is in the workstation's local time, assumed to be Paris time.
  const timestamp = parisTime(textOf(content, "ACCESSLOG", "LOGDATE")) ?? now();
  const existing = assets.byDeviceId.get(deviceid);
  // The workstation list that receives its tag.
  const inbox = widgetList ?? tagInbox(tag);
  const json = JSON.stringify(content);
  const user = contentUser(content);

  if (existing) {
    assets.update.run(
      name,
      tag,
      inbox?.board_id ?? null,
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
      inbox?.list ?? "",
      json,
      user,
      timestamp,
      timestamp,
    );
  }

  respond(res, EMPTY_RESPONSE);
});

// --- What the client reads ---------------------------------------------------

export const managedDeviceAssetRoutes = Router();

managedDeviceAssetRoutes.use(touch("managed-device-assets"));

/** The workstation, if the user sees the assets and its board. */
const visibleWorkstation = (req: Request, id: unknown) => {
  const workstation = orNotFound(assets.byId.get(id), WORKSTATION_NOT_FOUND);
  require(req, "assets", "view", WORKSTATION_NOT_FOUND);
  if (!readableBoard(boards.byId.get(workstation.board_id), req.user)) notFound(WORKSTATION_NOT_FOUND);
  return workstation;
};

/**
 * The workstations of a board. A workstation whose tag no asset label names
 * shows up nowhere.
 */
managedDeviceAssetRoutes.get("/", (req, res) => {
  if (!requestCan(req, "assets", "view")) return void res.json([]);
  const board = openBoard(req.query.board, req.user);
  res.json(assets.ofBoard.all(board.id).map((row) => managedDeviceAssetOf(row)));
});

/**
 * An opened workstation, with the end of support of its system. It comes
 * from endoflife.date, hence the wait — and "next", which Express 4 requires
 * for an async function. It never makes the detail view fail: without it,
 * the workstation still opens.
 */
managedDeviceAssetRoutes.get("/:id", (req, res, next) => {
  const detail = managedDeviceAssetDetail(visibleWorkstation(req, req.params.id));
  endOfSupport(detail.os)
    .then((support) => res.json({ ...detail, support }))
    .catch(next);
});

/**
 * The agent's embedded server, and the time we give it to answer. The port
 * is the one the agent listens on by default ("httpd-port" option); five
 * seconds are enough — the agent acknowledges right away, while the
 * inventory goes off behind and will arrive through the usual door.
 */
const PORT_AGENT = 62354;
const AGENT_TIMEOUT = 5_000;

/**
 * "Inventory yourself now." The agent simply brings its next appointment
 * forward: it redoes its round of the machine and sends the result back to
 * "/api/inventory", as it would have done on its own a few hours later.
 * Nothing comes back through here — hence the three refusals, each saying
 * what to fix.
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

  // The agent only answers "now" to the addresses it was designated.
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
 * Ask again for a workstation's inventory, without waiting for its next
 * visit.
 *
 * The synchronous part throws as everywhere else; what follows the wait goes
 * through "next", because Express 4 does not catch rejections from an async
 * function — the rest of the server is synchronous and has no such issue.
 */
managedDeviceAssetRoutes.post("/:id/refresh", (req, res, next) => {
  const workstation = visibleWorkstation(req, req.params.id);
  const { address } = managedDeviceAssetDetail(workstation);
  if (!address) {
    badRequest("Aucune adresse connue pour ce poste : son inventaire n'en déclare aucune.");
  }

  requestInventory(address)
    .then(() => res.json({ address }))
    .catch(next);
});

/** A workstation that no longer exists: the only action we have on it. */
managedDeviceAssetRoutes.delete("/:id", (req, res) => {
  assets.remove.run(visibleWorkstation(req, req.params.id).id);
  res.status(204).end();
});
