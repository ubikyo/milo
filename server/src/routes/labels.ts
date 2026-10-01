// Les étiquettes : celles d'un tableau de tâches, posées sur ses cartes, et
// leurs jumelles d'un tableau de projets, posées sur ses projets. Mêmes
// règles, deux tables : les deux modes ne partagent pas leurs étiquettes.
//
// Un routeur les sert toutes deux. Elles avaient deux blocs de code jumeaux
// dans l'ancien fichier ; les deux sortes de tableaux pouvant être privées,
// seule la table qu'on interroge les distingue encore.

import { Router } from "express";
import type { CopyResult, Id, Resource } from "@milo/shared";
import { DEFAULT_LABEL_COLOR, isLabelColor } from "@milo/shared";
import { mutation, scalar, selection, transaction } from "../db/query.js";
import type { LabelRow, NextRow, UserRow } from "../db/rows.js";
import { badRequest, orNotFound, refuserSiUtilise, requireText } from "../lib/http.js";
import { now } from "../lib/time.js";
import { touch } from "../middleware/events.js";
import { boardOuvert } from "../repositories/boards.js";
import { projectBoardOuvert } from "../repositories/project-boards.js";

const ETIQUETTE_INTROUVABLE = "Étiquette introuvable";

interface LabelTable {
  /** Le nom de la table. Il n'entre dans le SQL qu'ici, jamais depuis une requête. */
  table: "labels" | "project_labels";
  /** Ce que le flux d'événements doit signaler quand ces étiquettes changent. */
  touched: Resource[];
  /**
   * Le tableau qui porte ces étiquettes, s'il est ouvert à cette personne.
   * Lève sinon, et rend l'identifiant vérifié — la copie en a besoin des deux
   * côtés, et ne veut pas d'un identifiant reçu tel quel.
   */
  verifierTableau: (boardId: unknown, user: UserRow) => Id;
  /** Vrai quand ces étiquettes portent un poids : celles des projets seules. */
  avecPoids?: boolean;
}

/** Le poids reçu : un entier, positif ou non. */
const poidsEtiquette = (valeur: unknown): number => {
  const poids = Number(valeur);
  if (!Number.isInteger(poids)) badRequest("Le poids doit être un nombre entier");
  return poids;
};

const creerRoutes = ({
  table,
  touched,
  verifierTableau,
  avecPoids = false,
}: LabelTable): Router => {
  const parId = selection<LabelRow>(`SELECT * FROM ${table} WHERE id = ?`);
  const duTableau = selection<LabelRow>(
    `SELECT * FROM ${table} WHERE board_id = ? ORDER BY position, id`,
  );
  const rangSuivant = scalar<NextRow>(
    `SELECT COALESCE(MAX(position), -1) + 1 AS next FROM ${table} WHERE board_id = ?`,
  );
  // Sans poids, la colonne n'existe pas : on n'écrit que ce que la table porte.
  const insertion = mutation(
    avecPoids
      ? `INSERT INTO ${table} (board_id, name, color, position, created_at, weight) VALUES (?, ?, ?, ?, ?, ?)`
      : `INSERT INTO ${table} (board_id, name, color, position, created_at) VALUES (?, ?, ?, ?, ?)`,
  );
  const creer = {
    run: (boardId: unknown, name: string, color: string, rang: number, instant: string, poids = 0) =>
      avecPoids
        ? insertion.run(boardId, name, color, rang, instant, poids)
        : insertion.run(boardId, name, color, rang, instant),
  };
  const miseAJour = mutation(
    avecPoids
      ? `UPDATE ${table} SET name = ?, color = ?, weight = ? WHERE id = ?`
      : `UPDATE ${table} SET name = ?, color = ? WHERE id = ?`,
  );
  const modifier = {
    run: (name: string, color: string, poids: number, id: Id) =>
      avecPoids ? miseAJour.run(name, color, poids, id) : miseAJour.run(name, color, id),
  };
  const deMemeNom = selection<LabelRow>(
    `SELECT * FROM ${table} WHERE board_id = ? AND name = ? COLLATE NOCASE LIMIT 1`,
  );
  const supprimer = mutation(`DELETE FROM ${table} WHERE id = ?`);
  // Ce qui porte l'étiquette : des cartes, ou des projets.
  const utilisations = scalar<{ count: number }>(
    table === "labels"
      ? "SELECT COUNT(*) AS count FROM card_labels WHERE label_id = ?"
      : "SELECT COUNT(*) AS count FROM project_label_links WHERE label_id = ?",
  );

  /**
   * Les étiquettes d'un tableau posées dans un autre. Celles qui y portent
   * déjà le même nom ne sont pas redoublées, quelle que soit leur couleur :
   * deux étiquettes du même nom ne se distingueraient plus dans une liste.
   * Les autres se rangent à la suite de celles de l'accueil.
   */
  const copier = transaction((source: Id, cible: Id): CopyResult => {
    const timestamp = now();
    let rang = rangSuivant(cible).next;
    let copied = 0;
    let skipped = 0;

    for (const label of duTableau.all(source)) {
      if (deMemeNom.get(cible, label.name)) {
        skipped += 1;
        continue;
      }
      creer.run(cible, label.name, label.color, rang, timestamp, label.weight ?? 0);
      rang += 1;
      copied += 1;
    }

    return { copied, skipped };
  });

  const routes = Router();
  routes.use(touch(...touched));

  routes.get("/", (req, res) => {
    const { board } = req.query;
    if (!board) badRequest("Le paramètre board est requis");
    verifierTableau(board, req.user);
    res.json(duTableau.all(board));
  });

  routes.post("/", (req, res) => {
    const name = requireText(req.body.name, "Le nom de l'étiquette est requis");
    const boardId = req.body.board_id;
    const color = req.body.color || DEFAULT_LABEL_COLOR;
    if (!boardId) badRequest("Le tableau est requis");
    if (!isLabelColor(color)) badRequest("Couleur inconnue");
    verifierTableau(boardId, req.user);
    const poids = poidsEtiquette(req.body.weight ?? 0);

    const { next } = rangSuivant(boardId);
    const { lastInsertRowid } = creer.run(boardId, name, color, next, now(), poids);
    res.status(201).json(parId.get(lastInsertRowid));
  });

  // Déclaré avant « /:id » n'est pas nécessaire — les verbes diffèrent —,
  // mais la copie se lit mieux près de la création qu'en fin de fichier.
  routes.post("/copy", (req, res) => {
    const { from_board, to_board } = req.body;
    if (!from_board || !to_board) {
      badRequest("Le tableau d'origine et celui de destination sont requis");
    }

    const source = verifierTableau(from_board, req.user);
    const cible = verifierTableau(to_board, req.user);
    if (source === cible) badRequest("Choisissez un autre tableau que celui-ci");

    res.json(copier(source, cible));
  });

  routes.put("/:id", (req, res) => {
    const existing = orNotFound(parId.get(req.params.id), ETIQUETTE_INTROUVABLE);
    verifierTableau(existing.board_id, req.user);

    const name = requireText(req.body.name ?? existing.name, "Le nom de l'étiquette est requis");
    const color = req.body.color ?? existing.color;
    if (!isLabelColor(color)) badRequest("Couleur inconnue");
    const poids = poidsEtiquette(req.body.weight ?? existing.weight ?? 0);

    modifier.run(name, color, poids, existing.id);
    res.json(parId.get(existing.id));
  });

  routes.delete("/:id", (req, res) => {
    const existing = orNotFound(parId.get(req.params.id), ETIQUETTE_INTROUVABLE);
    verifierTableau(existing.board_id, req.user);
    refuserSiUtilise(existing.name, utilisations(existing.id).count);

    supprimer.run(existing.id);
    res.status(204).end();
  });

  return routes;
};

/** Étiquettes d'un tableau de tâches : il peut être privé. */
export const labelRoutes = creerRoutes({
  table: "labels",
  // Les cartes portent leurs étiquettes : le tableau se relit avec elles.
  touched: ["labels", "task-lists"],
  verifierTableau: (boardId, user) => boardOuvert(boardId, user).id,
});

/** Étiquettes d'un tableau de projets : il peut être privé, lui aussi. */
export const projectLabelRoutes = creerRoutes({
  table: "project_labels",
  touched: ["project-labels", "projects"],
  verifierTableau: (boardId, user) => projectBoardOuvert(boardId, user).id,
  avecPoids: true,
});
