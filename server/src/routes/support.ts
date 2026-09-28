// Le mode Support : ses demandes, leur fil, et les étiquettes qu'elles
// portent.
//
// Une demande pend à une société — celle de la liste déroulante de l'entête —
// et non à un tableau : il n'y a donc rien de privé ici, chacun voit les
// demandes des sociétés qu'il consulte.
//
// Les étiquettes ne passent pas par la fabrique de « routes/labels.ts » :
// celle-ci ne parle que de tableaux, et sait les copier de l'un à l'autre.
// Celles du support pendent à une société et ne se copient pas.

import { Router } from "express";
import { DEFAULT_SUPPORT_STATUS, isSupportStatus, isLabelColor, DEFAULT_LABEL_COLOR } from "@milo/shared";
import type { SupportStatus } from "@milo/shared";
import { selection } from "../db/query.js";
import type { CompanyRow } from "../db/rows.js";
import { badRequest, forbidden, orNotFound, requireText, toIds } from "../lib/http.js";
import { echeance, horodatage, now } from "../lib/time.js";
import { touch } from "../middleware/events.js";
import { COMMENTAIRE_SYSTEME, withAuthor } from "../repositories/comments.js";
import {
  DEMANDE_INTROUVABLE,
  ETIQUETTE_SUPPORT_INTROUVABLE,
  replaceSupportActors,
  replaceSupportLabels,
  supportComments,
  supportLabels,
  supportRequestDetail,
  supportRequests,
  withRelations,
} from "../repositories/support.js";

const SOCIETE_INTROUVABLE = "Société introuvable";
const COMMENTAIRE_INTROUVABLE = "Commentaire introuvable";

const societes = selection<CompanyRow>("SELECT * FROM companies WHERE id = ?");

/** La société visée, si elle existe : tout ce qui suit lui appartient. */
const societe = (id: unknown): CompanyRow => {
  if (!id) badRequest("La société est requise");
  return orNotFound(societes.get(id), SOCIETE_INTROUVABLE);
};

/** Le statut reçu. Une valeur inconnue est refusée plutôt que corrigée. */
const statut = (valeur: unknown, defaut: SupportStatus): SupportStatus => {
  if (valeur === undefined) return defaut;
  if (!isSupportStatus(valeur)) badRequest("Statut inconnu");
  return valeur as SupportStatus;
};

export const supportRequestRoutes = Router();

supportRequestRoutes.use(touch("support-requests"));

/** La demande visée, si elle existe. */
const demande = (id: unknown) => orNotFound(supportRequests.byId.get(id), DEMANDE_INTROUVABLE);

// Toutes les demandes d'une société, quel que soit leur statut : ce sont les
// onglets qui les rangent, et ils comptent ce que chacun contient.
supportRequestRoutes.get("/", (req, res) => {
  const company = societe(req.query.company);
  res.json(withRelations(supportRequests.ofCompany.all(company.id)));
});

supportRequestRoutes.post("/", (req, res) => {
  const company = societe(req.body.company_id);

  const timestamp = now();
  const { lastInsertRowid } = supportRequests.create.run(
    company.id,
    statut(req.body.status, DEFAULT_SUPPORT_STATUS),
    echeance(req.body.due_date, ""),
    timestamp,
    timestamp,
  );

  // Le fil d'une demande s'ouvre sur sa création, comme celui d'une carte.
  supportComments.createSystem.run(
    lastInsertRowid,
    req.user.id,
    `Demande créée le ${horodatage(timestamp)}`,
    timestamp,
    timestamp,
  );

  const creee = demande(lastInsertRowid);
  if (Array.isArray(req.body.actor_ids)) {
    replaceSupportActors(creee.id, toIds(req.body.actor_ids));
  }
  if (Array.isArray(req.body.label_ids)) {
    replaceSupportLabels(creee.id, toIds(req.body.label_ids), company.id);
  }

  res.status(201).json(supportRequestDetail(creee));
});

supportRequestRoutes.get("/:id", (req, res) => {
  res.json(supportRequestDetail(demande(req.params.id)));
});

// La société n'est pas modifiable : une demande reste sous celle où elle a été
// ouverte. Chaque champ absent du corps reste tel quel.
supportRequestRoutes.put("/:id", (req, res) => {
  const existing = demande(req.params.id);

  supportRequests.update.run(
    statut(req.body.status, existing.status),
    echeance(req.body.due_date, existing.due_date),
    now(),
    existing.id,
  );

  if (Array.isArray(req.body.actor_ids)) {
    replaceSupportActors(existing.id, toIds(req.body.actor_ids));
  }
  if (Array.isArray(req.body.label_ids)) {
    replaceSupportLabels(existing.id, toIds(req.body.label_ids), existing.company_id);
  }

  res.json(supportRequestDetail(demande(existing.id)));
});

supportRequestRoutes.delete("/:id", (req, res) => {
  // Ses étiquettes et son fil partent avec elle, par clé étrangère.
  supportRequests.remove.run(demande(req.params.id).id);
  res.status(204).end();
});

// --- Fil d'une demande -----------------------------------------------------

supportRequestRoutes.post("/:id/comments", (req, res) => {
  const existing = demande(req.params.id);
  const text = requireText(req.body.text, "text est requis");

  const timestamp = now();
  const { lastInsertRowid } = supportComments.create.run(
    existing.id,
    req.user.id,
    text,
    timestamp,
    timestamp,
  );

  res.status(201).json(withAuthor(supportComments.byId.get(lastInsertRowid)!));
});

/** Monté sous `/api/support-comments`. */
export const supportCommentRoutes = Router();

supportCommentRoutes.use(touch("support-requests"));

supportCommentRoutes.put("/:id", (req, res) => {
  const comment = orNotFound(supportComments.byId.get(req.params.id), COMMENTAIRE_INTROUVABLE);
  if (comment.system) forbidden(COMMENTAIRE_SYSTEME);
  const text = requireText(req.body.text, "text est requis");

  // Un texte identique n'est pas une modification : la date ne bouge pas, et
  // le commentaire ne se met pas à porter « (modifié) ».
  if (text === comment.text) {
    res.json(withAuthor(comment));
    return;
  }

  supportComments.update.run(text, now(), comment.id);
  res.json(withAuthor(supportComments.byId.get(comment.id)!));
});

supportCommentRoutes.delete("/:id", (req, res) => {
  const comment = orNotFound(supportComments.byId.get(req.params.id), COMMENTAIRE_INTROUVABLE);
  if (comment.system) forbidden(COMMENTAIRE_SYSTEME);

  supportComments.remove.run(comment.id);
  res.status(204).end();
});

// --- Étiquettes ------------------------------------------------------------
// Elles appartiennent à la société, comme celles d'un tableau lui
// appartiennent : les renommer, les recolorer ou les supprimer touche toutes
// les demandes qui les portent.

export const supportLabelRoutes = Router();

supportLabelRoutes.use(touch("support-labels", "support-requests"));

supportLabelRoutes.get("/", (req, res) => {
  res.json(supportLabels.ofCompany.all(societe(req.query.company).id));
});

supportLabelRoutes.post("/", (req, res) => {
  const name = requireText(req.body.name, "Le nom de l'étiquette est requis");
  const company = societe(req.body.company_id);
  const color = req.body.color || DEFAULT_LABEL_COLOR;
  if (!isLabelColor(color)) badRequest("Couleur inconnue");

  const { next } = supportLabels.nextPosition(company.id);
  const { lastInsertRowid } = supportLabels.create.run(company.id, name, color, next, now());
  res.status(201).json(supportLabels.byId.get(lastInsertRowid));
});

supportLabelRoutes.put("/:id", (req, res) => {
  const existing = orNotFound(
    supportLabels.byId.get(req.params.id),
    ETIQUETTE_SUPPORT_INTROUVABLE,
  );
  const name = requireText(req.body.name ?? existing.name, "Le nom de l'étiquette est requis");
  const color = req.body.color ?? existing.color;
  if (!isLabelColor(color)) badRequest("Couleur inconnue");

  supportLabels.update.run(name, color, existing.id);
  res.json(supportLabels.byId.get(existing.id));
});

supportLabelRoutes.delete("/:id", (req, res) => {
  const existing = orNotFound(
    supportLabels.byId.get(req.params.id),
    ETIQUETTE_SUPPORT_INTROUVABLE,
  );
  supportLabels.remove.run(existing.id);
  res.status(204).end();
});
