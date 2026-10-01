// L'ordre des onglets fixes des modes Support et Assets (voir
// shared/tab-orders.ts). Il vaut pour tout le monde, comme celui des
// tableaux : c'est le mode qui est rangé, pas la vue qu'on en a.

import { Router } from "express";
import { TAB_ORDER_MODES, isTabOrderMode } from "@milo/shared";
import type { TabOrders } from "@milo/shared";
import { badRequest } from "../lib/http.js";
import { touch } from "../middleware/events.js";
import { readSetting, writeSetting } from "../repositories/settings.js";

const cle = (mode: string) => `tab_order_${mode}`;

const ordres = (): TabOrders =>
  Object.fromEntries(
    TAB_ORDER_MODES.map((mode) => [mode, readSetting<string[]>(cle(mode), [])]),
  ) as TabOrders;

export const tabOrderRoutes = Router();

tabOrderRoutes.use(touch("tab-orders"));

tabOrderRoutes.get("/", (_req, res) => {
  res.json(ordres());
});

/** Le nouvel ordre d'un mode : les valeurs de ses onglets, dans l'ordre. */
tabOrderRoutes.put("/:mode", (req, res) => {
  const { mode } = req.params;
  if (!isTabOrderMode(mode)) badRequest("Mode inconnu");
  const values: unknown = req.body?.values;
  if (!Array.isArray(values) || !values.every((v) => typeof v === "string")) {
    badRequest("« values » doit être une liste de chaînes");
  }
  writeSetting(cle(mode), [...new Set(values as string[])]);
  res.json(ordres());
});
