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

  // The board's contexts: the labels of a "Contextes" group, which its
  // projects lists choose (shared, contexts.ts).
  const created = new Date().toISOString();
  const group = db
    .prepare(
      `INSERT INTO project_label_groups (board_id, name, position, created_at)
       VALUES (?, 'Contextes', (SELECT COALESCE(MAX(position), -1) + 1
                                FROM project_label_groups WHERE board_id = ?), ?)`,
    )
    .run(boardId, boardId, created).lastInsertRowid;
  const insertLabel = db.prepare(
    `INSERT INTO project_labels (board_id, group_id, name, color, position, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const contextIds: Record<string, number | bigint> = {};
  (
    [
      ["Arco Marketing", "blue.6"],
      ["Arco Digital", "teal.6"],
      ["Arco Studio", "orange.6"],
    ] as const
  ).forEach(([name, color], position) => {
    contextIds[name] = insertLabel.run(boardId, group, name, color, position, created)
      .lastInsertRowid;
  });
  const lists = db
    .prepare(
      `SELECT w.id, w.config FROM board_widgets w
       JOIN board_sections s ON s.id = w.section_id
       WHERE s.board_id = ? AND w.type = 'project.list'`,
    )
    .all(boardId) as { id: number; config: string }[];
  for (const list of lists) {
    let config: Record<string, unknown> = {};
    try {
      config = JSON.parse(list.config) as Record<string, unknown>;
    } catch {
      // An unreadable configuration starts over.
    }
    db.prepare("UPDATE board_widgets SET config = ? WHERE id = ?").run(
      JSON.stringify({ ...config, context_group: Number(group) }),
      list.id,
    );
  }
  const insertLink = db.prepare(
    "INSERT INTO project_label_links (project_id, label_id) VALUES (?, ?)",
  );

  const now = new Date();
  const iso = (daysAgo: number): string => {
    const d = new Date(now);
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString();
  };

  const insertProject = db.prepare(`
    INSERT INTO projects (name, description, board_id, category_id, status, created_at, updated_at)
    VALUES (@name, @description, @board_id, @category_id, @status, @created_at, @updated_at)
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
    status: 65,
    created_at: iso(20),
    updated_at: iso(2),
  });
  insertLink.run(p1.lastInsertRowid, contextIds["Arco Marketing"]);
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
    status: 100,
    created_at: iso(45),
    updated_at: iso(5),
  });
  insertLink.run(p2.lastInsertRowid, contextIds["Arco Digital"]);
  insertComment.run({
    project_id: p2.lastInsertRowid,
    text: "Mise en production effectuée.",
    created_at: iso(5),
    updated_at: iso(5),
  });

  const p3 = insertProject.run({
    name: "Migration serveurs internes",
    board_id: boardId,
    description: "Bascule des serveurs sur la nouvelle infra.",
    category_id: categoryIds["Interne"],
    status: 10,
    created_at: iso(3),
    updated_at: iso(3),
  });
  insertLink.run(p3.lastInsertRowid, contextIds["Arco Studio"]);
};
