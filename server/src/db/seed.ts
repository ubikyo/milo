// Jeu d'essai posé sur une base vide, pour que la première ouverture montre
// quelque chose. Il ne s'exécute que si aucune catégorie n'existe.

import type { Database } from "better-sqlite3";

export const seedIfEmpty = (db: Database): void => {
  const { count } = db.prepare("SELECT COUNT(*) AS count FROM categories").get() as {
    count: number;
  };
  if (count > 0) return;

  // Les catégories appartiennent à un tableau : il vient donc en premier.
  const { lastInsertRowid: boardId } = db
    .prepare("INSERT INTO project_boards (name, position, created_at) VALUES (?, 0, ?)")
    .run("Tableau", new Date().toISOString());

  const insertCategory = db.prepare("INSERT INTO categories (board_id, name) VALUES (?, ?)");
  const categoryIds: Record<string, number | bigint> = {};
  for (const name of ["Web", "Mobile", "Interne", "Client"]) {
    categoryIds[name] = insertCategory.run(boardId, name).lastInsertRowid;
  }

  const insertCompany = db.prepare("INSERT INTO companies (name) VALUES (?)");
  const companyIds: Record<string, number | bigint> = {};
  for (const name of ["Arco Marketing", "Arco Digital", "Arco Studio"]) {
    companyIds[name] = insertCompany.run(name).lastInsertRowid;
  }

  const now = new Date();
  const iso = (daysAgo: number): string => {
    const d = new Date(now);
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString();
  };

  const insertProject = db.prepare(`
    INSERT INTO projects (name, description, board_id, category_id, company_id, status, created_at, updated_at)
    VALUES (@name, @description, @board_id, @category_id, @company_id, @status, @created_at, @updated_at)
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
    company_id: companyIds["Arco Marketing"],
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
    company_id: companyIds["Arco Digital"],
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
    company_id: companyIds["Arco Studio"],
    status: 10,
    created_at: iso(3),
    updated_at: iso(3),
  });
};
