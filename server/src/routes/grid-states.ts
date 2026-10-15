// The sort and search of the grids, kept for each account (user_grid_states):
// a grid comes back as its person left it, on any browser. The server keeps
// the JSON the client gives it without reading it; the client checks it on
// the way back — a column may have gone since.
//
// Nothing here concerns the others: no write is announced (touch).

import { Router } from "express";
import { mutation, selection } from "../db/query.js";
import { badRequest } from "../lib/http.js";

export const gridStateRoutes = Router();

/** A grid's state has no reason to weigh more: a sort and a few filters. */
const STATE_MAX = 20_000;

const statesOf = selection<{ scope: string; state: string }>(
  "SELECT scope, state FROM user_grid_states WHERE user_id = ?",
);
const storeState = mutation(
  `INSERT INTO user_grid_states (user_id, scope, state) VALUES (?, ?, ?)
   ON CONFLICT(user_id, scope) DO UPDATE SET state = excluded.state`,
);
const removeState = mutation("DELETE FROM user_grid_states WHERE user_id = ? AND scope = ?");

/** Every grid of the signed-in person, by scope. */
gridStateRoutes.get("/", (req, res) => {
  const states: Record<string, unknown> = {};
  for (const { scope, state } of statesOf.all(req.user.id)) {
    try {
      states[scope] = JSON.parse(state);
    } catch {
      // Unreadable: the grid starts from its default.
    }
  }
  res.json(states);
});

/** A grid's state, replaced whole; an empty one removes it. */
gridStateRoutes.put("/:scope", (req, res) => {
  const scope = String(req.params.scope);
  const state: unknown = req.body?.state;
  if (scope.length > 100) badRequest("Grille inconnue.");
  if (state === null || typeof state !== "object" || Array.isArray(state)) {
    badRequest("État de grille invalide.");
  }
  if (Object.keys(state as object).length === 0) {
    removeState.run(req.user.id, scope);
  } else {
    const json = JSON.stringify(state);
    if (json.length > STATE_MAX) badRequest("État de grille trop volumineux.");
    storeState.run(req.user.id, scope, json);
  }
  res.status(204).end();
});
