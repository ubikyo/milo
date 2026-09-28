// Le fil d'un projet. Écrire dedans redate le projet : c'est ce qui le fait
// remonter en tête de liste.

import { Router } from "express";
import { forbidden, orNotFound, requireText } from "../lib/http.js";
import { notifier, racine } from "../lib/notify.js";
import { now } from "../lib/time.js";
import { touch } from "../middleware/events.js";
import { COMMENTAIRE_SYSTEME, withAuthor } from "../repositories/comments.js";
import { comments } from "../repositories/project-comments.js";
import { projects } from "../repositories/projects.js";

const COMMENTAIRE_INTROUVABLE = "Commentaire introuvable";

/** Monté sous `/api/projects/:id/comments`. */
export const projectCommentRoutes = Router({ mergeParams: true });

projectCommentRoutes.use(touch("projects"));

projectCommentRoutes.post("/", (req, res) => {
  const text = requireText(req.body.text, "text est requis");
  const { id } = req.params as { id?: string };
  const project = orNotFound(projects.exists.get(id), "Projet introuvable");

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
  notifier({
    kind: "project",
    targetId: project.id,
    titre: projects.raw.get(project.id)?.name ?? "Projet",
    message: "a commenté",
    auteur: req.user,
    base: racine(req),
  });

  res.status(201).json(withAuthor(comments.byId.get(lastInsertRowid)!));
});

/** Monté sous `/api/comments`. */
export const commentRoutes = Router();

commentRoutes.use(touch("projects"));

commentRoutes.put("/:id", (req, res) => {
  const comment = orNotFound(comments.raw.get(req.params.id), COMMENTAIRE_INTROUVABLE);
  if (comment.system) forbidden(COMMENTAIRE_SYSTEME);
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
  res.json(withAuthor(comments.byId.get(comment.id)!));
});

commentRoutes.delete("/:id", (req, res) => {
  const comment = orNotFound(comments.raw.get(req.params.id), COMMENTAIRE_INTROUVABLE);
  if (comment.system) forbidden(COMMENTAIRE_SYSTEME);

  comments.remove.run(comment.id);
  projects.touch.run(now(), comment.project_id);
  res.status(204).end();
});
