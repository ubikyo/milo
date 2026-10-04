// A board's contexts are the labels of the groups its lists choose
// (repositories/contexts.ts): they are managed with the labels, in the lists'
// drawers. Here, only the choice of the one being looked at — which concerns
// only oneself: seeing the board is enough. It returns the board as this
// account sees it.

import { Router } from "express";
import { contextKey } from "@milo/shared";
import { boards, openBoard } from "../repositories/boards.js";
import { selectContext } from "../repositories/contexts.js";
import { boardForAccount } from "./boards.js";

/** Mounted under /api/boards/:id/contexts. */
export const boardContextRoutes = Router({ mergeParams: true });

// The context being looked at, by its name: null, empty or "all" for all.
boardContextRoutes.put("/selected", (req, res) => {
  const board = openBoard((req.params as { id: string }).id, req.user);
  const value: unknown = req.body.context;
  const name = typeof value === "string" && value !== "all" ? value.trim() : "";
  selectContext.run(req.user.id, board.id, contextKey(name) ? name : "");
  res.json(boardForAccount(boards.byId.get(board.id)!, req.user));
});
