// The settings of an Asset widget: the models table (see
// lib/asset-models.ts) and the VLAN table (lib/asset-vlans.ts). They are not
// its configuration but its own data (ListScope), as its asset labels. Like
// those, they follow the permission on the Asset widget type.

import { Router } from "express";
import type { Request } from "express";
import {
  MANAGED_DEVICE_ASSET_MODEL_MAX,
  VLAN_MAX,
  VLAN_MIN,
  VLAN_NAME_MAX,
  accessIncludes,
} from "@milo/shared";
import type {
  ManagedDeviceAssetModel,
  ManagedDeviceAssetSettings,
  ManagedDeviceAssetVlan,
} from "@milo/shared";
import { saveTemplates, templates } from "../lib/managed-device-asset-models.js";
import { saveVlans, vlans } from "../lib/managed-device-asset-vlans.js";
import { HttpError, badRequest } from "../lib/http.js";
import { touchNow } from "../middleware/events.js";
import { openBoard, requireBoardControl } from "../repositories/boards.js";
import { listInBoard } from "../repositories/lists.js";
import type { ListScope } from "../repositories/lists.js";
import { widgetRights } from "../repositories/users.js";

const assetSettings = (scope: ListScope): ManagedDeviceAssetSettings => ({
  models: templates(scope),
  vlans: vlans(scope),
});

/**
 * The widget named by "?board=&list=", if this person sees its board — and,
 * to change its settings, may modify them.
 */
const verifyList = (req: Request, write: boolean): ListScope => {
  if (write && !accessIncludes(widgetRights(req.user).managed_device_asset, "update")) {
    throw new HttpError(403, "Vous n'avez pas le droit de modifier ici");
  }
  const board = openBoard(req.query.board, req.user);
  if (write) requireBoardControl(board, req.user);
  return listInBoard(board.id, "managed_device_asset.list", req.query.list);
};

/** An IPv4 subnet in CIDR notation: "10.1.106.0/24". */
const CIDR = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/;

const isSubnet = (text: string): boolean => {
  const m = CIDR.exec(text);
  if (!m) return false;
  const bytes = m.slice(1, 5).map(Number);
  return bytes.every((o) => o <= 255) && Number(m[5]) <= 32;
};

export const managedDeviceAssetSettingsRoutes = Router();

managedDeviceAssetSettingsRoutes.get("/", (req, res) => {
  res.json(assetSettings(verifyList(req, false)));
});

/**
 * The models table. Rows with neither id nor name — a row just added and
 * not filled in — are left out; an id appears only once.
 */
const readTemplates = (received: unknown): ManagedDeviceAssetModel[] => {
  if (!Array.isArray(received)) badRequest("La table des modèles est une liste");

  const seen = new Set<string>();
  const list: ManagedDeviceAssetModel[] = [];
  for (const entry of received as unknown[]) {
    const identifier = String(
      (entry as ManagedDeviceAssetModel | null)?.identifier ?? "",
    ).trim();
    const name = String((entry as ManagedDeviceAssetModel | null)?.name ?? "").trim();
    if (!identifier && !name) continue;
    if (!identifier) badRequest(`Le modèle « ${name} » n'a pas d'identifiant`);
    if (!name) badRequest(`L'identifiant « ${identifier} » n'a pas de nom`);
    if (identifier.length > MANAGED_DEVICE_ASSET_MODEL_MAX || name.length > MANAGED_DEVICE_ASSET_MODEL_MAX) {
      badRequest(
        `Un identifiant ou un nom tient en ${MANAGED_DEVICE_ASSET_MODEL_MAX} caractères`,
      );
    }
    const key = identifier.toLowerCase();
    if (seen.has(key))
      badRequest(`L'identifiant « ${identifier} » figure deux fois`);
    seen.add(key);
    list.push({ identifier, name });
  }
  return list;
};

/**
 * The VLAN table. Empty rows are left out; a subnet appears only once, a
 * single VLAN can carry several. The name is optional.
 */
const readVlans = (received: unknown): ManagedDeviceAssetVlan[] => {
  if (!Array.isArray(received)) badRequest("La table des VLAN est une liste");

  const seen = new Set<string>();
  const list: ManagedDeviceAssetVlan[] = [];
  for (const entry of received as unknown[]) {
    const subnet = String((entry as ManagedDeviceAssetVlan | null)?.subnet ?? "").trim();
    const raw = String((entry as ManagedDeviceAssetVlan | null)?.vlan ?? "").trim();
    const name = String((entry as ManagedDeviceAssetVlan | null)?.name ?? "").trim();
    if (!subnet && !raw && !name) continue;
    if (!subnet) badRequest(`Le VLAN « ${raw} » n'a pas de sous-réseau`);
    if (!isSubnet(subnet)) {
      badRequest(`« ${subnet} » n'est pas un sous-réseau (ex. 10.1.106.0/24)`);
    }
    const vlan = Number(raw);
    if (!/^\d+$/.test(raw) || vlan < VLAN_MIN || vlan > VLAN_MAX) {
      badRequest(
        `Le VLAN de « ${subnet} » est un nombre de ${VLAN_MIN} à ${VLAN_MAX}`,
      );
    }
    if (seen.has(subnet))
      badRequest(`Le sous-réseau « ${subnet} » figure deux fois`);
    seen.add(subnet);
    if (name.length > VLAN_NAME_MAX) {
      badRequest(`Un nom de VLAN tient en ${VLAN_NAME_MAX} caractères`);
    }
    list.push({ subnet, vlan, name });
  }
  return list;
};

/**
 * Each received table is replaced entirely, in one go; a table that is not
 * sent stays as it is.
 */
managedDeviceAssetSettingsRoutes.put("/", (req, res) => {
  const scope = verifyList(req, true);
  const body = req.body ?? {};
  if (body.models === undefined && body.vlans === undefined) {
    badRequest("Rien à enregistrer");
  }
  // Everything is checked before writing: a rejected table does not leave
  // the other one half saved.
  const newTemplates =
    body.models === undefined ? null : readTemplates(body.models);
  const newVlans =
    body.vlans === undefined ? null : readVlans(body.vlans);
  if (newTemplates) saveTemplates(scope, newTemplates);
  if (newVlans) saveVlans(scope, newVlans);

  // Open detail views display the name: let them re-read.
  touchNow(res, "managed-device-assets");
  res.json(assetSettings(scope));
});
