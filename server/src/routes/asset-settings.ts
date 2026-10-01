// La section « Assets » du Paramétrage : la table des modèles (voir
// lib/asset-models.ts).

import { Router } from "express";
import { ASSET_MODEL_MAX } from "@milo/shared";
import type { AssetModel, AssetSettings } from "@milo/shared";
import { enregistrerModeles, modeles } from "../lib/asset-models.js";
import { badRequest } from "../lib/http.js";
import { touchNow } from "../middleware/events.js";

const reglagesAssets = (): AssetSettings => ({ models: modeles() });

export const assetSettingsRoutes = Router();

assetSettingsRoutes.get("/", (_req, res) => {
  res.json(reglagesAssets());
});

/**
 * La table entière, remplacée d'un coup. Les lignes sans identifiant ni nom
 * — une ligne qu'on vient d'ajouter et qu'on n'a pas remplie — sont laissées
 * de côté ; un identifiant ne figure qu'une fois.
 */
assetSettingsRoutes.put("/", (req, res) => {
  const recus: unknown = req.body?.models;
  if (!Array.isArray(recus)) badRequest("La table des modèles est une liste");

  const vus = new Set<string>();
  const liste: AssetModel[] = [];
  for (const recu of recus as unknown[]) {
    const identifier = String((recu as AssetModel | null)?.identifier ?? "").trim();
    const name = String((recu as AssetModel | null)?.name ?? "").trim();
    if (!identifier && !name) continue;
    if (!identifier) badRequest(`Le modèle « ${name} » n'a pas d'identifiant`);
    if (!name) badRequest(`L'identifiant « ${identifier} » n'a pas de nom`);
    if (identifier.length > ASSET_MODEL_MAX || name.length > ASSET_MODEL_MAX) {
      badRequest(`Un identifiant ou un nom tient en ${ASSET_MODEL_MAX} caractères`);
    }
    const cle = identifier.toLowerCase();
    if (vus.has(cle)) badRequest(`L'identifiant « ${identifier} » figure deux fois`);
    vus.add(cle);
    liste.push({ identifier, name });
  }

  enregistrerModeles(liste);
  // Les fiches ouvertes affichent le nom : qu'elles se relisent.
  touchNow(res, "assets");
  res.json(reglagesAssets());
});
