import cors from "cors";
import express from "express";
import { createHash } from "node:crypto";
import sanitizeHtml from "sanitize-html";
import { createToken, hashPassword, passwordIssues, verifyPassword } from "./auth.js";
import db from "./db.js";

const app = express();
app.use(cors());
app.use(express.json());

const now = () => new Date().toISOString();

// « 22/09/2026 à 20:15 ». Le fuseau est celui de Paris : l'application est
// française, et la base, elle, garde ses dates en temps universel.
const horodatage = (iso) => {
  const date = new Date(iso);
  const jour = date.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" });
  const heure = date.toLocaleTimeString("fr-FR", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${jour} à ${heure}`;
};

// --- Texte enrichi ---------------------------------------------------------
// Les descriptions sont saisies dans l'éditeur et gardées en HTML. Ce HTML est
// réécrit avant d'être enregistré : il ne doit contenir que ce que l'éditeur
// sait produire, sans quoi un compte pourrait y glisser du script. Les
// commentaires, eux, sont du texte simple et ne passent pas par ici.

const BALISES_RICHES = [
  "p", "br", "strong", "b", "em", "i", "u", "s", "del", "code", "pre",
  "blockquote", "ul", "ol", "li", "h1", "h2", "h3", "h4", "h5", "h6", "a", "hr",
];

const assainir = (html) =>
  sanitizeHtml(String(html ?? ""), {
    allowedTags: BALISES_RICHES,
    // Un lien garde son adresse et s'ouvre ailleurs ; rien d'autre ne passe,
    // et surtout aucun attribut « on… ».
    allowedAttributes: { a: ["href", "target", "rel"] },
    allowedSchemes: ["http", "https", "mailto"],
    // Un lien sans protocole connu perd son adresse plutôt que la page.
    allowProtocolRelative: false,
  });

// La description telle qu'on la garde. Un éditeur vide rend « <p></p> » : on
// n'en garde rien du tout. Sans cette remise à plat, une fiche sans
// description se croirait modifiée à chaque fois qu'on l'ouvre — le tiroir
// enregistre en se refermant —, et sa date de modification bougerait pour
// rien.
const descriptionPropre = (html) => {
  const propre = assainir(html);
  return porteDuTexte(propre) ? propre : "";
};

// Deux descriptions qui disent la même chose. Le cas particulier est celui des
// fiches d'avant l'éditeur : leur texte n'a aucune balise, et l'éditeur le
// leur rend dans un paragraphe. C'est lui qui l'a mis là, pas l'utilisateur :
// la nouvelle forme s'enregistre, mais la date ne bouge pas pour autant.
const memeDescription = (recue, existante) =>
  recue === existante ||
  (!/<[a-z/!]/i.test(String(existante || "")) &&
    recue === `<p>${existante}</p>`);

// --- Authentification ------------------------------------------------------
// Jeton opaque en base, envoyé par le client dans l'en-tête Authorization.

// Gravatar : hachage SHA-256 de l'e-mail normalisé. `d=404` fait échouer la
// requête quand la personne n'a pas d'image, ce qui laisse l'interface
// retomber sur les initiales.
const gravatarUrl = (email) =>
  `https://www.gravatar.com/avatar/${createHash("sha256")
    .update(String(email).trim().toLowerCase())
    .digest("hex")}?d=404&s=128`;

const fullName = (first, last) => [first, last].map((p) => String(p || "").trim()).filter(Boolean).join(" ");

const publicUser = (user) =>
  user && {
    id: user.id,
    first_name: user.first_name,
    last_name: user.last_name,
    // `name` reste exposé : il alimente les initiales et les listes d'acteurs.
    name: fullName(user.first_name, user.last_name) || user.email,
    email: user.email,
    gravatar_url: gravatarUrl(user.email),
    // Un mot de passe vide signifie « première connexion à faire ».
    activated: Boolean(user.password_hash),
    default_mode: user.default_mode || "projects",
    created_at: user.created_at,
  };

const saveIdentity = db.prepare(
  "UPDATE users SET first_name = ?, last_name = ?, name = ?, email = ? WHERE id = ?"
);

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

  const firstName = (req.body.first_name || "").trim();
  const lastName = (req.body.last_name || "").trim();
  const email = (req.body.email || "").trim();
  const { password } = req.body;
  if (!firstName || !lastName || !email || !password) {
    return res.status(400).json({ error: "Prénom, nom, e-mail et mot de passe sont requis" });
  }
  const issues = passwordIssues(password);
  if (issues.length > 0) {
    return res.status(400).json({ error: `Le mot de passe doit contenir : ${issues.join(", ")}` });
  }

  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO users (first_name, last_name, name, email, password_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(firstName, lastName, fullName(firstName, lastName), email, hashPassword(password), now());

  res.status(201).json({ token: openSession(lastInsertRowid), user: publicUser(userById.get(lastInsertRowid)) });
});

// --- Première connexion ----------------------------------------------------
// L'administrateur ne crée qu'une adresse ; la personne renseigne elle-même
// son identité et son mot de passe. L'e-mail est indispensable pour savoir
// quel compte activer.
app.post("/api/auth/first-login", (req, res) => {
  const email = (req.body.email || "").trim();
  const firstName = (req.body.first_name || "").trim();
  const lastName = (req.body.last_name || "").trim();
  const { password, password_confirm: confirm } = req.body;

  if (!email || !firstName || !lastName || !password) {
    return res.status(400).json({ error: "Tous les champs sont requis" });
  }
  const issues = passwordIssues(password);
  if (issues.length > 0) {
    return res.status(400).json({ error: `Le mot de passe doit contenir : ${issues.join(", ")}` });
  }
  if (password !== confirm) {
    return res.status(400).json({ error: "Les deux mots de passe ne correspondent pas" });
  }

  const user = userByEmail.get(email);
  // Même réponse si l'adresse est inconnue ou déjà activée : on n'indique pas
  // quelles adresses existent.
  if (!user || user.password_hash) {
    return res.status(409).json({
      error: "Cette adresse est inconnue ou son mot de passe est déjà défini",
    });
  }

  db.prepare(
    "UPDATE users SET first_name = ?, last_name = ?, name = ?, password_hash = ? WHERE id = ?"
  ).run(firstName, lastName, fullName(firstName, lastName), hashPassword(password), user.id);

  res.json({ token: openSession(user.id), user: publicUser(userById.get(user.id)) });
});

app.post("/api/auth/login", (req, res) => {
  const email = (req.body.email || "").trim();
  const { password } = req.body;
  const user = email ? userByEmail.get(email) : null;

  // Même message dans les deux cas : on n'indique pas si l'e-mail existe.
  if (!user || !user.password_hash || !password || !verifyPassword(password, user.password_hash)) {
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

// --- Suivi des modifications ----------------------------------------------
// Compteur incrémenté à chaque écriture réussie. Les clients l'interrogent
// pour savoir s'ils doivent recharger leurs données. En mémoire : un
// redémarrage remet le compteur à 1, ce qui provoque au pire un rechargement
// inutile chez les clients connectés.
let dataVersion = 1;

// Clients abonnés au flux d'événements.
const streamClients = new Set();

const broadcastVersion = () => {
  const payload = `data: ${JSON.stringify({ version: dataVersion })}\n\n`;
  for (const client of streamClients) {
    try {
      client.write(payload);
    } catch {
      streamClients.delete(client);
    }
  }
};

app.use("/api", (req, res, next) => {
  if (req.method === "GET") return next();
  res.on("finish", () => {
    if (res.statusCode < 400) {
      dataVersion += 1;
      broadcastVersion();
    }
  });
  next();
});

app.get("/api/version", (req, res) => res.json({ version: dataVersion }));

// Flux d'événements (SSE) : la version est poussée dès qu'une écriture a lieu.
app.get("/api/events", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    // Demande à nginx de ne pas mettre la réponse en tampon.
    "X-Accel-Buffering": "no",
  });
  res.write(`data: ${JSON.stringify({ version: dataVersion })}\n\n`);
  streamClients.add(res);

  // Commentaire périodique : maintient la connexion ouverte à travers les proxys.
  const heartbeat = setInterval(() => {
    try {
      res.write(": ping\n\n");
    } catch {
      /* la fermeture est gérée par l'événement close */
    }
  }, 25000);

  req.on("close", () => {
    clearInterval(heartbeat);
    streamClients.delete(res);
  });
});

app.get("/api/auth/me", (req, res) => res.json(publicUser(req.user)));

// Modes de l'application : le compte en choisit un pour l'ouverture de ses
// sessions. La liste double celle du client (client/src/modes.js).
const MODES = ["access", "projects", "tasks", "support"];

// Préférences : identité, mode d'ouverture et, si demandé, mot de passe.
app.put("/api/auth/me", (req, res) => {
  const firstName = (req.body.first_name ?? req.user.first_name).trim();
  const lastName = (req.body.last_name ?? req.user.last_name).trim();
  const email = (req.body.email ?? req.user.email).trim();
  const { password, password_confirm: confirm } = req.body;

  if (!firstName || !lastName || !email) {
    return res.status(400).json({ error: "Prénom, nom et e-mail sont requis" });
  }
  const duplicate = userByEmail.get(email);
  if (duplicate && duplicate.id !== req.user.id) {
    return res.status(409).json({ error: "Cet e-mail est déjà utilisé" });
  }
  if (password) {
    const issues = passwordIssues(password);
    if (issues.length > 0) {
      return res.status(400).json({ error: `Le mot de passe doit contenir : ${issues.join(", ")}` });
    }
    if (password !== confirm) {
      return res.status(400).json({ error: "Les deux mots de passe ne correspondent pas" });
    }
  }

  const defaultMode = req.body.default_mode ?? req.user.default_mode ?? "projects";
  if (!MODES.includes(defaultMode)) {
    return res.status(400).json({ error: "Mode inconnu" });
  }

  saveIdentity.run(firstName, lastName, fullName(firstName, lastName), email, req.user.id);
  db.prepare("UPDATE users SET default_mode = ? WHERE id = ?").run(defaultMode, req.user.id);

  if (password) {
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(
      hashPassword(password),
      req.user.id
    );
    // Les autres sessions de ce compte sont fermées.
    db.prepare("DELETE FROM sessions WHERE user_id = ? AND token != ?").run(req.user.id, req.token);
  }

  res.json(publicUser(userById.get(req.user.id)));
});

app.post("/api/auth/logout", (req, res) => {
  db.prepare("DELETE FROM sessions WHERE token = ?").run(req.token);
  res.status(204).end();
});

// --- Utilisateurs ----------------------------------------------------------

app.get("/api/users", (req, res) => {
  res.json(db.prepare("SELECT * FROM users ORDER BY name").all().map(publicUser));
});

// L'administrateur n'invite qu'une adresse ; la personne complète son profil
// lors de sa première connexion.
app.post("/api/users", (req, res) => {
  const email = (req.body.email || "").trim();
  if (!email) return res.status(400).json({ error: "L'e-mail est requis" });
  if (userByEmail.get(email)) return res.status(409).json({ error: "Cet e-mail est déjà utilisé" });

  // Les colonnes sont renseignées explicitement : sur une base créée avant
  // l'ajout des valeurs par défaut, `name` et `password_hash` sont NOT NULL
  // sans défaut, et `CREATE TABLE IF NOT EXISTS` ne les a pas modifiées.
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO users (name, first_name, last_name, email, password_hash, created_at)
       VALUES ('', '', '', ?, '', ?)`
    )
    .run(email, now());
  res.status(201).json(publicUser(userById.get(lastInsertRowid)));
});

app.put("/api/users/:id", (req, res) => {
  const existing = userById.get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Utilisateur introuvable" });
  // Son propre compte se modifie depuis les préférences (PUT /api/auth/me),
  // qui gère aussi le mot de passe.
  if (existing.id === req.user.id) {
    return res.status(409).json({
      error: "Modifiez votre propre compte depuis vos préférences",
    });
  }

  const firstName = (req.body.first_name ?? existing.first_name).trim();
  const lastName = (req.body.last_name ?? existing.last_name).trim();
  const email = (req.body.email ?? existing.email).trim();
  if (!email) return res.status(400).json({ error: "L'e-mail est requis" });

  const duplicate = userByEmail.get(email);
  if (duplicate && duplicate.id !== existing.id) {
    return res.status(409).json({ error: "Cet e-mail est déjà utilisé" });
  }

  saveIdentity.run(firstName, lastName, fullName(firstName, lastName), email, req.params.id);
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

// --- Acteurs ---------------------------------------------------------------
// Les acteurs sont renvoyés avec chaque projet ; une seule requête pour tout
// le lot plutôt qu'une par projet.

const withActors = (projects) => {
  const list = Array.isArray(projects) ? projects : [projects];
  if (list.length === 0) return projects;

  const placeholders = list.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT project_actors.project_id, users.id, users.name, users.email
       FROM project_actors
       JOIN users ON users.id = project_actors.user_id
       WHERE project_actors.project_id IN (${placeholders})
       ORDER BY users.name`
    )
    .all(...list.map((p) => p.id));

  const byProject = new Map();
  for (const row of rows) {
    if (!byProject.has(row.project_id)) byProject.set(row.project_id, []);
    byProject.get(row.project_id).push({
      id: row.id,
      name: row.name || row.email,
      email: row.email,
      gravatar_url: gravatarUrl(row.email),
    });
  }

  const decorated = list.map((p) => ({ ...p, actors: byProject.get(p.id) || [] }));
  return Array.isArray(projects) ? decorated : decorated[0];
};

// --- Étiquettes des projets ------------------------------------------------
// Jumelles de celles des cartes : elles appartiennent à un tableau de projets
// et se posent sur ses projets. Un projet les emporte comme ses acteurs, en
// une requête pour tout le lot.

const withProjectLabels = (projects) => {
  const list = Array.isArray(projects) ? projects : [projects];
  if (list.length === 0) return projects;

  const placeholders = list.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT project_label_links.project_id, project_labels.*
       FROM project_label_links
       JOIN project_labels ON project_labels.id = project_label_links.label_id
       WHERE project_label_links.project_id IN (${placeholders})
       ORDER BY project_labels.position, project_labels.id`
    )
    .all(...list.map((p) => p.id));

  const byProject = new Map();
  for (const { project_id, ...label } of rows) {
    if (!byProject.has(project_id)) byProject.set(project_id, []);
    byProject.get(project_id).push(label);
  }

  const decorated = list.map((p) => ({ ...p, labels: byProject.get(p.id) || [] }));
  return Array.isArray(projects) ? decorated : decorated[0];
};

// Un projet ne porte que les étiquettes de son propre tableau : celles d'un
// autre sont ignorées plutôt que refusées, comme pour les acteurs.
const replaceProjectLabels = db.transaction((projectId, labelIds, boardId) => {
  db.prepare("DELETE FROM project_label_links WHERE project_id = ?").run(projectId);
  const insert = db.prepare(
    "INSERT OR IGNORE INTO project_label_links (project_id, label_id) VALUES (?, ?)"
  );
  const known = db.prepare("SELECT id FROM project_labels WHERE id = ? AND board_id = ?");
  for (const labelId of labelIds) {
    if (known.get(labelId, boardId)) insert.run(projectId, labelId);
  }
});

// Un projet, ses acteurs et ses étiquettes.
const withProjectRelations = (projects) => withProjectLabels(withActors(projects));

// Les acteurs et les étiquettes d'un projet, en identifiants seuls : de quoi
// savoir si ce qu'on reçoit change quelque chose.
const acteursDe = (projectId) =>
  db
    .prepare("SELECT user_id FROM project_actors WHERE project_id = ?")
    .all(projectId)
    .map((l) => l.user_id);

const etiquettesDe = (projectId) =>
  db
    .prepare("SELECT label_id FROM project_label_links WHERE project_id = ?")
    .all(projectId)
    .map((l) => l.label_id);

const replaceActors = db.transaction((projectId, actorIds) => {
  db.prepare("DELETE FROM project_actors WHERE project_id = ?").run(projectId);
  const insert = db.prepare(
    "INSERT OR IGNORE INTO project_actors (project_id, user_id) VALUES (?, ?)"
  );
  for (const userId of actorIds) {
    if (db.prepare("SELECT id FROM users WHERE id = ?").get(userId)) insert.run(projectId, userId);
  }
});

// --- Tables de référence (sociétés) ---------------------------------------
// Une ressource qui n'a qu'un id et un nom, et dont la suppression emporte
// les projets rattachés.

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

// --- Tableaux de projets ---------------------------------------------------
// Ils ne dépendent d'aucune société : un tableau rassemble des projets de
// plusieurs sociétés, et porte ses propres catégories.

const projectBoardById = db.prepare("SELECT * FROM project_boards WHERE id = ?");

app.get("/api/project-boards", (req, res) => {
  res.json(db.prepare("SELECT * FROM project_boards ORDER BY position, id").all());
});

app.post("/api/project-boards", (req, res) => {
  const name = (req.body.name || "").trim();
  if (!name) return res.status(400).json({ error: "Le nom du tableau est requis" });

  // Nouveau tableau ajouté à la suite des autres.
  const { next } = db
    .prepare("SELECT COALESCE(MAX(position), -1) + 1 AS next FROM project_boards")
    .get();
  const { lastInsertRowid } = db
    .prepare("INSERT INTO project_boards (name, position, created_at) VALUES (?, ?, ?)")
    .run(name, next, now());
  res.status(201).json(projectBoardById.get(lastInsertRowid));
});

app.put("/api/project-boards/:id", (req, res) => {
  const existing = projectBoardById.get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Tableau introuvable" });

  const name = (req.body.name ?? existing.name).trim();
  if (!name) return res.status(400).json({ error: "Le nom du tableau est requis" });

  db.prepare("UPDATE project_boards SET name = ? WHERE id = ?").run(name, req.params.id);
  res.json(projectBoardById.get(req.params.id));
});

// Suppression en cascade : les projets du tableau partent d'abord (leurs
// commentaires et leurs acteurs suivent par clé étrangère), puis ses
// catégories. L'ordre compte : un projet référence sa catégorie.
const deleteProjectBoardCascade = db.transaction((id) => {
  const { count } = db.prepare("SELECT COUNT(*) AS count FROM projects WHERE board_id = ?").get(id);
  db.prepare("DELETE FROM projects WHERE board_id = ?").run(id);
  db.prepare("DELETE FROM categories WHERE board_id = ?").run(id);
  db.prepare("DELETE FROM project_boards WHERE id = ?").run(id);
  return count;
});

app.delete("/api/project-boards/:id", (req, res) => {
  if (!projectBoardById.get(req.params.id)) {
    return res.status(404).json({ error: "Tableau introuvable" });
  }
  res.json({ deleted_projects: deleteProjectBoardCascade(req.params.id) });
});

// --- Catégories ------------------------------------------------------------
// Une catégorie appartient à un tableau de projets : deux tableaux peuvent
// nommer une catégorie de la même façon. Même forme que les bâtiments, qui
// pendent à une société.

const categoryById = db.prepare("SELECT * FROM categories WHERE id = ?");
const categoryByName = db.prepare(
  "SELECT * FROM categories WHERE board_id = ? AND name = ? COLLATE NOCASE AND id != ?"
);

app.get("/api/categories", (req, res) => {
  const { board } = req.query;
  const where = board && board !== "all" ? "WHERE categories.board_id = @board" : "";
  res.json(
    db
      .prepare(
        `SELECT categories.*,
                (SELECT COUNT(*) FROM projects WHERE projects.category_id = categories.id)
                  AS project_count
         FROM categories
         ${where}
         ORDER BY name`
      )
      .all(board && board !== "all" ? { board } : {})
  );
});

app.post("/api/categories", (req, res) => {
  const name = (req.body.name || "").trim();
  const { board_id } = req.body;
  if (!name) return res.status(400).json({ error: "Le nom est requis" });
  if (!board_id) return res.status(400).json({ error: "Le tableau est requis" });
  if (!projectBoardById.get(board_id)) {
    return res.status(404).json({ error: "Tableau introuvable" });
  }
  if (categoryByName.get(board_id, name, 0)) {
    return res.status(409).json({ error: "Cette catégorie existe déjà" });
  }

  const { lastInsertRowid } = db
    .prepare("INSERT INTO categories (board_id, name) VALUES (?, ?)")
    .run(board_id, name);
  res.status(201).json(categoryById.get(lastInsertRowid));
});

app.put("/api/categories/:id", (req, res) => {
  const existing = categoryById.get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Catégorie introuvable" });

  const name = (req.body.name || "").trim();
  if (!name) return res.status(400).json({ error: "Le nom est requis" });
  if (categoryByName.get(existing.board_id, name, req.params.id)) {
    return res.status(409).json({ error: "Cette catégorie existe déjà" });
  }

  db.prepare("UPDATE categories SET name = ? WHERE id = ?").run(name, req.params.id);
  res.json(categoryById.get(req.params.id));
});

// Suppression en cascade : les projets rattachés partent avec, et leurs
// commentaires suivent via la clé étrangère ON DELETE CASCADE.
const deleteCategoryCascade = db.transaction((id) => {
  const { count } = db
    .prepare("SELECT COUNT(*) AS count FROM projects WHERE category_id = ?")
    .get(id);
  db.prepare("DELETE FROM projects WHERE category_id = ?").run(id);
  db.prepare("DELETE FROM categories WHERE id = ?").run(id);
  return count;
});

app.delete("/api/categories/:id", (req, res) => {
  if (!categoryById.get(req.params.id)) {
    return res.status(404).json({ error: "Catégorie introuvable" });
  }
  res.json({ deleted_projects: deleteCategoryCascade(req.params.id) });
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

// --- Tableaux --------------------------------------------------------------
// Une société a autant de tableaux qu'elle veut ; chacun porte ses listes.

const boardById = db.prepare("SELECT * FROM boards WHERE id = ?");

// Un tableau privé n'est qu'à son auteur : les autres ne le voient pas dans la
// liste et n'en atteignent ni les listes, ni les cartes, ni les étiquettes.
// Les tableaux d'avant l'option n'ont pas d'auteur connu : ils restent ouverts.
const boardLisible = (board, user) => Boolean(board) && (!board.is_private || board.owner_id === user.id);

// Le tableau demandé, s'il existe et que cette personne peut le voir. Sinon
// rien : l'appelant répondra « introuvable », car un tableau privé ne se
// laisse pas même deviner.
const boardOuvert = (id, user) => {
  const board = boardById.get(id);
  return boardLisible(board, user) ? board : null;
};

const BOARD_INTROUVABLE = { error: "Tableau introuvable" };

app.get("/api/boards", (req, res) => {
  const { company } = req.query;
  if (!company) return res.status(400).json({ error: "Le paramètre company est requis" });
  res.json(
    db
      .prepare(
        `SELECT * FROM boards
         WHERE company_id = ? AND (is_private = 0 OR owner_id = ?)
         ORDER BY position, id`
      )
      .all(company, req.user.id)
  );
});

app.post("/api/boards", (req, res) => {
  const name = (req.body.name || "").trim();
  const { company_id } = req.body;
  if (!name) return res.status(400).json({ error: "Le nom du tableau est requis" });
  if (!company_id) return res.status(400).json({ error: "La société est requise" });
  if (!db.prepare("SELECT id FROM companies WHERE id = ?").get(company_id)) {
    return res.status(404).json({ error: "Société introuvable" });
  }

  // Les réglages arrivent en booléens ; la base les range en 0 ou 1. Le tiroir
  // les propose dès la création, mais un tableau créé sans eux garde les
  // valeurs par défaut : numéros montrés, tableau ouvert à tous.
  const showNumbers =
    req.body.show_card_numbers === undefined ? 1 : Number(Boolean(req.body.show_card_numbers));
  const isPrivate = Number(Boolean(req.body.is_private));

  // Nouveau tableau ajouté à la suite de ceux de cette société.
  const { next } = db
    .prepare("SELECT COALESCE(MAX(position), -1) + 1 AS next FROM boards WHERE company_id = ?")
    .get(company_id);
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO boards (company_id, name, position, show_card_numbers, is_private, owner_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(company_id, name, next, showNumbers, isPrivate, req.user.id, now());
  res.status(201).json(boardById.get(lastInsertRowid));
});

app.put("/api/boards/:id", (req, res) => {
  const existing = boardOuvert(req.params.id, req.user);
  if (!existing) return res.status(404).json(BOARD_INTROUVABLE);

  const name = (req.body.name ?? existing.name).trim();
  if (!name) return res.status(400).json({ error: "Le nom du tableau est requis" });
  // Le réglage arrive en booléen ; la base le range en 0 ou 1.
  const showNumbers =
    req.body.show_card_numbers === undefined
      ? existing.show_card_numbers
      : Number(Boolean(req.body.show_card_numbers));
  const isPrivate =
    req.body.is_private === undefined
      ? existing.is_private
      : Number(Boolean(req.body.is_private));

  // Fermer un tableau, c'est se le réserver : son auteur seul en décide. Ceux
  // d'avant l'option n'en ont pas — le premier à les fermer les adopte.
  let owner = existing.owner_id;
  if (isPrivate !== existing.is_private) {
    if (owner === null) owner = req.user.id;
    else if (owner !== req.user.id) {
      return res.status(403).json({ error: "Seul l'auteur du tableau peut le rendre privé" });
    }
  }

  db.prepare(
    "UPDATE boards SET name = ?, show_card_numbers = ?, is_private = ?, owner_id = ? WHERE id = ?"
  ).run(name, showNumbers, isPrivate, owner, req.params.id);
  res.json(boardById.get(req.params.id));
});

// Les listes du tableau, et leurs cartes, partent avec lui (ON DELETE CASCADE).
app.delete("/api/boards/:id", (req, res) => {
  if (!boardOuvert(req.params.id, req.user)) return res.status(404).json(BOARD_INTROUVABLE);
  const info = db.prepare("DELETE FROM boards WHERE id = ?").run(req.params.id);
  if (info.changes === 0) return res.status(404).json(BOARD_INTROUVABLE);
  res.status(204).end();
});

// --- Listes de tâches ------------------------------------------------------

const taskListById = db.prepare("SELECT * FROM task_lists WHERE id = ?");

const taskCardsByBoard = db.prepare(
  `SELECT task_cards.*
   FROM task_cards
   JOIN task_lists ON task_lists.id = task_cards.list_id
   WHERE task_lists.board_id = ?
   ORDER BY task_cards.position, task_cards.id`
);

// Les membres de toutes les cartes d'un tableau, en une seule requête : la
// carte les montre en bulles, il ne faut pas les demander une par une.
const cardMembersByBoard = db.prepare(
  `SELECT card_members.card_id, users.id, users.name, users.email
   FROM card_members
   JOIN task_cards ON task_cards.id = card_members.card_id
   JOIN task_lists ON task_lists.id = task_cards.list_id
   JOIN users ON users.id = card_members.user_id
   WHERE task_lists.board_id = ?
   ORDER BY users.name`
);

// Les étiquettes de toutes les cartes d'un tableau, en une seule requête : la
// carte les montre au-dessus de son titre.
const cardLabelsByBoard = db.prepare(
  `SELECT card_labels.card_id, labels.*
   FROM card_labels
   JOIN labels ON labels.id = card_labels.label_id
   JOIN task_cards ON task_cards.id = card_labels.card_id
   JOIN task_lists ON task_lists.id = task_cards.list_id
   WHERE task_lists.board_id = ?
   ORDER BY labels.position, labels.id`
);

// Les checklists de toutes les cartes d'un tableau, comptées en une seule
// requête : la carte n'en montre que le total et le nombre de cases cochées.
const checklistCountsByBoard = db.prepare(
  `SELECT card_checklists.card_id,
          COUNT(checklist_items.id) AS total,
          COALESCE(SUM(checklist_items.done), 0) AS done
   FROM card_checklists
   JOIN task_cards ON task_cards.id = card_checklists.card_id
   JOIN task_lists ON task_lists.id = task_cards.list_id
   LEFT JOIN checklist_items ON checklist_items.checklist_id = card_checklists.id
   WHERE task_lists.board_id = ?
   GROUP BY card_checklists.card_id`
);

// Les éléments non cochés de toutes les cartes d'un tableau : c'est ce que
// déplie la pastille d'une carte, pour voir ce qu'il reste à faire sans
// ouvrir la fiche. Une fois cochés, ils n'y figurent plus.
const openChecklistItemsByBoard = db.prepare(
  `SELECT card_checklists.card_id, checklist_items.id, checklist_items.text
   FROM checklist_items
   JOIN card_checklists ON card_checklists.id = checklist_items.checklist_id
   JOIN task_cards ON task_cards.id = card_checklists.card_id
   JOIN task_lists ON task_lists.id = task_cards.list_id
   WHERE task_lists.board_id = ? AND checklist_items.done = 0
   ORDER BY card_checklists.position, card_checklists.id,
            checklist_items.position, checklist_items.id`
);

// Un éditeur vide rend « <p></p> » : ce n'est pas du texte. Le tableau ne doit
// pas signaler une description là où il n'y a rien à lire.
const porteDuTexte = (html) =>
  String(html || "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim() !== "";

// Le tableau se lit d'un bloc : chaque liste porte ses cartes, dans l'ordre, et
// chaque carte ses membres. La description, elle, ne suit pas : seule son
// existence intéresse la carte, sa fiche ira chercher le texte.
const listsWithCards = (boardId) => {
  const cards = taskCardsByBoard.all(boardId);

  const comptesParCarte = new Map();
  for (const ligne of checklistCountsByBoard.all(boardId)) {
    const cumul = comptesParCarte.get(ligne.card_id) || { total: 0, done: 0 };
    // Plusieurs checklists sur une carte : les cases s'additionnent, la
    // pastille n'en montre qu'un seul rapport.
    comptesParCarte.set(ligne.card_id, {
      total: cumul.total + ligne.total,
      done: cumul.done + ligne.done,
    });
  }

  const restantsParCarte = new Map();
  for (const { card_id, ...item } of openChecklistItemsByBoard.all(boardId)) {
    if (!restantsParCarte.has(card_id)) restantsParCarte.set(card_id, []);
    restantsParCarte.get(card_id).push(item);
  }

  const etiquettesParCarte = new Map();
  for (const { card_id, ...label } of cardLabelsByBoard.all(boardId)) {
    if (!etiquettesParCarte.has(card_id)) etiquettesParCarte.set(card_id, []);
    etiquettesParCarte.get(card_id).push(label);
  }

  const parCarte = new Map();
  for (const row of cardMembersByBoard.all(boardId)) {
    if (!parCarte.has(row.card_id)) parCarte.set(row.card_id, []);
    parCarte.get(row.card_id).push({
      id: row.id,
      name: row.name || row.email,
      email: row.email,
      gravatar_url: gravatarUrl(row.email),
    });
  }

  return db
    .prepare("SELECT * FROM task_lists WHERE board_id = ? ORDER BY position, id")
    .all(boardId)
    .map((list) => ({
      ...list,
      cards: cards
        .filter((card) => card.list_id === list.id)
        .map(({ description, ...card }) => ({
          ...card,
          has_description: porteDuTexte(description),
          members: parCarte.get(card.id) || [],
          labels: etiquettesParCarte.get(card.id) || [],
          checklist_total: comptesParCarte.get(card.id)?.total || 0,
          checklist_done: comptesParCarte.get(card.id)?.done || 0,
          checklist_open: restantsParCarte.get(card.id) || [],
        })),
    }));
};

// Les listes appartiennent à un tableau : la requête doit préciser lequel.
app.get("/api/task-lists", (req, res) => {
  const { board } = req.query;
  if (!board) return res.status(400).json({ error: "Le paramètre board est requis" });
  if (!boardOuvert(board, req.user)) return res.status(404).json(BOARD_INTROUVABLE);
  res.json(listsWithCards(board));
});

app.post("/api/task-lists", (req, res) => {
  const name = (req.body.name || "").trim();
  const { board_id } = req.body;
  if (!name) return res.status(400).json({ error: "Le nom de la liste est requis" });
  if (!board_id) return res.status(400).json({ error: "Le tableau est requis" });
  if (!boardOuvert(board_id, req.user)) return res.status(404).json(BOARD_INTROUVABLE);

  // Nouvelle liste ajoutée à la fin de celles de ce tableau.
  const { next } = db
    .prepare("SELECT COALESCE(MAX(position), -1) + 1 AS next FROM task_lists WHERE board_id = ?")
    .get(board_id);
  const { lastInsertRowid } = db
    .prepare("INSERT INTO task_lists (board_id, name, position, created_at) VALUES (?, ?, ?, ?)")
    .run(board_id, name, next, now());
  res.status(201).json({ ...taskListById.get(lastInsertRowid), cards: [] });
});

// Réordonnancement complet. Déclaré avant « /:id », sinon « reorder » serait
// interprété comme un identifiant.
const reorderTaskLists = db.transaction((ids) => {
  const update = db.prepare("UPDATE task_lists SET position = ? WHERE id = ?");
  ids.forEach((id, index) => update.run(index, id));
});

app.put("/api/task-lists/reorder", (req, res) => {
  const { ids, board_id } = req.body;
  if (!Array.isArray(ids)) return res.status(400).json({ error: "ids doit être un tableau" });
  if (!board_id) return res.status(400).json({ error: "Le tableau est requis" });
  if (!boardOuvert(board_id, req.user)) return res.status(404).json(BOARD_INTROUVABLE);

  // L'ordre envoyé doit couvrir exactement les listes de ce tableau.
  const connues = new Set(
    db.prepare("SELECT id FROM task_lists WHERE board_id = ?").all(board_id).map((l) => l.id)
  );
  if (ids.length !== connues.size || ids.some((id) => !connues.has(Number(id)))) {
    return res
      .status(400)
      .json({ error: "La liste des identifiants ne correspond pas aux listes de ce tableau" });
  }

  reorderTaskLists(ids.map(Number));
  res.json(listsWithCards(board_id));
});

// Couleurs proposées dans le menu d'une liste. La chaîne vide vaut « aucune » ;
// « white » est le blanc qui s'inverse en noir sur le thème clair.
const COULEURS_LISTE = [
  "",
  "green",
  "blue",
  "violet",
  "pink",
  "red",
  "orange",
  "yellow",
  "gray",
  "white",
];

app.put("/api/task-lists/:id", (req, res) => {
  const existing = taskListById.get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Liste introuvable" });

  const name = (req.body.name ?? existing.name).trim();
  if (!name) return res.status(400).json({ error: "Le nom de la liste est requis" });
  const color = req.body.color ?? existing.color ?? "";
  if (!COULEURS_LISTE.includes(color)) {
    return res.status(400).json({ error: "Couleur inconnue" });
  }

  // Changement de tableau : la liste emporte ses cartes et se range à la fin
  // du tableau d'accueil, comme une liste qu'on viendrait d'y créer.
  const boardId = req.body.board_id ?? existing.board_id;
  // Le tableau de départ comme celui d'accueil doivent être ouverts à cette
  // personne : une liste ne sort pas d'un tableau privé, et n'y entre pas.
  if (!boardOuvert(existing.board_id, req.user) || !boardOuvert(boardId, req.user)) {
    return res.status(404).json(BOARD_INTROUVABLE);
  }
  const change = Number(boardId) !== existing.board_id;
  const position = change
    ? db
        .prepare("SELECT COALESCE(MAX(position), -1) + 1 AS next FROM task_lists WHERE board_id = ?")
        .get(boardId).next
    : (req.body.position ?? existing.position);

  db.prepare(
    "UPDATE task_lists SET board_id = ?, name = ?, position = ?, color = ? WHERE id = ?"
  ).run(boardId, name, position, color, req.params.id);
  res.json(taskListById.get(req.params.id));
});

app.delete("/api/task-lists/:id", (req, res) => {
  const info = db.prepare("DELETE FROM task_lists WHERE id = ?").run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: "Liste introuvable" });
  res.status(204).end();
});

// --- Cartes des listes -----------------------------------------------------
// Une carte appartient à une liste ; elle disparaît avec elle (ON DELETE
// CASCADE défini sur la clé étrangère).

const taskCardById = db.prepare("SELECT * FROM task_cards WHERE id = ?");

// Ce qu'une liste peut porter : une carte, ou un séparateur qui titre ce qui
// suit. Ils se saisissent, se déplacent et se suppriment de la même façon ;
// seul l'affichage les distingue.
const GENRES_CARTE = ["card", "separator"];

app.post("/api/task-cards", (req, res) => {
  const text = (req.body.text || "").trim();
  const { list_id } = req.body;
  const kind = req.body.kind || "card";
  if (!text) return res.status(400).json({ error: "Le texte de la carte est requis" });
  if (!list_id) return res.status(400).json({ error: "La liste est requise" });
  if (!GENRES_CARTE.includes(kind)) return res.status(400).json({ error: "Genre de carte inconnu" });
  if (!taskListById.get(list_id)) return res.status(404).json({ error: "Liste introuvable" });

  // Nouvelle carte ajoutée à la fin de sa liste.
  const { next } = db
    .prepare("SELECT COALESCE(MAX(position), -1) + 1 AS next FROM task_cards WHERE list_id = ?")
    .get(list_id);

  // Le numéro affiché se compte par tableau : on prend le suivant parmi les
  // cartes de toutes ses listes. Il ne bouge plus ensuite, même si la carte
  // change de liste. Un séparateur n'en porte pas et n'en consomme donc pas.
  const { numero } = db
    .prepare(
      `SELECT COALESCE(MAX(task_cards.number), 0) + 1 AS numero
       FROM task_cards
       JOIN task_lists ON task_lists.id = task_cards.list_id
       WHERE task_lists.board_id = ?`
    )
    .get(taskListById.get(list_id).board_id);

  const timestamp = now();
  const { lastInsertRowid } = db
    .prepare(
      "INSERT INTO task_cards (list_id, text, position, number, kind, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .run(list_id, text, next, kind === "separator" ? 0 : numero, kind, timestamp);

  // Le fil d'une carte s'ouvre sur sa création. Un séparateur n'a pas de
  // fiche, donc pas de fil.
  if (kind !== "separator") {
    db.prepare(
      `INSERT INTO card_comments (card_id, user_id, text, system, created_at, updated_at)
       VALUES (?, ?, ?, 1, ?, ?)`
    ).run(
      lastInsertRowid,
      req.user.id,
      `Carte créée le ${horodatage(timestamp)}`,
      timestamp,
      timestamp
    );
  }

  res.status(201).json(taskCardById.get(lastInsertRowid));
});

// Déplacement dans la liste ou d'une liste vers une autre. Déclaré avant
// « /:id », sinon « reorder » serait interprété comme un identifiant.
// L'ordre reçu est celui, complet, de la liste d'accueil : les cartes venues
// d'une autre liste y sont rattachées au passage.
const reorderTaskCards = db.transaction((listId, ids) => {
  const update = db.prepare("UPDATE task_cards SET list_id = ?, position = ? WHERE id = ?");
  ids.forEach((id, index) => update.run(listId, index, id));
});

app.put("/api/task-cards/reorder", (req, res) => {
  const { list_id, ids } = req.body;
  if (!Array.isArray(ids)) return res.status(400).json({ error: "ids doit être un tableau" });
  const list = list_id ? taskListById.get(list_id) : null;
  if (!list) return res.status(404).json({ error: "Liste introuvable" });

  const ordre = ids.map(Number);

  // Une carte ne se déplace qu'entre les listes d'un même tableau.
  const connues = new Set(taskCardsByBoard.all(list.board_id).map((c) => c.id));
  if (ordre.some((id) => !connues.has(id))) {
    return res.status(400).json({ error: "Une carte n'appartient pas à ce tableau" });
  }

  // L'ordre reçu doit couvrir toutes les cartes déjà dans la liste d'accueil,
  // sinon celles omises garderaient une position devenue fausse.
  const actuelles = db.prepare("SELECT id FROM task_cards WHERE list_id = ?").all(list.id);
  if (actuelles.some((c) => !ordre.includes(c.id))) {
    return res
      .status(400)
      .json({ error: "L'ordre reçu ne couvre pas toutes les cartes de cette liste" });
  }

  reorderTaskCards(list.id, ordre);
  res.json(listsWithCards(list.board_id));
});

// Modification d'une carte : son texte seul depuis le tableau, sa fiche
// entière depuis son tiroir. Chaque champ absent du corps reste tel quel.
app.put("/api/task-cards/:id", (req, res) => {
  const existing = taskCardById.get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Carte introuvable" });

  const text = (req.body.text ?? existing.text).trim();
  if (!text) return res.status(400).json({ error: "Le texte de la carte est requis" });
  const description = descriptionPropre(req.body.description ?? existing.description ?? "");

  db.prepare("UPDATE task_cards SET text = ?, description = ? WHERE id = ?").run(
    text,
    description,
    req.params.id
  );

  if (Array.isArray(req.body.member_ids)) {
    replaceCardMembers(req.params.id, req.body.member_ids.map(Number));
  }
  if (Array.isArray(req.body.label_ids)) {
    replaceCardLabels(req.params.id, req.body.label_ids.map(Number), boardOfCard(existing));
  }

  res.json(cardDetail(taskCardById.get(req.params.id)));
});

// --- Fiche d'une carte -----------------------------------------------------
// Une carte porte, en plus de son texte, une description en texte enrichi, des
// membres, des étiquettes et son propre fil de commentaires. Un séparateur n'a
// rien de tout cela : il n'a pas de fiche.

const cardMembersByCard = db.prepare(
  `SELECT users.id, users.name, users.email
   FROM card_members
   JOIN users ON users.id = card_members.user_id
   WHERE card_members.card_id = ?
   ORDER BY users.name`
);

const membersOf = (cardId) =>
  cardMembersByCard.all(cardId).map((u) => ({
    id: u.id,
    name: u.name || u.email,
    email: u.email,
    gravatar_url: gravatarUrl(u.email),
  }));

const replaceCardMembers = db.transaction((cardId, userIds) => {
  db.prepare("DELETE FROM card_members WHERE card_id = ?").run(cardId);
  const insert = db.prepare(
    "INSERT OR IGNORE INTO card_members (card_id, user_id) VALUES (?, ?)"
  );
  for (const userId of userIds) {
    if (db.prepare("SELECT id FROM users WHERE id = ?").get(userId)) insert.run(cardId, userId);
  }
});

const cardLabelsByCard = db.prepare(
  `SELECT labels.*
   FROM card_labels
   JOIN labels ON labels.id = card_labels.label_id
   WHERE card_labels.card_id = ?
   ORDER BY labels.position, labels.id`
);

// Une carte ne porte que les étiquettes de son propre tableau : celles d'un
// autre tableau sont ignorées plutôt que refusées, comme pour les acteurs.
const replaceCardLabels = db.transaction((cardId, labelIds, boardId) => {
  db.prepare("DELETE FROM card_labels WHERE card_id = ?").run(cardId);
  const insert = db.prepare(
    "INSERT OR IGNORE INTO card_labels (card_id, label_id) VALUES (?, ?)"
  );
  const known = db.prepare("SELECT id FROM labels WHERE id = ? AND board_id = ?");
  for (const labelId of labelIds) {
    if (known.get(labelId, boardId)) insert.run(cardId, labelId);
  }
});

const CARD_COMMENT_SELECT = `
  SELECT card_comments.*, users.name AS author_name, users.email AS author_email
  FROM card_comments
  LEFT JOIN users ON users.id = card_comments.user_id
`;

const cardCommentById = db.prepare(`${CARD_COMMENT_SELECT} WHERE card_comments.id = ?`);
const cardCommentsByCard = db.prepare(
  `${CARD_COMMENT_SELECT} WHERE card_comments.card_id = ? ORDER BY card_comments.created_at ASC`
);

// Le tableau qui porte une carte, par sa liste : les étiquettes s'y rattachent.
const boardOfCard = (card) => taskListById.get(card.list_id).board_id;

// La carte et tout ce qui l'accompagne, pour son tiroir.
const cardDetail = (card) => ({
  ...card,
  members: membersOf(card.id),
  labels: cardLabelsByCard.all(card.id),
  checklists: checklistsOfCard(card.id),
  comments: cardCommentsByCard.all(card.id).map(withAuthor),
});

app.get("/api/task-cards/:id", (req, res) => {
  const card = taskCardById.get(req.params.id);
  if (!card) return res.status(404).json({ error: "Carte introuvable" });
  res.json(cardDetail(card));
});

app.post("/api/task-cards/:id/comments", (req, res) => {
  const card = taskCardById.get(req.params.id);
  if (!card) return res.status(404).json({ error: "Carte introuvable" });
  const text = (req.body.text || "").trim();
  if (!text) return res.status(400).json({ error: "text est requis" });

  const timestamp = now();
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO card_comments (card_id, user_id, text, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(req.params.id, req.user.id, text, timestamp, timestamp);
  res.status(201).json(withAuthor(cardCommentById.get(lastInsertRowid)));
});

app.put("/api/card-comments/:id", (req, res) => {
  const comment = cardCommentById.get(req.params.id);
  if (!comment) return res.status(404).json({ error: "Commentaire introuvable" });
  if (comment.system) return res.status(403).json(COMMENTAIRE_SYSTEME);
  const text = (req.body.text || "").trim();
  if (!text) return res.status(400).json({ error: "text est requis" });

  // Un texte identique n'est pas une modification : la date ne bouge pas, et
  // le commentaire ne se met pas à porter « (modifié) ».
  if (text === comment.text) return res.json(withAuthor(comment));

  db.prepare("UPDATE card_comments SET text = ?, updated_at = ? WHERE id = ?").run(
    text,
    now(),
    req.params.id
  );
  res.json(withAuthor(cardCommentById.get(req.params.id)));
});

app.delete("/api/card-comments/:id", (req, res) => {
  const comment = cardCommentById.get(req.params.id);
  if (!comment) return res.status(404).json({ error: "Commentaire introuvable" });
  if (comment.system) return res.status(403).json(COMMENTAIRE_SYSTEME);

  db.prepare("DELETE FROM card_comments WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

// --- Checklists d'une carte -----------------------------------------------
// Une carte porte autant de checklists qu'elle veut ; chacune a un titre et
// ses éléments, qui se cochent, se datent, se confient à des membres et se
// glissent pour être réordonnés. Tout part avec la carte (ON DELETE CASCADE).

const checklistById = db.prepare("SELECT * FROM card_checklists WHERE id = ?");
const checklistItemById = db.prepare("SELECT * FROM checklist_items WHERE id = ?");

const checklistItemMembers = db.prepare(
  `SELECT users.id, users.name, users.email
   FROM checklist_item_members
   JOIN users ON users.id = checklist_item_members.user_id
   WHERE checklist_item_members.item_id = ?
   ORDER BY users.name`
);

const replaceChecklistItemMembers = db.transaction((itemId, userIds) => {
  db.prepare("DELETE FROM checklist_item_members WHERE item_id = ?").run(itemId);
  const insert = db.prepare(
    "INSERT OR IGNORE INTO checklist_item_members (item_id, user_id) VALUES (?, ?)"
  );
  const connu = db.prepare("SELECT id FROM users WHERE id = ?");
  for (const userId of userIds) {
    if (connu.get(userId)) insert.run(itemId, userId);
  }
});

// Une date d'échéance s'écrit « AAAA-MM-JJ », comme les sélecteurs de Mantine
// la produisent. Tout le reste vaut « pas de date » plutôt qu'une erreur : le
// champ est facultatif.
const dateEcheance = (valeur) =>
  /^\d{4}-\d{2}-\d{2}$/.test(String(valeur || "")) ? String(valeur) : "";

const itemsOfChecklist = (checklistId) =>
  db
    .prepare(
      "SELECT * FROM checklist_items WHERE checklist_id = ? ORDER BY position, id"
    )
    .all(checklistId)
    .map((item) => ({
      ...item,
      members: checklistItemMembers.all(item.id).map((u) => ({
        id: u.id,
        name: u.name || u.email,
        email: u.email,
        gravatar_url: gravatarUrl(u.email),
      })),
    }));

const checklistsOfCard = (cardId) =>
  db
    .prepare("SELECT * FROM card_checklists WHERE card_id = ? ORDER BY position, id")
    .all(cardId)
    .map((checklist) => ({ ...checklist, items: itemsOfChecklist(checklist.id) }));

// La carte qui porte un élément, par sa checklist : la réponse renvoie la
// carte entière, pour que le tiroir se remette à jour d'un bloc.
const checklistOfItem = (item) => checklistById.get(item.checklist_id);

app.post("/api/task-cards/:id/checklists", (req, res) => {
  const card = taskCardById.get(req.params.id);
  if (!card) return res.status(404).json({ error: "Carte introuvable" });

  const title = (req.body.title || "Checklist").trim() || "Checklist";
  const { next } = db
    .prepare(
      "SELECT COALESCE(MAX(position), -1) + 1 AS next FROM card_checklists WHERE card_id = ?"
    )
    .get(card.id);

  const { lastInsertRowid } = db
    .prepare(
      "INSERT INTO card_checklists (card_id, title, position, created_at) VALUES (?, ?, ?, ?)"
    )
    .run(card.id, title, next, now());

  res.status(201).json({ ...checklistById.get(lastInsertRowid), items: [] });
});

// L'ordre reçu est celui, complet, des checklists de la carte. Déclaré avant
// « /checklists/:id », qui ne s'y trompe pas, mais surtout à côté de la carte
// qu'il concerne.
const reorderChecklists = db.transaction((cardId, ids) => {
  const update = db.prepare(
    "UPDATE card_checklists SET position = ? WHERE id = ? AND card_id = ?"
  );
  ids.forEach((id, index) => update.run(index, id, cardId));
});

app.put("/api/task-cards/:id/checklists/reorder", (req, res) => {
  const card = taskCardById.get(req.params.id);
  if (!card) return res.status(404).json({ error: "Carte introuvable" });
  const { ids } = req.body;
  if (!Array.isArray(ids)) return res.status(400).json({ error: "ids doit être un tableau" });

  const ordre = ids.map(Number);
  const connues = new Set(
    db
      .prepare("SELECT id FROM card_checklists WHERE card_id = ?")
      .all(card.id)
      .map((c) => c.id)
  );
  // Une checklist ne se glisse qu'à l'intérieur de sa carte, et l'ordre reçu
  // doit toutes les couvrir : sinon les omises garderaient une position
  // devenue fausse.
  if (ordre.length !== connues.size || ordre.some((id) => !connues.has(id))) {
    return res
      .status(400)
      .json({ error: "L'ordre reçu ne couvre pas les checklists de cette carte" });
  }

  reorderChecklists(card.id, ordre);
  res.json(checklistsOfCard(card.id));
});

app.put("/api/checklists/:id", (req, res) => {
  const checklist = checklistById.get(req.params.id);
  if (!checklist) return res.status(404).json({ error: "Checklist introuvable" });

  const title = (req.body.title ?? checklist.title).trim();
  if (!title) return res.status(400).json({ error: "Le titre de la checklist est requis" });

  db.prepare("UPDATE card_checklists SET title = ? WHERE id = ?").run(title, checklist.id);
  res.json({ ...checklistById.get(checklist.id), items: itemsOfChecklist(checklist.id) });
});

app.delete("/api/checklists/:id", (req, res) => {
  const info = db.prepare("DELETE FROM card_checklists WHERE id = ?").run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: "Checklist introuvable" });
  res.status(204).end();
});

// Un élément naît en bas de sa checklist, sans libellé : on le saisit ensuite
// sur place.
app.post("/api/checklists/:id/items", (req, res) => {
  const checklist = checklistById.get(req.params.id);
  if (!checklist) return res.status(404).json({ error: "Checklist introuvable" });

  const text = (req.body.text || "").trim();
  const { next } = db
    .prepare(
      "SELECT COALESCE(MAX(position), -1) + 1 AS next FROM checklist_items WHERE checklist_id = ?"
    )
    .get(checklist.id);

  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO checklist_items (checklist_id, text, position, created_at)
       VALUES (?, ?, ?, ?)`
    )
    .run(checklist.id, text, next, now());

  res.status(201).json({ ...checklistItemById.get(lastInsertRowid), members: [] });
});

// L'ordre reçu est celui, complet, des éléments de la checklist. Déclaré avant
// « /:id », sinon « reorder » passerait pour un identifiant.
const reorderChecklistItems = db.transaction((checklistId, ids) => {
  const update = db.prepare(
    "UPDATE checklist_items SET position = ? WHERE id = ? AND checklist_id = ?"
  );
  ids.forEach((id, index) => update.run(index, id, checklistId));
});

app.put("/api/checklists/:id/items/reorder", (req, res) => {
  const checklist = checklistById.get(req.params.id);
  if (!checklist) return res.status(404).json({ error: "Checklist introuvable" });
  const { ids } = req.body;
  if (!Array.isArray(ids)) return res.status(400).json({ error: "ids doit être un tableau" });

  const ordre = ids.map(Number);
  const connus = new Set(
    db
      .prepare("SELECT id FROM checklist_items WHERE checklist_id = ?")
      .all(checklist.id)
      .map((i) => i.id)
  );
  // Un élément ne se glisse qu'à l'intérieur de sa propre checklist, et
  // l'ordre reçu doit tous les couvrir : sinon les omis garderaient une
  // position devenue fausse.
  if (ordre.length !== connus.size || ordre.some((id) => !connus.has(id))) {
    return res
      .status(400)
      .json({ error: "L'ordre reçu ne couvre pas les éléments de cette checklist" });
  }

  reorderChecklistItems(checklist.id, ordre);
  res.json({ ...checklist, items: itemsOfChecklist(checklist.id) });
});

// Chaque champ absent du corps reste tel quel : cocher une case n'efface ni le
// libellé, ni la date, ni les membres.
app.put("/api/checklist-items/:id", (req, res) => {
  const existing = checklistItemById.get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Élément introuvable" });

  const text = (req.body.text ?? existing.text).trim();
  const done =
    req.body.done === undefined ? existing.done : Number(Boolean(req.body.done));
  const dueDate =
    req.body.due_date === undefined ? existing.due_date : dateEcheance(req.body.due_date);

  db.prepare(
    "UPDATE checklist_items SET text = ?, done = ?, due_date = ? WHERE id = ?"
  ).run(text, done, dueDate, existing.id);

  if (Array.isArray(req.body.member_ids)) {
    replaceChecklistItemMembers(existing.id, req.body.member_ids.map(Number));
  }

  const checklist = checklistOfItem(existing);
  res.json({ ...checklist, items: itemsOfChecklist(checklist.id) });
});

app.delete("/api/checklist-items/:id", (req, res) => {
  const info = db.prepare("DELETE FROM checklist_items WHERE id = ?").run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: "Élément introuvable" });
  res.status(204).end();
});

// --- Étiquettes d'un tableau ----------------------------------------------
// Elles vivent avec leur tableau (ON DELETE CASCADE) et se posent sur ses
// cartes. La palette double celle du client (client/src/components/ui/LabelChip.jsx).

// Une couleur s'écrit « teinte.nuance » (« red.6 »), comme chez Mantine. Les
// teintes sont celles de la matrice proposée par le client
// (client/src/components/ui/LabelChip.jsx) ; la nuance va de 0 à 9. La teinte
// seule reste acceptée : c'est ce que portent les étiquettes créées avant la
// matrice.
const TEINTES_ETIQUETTE = ["gray", "red", "orange", "yellow", "green", "teal", "blue", "grape"];

const couleurEtiquetteValide = (couleur) => {
  const [teinte, nuance, ...reste] = String(couleur).split(".");
  if (reste.length > 0) return false;
  if (!TEINTES_ETIQUETTE.includes(teinte)) return false;
  return nuance === undefined || /^[0-9]$/.test(nuance);
};

const labelById = db.prepare("SELECT * FROM labels WHERE id = ?");

app.get("/api/labels", (req, res) => {
  const { board } = req.query;
  if (!board) return res.status(400).json({ error: "Le paramètre board est requis" });
  if (!boardOuvert(board, req.user)) return res.status(404).json(BOARD_INTROUVABLE);
  res.json(
    db
      .prepare("SELECT * FROM labels WHERE board_id = ? ORDER BY position, id")
      .all(board)
  );
});

app.post("/api/labels", (req, res) => {
  const name = (req.body.name || "").trim();
  const { board_id } = req.body;
  const color = req.body.color || "blue.6";
  if (!name) return res.status(400).json({ error: "Le nom de l'étiquette est requis" });
  if (!board_id) return res.status(400).json({ error: "Le tableau est requis" });
  if (!couleurEtiquetteValide(color)) return res.status(400).json({ error: "Couleur inconnue" });
  if (!boardOuvert(board_id, req.user)) return res.status(404).json(BOARD_INTROUVABLE);

  const { next } = db
    .prepare("SELECT COALESCE(MAX(position), -1) + 1 AS next FROM labels WHERE board_id = ?")
    .get(board_id);
  const { lastInsertRowid } = db
    .prepare("INSERT INTO labels (board_id, name, color, position, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(board_id, name, color, next, now());
  res.status(201).json(labelById.get(lastInsertRowid));
});

app.put("/api/labels/:id", (req, res) => {
  const existing = labelById.get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Étiquette introuvable" });

  const name = (req.body.name ?? existing.name).trim();
  const color = req.body.color ?? existing.color;
  if (!name) return res.status(400).json({ error: "Le nom de l'étiquette est requis" });
  if (!couleurEtiquetteValide(color)) return res.status(400).json({ error: "Couleur inconnue" });

  db.prepare("UPDATE labels SET name = ?, color = ? WHERE id = ?").run(name, color, req.params.id);
  res.json(labelById.get(req.params.id));
});

app.delete("/api/labels/:id", (req, res) => {
  const info = db.prepare("DELETE FROM labels WHERE id = ?").run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: "Étiquette introuvable" });
  res.status(204).end();
});

// --- Étiquettes d'un tableau de projets ------------------------------------
// Les mêmes règles que celles des cartes — un nom, une couleur « teinte.nuance »
// et un rang —, mais rattachées à un tableau de projets. Un tableau de projets
// est ouvert à tous : il n'a pas la visibilité restreinte des tableaux de
// tâches, donc aucun contrôle d'accès ici.

const projectLabelById = db.prepare("SELECT * FROM project_labels WHERE id = ?");

app.get("/api/project-labels", (req, res) => {
  const { board } = req.query;
  if (!board) return res.status(400).json({ error: "Le paramètre board est requis" });
  res.json(
    db
      .prepare("SELECT * FROM project_labels WHERE board_id = ? ORDER BY position, id")
      .all(board)
  );
});

app.post("/api/project-labels", (req, res) => {
  const name = (req.body.name || "").trim();
  const { board_id } = req.body;
  const color = req.body.color || "blue.6";
  if (!name) return res.status(400).json({ error: "Le nom de l'étiquette est requis" });
  if (!board_id) return res.status(400).json({ error: "Le tableau est requis" });
  if (!couleurEtiquetteValide(color)) return res.status(400).json({ error: "Couleur inconnue" });
  if (!projectBoardById.get(board_id)) {
    return res.status(404).json({ error: "Tableau introuvable" });
  }

  const { next } = db
    .prepare(
      "SELECT COALESCE(MAX(position), -1) + 1 AS next FROM project_labels WHERE board_id = ?"
    )
    .get(board_id);
  const { lastInsertRowid } = db
    .prepare(
      "INSERT INTO project_labels (board_id, name, color, position, created_at) VALUES (?, ?, ?, ?, ?)"
    )
    .run(board_id, name, color, next, now());
  res.status(201).json(projectLabelById.get(lastInsertRowid));
});

app.put("/api/project-labels/:id", (req, res) => {
  const existing = projectLabelById.get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Étiquette introuvable" });

  const name = (req.body.name ?? existing.name).trim();
  const color = req.body.color ?? existing.color;
  if (!name) return res.status(400).json({ error: "Le nom de l'étiquette est requis" });
  if (!couleurEtiquetteValide(color)) return res.status(400).json({ error: "Couleur inconnue" });

  db.prepare("UPDATE project_labels SET name = ?, color = ? WHERE id = ?").run(
    name,
    color,
    req.params.id
  );
  res.json(projectLabelById.get(req.params.id));
});

app.delete("/api/project-labels/:id", (req, res) => {
  const info = db.prepare("DELETE FROM project_labels WHERE id = ?").run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: "Étiquette introuvable" });
  res.status(204).end();
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
  const { board, category, company, building, status, actor } = req.query;
  const clauses = [];
  const params = {};

  // Les projets sont toujours regardés depuis un tableau : sans ce filtre, on
  // mélangerait les projets de tous les onglets.
  if (board && board !== "all") {
    clauses.push("projects.board_id = @board");
    params.board = board;
  }
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
  // Un projet a plusieurs acteurs : on retient ceux auxquels celui-ci est lié.
  if (actor && actor !== "all") {
    clauses.push("projects.id IN (SELECT project_id FROM project_actors WHERE user_id = @actor)");
    params.actor = actor;
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
  res.json(withProjectRelations(rows));
});

app.get("/api/projects/:id", (req, res) => {
  const project = projectWithRelations.get(req.params.id);
  if (!project) return res.status(404).json({ error: "Projet introuvable" });
  const comments = commentsByProject.all(req.params.id).map(withAuthor);
  res.json({ ...withProjectRelations(project), comments });
});

// La catégorie retenue doit appartenir au tableau du projet : sinon le projet
// porterait une catégorie absente de son onglet.
const categoryOutsideBoard = (categoryId, boardId) => {
  const category = categoryById.get(categoryId);
  return !category || String(category.board_id) !== String(boardId);
};

app.post("/api/projects", (req, res) => {
  const {
    name,
    description = "",
    board_id,
    category_id,
    company_id = null,
    building_id = null,
    status = 0,
    actor_ids = [],
    label_ids = [],
  } = req.body;
  if (!name || !board_id || !category_id) {
    return res.status(400).json({ error: "name, board_id et category_id sont requis" });
  }
  if (!projectBoardById.get(board_id)) {
    return res.status(404).json({ error: "Tableau introuvable" });
  }
  if (categoryOutsideBoard(category_id, board_id)) {
    return res.status(400).json({ error: "Cette catégorie n'appartient pas au tableau" });
  }
  const timestamp = now();
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO projects (name, description, board_id, category_id, company_id, building_id, status, created_at, updated_at)
       VALUES (@name, @description, @board_id, @category_id, @company_id, @building_id, @status, @created_at, @updated_at)`
    )
    .run({
      name,
      description: descriptionPropre(description),
      board_id,
      category_id,
      company_id,
      building_id,
      status,
      created_at: timestamp,
      updated_at: timestamp,
    });
  replaceActors(lastInsertRowid, actor_ids);
  replaceProjectLabels(lastInsertRowid, label_ids.map(Number), board_id);

  // Le fil s'ouvre sur la création : qui, et quand. Les commentaires écrits
  // ensuite viennent à la suite.
  db.prepare(
    `INSERT INTO comments (project_id, user_id, text, system, created_at, updated_at)
     VALUES (?, ?, ?, 1, ?, ?)`
  ).run(
    lastInsertRowid,
    req.user.id,
    `Projet créé le ${horodatage(timestamp)}`,
    timestamp,
    timestamp
  );

  res.status(201).json(withProjectRelations(projectWithRelations.get(lastInsertRowid)));
});

// Deux valeurs qui désignent la même chose, quel que soit leur type : le client
// envoie ses identifiants tantôt en nombre, tantôt en chaîne, et « aucun »
// s'écrit aussi bien null qu'une chaîne vide.
const memeValeur = (a, b) => {
  const normalise = (v) => (v === null || v === undefined || v === "" ? null : Number(v));
  return normalise(a) === normalise(b);
};

// Deux listes d'identifiants qui désignent le même ensemble, sans égard à
// l'ordre ni aux doublons. Une liste absente du corps ne change rien.
const memesIds = (recus, actuels) => {
  if (!Array.isArray(recus)) return true;
  const trie = (liste) => [...new Set(liste.map(Number))].sort((x, y) => x - y);
  const gauche = trie(recus);
  const droite = trie(actuels);
  return gauche.length === droite.length && gauche.every((v, i) => v === droite[i]);
};

app.put("/api/projects/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM projects WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Projet introuvable" });

  const {
    name = existing.name,
    description = existing.description,
    board_id = existing.board_id,
    category_id = existing.category_id,
    company_id = existing.company_id,
    building_id = existing.building_id,
    status = existing.status,
    actor_ids,
    label_ids,
  } = req.body;

  if (!projectBoardById.get(board_id)) {
    return res.status(404).json({ error: "Tableau introuvable" });
  }
  if (categoryOutsideBoard(category_id, board_id)) {
    return res.status(400).json({ error: "Cette catégorie n'appartient pas au tableau" });
  }

  const propre = descriptionPropre(description);

  // La date de modification ne bouge que si quelque chose a bougé. Le tiroir
  // enregistre en se refermant : sans cette comparaison, ouvrir une fiche pour
  // la relire suffirait à la dater de maintenant, et le tableau se
  // réordonnerait pour rien.
  const inchange =
    name === existing.name &&
    memeDescription(propre, existing.description) &&
    memeValeur(board_id, existing.board_id) &&
    memeValeur(category_id, existing.category_id) &&
    memeValeur(company_id, existing.company_id) &&
    memeValeur(building_id, existing.building_id) &&
    memeValeur(status, existing.status) &&
    memesIds(actor_ids, acteursDe(existing.id)) &&
    memesIds(label_ids, etiquettesDe(existing.id));

  db.prepare(
    `UPDATE projects SET name = @name, description = @description, board_id = @board_id,
       category_id = @category_id, company_id = @company_id, building_id = @building_id,
       status = @status, updated_at = @updated_at
     WHERE id = @id`
  ).run({
    id: req.params.id,
    name,
    description: propre,
    board_id,
    category_id,
    company_id,
    building_id,
    status,
    updated_at: inchange ? existing.updated_at : now(),
  });

  if (Array.isArray(actor_ids)) replaceActors(req.params.id, actor_ids);
  if (Array.isArray(label_ids)) replaceProjectLabels(req.params.id, label_ids.map(Number), board_id);
  res.json(withProjectRelations(projectWithRelations.get(req.params.id)));
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

// L'auteur accompagne le commentaire, comme les acteurs accompagnent un
// projet : une jointure plutôt qu'une requête par commentaire.
const COMMENT_SELECT = `
  SELECT comments.*, users.name AS author_name, users.email AS author_email
  FROM comments
  LEFT JOIN users ON users.id = comments.user_id
`;

const commentById = db.prepare(`${COMMENT_SELECT} WHERE comments.id = ?`);
const commentsByProject = db.prepare(
  `${COMMENT_SELECT} WHERE comments.project_id = ? ORDER BY comments.created_at ASC`
);

// « author » est nul pour un commentaire d'avant cette colonne, ou dont le
// compte a été supprimé : son texte reste, son auteur n'est plus connu.
const withAuthor = ({ author_name, author_email, ...comment }) => ({
  ...comment,
  author: comment.user_id
    ? {
        id: comment.user_id,
        name: author_name || author_email,
        email: author_email,
        gravatar_url: gravatarUrl(author_email),
      }
    : null,
});

app.post("/api/projects/:id/comments", (req, res) => {
  const text = (req.body.text || "").trim();
  if (!text) return res.status(400).json({ error: "text est requis" });

  const project = db.prepare("SELECT id FROM projects WHERE id = ?").get(req.params.id);
  if (!project) return res.status(404).json({ error: "Projet introuvable" });

  const timestamp = now();
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO comments (project_id, user_id, text, created_at, updated_at)
       VALUES (@project_id, @user_id, @text, @created_at, @updated_at)`
    )
    .run({
      project_id: req.params.id,
      user_id: req.user.id,
      text,
      created_at: timestamp,
      updated_at: timestamp,
    });

  touchProject(req.params.id);
  res.status(201).json(withAuthor(commentById.get(lastInsertRowid)));
});

// Les mots que l'application écrit elle-même content un fait : ils ne se
// retouchent ni ne s'effacent, ni ici ni sur une carte.
const COMMENTAIRE_SYSTEME = { error: "Ce commentaire est écrit par l'application" };

app.put("/api/comments/:id", (req, res) => {
  const comment = db.prepare("SELECT * FROM comments WHERE id = ?").get(req.params.id);
  if (!comment) return res.status(404).json({ error: "Commentaire introuvable" });
  if (comment.system) return res.status(403).json(COMMENTAIRE_SYSTEME);
  const text = (req.body.text || "").trim();
  if (!text) return res.status(400).json({ error: "text est requis" });

  // Un texte identique n'est pas une modification : ni la date du commentaire
  // ni celle du projet ne bougent.
  if (text === comment.text) return res.json(withAuthor(commentById.get(req.params.id)));

  db.prepare("UPDATE comments SET text = ?, updated_at = ? WHERE id = ?").run(
    text,
    now(),
    req.params.id
  );
  touchProject(comment.project_id);
  res.json(withAuthor(commentById.get(req.params.id)));
});

app.delete("/api/comments/:id", (req, res) => {
  const comment = db.prepare("SELECT * FROM comments WHERE id = ?").get(req.params.id);
  if (!comment) return res.status(404).json({ error: "Commentaire introuvable" });
  if (comment.system) return res.status(403).json(COMMENTAIRE_SYSTEME);

  db.prepare("DELETE FROM comments WHERE id = ?").run(req.params.id);
  touchProject(comment.project_id);
  res.status(204).end();
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`API Milo disponible sur http://localhost:${PORT}`);
});
