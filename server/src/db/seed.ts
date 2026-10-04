// Sample data placed on an empty database, so that the first launch shows
// something. It only runs if no category exists.

import type { Database } from "better-sqlite3";

export const seedIfEmpty = (db: Database): void => {
  const { count } = db.prepare("SELECT COUNT(*) AS count FROM categories").get() as {
    count: number;
  };
  if (count > 0) return;

  // Categories belong to a board: the one of the Projects view, created with
  // the initial views (migrations.ts, viewsAndBoards).
  const board = db
    .prepare(
      `SELECT b.id FROM boards b JOIN views v ON v.id = b.view_id
       WHERE v.name = 'Projets' ORDER BY b.position, b.id LIMIT 1`,
    )
    .get() as { id: number } | undefined;
  if (!board) return;
  const boardId = board.id;

  const insertCategory = db.prepare("INSERT INTO categories (board_id, name) VALUES (?, ?)");
  const categoryIds: Record<string, number | bigint> = {};
  for (const name of ["Web", "Mobile", "Interne", "Client"]) {
    categoryIds[name] = insertCategory.run(boardId, name).lastInsertRowid;
  }

  // The board's contexts replace its "Contexte par défaut".
  db.prepare("DELETE FROM contexts WHERE board_id = ?").run(boardId);
  const insertContext = db.prepare(
    "INSERT INTO contexts (board_id, name, position, created_at) VALUES (?, ?, ?, ?)",
  );
  const contextIds: Record<string, number | bigint> = {};
  ["Arco Marketing", "Arco Digital", "Arco Studio"].forEach((name, position) => {
    contextIds[name] = insertContext.run(boardId, name, position, new Date().toISOString())
      .lastInsertRowid;
  });

  const now = new Date();
  const iso = (daysAgo: number): string => {
    const d = new Date(now);
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString();
  };

  const insertProject = db.prepare(`
    INSERT INTO projects (name, description, board_id, category_id, context_id, status, created_at, updated_at)
    VALUES (@name, @description, @board_id, @category_id, @context_id, @status, @created_at, @updated_at)
  `);
  const insertComment = db.prepare(`
    INSERT INTO comments (project_id, text, created_at, updated_at)
    VALUES (@project_id, @text, @created_at, @updated_at)
  `);

  const p1 = insertProject.run({
    name: "Refonte site vitrine",
    board_id: boardId,
    description: "Nouvelle version du site institutionnel avec Mantine.",
    category_id: categoryIds["Web"],
    context_id: contextIds["Arco Marketing"],
    status: 65,
    created_at: iso(20),
    updated_at: iso(2),
  });
  insertComment.run({
    project_id: p1.lastInsertRowid,
    text: "Maquettes validées par le client.",
    created_at: iso(10),
    updated_at: iso(10),
  });
  insertComment.run({
    project_id: p1.lastInsertRowid,
    text: "Intégration de la page d'accueil terminée.",
    created_at: iso(2),
    updated_at: iso(2),
  });

  const p2 = insertProject.run({
    name: "Application mobile RH",
    board_id: boardId,
    description: "App interne de gestion des congés.",
    category_id: categoryIds["Mobile"],
    context_id: contextIds["Arco Digital"],
    status: 100,
    created_at: iso(45),
    updated_at: iso(5),
  });
  insertComment.run({
    project_id: p2.lastInsertRowid,
    text: "Mise en production effectuée.",
    created_at: iso(5),
    updated_at: iso(5),
  });

  insertProject.run({
    name: "Migration serveurs internes",
    board_id: boardId,
    description: "Bascule des serveurs sur la nouvelle infra.",
    category_id: categoryIds["Interne"],
    context_id: contextIds["Arco Studio"],
    status: 10,
    created_at: iso(3),
    updated_at: iso(3),
  });
};
