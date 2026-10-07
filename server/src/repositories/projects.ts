// Projects, and what comes with them: their actors and labels.

import { DEFAULT_LABEL_GROUP, PROJECT_PRIORITY_LABELS } from "@milo/shared";
import type { Actor, Id, Project, ProjectLabel } from "@milo/shared";
import { mutation, scalar, selection, transaction } from "../db/query.js";
import type { IdRow, NextRow, ProjectJoinedRow, ProjectRow } from "../db/rows.js";
import { projectLabelGroups } from "./label-groups.js";
import { actorOf } from "./users.js";

export const PROJECT_SELECT = `
  SELECT projects.*, categories.name AS category_name
  FROM projects
  JOIN categories ON categories.id = projects.category_id
`;

export const projects = {
  raw: selection<ProjectRow>("SELECT * FROM projects WHERE id = ?"),
  joined: selection<ProjectJoinedRow>(`${PROJECT_SELECT} WHERE projects.id = ?`),
  exists: selection<IdRow>("SELECT id FROM projects WHERE id = ?"),
  create: mutation(
    `INSERT INTO projects (number, name, description, board_id, category_id, list_key,
       milestone_type_id, status, created_at, updated_at)
     VALUES (@number, @name, @description, @board_id, @category_id, @list_key,
       @milestone_type_id, @status, @created_at, @updated_at)`,
  ),
  update: mutation(
    `UPDATE projects SET number = @number, name = @name, description = @description,
       board_id = @board_id, category_id = @category_id, list_key = @list_key,
       milestone_type_id = @milestone_type_id, status = @status,
       updated_at = @updated_at
     WHERE id = @id`,
  ),
  remove: mutation("DELETE FROM projects WHERE id = ?"),
  touch: mutation("UPDATE projects SET updated_at = ? WHERE id = ?"),
};

// Actors and labels are read for a whole batch of projects in a single
// query, and not one per project.
//
// The batch goes through `json_each` rather than a hand-assembled list of
// "?": the SQL no longer depends on the number of projects, so the query is
// prepared once and for all instead of being recompiled on each read.

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
   ORDER BY project_labels.position, project_labels.id`,
);

const groupBy = <Row, Value>(
  rows: Row[],
  key: (row: Row) => Id,
  value: (row: Row) => Value,
): Map<Id, Value[]> => {
  const byKey = new Map<Id, Value[]>();
  for (const row of rows) {
    const k = key(row);
    const already = byKey.get(k);
    if (already) already.push(value(row));
    else byKey.set(k, [value(row)]);
  }
  return byKey;
};

/** A batch of projects, each with its actors and labels. */
export const withRelations = (rows: ProjectJoinedRow[]): Project[] => {
  if (rows.length === 0) return [];
  const ids = JSON.stringify(rows.map((p) => p.id));

  const actors = groupBy(actorsFor.all(ids), (r) => r.project_id, actorOf);
  const labels = groupBy(
    labelsFor.all(ids),
    (r) => r.project_id,
    ({ project_id: _ignored, ...label }): ProjectLabel => label,
  );

  return rows.map((p) => ({
    ...p,
    actors: actors.get(p.id) ?? ([] as Actor[]),
    labels: labels.get(p.id) ?? ([] as ProjectLabel[]),
  }));
};

/** A single project, with its actors and labels. */
export const oneWithRelations = (row: ProjectJoinedRow): Project => withRelations([row])[0] as Project;

// A project's actors and labels, as identifiers only: enough to know whether
// what is received changes anything.

const actorIds = selection<{ user_id: Id }>(
  "SELECT user_id FROM project_actors WHERE project_id = ?",
);
const labelIds = selection<{ label_id: Id }>(
  "SELECT label_id FROM project_label_links WHERE project_id = ?",
);

export const actorsOf = (projectId: unknown): Id[] =>
  actorIds.all(projectId).map((l) => l.user_id);

export const labelsOf = (projectId: unknown): Id[] =>
  labelIds.all(projectId).map((l) => l.label_id);

const deleteActors = mutation("DELETE FROM project_actors WHERE project_id = ?");
const addActor = mutation(
  `INSERT OR IGNORE INTO project_actors (project_id, user_id)
   SELECT ?, id FROM users WHERE id = ?`,
);

/**
 * A project's actors, replaced wholesale. An identifier that designates no
 * account is ignored rather than refused: the insertion's `SELECT` takes care
 * of it, which avoids a verification query per actor.
 */
export const replaceActors = transaction((projectId: Id, actorIds: Id[]) => {
  deleteActors.run(projectId);
  for (const userId of actorIds) addActor.run(projectId, userId);
});

const deleteLabels = mutation("DELETE FROM project_label_links WHERE project_id = ?");
const addLabel = mutation(
  `INSERT OR IGNORE INTO project_label_links (project_id, label_id)
   SELECT ?, id FROM project_labels WHERE id = ? AND board_id = ?`,
);

/**
 * A project carries only its own board's labels: those of another are
 * ignored rather than refused, as for actors.
 */
/**
 * The destination board's label that matches this one: itself in its own
 * board, its twin elsewhere — same name, same color —, created if needed. The
 * same rule as for copying a list (copy-list.ts): without it, the copy would
 * arrive bare and we would no longer know what the project carried.
 */
const twinLabel = selection<{ id: Id }>(
  `SELECT id FROM project_labels
   WHERE board_id = ? AND name = ? COLLATE NOCASE AND color = ?
   ORDER BY position, id`,
);
const nextLabelRank = scalar<NextRow>(
  "SELECT COALESCE(MAX(position), -1) + 1 AS next FROM project_labels WHERE board_id = ?",
);
const createLabel = mutation(
  "INSERT INTO project_labels (board_id, group_id, name, color, position, created_at) VALUES (?, ?, ?, ?, ?, ?)",
);
const fullLabels = selection<{
  id: Id;
  board_id: Id;
  group_id: Id;
  name: string;
  color: string;
}>(
  `SELECT project_labels.*
   FROM project_label_links
   JOIN project_labels ON project_labels.id = project_label_links.label_id
   WHERE project_label_links.project_id = ?
   ORDER BY project_labels.position, project_labels.id`,
);

const priorityGroup = selection<IdRow>(
  `SELECT id FROM project_label_groups
   WHERE board_id = ? AND name = ? COLLATE NOCASE LIMIT 1`,
);

/**
 * A projects widget brings the "Priorités" group and its labels
 * (PROJECT_PRIORITY_LABELS), when the board has no group of that name yet:
 * the board's projects widgets share them. True when they were created.
 */
export const ensureProjectPriorities = transaction((boardId: Id): boolean => {
  if (priorityGroup.get(boardId, DEFAULT_LABEL_GROUP)) return false;
  const group = projectLabelGroups.create(boardId, DEFAULT_LABEL_GROUP);
  const timestamp = new Date().toISOString();
  let position = nextLabelRank(boardId).next;
  for (const label of PROJECT_PRIORITY_LABELS) {
    createLabel.run(boardId, group, label.name, label.color, position++, timestamp);
  }
  projectLabelGroups.renumber(boardId);
  return true;
});

/** The twin, created in the group of the same name — itself created if needed. */
const createTwin = (
  label: { group_id: Id; name: string; color: string },
  targetBoard: Id,
  timestamp: string,
): Id => {
  const groupName = projectLabelGroups.byId(label.group_id)?.name ?? DEFAULT_LABEL_GROUP;
  const id = Number(
    createLabel.run(
      targetBoard,
      projectLabelGroups.named(targetBoard, groupName),
      label.name,
      label.color,
      nextLabelRank(targetBoard).next,
      timestamp,
    ).lastInsertRowid,
  );
  projectLabelGroups.renumber(targetBoard);
  return id;
};

/** A project's labels, carried over to its copy. */
export const copyProjectLabels = transaction(
  (sourceId: Id, copyId: Id, targetBoard: Id, timestamp: string) => {
    for (const label of fullLabels.all(sourceId)) {
      const id =
        label.board_id === targetBoard
          ? label.id
          : (twinLabel.get(targetBoard, label.name, label.color)?.id ??
            createTwin(label, targetBoard, timestamp));
      addLabel.run(copyId, id, targetBoard);
    }
  },
);

export const replaceProjectLabels = transaction(
  (projectId: Id, labelIds: Id[], boardId: Id) => {
    deleteLabels.run(projectId);
    for (const labelId of labelIds) addLabel.run(projectId, labelId, boardId);
  },
);
