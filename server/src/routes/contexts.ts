// Les contextes d'un tableau : les ajouter, les renommer, les ranger, les
// supprimer — ce qui emporte leurs projets, leurs cartes, leurs demandes et
// leurs postes —, et choisir celui qu'on regarde. Chaque route rend le
// tableau tel que ce compte le voit, ses contextes à jour.
//
// Les contextes sont la structure commune du tableau : les changer demande de
// pouvoir organiser les tableaux (lib/droits.ts). Choisir celui qu'on regarde
// ne regarde que soi : voir le tableau suffit.

import { Router } from "express";
import type { Request } from "express";
import { mutation } from "../db/query.js";
import type { ContextRow } from "../db/rows.js";
import { exigerOrganiser } from "../lib/droits.js";
import { badRequest, notFound, requireText } from "../lib/http.js";
import { touch, touchNow } from "../middleware/events.js";
import { boards, boardLisible, tableauOuvert } from "../repositories/boards.js";
import {
  ajouterContexte,
  contexteDuTableau,
  contexts,
  copierContextes,
} from "../repositories/contexts.js";
import { rangerContextes, ordreRecu } from "../repositories/reorder.js";
import { suivreLesListes } from "./board-widgets.js";
import { tableauPourCompte } from "./boards.js";

const CONTEXTE_INTROUVABLE = "Contexte introuvable";

/** Le libellé de « Tous les contextes » d'un tableau. */
const renommerTous = mutation("UPDATE boards SET all_contexts_label = ? WHERE id = ?");

/** Le tableau de la route, tel que ce compte le voit. */
const rendu = (req: Request, boardId: number) =>
  tableauPourCompte(boards.byId.get(boardId)!, req.user.id);

/** Un contexte d'un tableau que ce compte voit. */
const contexteOuvert = (id: unknown, req: Request): ContextRow => {
  const contexte = contexts.byId.get(id);
  if (!contexte || !boardLisible(boards.byId.get(contexte.board_id), req.user)) {
    return notFound(CONTEXTE_INTROUVABLE);
  }
  return contexte;
};

/** Monté sous /api/boards/:id/contexts. */
export const boardContextRoutes = Router({ mergeParams: true });

// Choisir le contexte qu'on regarde : nul pour tous. Déclaré avant le reste,
// qui touche la structure commune.
boardContextRoutes.put("/selected", (req, res) => {
  const board = tableauOuvert((req.params as { id: string }).id, req.user);
  const valeur = req.body.context_id;
  const choisi =
    valeur === null || valeur === undefined || valeur === "" || valeur === "all"
      ? null
      : contexteDuTableau(board.id, valeur);
  contexts.choisir.run(req.user.id, board.id, choisi);
  res.json(rendu(req, board.id));
});

boardContextRoutes.use(touch("boards"));

boardContextRoutes.post("/", (req, res) => {
  exigerOrganiser(req);
  const board = tableauOuvert((req.params as { id: string }).id, req.user);
  const name = requireText(req.body.name, "Le nom du contexte est requis");
  ajouterContexte(board.id, name);
  res.status(201).json(rendu(req, board.id));
});

// Copier les contextes du tableau vers un autre, à la suite des siens. Ceux
// qui y portent déjà le même nom ne sont pas redoublés : ils sont comptés.
// Seuls les noms passent — pas ce que les contextes contiennent. « replace » :
// ceux de l'accueil s'en vont d'abord, avec ce qu'ils contiennent.
// « rename_all » : l'accueil reprend aussi le libellé de « Tous les
// contextes », le sélecteur global.
boardContextRoutes.post("/copy", (req, res) => {
  exigerOrganiser(req);
  const source = tableauOuvert((req.params as { id: string }).id, req.user);
  if (!req.body.to_board) badRequest("Le tableau de destination est requis");
  const cible = tableauOuvert(req.body.to_board, req.user);
  if (source.id === cible.id) badRequest("Choisissez un autre tableau que celui-ci");
  const remplacer = req.body.replace === true;
  if (remplacer) touchNow(res, "projects", "task-lists", "support-requests", "assets");
  const resultat = copierContextes(source.id, cible.id, remplacer);
  if (req.body.rename_all === true) renommerTous.run(source.all_contexts_label, cible.id);
  res.json(resultat);
});

boardContextRoutes.put("/reorder", (req, res) => {
  exigerOrganiser(req);
  const board = tableauOuvert((req.params as { id: string }).id, req.user);
  const ordre = ordreRecu(
    req.body.ids,
    contexts.ofBoard.all(board.id),
    "La liste des identifiants ne correspond pas aux contextes de ce tableau",
  );
  rangerContextes(ordre, board.id);
  res.json(rendu(req, board.id));
});

/** Monté sous /api/contexts. */
export const contextRoutes = Router();

contextRoutes.use(suivreLesListes);

contextRoutes.put("/:id", touch("boards"), (req, res) => {
  exigerOrganiser(req);
  const contexte = contexteOuvert(req.params.id, req);
  contexts.rename.run(requireText(req.body.name, "Le nom du contexte est requis"), contexte.id);
  res.json(rendu(req, contexte.board_id));
});

// Supprimer un contexte emporte, par clé étrangère, ses projets, ses cartes,
// ses demandes et ses postes — et ce qui pend à chacun.
contextRoutes.delete(
  "/:id",
  touch("boards", "projects", "task-lists", "support-requests", "assets"),
  (req, res) => {
    exigerOrganiser(req);
    const contexte = contexteOuvert(req.params.id, req);
    contexts.remove.run(contexte.id);
    res.json(rendu(req, contexte.board_id));
  },
);
