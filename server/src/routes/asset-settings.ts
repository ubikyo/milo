// La section « Assets » du Paramétrage : la table des modèles (voir
// lib/asset-models.ts) et celle des VLAN (lib/asset-vlans.ts).

import { Router } from "express";
import {
  ASSET_MODEL_MAX,
  VLAN_MAX,
  VLAN_MIN,
  VLAN_NAME_MAX,
} from "@milo/shared";
import type { AssetModel, AssetSettings, AssetVlan } from "@milo/shared";
import { enregistrerModeles, modeles } from "../lib/asset-models.js";
import { enregistrerVlans, vlans } from "../lib/asset-vlans.js";
import { badRequest } from "../lib/http.js";
import { touchNow } from "../middleware/events.js";

const reglagesAssets = (): AssetSettings => ({
  models: modeles(),
  vlans: vlans(),
});

/** Un sous-réseau IPv4 en notation CIDR : « 10.1.106.0/24 ». */
const CIDR = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/;

const estUnSousReseau = (texte: string): boolean => {
  const m = CIDR.exec(texte);
  if (!m) return false;
  const octets = m.slice(1, 5).map(Number);
  return octets.every((o) => o <= 255) && Number(m[5]) <= 32;
};

export const assetSettingsRoutes = Router();

assetSettingsRoutes.get("/", (_req, res) => {
  res.json(reglagesAssets());
});

/**
 * La table des modèles. Les lignes sans identifiant ni nom — une ligne qu'on
 * vient d'ajouter et qu'on n'a pas remplie — sont laissées de côté ; un
 * identifiant ne figure qu'une fois.
 */
const lireModeles = (recus: unknown): AssetModel[] => {
  if (!Array.isArray(recus)) badRequest("La table des modèles est une liste");

  const vus = new Set<string>();
  const liste: AssetModel[] = [];
  for (const recu of recus as unknown[]) {
    const identifier = String(
      (recu as AssetModel | null)?.identifier ?? "",
    ).trim();
    const name = String((recu as AssetModel | null)?.name ?? "").trim();
    if (!identifier && !name) continue;
    if (!identifier) badRequest(`Le modèle « ${name} » n'a pas d'identifiant`);
    if (!name) badRequest(`L'identifiant « ${identifier} » n'a pas de nom`);
    if (identifier.length > ASSET_MODEL_MAX || name.length > ASSET_MODEL_MAX) {
      badRequest(
        `Un identifiant ou un nom tient en ${ASSET_MODEL_MAX} caractères`,
      );
    }
    const cle = identifier.toLowerCase();
    if (vus.has(cle))
      badRequest(`L'identifiant « ${identifier} » figure deux fois`);
    vus.add(cle);
    liste.push({ identifier, name });
  }
  return liste;
};

/**
 * La table des VLAN. Les lignes vides sont laissées de côté ; un sous-réseau
 * ne figure qu'une fois, un même VLAN peut en porter plusieurs. Le nom est
 * facultatif.
 */
const lireVlans = (recus: unknown): AssetVlan[] => {
  if (!Array.isArray(recus)) badRequest("La table des VLAN est une liste");

  const vus = new Set<string>();
  const liste: AssetVlan[] = [];
  for (const recu of recus as unknown[]) {
    const subnet = String((recu as AssetVlan | null)?.subnet ?? "").trim();
    const brut = String((recu as AssetVlan | null)?.vlan ?? "").trim();
    const name = String((recu as AssetVlan | null)?.name ?? "").trim();
    if (!subnet && !brut && !name) continue;
    if (!subnet) badRequest(`Le VLAN « ${brut} » n'a pas de sous-réseau`);
    if (!estUnSousReseau(subnet)) {
      badRequest(`« ${subnet} » n'est pas un sous-réseau (ex. 10.1.106.0/24)`);
    }
    const vlan = Number(brut);
    if (!/^\d+$/.test(brut) || vlan < VLAN_MIN || vlan > VLAN_MAX) {
      badRequest(
        `Le VLAN de « ${subnet} » est un nombre de ${VLAN_MIN} à ${VLAN_MAX}`,
      );
    }
    if (vus.has(subnet))
      badRequest(`Le sous-réseau « ${subnet} » figure deux fois`);
    vus.add(subnet);
    if (name.length > VLAN_NAME_MAX) {
      badRequest(`Un nom de VLAN tient en ${VLAN_NAME_MAX} caractères`);
    }
    liste.push({ subnet, vlan, name });
  }
  return liste;
};

/**
 * Chaque table reçue est remplacée entière, d'un coup ; celle qui n'est pas
 * envoyée reste telle quelle.
 */
assetSettingsRoutes.put("/", (req, res) => {
  const corps = req.body ?? {};
  if (corps.models === undefined && corps.vlans === undefined) {
    badRequest("Rien à enregistrer");
  }
  // Tout est vérifié avant d'écrire : une table refusée n'en laisse pas
  // l'autre à moitié enregistrée.
  const nouveauxModeles =
    corps.models === undefined ? null : lireModeles(corps.models);
  const nouveauxVlans =
    corps.vlans === undefined ? null : lireVlans(corps.vlans);
  if (nouveauxModeles) enregistrerModeles(nouveauxModeles);
  if (nouveauxVlans) enregistrerVlans(nouveauxVlans);

  // Les fiches ouvertes affichent le nom : qu'elles se relisent.
  touchNow(res, "assets");
  res.json(reglagesAssets());
});
