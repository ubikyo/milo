// Les sociétés : un nom, et les coordonnées de leur support (e-mail et site).
// Leur suppression emporte les projets rattachés.
//
// C'était une fabrique générique « registerLookupRoutes » paramétrée par des
// noms de table interpolés dans le SQL. Elle n'a jamais servi qu'une fois : le
// paramétrage coûtait plus qu'il ne rendait, et interpoler un nom de table
// dans du SQL est une habitude qu'on ne veut pas laisser traîner.

import { Router } from "express";
import { mutation, scalar, selection, transaction } from "../db/query.js";
import type { CompanyRow, CountRow } from "../db/rows.js";
import { badRequest, conflict, orNotFound, refuserSiUtilise, requireText } from "../lib/http.js";
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
const enregistrer = mutation(
  "UPDATE companies SET name = ?, support_email = ?, support_url = ? WHERE id = ?",
);
const supprimerProjets = mutation("DELETE FROM projects WHERE company_id = ?");
const supprimer = mutation("DELETE FROM companies WHERE id = ?");

// Ce qui rattache une société à quelque chose : ses projets, les cartes de
// ses tableaux, ses demandes de support, ses postes. Des tableaux vides, ses
// étiquettes ou les rôles qu'on y a attribués ne comptent pas : ils ne
// servent qu'à elle, et partent avec elle.
const utilisations = scalar<CountRow>(
  `SELECT
     (SELECT COUNT(*) FROM projects WHERE company_id = :id)
   + (SELECT COUNT(*) FROM task_cards t
        JOIN task_lists l ON l.id = t.list_id
        JOIN boards b ON b.id = l.board_id
      WHERE b.company_id = :id)
   + (SELECT COUNT(*) FROM support_requests WHERE company_id = :id)
   + (SELECT COUNT(*) FROM assets WHERE company_id = :id) AS count`,
);

// Une adresse e-mail plausible : de quoi arrêter une faute de frappe, pas plus.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** L'e-mail de support : vide, ou une adresse. */
const emailSupport = (valeur: unknown): string => {
  const email = String(valeur ?? "").trim();
  if (email && !EMAIL.test(email)) badRequest("L'e-mail de support n'est pas valide");
  return email;
};

/**
 * L'adresse du site de support, toujours en https:// : le préfixe est
 * imposé, qu'on l'ait tapé ou non. Un « http:// » collé est remplacé.
 */
const urlSupport = (valeur: unknown): string => {
  const reste = String(valeur ?? "")
    .trim()
    .replace(/^https?:\/\//i, "");
  if (!reste) return "";
  if (/\s/.test(reste) || !/^[^/?#]+\.[^/?#]+/.test(reste)) {
    badRequest("L'adresse du support n'est pas valide");
  }
  return `https://${reste}`;
};

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

// Ce qui n'est pas envoyé reste : la liste renomme sans toucher au support.
companyRoutes.put("/:id", (req, res) => {
  const existing = orNotFound(parId.get(req.params.id), SOCIETE_INTROUVABLE);
  const { body } = req;
  const name =
    body.name === undefined ? existing.name : requireText(body.name, "Le nom est requis");
  if (parNom.get(name, existing.id)) conflict(SOCIETE_EXISTANTE);

  enregistrer.run(
    name,
    body.support_email === undefined ? existing.support_email : emailSupport(body.support_email),
    body.support_url === undefined ? existing.support_url : urlSupport(body.support_url),
    existing.id,
  );
  res.json(parId.get(existing.id));
});

companyRoutes.delete("/:id", (req, res) => {
  const existing = orNotFound(parId.get(req.params.id), SOCIETE_INTROUVABLE);
  refuserSiUtilise(existing.name, utilisations({ id: existing.id }).count);
  // La suppression seule emporte les tableaux de tâches de la société et
  // leurs listes : une création ou un renommage n'y touche pas.
  touchNow(res, "boards", "task-lists");
  res.json({ deleted_projects: supprimerEnCascade(existing.id) });
});
