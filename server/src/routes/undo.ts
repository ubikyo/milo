// Undoing a deletion, by the token its route returned (lib/undo.ts).

import { Router } from "express";
import { notifyBoard, root } from "../lib/notify.js";
import { undoDeletion } from "../lib/undo.js";
import { touch } from "../middleware/events.js";

export const undoRoutes = Router();

// What comes back may be a whole view: its boards, their sections and widgets,
// their lists, projects, tickets and machines. Open tabs re-read everything a
// board carries.
undoRoutes.use(
  touch(
    "views",
    "boards",
    "board-widgets",
    "categories",
    "projects",
    "task-lists",
    "labels",
    "project-labels",
    "support-requests",
    "support-labels",
    "managed-device-assets",
  ),
);

undoRoutes.post("/:token", (req, res) => {
  for (const boardId of undoDeletion(req.user.id, String(req.params.token))) {
    notifyBoard({
      boardId,
      message: "a annulé une suppression",
      author: req.user,
      base: root(req),
      scope: "edit",
      recipients: [],
    });
  }
  res.status(204).end();
});
