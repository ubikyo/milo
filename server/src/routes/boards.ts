// Les tableaux du mode Tâche. Une société en compte autant qu'elle veut ;
// chacun porte ses listes.

import { Router } from "express";
import { selection } from "../db/query.js";
import type { IdRow } from "../db/rows.js";
import { badRequest, forbidden, requireText } from "../lib/http.js";
import { concernes, notifierSuppression } from "../lib/notify.js";
import { now } from "../lib/time.js";
import { touch } from "../middleware/events.js";
import { boardOuvert, boards } from "../repositories/boards.js";
import { ordreRecu, rangerBoards } from "../repositories/reorder.js";

const societeExiste = selection<IdRow>("SELECT id FROM companies WHERE id = ?");

/** Un réglage arrive en booléen ; la base le range en 0 ou 1. */
const drapeau = (valeur: unknown, defaut: 0 | 1): 0 | 1 =>
  valeur === undefined ? defaut : (Number(Boolean(valeur)) as 0 | 1);

export const boardRoutes = Router();

// Supprimer un tableau emporte ses listes, ses cartes et ses étiquettes.
boardRoutes.use(touch("boards", "task-lists", "labels"));

boardRoutes.get("/", (req, res) => {
  const { company } = req.query;
  if (!company) badRequest("Le paramètre company est requis");
  res.json(boards.visibleTo.all(company, req.user.id));
});

boardRoutes.post("/", (req, res) => {
  const name = requireText(req.body.name, "Le nom du tableau est requis");
  const companyId = req.body.company_id;
  if (!companyId) badRequest("La société est requise");
  if (!societeExiste.get(companyId)) badRequest("Société introuvable");

  // Le tiroir propose les réglages dès la création, mais un tableau créé sans
  // eux garde les valeurs par défaut : numéros montrés, tableau ouvert à tous.
  const { next } = boards.nextPosition(companyId);
  const { lastInsertRowid } = boards.create.run(
    companyId,
    name,
    next,
    drapeau(req.body.show_card_numbers, 1),
    drapeau(req.body.is_private, 0),
    req.user.id,
    now(),
  );
  res.status(201).json(boards.byId.get(lastInsertRowid));
});

// Ranger les onglets. Déclaré avant « /:id », sinon « reorder » serait pris
// pour un identifiant. L'ordre est celui de tout le monde : un tableau privé
// qu'on ne voit pas garde sa place (repositories/reorder.ts).
boardRoutes.put("/reorder", (req, res) => {
  const companyId = req.body.company_id;
  if (!companyId) badRequest("La société est requise");
  const visibles = boards.visibleTo.all(companyId, req.user.id);
  const ordre = ordreRecu(
    req.body.ids,
    visibles,
    "La liste des identifiants ne correspond pas aux tableaux de cette société",
  );

  rangerBoards(ordre, companyId);
  res.json(boards.visibleTo.all(companyId, req.user.id));
});

boardRoutes.put("/:id", (req, res) => {
  const existing = boardOuvert(req.params.id, req.user);
  const name = requireText(req.body.name ?? existing.name, "Le nom du tableau est requis");
  const showNumbers = drapeau(req.body.show_card_numbers, existing.show_card_numbers);
  const isPrivate = drapeau(req.body.is_private, existing.is_private);
  const isLocked = drapeau(req.body.is_locked, existing.is_locked);

  // Fermer un tableau, c'est se le réserver : son auteur seul en décide. Ceux
  // d'avant l'option n'en ont pas — le premier à les fermer les adopte.
  let owner = existing.owner_id;
  if (isPrivate !== existing.is_private) {
    if (owner === null) owner = req.user.id;
    else if (owner !== req.user.id) {
      forbidden("Seul l'auteur du tableau peut le rendre privé");
    }
  }

  boards.update.run(name, showNumbers, isPrivate, isLocked, owner, existing.id);
  res.json(boards.byId.get(existing.id));
});

// Les listes du tableau, et leurs cartes, partent avec lui (ON DELETE CASCADE).
boardRoutes.delete("/:id", (req, res) => {
  const existing = boardOuvert(req.params.id, req.user);
  const destinataires = concernes.tableau(existing.id);
  boards.remove.run(existing.id);
  notifierSuppression({
    kind: "card",
    targetId: existing.id,
    titre: existing.name,
    message: "a supprimé le tableau",
    auteur: req.user,
    destinataires,
    disparu: true,
  });
  res.status(204).end();
});
