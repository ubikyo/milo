// Le fil d'un projet. Écrire dedans redate le projet : c'est ce qui le fait
// remonter en tête de liste.

import { Router } from "express";
import { forbidden, orNotFound, requireText } from "../lib/http.js";
import { concerned, notify, notifyDeletion, root } from "../lib/notify.js";
import { now } from "../lib/time.js";
import { touch } from "../middleware/events.js";
import { SYSTEM_COMMENT, withAuthor } from "../repositories/comments.js";
import { comments } from "../repositories/project-comments.js";
import { projects } from "../repositories/projects.js";
import { projectFor } from "./projects.js";

const COMMENT_NOT_FOUND = "Commentaire introuvable";

/** Monté sous `/api/projects/:id/comments`. */
export const projectCommentRoutes = Router({ mergeParams: true });

projectCommentRoutes.use(touch("projects"));

projectCommentRoutes.post("/", (req, res) => {
  const text = requireText(req.body.text, "text est requis");
  const { id } = req.params as { id?: string };
  // Écrire dans le fil d'un projet, c'est le modifier.
  const project = projectFor(req, id, "update");

  const timestamp = now();
  const { lastInsertRowid } = comments.create.run(
    project.id,
    req.user.id,
    text,
    timestamp,
    timestamp,
  );

  projects.touch.run(timestamp, project.id);

  // `exists` ne rend que l'identifiant : le nom se relit pour la notification.
  notify({
    kind: "project",
    targetId: project.id,
    title: projects.raw.get(project.id)?.name ?? "Projet",
    message: "a commenté",
    author: req.user,
    base: root(req),
  });

  res.status(201).json(withAuthor(comments.byId.get(lastInsertRowid)!));
});

/** Monté sous `/api/comments`. */
export const commentRoutes = Router();

commentRoutes.use(touch("projects"));

commentRoutes.put("/:id", (req, res) => {
  const comment = orNotFound(comments.raw.get(req.params.id), COMMENT_NOT_FOUND);
  if (comment.system) forbidden(SYSTEM_COMMENT);
  projectFor(req, comment.project_id, "update");
  const text = requireText(req.body.text, "text est requis");

  // Un texte identique n'est pas une modification : ni la date du commentaire
  // ni celle du projet ne bougent.
  if (text === comment.text) {
    res.json(withAuthor(comments.byId.get(comment.id)!));
    return;
  }

  const timestamp = now();
  comments.update.run(text, timestamp, comment.id);
  projects.touch.run(timestamp, comment.project_id);
  notify({
    kind: "project",
    targetId: comment.project_id,
    title: projects.raw.get(comment.project_id)?.name ?? "Projet",
    message: "a modifié un commentaire",
    author: req.user,
    base: root(req),
  });
  res.json(withAuthor(comments.byId.get(comment.id)!));
});

commentRoutes.delete("/:id", (req, res) => {
  const comment = orNotFound(comments.raw.get(req.params.id), COMMENT_NOT_FOUND);
  if (comment.system) forbidden(SYSTEM_COMMENT);
  projectFor(req, comment.project_id, "update");

  comments.remove.run(comment.id);
  projects.touch.run(now(), comment.project_id);
  notifyDeletion({
    kind: "project",
    targetId: comment.project_id,
    title: projects.raw.get(comment.project_id)?.name ?? "Projet",
    message: "a supprimé un commentaire",
    author: req.user,
    recipients: concerned.project(comment.project_id),
    vanished: false,
  });
  res.status(204).end();
});
