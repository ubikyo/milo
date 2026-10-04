// Following: what each person asks to be notified about when it changes.
//
// Nothing here touches the event counters: following an item changes what
// nobody else sees, and the client keeps its own list up to date.

import { Router } from "express";
import { badRequest } from "../lib/http.js";
import { isFollowKind } from "@milo/shared";
import type { FollowKind, Id } from "@milo/shared";
import { follows } from "../repositories/follows.js";
import { now } from "../lib/time.js";

export const followRoutes = Router();

/**
 * The received kind. Written this way — a "return" on a function that
 * throws — so that the type guard does return a `FollowKind` afterwards,
 * without a cast.
 */
const kind = (value: unknown): FollowKind => {
  if (!isFollowKind(value)) return badRequest("Sorte d'élément inconnue");
  return value;
};

const identifier = (value: unknown): Id => {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) return badRequest("Identifiant invalide");
  return id;
};

followRoutes.get("/", (req, res) => {
  res.json(follows.of(req.user.id));
});

followRoutes.put("/:kind/:id", (req, res) => {
  follows.add(req.user.id, kind(req.params.kind), identifier(req.params.id), now());
  res.json(follows.of(req.user.id));
});

followRoutes.delete("/:kind/:id", (req, res) => {
  follows.remove(req.user.id, kind(req.params.kind), identifier(req.params.id));
  res.json(follows.of(req.user.id));
});
