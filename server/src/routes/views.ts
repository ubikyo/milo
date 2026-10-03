// Les vues : ce que le sélecteur du bas propose. Une vue naît avec un tableau,
// sans filtre de société ; elle se renomme, se ferme aux autres (« Privé ») et
// se supprime avec tout ce que ses tableaux contiennent.

import { Router } from "express";
import type { Request } from "express";
import type { Id, View } from "@milo/shared";
import { transaction } from "../db/query.js";
import { exigerOrganiser } from "../lib/droits.js";
import { HttpError, requireText } from "../lib/http.js";
import { now } from "../lib/time.js";
import { touch } from "../middleware/events.js";
import { boards } from "../repositories/boards.js";
import { ordreRecu } from "../repositories/reorder.js";
import { dansLOrdreDe, userTabOrders } from "../repositories/tab-orders.js";
import { views, vueOuverte } from "../repositories/views.js";
import { creerTableau, supprimerTableau, tableauPourCompte } from "./boards.js";

/** Un réglage arrive en booléen ; la base le range en 0 ou 1. */
const drapeau = (valeur: unknown, defaut: 0 | 1): 0 | 1 =>
  valeur === undefined ? defaut : (Number(Boolean(valeur)) as 0 | 1);

const SCOPE_VUES = "views";

/** Les vues de son workspace que ce compte voit. */
const vuesDuCompte = (req: Request) => views.visibleTo.all(req.user.workspace_id, req.user.id);

/** Les vues que ce compte voit, dans son ordre à lui. */
const vuesVues = (req: Request): View[] =>
  dansLOrdreDe(req.user.id, SCOPE_VUES, vuesDuCompte(req));

/** Une vue neuve, à la suite des autres de son workspace, avec son premier tableau. */
export const creerVue = transaction((workspace: Id, name: string): { view: Id; board: Id } => {
  const { next } = views.nextPosition(workspace);
  const view = Number(views.create.run(workspace, name, next, 0, null, now()).lastInsertRowid);
  return { view, board: creerTableau(view, "Tableau", null) };
});

export const viewRoutes = Router();

// Supprimer une vue emporte ses tableaux, et tout ce qu'ils contiennent.
viewRoutes.use(
  touch("views", "boards", "board-widgets", "task-lists", "labels", "projects", "categories"),
);

viewRoutes.get("/", (req, res) => {
  res.json(vuesVues(req));
});

viewRoutes.post("/", (req, res) => {
  exigerOrganiser(req);
  const name = requireText(req.body.name, "Le nom de la vue est requis");
  if (req.user.workspace_id === null) throw new HttpError(403, "Aucun workspace");
  const { view, board } = creerVue(req.user.workspace_id, name);
  res.status(201).json({
    view: views.byId.get(view),
    board: tableauPourCompte(boards.byId.get(board)!, req.user.id),
  });
});

// Ranger les vues. Déclaré avant « /:id », sinon « reorder » serait pris pour
// un identifiant. L'ordre est celui de ce compte seulement : le voir suffit.
viewRoutes.put("/reorder", (req, res) => {
  const ordre = ordreRecu(
    req.body.ids,
    vuesDuCompte(req),
    "La liste des identifiants ne correspond pas aux vues",
  );
  userTabOrders.ranger(req.user.id, SCOPE_VUES, ordre);
  res.json(vuesVues(req));
});

viewRoutes.put("/:id", (req, res) => {
  exigerOrganiser(req);
  const existing = vueOuverte(req.params.id, req.user);
  const name = requireText(req.body.name ?? existing.name, "Le nom de la vue est requis");
  const isPrivate = drapeau(req.body.is_private, existing.is_private);
  // Comme un tableau : la fermer, c'est se la réserver ; la rouvrir la rend à
  // tous, sans propriétaire.
  const owner = isPrivate ? (existing.is_private ? existing.owner_id : req.user.id) : null;
  views.update.run(name, isPrivate, owner, existing.id);
  res.json(views.byId.get(existing.id));
});

viewRoutes.delete("/:id", (req, res) => {
  exigerOrganiser(req);
  const existing = vueOuverte(req.params.id, req.user);
  // Chaque tableau part avec ce qu'il emporte et l'annonce ; la vue ensuite.
  for (const board of boards.visibleIn.all(existing.id, req.user.id)) supprimerTableau(board, req);
  views.remove.run(existing.id);
  res.status(204).end();
});
