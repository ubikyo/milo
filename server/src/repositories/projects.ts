// Les projets, et ce qui les accompagne : leurs acteurs et leurs étiquettes.

import type { Actor, Id, Project, ProjectLabel } from "@milo/shared";
import { mutation, scalar, selection, transaction } from "../db/query.js";
import type { IdRow, NextRow, ProjectJoinedRow, ProjectRow } from "../db/rows.js";
import { actorOf } from "./users.js";

export const PROJECT_SELECT = `
  SELECT projects.*, categories.name AS category_name, companies.name AS company_name
  FROM projects
  JOIN categories ON categories.id = projects.category_id
  LEFT JOIN companies ON companies.id = projects.company_id
`;

export const projects = {
  raw: selection<ProjectRow>("SELECT * FROM projects WHERE id = ?"),
  joined: selection<ProjectJoinedRow>(`${PROJECT_SELECT} WHERE projects.id = ?`),
  exists: selection<IdRow>("SELECT id FROM projects WHERE id = ?"),
  create: mutation(
    `INSERT INTO projects (number, name, description, board_id, category_id, company_id,
       milestone_type_id, status, created_at, updated_at)
     VALUES (@number, @name, @description, @board_id, @category_id, @company_id,
       @milestone_type_id, @status, @created_at, @updated_at)`,
  ),
  update: mutation(
    `UPDATE projects SET name = @name, description = @description, board_id = @board_id,
       category_id = @category_id, company_id = @company_id,
       milestone_type_id = @milestone_type_id, status = @status,
       updated_at = @updated_at
     WHERE id = @id`,
  ),
  remove: mutation("DELETE FROM projects WHERE id = ?"),
  touch: mutation("UPDATE projects SET updated_at = ? WHERE id = ?"),
};

// Les acteurs et les étiquettes sont lus pour tout un lot de projets en une
// seule requête, et non une par projet.
//
// Le lot passe par `json_each` plutôt que par une liste de « ? » assemblée à
// la main : le SQL ne dépend plus du nombre de projets, la requête est donc
// préparée une fois pour toutes au lieu d'être recompilée à chaque lecture.

interface ActorRow {
  project_id: Id;
  id: Id;
  name: string;
  email: string;
}

const actorsFor = selection<ActorRow>(
  `SELECT project_actors.project_id, users.id, users.name, users.email
   FROM project_actors
   JOIN users ON users.id = project_actors.user_id
   WHERE project_actors.project_id IN (SELECT value FROM json_each(?))
   ORDER BY users.name`,
);

type LabelLinkRow = ProjectLabel & { project_id: Id };

const labelsFor = selection<LabelLinkRow>(
  `SELECT project_label_links.project_id, project_labels.*
   FROM project_label_links
   JOIN project_labels ON project_labels.id = project_label_links.label_id
   WHERE project_label_links.project_id IN (SELECT value FROM json_each(?))
   ORDER BY project_labels.weight DESC, project_labels.position, project_labels.id`,
);

const groupBy = <Row, Value>(
  rows: Row[],
  key: (row: Row) => Id,
  value: (row: Row) => Value,
): Map<Id, Value[]> => {
  const parCle = new Map<Id, Value[]>();
  for (const row of rows) {
    const k = key(row);
    const deja = parCle.get(k);
    if (deja) deja.push(value(row));
    else parCle.set(k, [value(row)]);
  }
  return parCle;
};

/** Un lot de projets, chacun avec ses acteurs et ses étiquettes. */
export const withRelations = (rows: ProjectJoinedRow[]): Project[] => {
  if (rows.length === 0) return [];
  const ids = JSON.stringify(rows.map((p) => p.id));

  const acteurs = groupBy(actorsFor.all(ids), (r) => r.project_id, actorOf);
  const etiquettes = groupBy(
    labelsFor.all(ids),
    (r) => r.project_id,
    ({ project_id: _ignore, ...label }): ProjectLabel => label,
  );

  return rows.map((p) => ({
    ...p,
    actors: acteurs.get(p.id) ?? ([] as Actor[]),
    labels: etiquettes.get(p.id) ?? ([] as ProjectLabel[]),
  }));
};

/** Un projet seul, avec ses acteurs et ses étiquettes. */
export const oneWithRelations = (row: ProjectJoinedRow): Project => withRelations([row])[0] as Project;

// Les acteurs et les étiquettes d'un projet, en identifiants seuls : de quoi
// savoir si ce qu'on reçoit change quelque chose.

const actorIds = selection<{ user_id: Id }>(
  "SELECT user_id FROM project_actors WHERE project_id = ?",
);
const labelIds = selection<{ label_id: Id }>(
  "SELECT label_id FROM project_label_links WHERE project_id = ?",
);

export const acteursDe = (projectId: unknown): Id[] =>
  actorIds.all(projectId).map((l) => l.user_id);

export const etiquettesDe = (projectId: unknown): Id[] =>
  labelIds.all(projectId).map((l) => l.label_id);

const supprimerActeurs = mutation("DELETE FROM project_actors WHERE project_id = ?");
const ajouterActeur = mutation(
  `INSERT OR IGNORE INTO project_actors (project_id, user_id)
   SELECT ?, id FROM users WHERE id = ?`,
);

/**
 * Les acteurs d'un projet, remplacés en bloc. Un identifiant qui ne désigne
 * aucun compte est ignoré plutôt que refusé : le `SELECT` de l'insertion s'en
 * charge, ce qui évite une requête de vérification par acteur.
 */
export const replaceActors = transaction((projectId: Id, actorIds: Id[]) => {
  supprimerActeurs.run(projectId);
  for (const userId of actorIds) ajouterActeur.run(projectId, userId);
});

const supprimerEtiquettes = mutation("DELETE FROM project_label_links WHERE project_id = ?");
const ajouterEtiquette = mutation(
  `INSERT OR IGNORE INTO project_label_links (project_id, label_id)
   SELECT ?, id FROM project_labels WHERE id = ? AND board_id = ?`,
);

/**
 * Un projet ne porte que les étiquettes de son propre tableau : celles d'un
 * autre sont ignorées plutôt que refusées, comme pour les acteurs.
 */
/**
 * L'étiquette du tableau d'accueil qui correspond à celle-ci : elle-même dans
 * son propre tableau, sa jumelle ailleurs — même nom, même couleur —, créée au
 * besoin. La même règle que pour la copie d'une liste (copy-list.ts) : sans
 * elle, la copie arriverait nue et on ne saurait plus ce que le projet portait.
 */
const etiquetteJumelle = selection<{ id: Id }>(
  `SELECT id FROM project_labels
   WHERE board_id = ? AND name = ? COLLATE NOCASE AND color = ?
   ORDER BY position, id`,
);
const rangEtiquetteSuivant = scalar<NextRow>(
  "SELECT COALESCE(MAX(position), -1) + 1 AS next FROM project_labels WHERE board_id = ?",
);
const creerEtiquette = mutation(
  "INSERT INTO project_labels (board_id, name, color, weight, position, created_at) VALUES (?, ?, ?, ?, ?, ?)",
);
const etiquettesCompletes = selection<{
  id: Id;
  board_id: Id;
  name: string;
  color: string;
  weight: number;
}>(
  `SELECT project_labels.*
   FROM project_label_links
   JOIN project_labels ON project_labels.id = project_label_links.label_id
   WHERE project_label_links.project_id = ?
   ORDER BY project_labels.weight DESC, project_labels.position, project_labels.id`,
);

/** Les étiquettes d'un projet, reportées sur sa copie. */
export const copyProjectLabels = transaction(
  (sourceId: Id, copieId: Id, boardCible: Id, timestamp: string) => {
    for (const label of etiquettesCompletes.all(sourceId)) {
      const id =
        label.board_id === boardCible
          ? label.id
          : (etiquetteJumelle.get(boardCible, label.name, label.color)?.id ??
            Number(
              creerEtiquette.run(
                boardCible,
                label.name,
                label.color,
                label.weight,
                rangEtiquetteSuivant(boardCible).next,
                timestamp,
              ).lastInsertRowid,
            ));
      ajouterEtiquette.run(copieId, id, boardCible);
    }
  },
);

export const replaceProjectLabels = transaction(
  (projectId: Id, labelIds: Id[], boardId: Id) => {
    supprimerEtiquettes.run(projectId);
    for (const labelId of labelIds) ajouterEtiquette.run(projectId, labelId, boardId);
  },
);
