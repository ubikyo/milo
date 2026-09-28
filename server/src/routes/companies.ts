// Les sociétés. Une ressource qui n'a qu'un id et un nom, et dont la
// suppression emporte les projets rattachés.
//
// C'était une fabrique générique « registerLookupRoutes » paramétrée par des
// noms de table interpolés dans le SQL. Elle n'a jamais servi qu'une fois : le
// paramétrage coûtait plus qu'il ne rendait, et interpoler un nom de table
// dans du SQL est une habitude qu'on ne veut pas laisser traîner.

import { Router } from "express";
import { mutation, scalar, selection, transaction } from "../db/query.js";
import type { CompanyRow, CountRow } from "../db/rows.js";
import { conflict, orNotFound, requireText } from "../lib/http.js";
import { touch, touchNow } from "../middleware/events.js";

const SOCIETE_INTROUVABLE = "Société introuvable";
const SOCIETE_EXISTANTE = "Cette société existe déjà";

/**
 * Le nombre de projets rattachés : la confirmation de suppression annonce ce
 * que la cascade va emporter.
 */
const toutes = selection<CompanyRow & { project_count: number }>(
  `SELECT companies.*,
          (SELECT COUNT(*) FROM projects WHERE projects.company_id = companies.id) AS project_count
   FROM companies
   ORDER BY name`,
);

const parId = selection<CompanyRow>("SELECT * FROM companies WHERE id = ?");
const parNom = selection<CompanyRow>(
  "SELECT * FROM companies WHERE name = ? COLLATE NOCASE AND id != ?",
);
const compterProjets = scalar<CountRow>("SELECT COUNT(*) AS count FROM projects WHERE company_id = ?");
const creer = mutation("INSERT INTO companies (name) VALUES (?)");
const renommer = mutation("UPDATE companies SET name = ? WHERE id = ?");
const supprimerProjets = mutation("DELETE FROM projects WHERE company_id = ?");
const supprimer = mutation("DELETE FROM companies WHERE id = ?");

/**
 * Suppression en cascade : les projets rattachés partent avec, et leurs
 * commentaires suivent via la clé étrangère ON DELETE CASCADE. Les tableaux de
 * la société partent de même.
 */
const supprimerEnCascade = transaction((id: number): number => {
  const { count } = compterProjets(id);
  supprimerProjets.run(id);
  supprimer.run(id);
  return count;
});

export const companyRoutes = Router();

// Le nom d'une société se lit sur les projets qui la citent : le renommer
// change ce qu'ils affichent.
companyRoutes.use(touch("lookups", "projects"));

companyRoutes.get("/", (_req, res) => {
  res.json(toutes.all());
});

companyRoutes.post("/", (req, res) => {
  const name = requireText(req.body.name, "Le nom est requis");
  if (parNom.get(name, 0)) conflict(SOCIETE_EXISTANTE);

  const { lastInsertRowid } = creer.run(name);
  res.status(201).json(parId.get(lastInsertRowid));
});

companyRoutes.put("/:id", (req, res) => {
  const existing = orNotFound(parId.get(req.params.id), SOCIETE_INTROUVABLE);
  const name = requireText(req.body.name, "Le nom est requis");
  if (parNom.get(name, existing.id)) conflict(SOCIETE_EXISTANTE);

  renommer.run(name, existing.id);
  res.json(parId.get(existing.id));
});

companyRoutes.delete("/:id", (req, res) => {
  const existing = orNotFound(parId.get(req.params.id), SOCIETE_INTROUVABLE);
  // La suppression seule emporte les tableaux de tâches de la société et
  // leurs listes : une création ou un renommage n'y touche pas.
  touchNow(res, "boards", "task-lists");
  res.json({ deleted_projects: supprimerEnCascade(existing.id) });
});
