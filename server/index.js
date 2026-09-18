import cors from "cors";
import express from "express";
import db from "./db.js";

const app = express();
app.use(cors());
app.use(express.json());

const now = () => new Date().toISOString();

const projectWithCategory = db.prepare(`
  SELECT projects.*, categories.name AS category_name
  FROM projects
  JOIN categories ON categories.id = projects.category_id
  WHERE projects.id = ?
`);

// --- Categories ---------------------------------------------------------

app.get("/api/categories", (req, res) => {
  res.json(db.prepare("SELECT * FROM categories ORDER BY name").all());
});

// --- Projects ------------------------------------------------------------

app.get("/api/projects", (req, res) => {
  const { category, status } = req.query;
  const clauses = [];
  const params = {};

  if (category && category !== "all") {
    clauses.push("projects.category_id = @category");
    params.category = category;
  }
  if (status === "in_progress") {
    clauses.push("projects.status < 100");
  } else if (status === "done") {
    clauses.push("projects.status = 100");
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = db
    .prepare(
      `SELECT projects.*, categories.name AS category_name
       FROM projects
       JOIN categories ON categories.id = projects.category_id
       ${where}
       ORDER BY projects.updated_at DESC`
    )
    .all(params);
  res.json(rows);
});

app.get("/api/projects/:id", (req, res) => {
  const project = projectWithCategory.get(req.params.id);
  if (!project) return res.status(404).json({ error: "Projet introuvable" });
  const comments = db
    .prepare("SELECT * FROM comments WHERE project_id = ? ORDER BY created_at ASC")
    .all(req.params.id);
  res.json({ ...project, comments });
});

app.post("/api/projects", (req, res) => {
  const { name, description = "", category_id, status = 0 } = req.body;
  if (!name || !category_id) {
    return res.status(400).json({ error: "name et category_id sont requis" });
  }
  const timestamp = now();
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO projects (name, description, category_id, status, created_at, updated_at)
       VALUES (@name, @description, @category_id, @status, @created_at, @updated_at)`
    )
    .run({ name, description, category_id, status, created_at: timestamp, updated_at: timestamp });
  res.status(201).json(projectWithCategory.get(lastInsertRowid));
});

app.put("/api/projects/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM projects WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Projet introuvable" });

  const {
    name = existing.name,
    description = existing.description,
    category_id = existing.category_id,
    status = existing.status,
  } = req.body;

  db.prepare(
    `UPDATE projects SET name = @name, description = @description,
       category_id = @category_id, status = @status, updated_at = @updated_at
     WHERE id = @id`
  ).run({ id: req.params.id, name, description, category_id, status, updated_at: now() });

  res.json(projectWithCategory.get(req.params.id));
});

app.delete("/api/projects/:id", (req, res) => {
  const info = db.prepare("DELETE FROM projects WHERE id = ?").run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: "Projet introuvable" });
  res.status(204).end();
});

// --- Comments --------------------------------------------------------------

const touchProject = (projectId) => {
  db.prepare("UPDATE projects SET updated_at = ? WHERE id = ?").run(now(), projectId);
};

app.post("/api/projects/:id/comments", (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: "text est requis" });

  const project = db.prepare("SELECT id FROM projects WHERE id = ?").get(req.params.id);
  if (!project) return res.status(404).json({ error: "Projet introuvable" });

  const timestamp = now();
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO comments (project_id, text, created_at, updated_at)
       VALUES (@project_id, @text, @created_at, @updated_at)`
    )
    .run({ project_id: req.params.id, text: text.trim(), created_at: timestamp, updated_at: timestamp });

  touchProject(req.params.id);
  res.status(201).json(db.prepare("SELECT * FROM comments WHERE id = ?").get(lastInsertRowid));
});

app.put("/api/comments/:id", (req, res) => {
  const { text } = req.body;
  const comment = db.prepare("SELECT * FROM comments WHERE id = ?").get(req.params.id);
  if (!comment) return res.status(404).json({ error: "Commentaire introuvable" });
  if (!text || !text.trim()) return res.status(400).json({ error: "text est requis" });

  const timestamp = now();
  db.prepare("UPDATE comments SET text = ?, updated_at = ? WHERE id = ?").run(
    text.trim(),
    timestamp,
    req.params.id
  );
  touchProject(comment.project_id);
  res.json(db.prepare("SELECT * FROM comments WHERE id = ?").get(req.params.id));
});

app.delete("/api/comments/:id", (req, res) => {
  const comment = db.prepare("SELECT * FROM comments WHERE id = ?").get(req.params.id);
  if (!comment) return res.status(404).json({ error: "Commentaire introuvable" });

  db.prepare("DELETE FROM comments WHERE id = ?").run(req.params.id);
  touchProject(comment.project_id);
  res.status(204).end();
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`API Milo disponible sur http://localhost:${PORT}`);
});
