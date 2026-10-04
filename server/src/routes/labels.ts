// Les étiquettes : celles d'un tableau de tâches, posées sur ses cartes, et
// leurs jumelles d'un tableau de projets, posées sur ses projets. Mêmes
// règles, deux tables : les deux modes ne partagent pas leurs étiquettes.
//
// Un routeur les sert toutes deux. Elles avaient deux blocs de code jumeaux
// dans l'ancien fichier ; les deux sortes de tableaux pouvant être privées,
// seule la table qu'on interroge les distingue encore.

import { Router } from "express";
import type { Request } from "express";
import type { CopyResult, Id, Resource, Right } from "@milo/shared";
import { DEFAULT_LABEL_COLOR, isLabelColor } from "@milo/shared";
import { mutation, scalar, selection, transaction } from "../db/query.js";
import type { LabelRow, NextRow } from "../db/rows.js";
import { require } from "../lib/droits.js";
import { badRequest, orNotFound, refuseIfUsed, requireText } from "../lib/http.js";
import { now } from "../lib/time.js";
import { touch } from "../middleware/events.js";
import { openTaskBoard } from "../repositories/boards.js";
import { openBoard } from "../repositories/boards.js";
import { receivedOrder, arrangeLabels, arrangeProjectLabels } from "../repositories/reorder.js";

const LABEL_NOT_FOUND = "Étiquette introuvable";

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
  verifyBoard: (boardId: unknown, req: Request, right: Right) => Id;
  /** Vrai quand ces étiquettes portent un poids : celles des projets seules. */
  withWeight?: boolean;
  /** Le rangement de la table, tableau par tableau (repositories/reorder.ts). */
  store: (ids: Id[], boardId: Id) => void;
}

/** Le poids reçu : un entier, positif ou non. */
const labelWeight = (value: unknown): number => {
  const weight = Number(value);
  if (!Number.isInteger(weight)) badRequest("Le poids doit être un nombre entier");
  return weight;
};

const createRoutes = ({
  table,
  touched,
  verifyBoard,
  withWeight = false,
  store,
}: LabelTable): Router => {
  const byId = selection<LabelRow>(`SELECT * FROM ${table} WHERE id = ?`);
  const ofBoard = selection<LabelRow>(
    `SELECT * FROM ${table} WHERE board_id = ? ORDER BY position, id`,
  );
  const nextRank = scalar<NextRow>(
    `SELECT COALESCE(MAX(position), -1) + 1 AS next FROM ${table} WHERE board_id = ?`,
  );
  // Sans poids, la colonne n'existe pas : on n'écrit que ce que la table porte.
  const insertion = mutation(
    withWeight
      ? `INSERT INTO ${table} (board_id, name, color, position, created_at, weight) VALUES (?, ?, ?, ?, ?, ?)`
      : `INSERT INTO ${table} (board_id, name, color, position, created_at) VALUES (?, ?, ?, ?, ?)`,
  );
  const create = {
    run: (boardId: unknown, name: string, color: string, rank: number, instant: string, weight = 0) =>
      withWeight
        ? insertion.run(boardId, name, color, rank, instant, weight)
        : insertion.run(boardId, name, color, rank, instant),
  };
  const updatedAt = mutation(
    withWeight
      ? `UPDATE ${table} SET name = ?, color = ?, weight = ? WHERE id = ?`
      : `UPDATE ${table} SET name = ?, color = ? WHERE id = ?`,
  );
  const updateStatement = {
    run: (name: string, color: string, weight: number, id: Id) =>
      withWeight ? updatedAt.run(name, color, weight, id) : updatedAt.run(name, color, id),
  };
  const withSameName = selection<LabelRow>(
    `SELECT * FROM ${table} WHERE board_id = ? AND name = ? COLLATE NOCASE LIMIT 1`,
  );
  const remove = mutation(`DELETE FROM ${table} WHERE id = ?`);
  // Ce qui porte l'étiquette : des cartes, ou des projets.
  const uses = scalar<{ count: number }>(
    table === "labels"
      ? "SELECT COUNT(*) AS count FROM card_labels WHERE label_id = ?"
      : "SELECT COUNT(*) AS count FROM project_label_links WHERE label_id = ?",
  );

  const clearFromBoard = mutation(`DELETE FROM ${table} WHERE board_id = ?`);

  /**
   * Les étiquettes d'un tableau posées dans un autre. Celles qui y portent
   * déjà le même nom ne sont pas redoublées, quelle que soit leur couleur :
   * deux étiquettes du même nom ne se distingueraient plus dans une liste.
   * Les autres se rangent à la suite de celles de l'accueil. « remplacer » :
   * celles de l'accueil s'en vont d'abord — et quittent ce qui les portait.
   */
  const copy = transaction((source: Id, target: Id, replaceExisting: boolean): CopyResult => {
    const removed = replaceExisting ? clearFromBoard.run(target).changes : 0;
    const timestamp = now();
    let rank = nextRank(target).next;
    let copied = 0;
    let skipped = 0;

    for (const label of ofBoard.all(source)) {
      if (withSameName.get(target, label.name)) {
        skipped += 1;
        continue;
      }
      create.run(target, label.name, label.color, rank, timestamp, label.weight ?? 0);
      rank += 1;
      copied += 1;
    }

    return { copied, skipped, removed };
  });

  const routes = Router();
  routes.use(touch(...touched));

  routes.get("/", (req, res) => {
    const { board } = req.query;
    if (!board) badRequest("Le paramètre board est requis");
    verifyBoard(board, req, "view");
    res.json(ofBoard.all(board));
  });

  routes.post("/", (req, res) => {
    const name = requireText(req.body.name, "Le nom de l'étiquette est requis");
    const boardId = req.body.board_id;
    const color = req.body.color || DEFAULT_LABEL_COLOR;
    if (!boardId) badRequest("Le tableau est requis");
    if (!isLabelColor(color)) badRequest("Couleur inconnue");
    verifyBoard(boardId, req, "create");
    const weight = labelWeight(req.body.weight ?? 0);

    const { next } = nextRank(boardId);
    const { lastInsertRowid } = create.run(boardId, name, color, next, now(), weight);
    res.status(201).json(byId.get(lastInsertRowid));
  });

  // Déclaré avant « /:id » n'est pas nécessaire — les verbes diffèrent —,
  // mais la copie se lit mieux près de la création qu'en fin de fichier.
  routes.post("/copy", (req, res) => {
    const { from_board, to_board } = req.body;
    if (!from_board || !to_board) {
      badRequest("Le tableau d'origine et celui de destination sont requis");
    }

    const replaceExisting = req.body.replace === true;
    const source = verifyBoard(from_board, req, "view");
    const target = verifyBoard(to_board, req, "create");
    // Effacer celles de l'accueil, c'est en supprimer.
    if (replaceExisting) verifyBoard(to_board, req, "delete");
    if (source === target) badRequest("Choisissez un autre tableau que celui-ci");

    res.json(copy(source, target, replaceExisting));
  });

  // L'ordre des étiquettes d'un tableau, glissé dans le tiroir du widget : il
  // nomme toutes celles du tableau, chacune une fois. Déclaré avant « /:id ».
  routes.put("/reorder", (req, res) => {
    const boardId = verifyBoard(req.body.board_id, req, "update");
    const ids = receivedOrder(req.body.ids, ofBoard.all(boardId), "L'ordre doit nommer toutes les étiquettes");
    store(ids, boardId);
    res.json(ofBoard.all(boardId));
  });

  routes.put("/:id", (req, res) => {
    const existing = orNotFound(byId.get(req.params.id), LABEL_NOT_FOUND);
    verifyBoard(existing.board_id, req, "update");

    const name = requireText(req.body.name ?? existing.name, "Le nom de l'étiquette est requis");
    const color = req.body.color ?? existing.color;
    if (!isLabelColor(color)) badRequest("Couleur inconnue");
    const weight = labelWeight(req.body.weight ?? existing.weight ?? 0);

    updateStatement.run(name, color, weight, existing.id);
    res.json(byId.get(existing.id));
  });

  routes.delete("/:id", (req, res) => {
    const existing = orNotFound(byId.get(req.params.id), LABEL_NOT_FOUND);
    verifyBoard(existing.board_id, req, "delete");
    refuseIfUsed(existing.name, uses(existing.id).count);

    remove.run(existing.id);
    res.status(204).end();
  });

  return routes;
};

/** Étiquettes d'un tableau de tâches : il peut être privé. */
export const labelRoutes = createRoutes({
  table: "labels",
  // Les cartes portent leurs étiquettes : le tableau se relit avec elles.
  touched: ["labels", "task-lists"],
  verifyBoard: (boardId, req, right) => openTaskBoard(boardId, req, right).id,
  store: arrangeLabels,
});

/** Étiquettes d'un tableau de projets : il peut être privé, lui aussi. */
export const projectLabelRoutes = createRoutes({
  table: "project_labels",
  touched: ["project-labels", "projects"],
  // Le tableau de projets n'appartient à aucune société : ses étiquettes
  // suivent les droits du mode Projets dans n'importe laquelle.
  verifyBoard: (boardId, req, right) => {
    require(req, "projects", right);
    return openBoard(boardId, req.user).id;
  },
  withWeight: true,
  store: arrangeProjectLabels,
});
