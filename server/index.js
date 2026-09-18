import cors from "cors";
import express from "express";
import { createToken, hashPassword, verifyPassword } from "./auth.js";
import db from "./db.js";

const app = express();
app.use(cors());
app.use(express.json());

const now = () => new Date().toISOString();

// --- Authentification ------------------------------------------------------
// Jeton opaque en base, envoyé par le client dans l'en-tête Authorization.

const publicUser = (user) =>
  user && { id: user.id, name: user.name, email: user.email, created_at: user.created_at };

const countUsers = () => db.prepare("SELECT COUNT(*) AS count FROM users").get().count;
const userByEmail = db.prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE");
const userById = db.prepare("SELECT * FROM users WHERE id = ?");

const openSession = (userId) => {
  const token = createToken();
  db.prepare("INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)").run(
    token,
    userId,
    now()
  );
  return token;
};

// Première utilisation : tant qu'aucun compte n'existe, on autorise la création
// du compte initial sans être authentifié.
app.get("/api/auth/setup", (req, res) => {
  res.json({ needs_setup: countUsers() === 0 });
});

app.post("/api/auth/setup", (req, res) => {
  if (countUsers() > 0) return res.status(409).json({ error: "Un compte existe déjà" });

  const name = (req.body.name || "").trim();
  const email = (req.body.email || "").trim();
  const { password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: "Nom, e-mail et mot de passe sont requis" });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Le mot de passe doit faire au moins 8 caractères" });
  }

  const { lastInsertRowid } = db
    .prepare(
      "INSERT INTO users (name, email, password_hash, created_at) VALUES (?, ?, ?, ?)"
    )
    .run(name, email, hashPassword(password), now());

  res.status(201).json({ token: openSession(lastInsertRowid), user: publicUser(userById.get(lastInsertRowid)) });
});

app.post("/api/auth/login", (req, res) => {
  const email = (req.body.email || "").trim();
  const { password } = req.body;
  const user = email ? userByEmail.get(email) : null;

  // Même message dans les deux cas : on n'indique pas si l'e-mail existe.
  if (!user || !password || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: "E-mail ou mot de passe incorrect" });
  }
  res.json({ token: openSession(user.id), user: publicUser(user) });
});

const requireAuth = (req, res, next) => {
  const header = req.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  const session = token ? db.prepare("SELECT * FROM sessions WHERE token = ?").get(token) : null;
  const user = session ? userById.get(session.user_id) : null;
  if (!user) return res.status(401).json({ error: "Authentification requise" });

  req.user = user;
  req.token = token;
  next();
};

// Tout ce qui suit exige une session valide.
app.use("/api", requireAuth);

app.get("/api/auth/me", (req, res) => res.json(publicUser(req.user)));

app.post("/api/auth/logout", (req, res) => {
  db.prepare("DELETE FROM sessions WHERE token = ?").run(req.token);
  res.status(204).end();
});

// --- Utilisateurs ----------------------------------------------------------

app.get("/api/users", (req, res) => {
  res.json(db.prepare("SELECT * FROM users ORDER BY name").all().map(publicUser));
});

app.post("/api/users", (req, res) => {
  const name = (req.body.name || "").trim();
  const email = (req.body.email || "").trim();
  const { password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: "Nom, e-mail et mot de passe sont requis" });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Le mot de passe doit faire au moins 8 caractères" });
  }
  if (userByEmail.get(email)) return res.status(409).json({ error: "Cet e-mail est déjà utilisé" });

  const { lastInsertRowid } = db
    .prepare("INSERT INTO users (name, email, password_hash, created_at) VALUES (?, ?, ?, ?)")
    .run(name, email, hashPassword(password), now());
  res.status(201).json(publicUser(userById.get(lastInsertRowid)));
});

app.put("/api/users/:id", (req, res) => {
  const existing = userById.get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Utilisateur introuvable" });

  const name = (req.body.name ?? existing.name).trim();
  const email = (req.body.email ?? existing.email).trim();
  const { password } = req.body;
  if (!name || !email) return res.status(400).json({ error: "Nom et e-mail sont requis" });
  if (password !== undefined && password !== "" && password.length < 8) {
    return res.status(400).json({ error: "Le mot de passe doit faire au moins 8 caractères" });
  }

  const duplicate = userByEmail.get(email);
  if (duplicate && duplicate.id !== existing.id) {
    return res.status(409).json({ error: "Cet e-mail est déjà utilisé" });
  }

  db.prepare("UPDATE users SET name = ?, email = ?, password_hash = ? WHERE id = ?").run(
    name,
    email,
    password ? hashPassword(password) : existing.password_hash,
    req.params.id
  );
  // Changer de mot de passe ferme les autres sessions de ce compte.
  if (password) {
    db.prepare("DELETE FROM sessions WHERE user_id = ? AND token != ?").run(req.params.id, req.token);
  }
  res.json(publicUser(userById.get(req.params.id)));
});

app.delete("/api/users/:id", (req, res) => {
  const existing = userById.get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Utilisateur introuvable" });
  if (existing.id === req.user.id) {
    return res.status(409).json({ error: "Vous ne pouvez pas supprimer votre propre compte" });
  }
  if (countUsers() <= 1) {
    return res.status(409).json({ error: "Il doit rester au moins un utilisateur" });
  }
  db.prepare("DELETE FROM users WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

const PROJECT_SELECT = `
  SELECT projects.*, categories.name AS category_name, companies.name AS company_name,
         buildings.name AS building_name
  FROM projects
  JOIN categories ON categories.id = projects.category_id
  LEFT JOIN companies ON companies.id = projects.company_id
  LEFT JOIN buildings ON buildings.id = projects.building_id
`;

const projectWithRelations = db.prepare(`${PROJECT_SELECT} WHERE projects.id = ?`);

// --- Tables de référence (catégories, sociétés) ----------------------------
// Les deux ressources ont la même forme : un id et un nom.

const registerLookupRoutes = ({ table, foreignKey, child, labels }) => {
  const base = `/api/${table}`;
  // Le nombre de projets rattachés sert à prévenir l'utilisateur de ce que la
  // suppression en cascade va emporter.
  // Compte facultatif d'une ressource rattachée (les bâtiments d'une société),
  // affiché dans la confirmation de suppression.
  const extraCount = child
    ? `, (SELECT COUNT(*) FROM ${child.table} WHERE ${child.table}.${child.foreignKey} = ${table}.id)
         AS ${child.countField}`
    : "";
  const all = db.prepare(`
    SELECT ${table}.*,
           (SELECT COUNT(*) FROM projects WHERE projects.${foreignKey} = ${table}.id) AS project_count
           ${extraCount}
    FROM ${table}
    ORDER BY name
  `);
  const byId = db.prepare(`SELECT * FROM ${table} WHERE id = ?`);
  const byName = db.prepare(`SELECT * FROM ${table} WHERE name = ? COLLATE NOCASE AND id != ?`);
  const countUsage = db.prepare(`SELECT COUNT(*) AS count FROM projects WHERE ${foreignKey} = ?`);

  app.get(base, (req, res) => {
    res.json(all.all());
  });

  app.post(base, (req, res) => {
    const name = (req.body.name || "").trim();
    if (!name) return res.status(400).json({ error: "Le nom est requis" });
    if (byName.get(name, 0)) return res.status(409).json({ error: labels.duplicate });

    const { lastInsertRowid } = db.prepare(`INSERT INTO ${table} (name) VALUES (?)`).run(name);
    res.status(201).json(byId.get(lastInsertRowid));
  });

  app.put(`${base}/:id`, (req, res) => {
    const existing = byId.get(req.params.id);
    if (!existing) return res.status(404).json({ error: labels.notFound });

    const name = (req.body.name || "").trim();
    if (!name) return res.status(400).json({ error: "Le nom est requis" });
    if (byName.get(name, req.params.id)) return res.status(409).json({ error: labels.duplicate });

    db.prepare(`UPDATE ${table} SET name = ? WHERE id = ?`).run(name, req.params.id);
    res.json(byId.get(req.params.id));
  });

  // Suppression en cascade : les projets rattachés partent avec, et leurs
  // commentaires suivent via la clé étrangère ON DELETE CASCADE.
  const deleteCascade = db.transaction((id) => {
    const { count } = countUsage.get(id);
    db.prepare(`DELETE FROM projects WHERE ${foreignKey} = ?`).run(id);
    db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
    return count;
  });

  app.delete(`${base}/:id`, (req, res) => {
    const existing = byId.get(req.params.id);
    if (!existing) return res.status(404).json({ error: labels.notFound });

    const deletedProjects = deleteCascade(req.params.id);
    res.json({ deleted_projects: deletedProjects });
  });
};

registerLookupRoutes({
  table: "categories",
  foreignKey: "category_id",
  labels: {
    notFound: "Catégorie introuvable",
    duplicate: "Cette catégorie existe déjà",
  },
});

registerLookupRoutes({
  table: "companies",
  foreignKey: "company_id",
  child: { table: "buildings", foreignKey: "company_id", countField: "building_count" },
  labels: {
    notFound: "Société introuvable",
    duplicate: "Cette société existe déjà",
  },
});

// --- Buildings -----------------------------------------------------------
// Un bâtiment appartient à une société ; il disparaît avec elle (ON DELETE
// CASCADE défini sur la clé étrangère).

const buildingById = db.prepare("SELECT * FROM buildings WHERE id = ?");
const buildingByName = db.prepare(
  "SELECT * FROM buildings WHERE company_id = ? AND name = ? COLLATE NOCASE AND id != ?"
);

app.get("/api/buildings", (req, res) => {
  const { company } = req.query;
  const where = company && company !== "all" ? "WHERE buildings.company_id = @company" : "";
  res.json(
    db
      .prepare(
        `SELECT buildings.*, companies.name AS company_name
         FROM buildings
         JOIN companies ON companies.id = buildings.company_id
         ${where}
         ORDER BY companies.name, buildings.name`
      )
      .all(company && company !== "all" ? { company } : {})
  );
});

app.post("/api/buildings", (req, res) => {
  const name = (req.body.name || "").trim();
  const { company_id } = req.body;
  if (!name) return res.status(400).json({ error: "Le nom est requis" });
  if (!company_id) return res.status(400).json({ error: "La société est requise" });
  if (!db.prepare("SELECT id FROM companies WHERE id = ?").get(company_id)) {
    return res.status(404).json({ error: "Société introuvable" });
  }
  if (buildingByName.get(company_id, name, 0)) {
    return res.status(409).json({ error: "Ce bâtiment existe déjà pour cette société" });
  }

  const { lastInsertRowid } = db
    .prepare("INSERT INTO buildings (company_id, name) VALUES (?, ?)")
    .run(company_id, name);
  res.status(201).json(buildingById.get(lastInsertRowid));
});

app.put("/api/buildings/:id", (req, res) => {
  const existing = buildingById.get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Bâtiment introuvable" });

  const name = (req.body.name || "").trim();
  if (!name) return res.status(400).json({ error: "Le nom est requis" });
  const company_id = req.body.company_id ?? existing.company_id;
  if (buildingByName.get(company_id, name, req.params.id)) {
    return res.status(409).json({ error: "Ce bâtiment existe déjà pour cette société" });
  }

  db.prepare("UPDATE buildings SET name = ?, company_id = ? WHERE id = ?").run(
    name,
    company_id,
    req.params.id
  );
  res.json(buildingById.get(req.params.id));
});

app.delete("/api/buildings/:id", (req, res) => {
  db.prepare("UPDATE projects SET building_id = NULL WHERE building_id = ?").run(req.params.id);
  const info = db.prepare("DELETE FROM buildings WHERE id = ?").run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: "Bâtiment introuvable" });
  res.status(204).end();
});

// --- Projects ------------------------------------------------------------

app.get("/api/projects", (req, res) => {
  const { category, company, building, status } = req.query;
  const clauses = [];
  const params = {};

  if (category && category !== "all") {
    clauses.push("projects.category_id = @category");
    params.category = category;
  }
  if (company && company !== "all") {
    clauses.push("projects.company_id = @company");
    params.company = company;
  }
  if (building && building !== "all") {
    clauses.push("projects.building_id = @building");
    params.building = building;
  }
  if (status === "in_progress") {
    clauses.push("projects.status < 100");
  } else if (status === "done") {
    clauses.push("projects.status = 100");
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = db
    .prepare(`${PROJECT_SELECT} ${where} ORDER BY projects.updated_at DESC`)
    .all(params);
  res.json(rows);
});

app.get("/api/projects/:id", (req, res) => {
  const project = projectWithRelations.get(req.params.id);
  if (!project) return res.status(404).json({ error: "Projet introuvable" });
  const comments = db
    .prepare("SELECT * FROM comments WHERE project_id = ? ORDER BY created_at ASC")
    .all(req.params.id);
  res.json({ ...project, comments });
});

app.post("/api/projects", (req, res) => {
  const { name, description = "", category_id, company_id = null, building_id = null, status = 0 } = req.body;
  if (!name || !category_id) {
    return res.status(400).json({ error: "name et category_id sont requis" });
  }
  const timestamp = now();
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO projects (name, description, category_id, company_id, building_id, status, created_at, updated_at)
       VALUES (@name, @description, @category_id, @company_id, @building_id, @status, @created_at, @updated_at)`
    )
    .run({
      name,
      description,
      category_id,
      company_id,
      building_id,
      status,
      created_at: timestamp,
      updated_at: timestamp,
    });
  res.status(201).json(projectWithRelations.get(lastInsertRowid));
});

app.put("/api/projects/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM projects WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Projet introuvable" });

  const {
    name = existing.name,
    description = existing.description,
    category_id = existing.category_id,
    company_id = existing.company_id,
    building_id = existing.building_id,
    status = existing.status,
  } = req.body;

  db.prepare(
    `UPDATE projects SET name = @name, description = @description,
       category_id = @category_id, company_id = @company_id, building_id = @building_id,
       status = @status, updated_at = @updated_at
     WHERE id = @id`
  ).run({
    id: req.params.id,
    name,
    description,
    category_id,
    company_id,
    building_id,
    status,
    updated_at: now(),
  });

  res.json(projectWithRelations.get(req.params.id));
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
