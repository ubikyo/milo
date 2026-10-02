// L'ordre des rangées fixes — les onglets des modes Support et Assets, les
// modes du sélecteur (voir shared/tab-orders.ts). Chaque compte range le sien
// (repositories/tab-orders.ts) ; sans ordre à lui, il voit l'ordre commun
// d'avant, quand il y en a un.

import { Router } from "express";
import { TAB_ORDER_MODES, isTabOrderMode } from "@milo/shared";
import type { Id, TabOrders } from "@milo/shared";
import { badRequest } from "../lib/http.js";
import { touch } from "../middleware/events.js";
import { readSetting } from "../repositories/settings.js";
import { userTabOrders } from "../repositories/tab-orders.js";

const cle = (mode: string) => `tab_order_${mode}`;

/** L'ordre de chaque rangée, pour ce compte. */
const ordres = (userId: Id): TabOrders =>
  Object.fromEntries(
    TAB_ORDER_MODES.map((mode) => [
      mode,
      userTabOrders.lire(userId, mode) ?? readSetting<string[]>(cle(mode), []),
    ]),
  ) as TabOrders;

export const tabOrderRoutes = Router();

tabOrderRoutes.use(touch("tab-orders"));

tabOrderRoutes.get("/", (req, res) => {
  res.json(ordres(req.user.id));
});

/** Le nouvel ordre d'un mode : les valeurs de ses onglets, dans l'ordre. */
tabOrderRoutes.put("/:mode", (req, res) => {
  const { mode } = req.params;
  if (!isTabOrderMode(mode)) badRequest("Mode inconnu");
  const values: unknown = req.body?.values;
  if (!Array.isArray(values) || !values.every((v) => typeof v === "string")) {
    badRequest("« values » doit être une liste de chaînes");
  }
  userTabOrders.ranger(req.user.id, mode, [...new Set(values as string[])]);
  res.json(ordres(req.user.id));
});
