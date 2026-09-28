// Les demandes du mode Support : leur société, leurs acteurs, leurs étiquettes
// et leur fil.
//
// Une demande pend à une société, jamais à un tableau : c'est la société de la
// liste déroulante de l'entête qui la porte. Ses acteurs et ses étiquettes se
// posent comme les membres et les étiquettes d'une carte : autant qu'il faut,
// par une table d'association.

import type {
  Actor,
  Id,
  SupportComment,
  SupportLabel,
  SupportRequest,
  SupportRequestDetail,
} from "@milo/shared";
import { mutation, scalar, selection, transaction } from "../db/query.js";
import type {
  NextRow,
  SupportCommentRow,
  SupportLabelRow,
  SupportRequestRow,
  WithAuthorColumns,
} from "../db/rows.js";
import { withAuthor } from "./comments.js";
import { actorOf } from "./users.js";

export const DEMANDE_INTROUVABLE = "Demande introuvable";
export const ETIQUETTE_SUPPORT_INTROUVABLE = "Étiquette introuvable";

export const supportRequests = {
  byId: selection<SupportRequestRow>("SELECT * FROM support_requests WHERE id = ?"),
  // Toutes les demandes d'une société, de la plus récente à la plus ancienne.
  // Les onglets filtrent ensuite sur le statut : c'est le client qui les range,
  // il les a déjà toutes en main pour compter ce que chaque onglet contient.
  ofCompany: selection<SupportRequestRow>(
    "SELECT * FROM support_requests WHERE company_id = ? ORDER BY created_at DESC, id DESC",
  ),
  create: mutation(
    `INSERT INTO support_requests (company_id, status, due_date, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  ),
  update: mutation(
    "UPDATE support_requests SET status = ?, due_date = ?, updated_at = ? WHERE id = ?",
  ),
  remove: mutation("DELETE FROM support_requests WHERE id = ?"),
};

export const supportLabels = {
  byId: selection<SupportLabelRow>("SELECT * FROM support_labels WHERE id = ?"),
  ofCompany: selection<SupportLabelRow>(
    "SELECT * FROM support_labels WHERE company_id = ? ORDER BY position, id",
  ),
  nextPosition: scalar<NextRow>(
    "SELECT COALESCE(MAX(position), -1) + 1 AS next FROM support_labels WHERE company_id = ?",
  ),
  create: mutation(
    `INSERT INTO support_labels (company_id, name, color, position, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ),
  update: mutation("UPDATE support_labels SET name = ?, color = ? WHERE id = ?"),
  remove: mutation("DELETE FROM support_labels WHERE id = ?"),
};

// --- Acteurs d'une demande -------------------------------------------------

const supprimerActeurs = mutation("DELETE FROM support_request_actors WHERE request_id = ?");
const ajouterActeur = mutation(
  `INSERT OR IGNORE INTO support_request_actors (request_id, user_id)
   SELECT ?, id FROM users WHERE id = ?`,
);

/**
 * Les acteurs d'une demande, remplacés en bloc. Un identifiant qui ne désigne
 * aucun compte est ignoré plutôt que refusé : le `SELECT` de l'insertion s'en
 * charge, comme pour les membres d'une carte.
 */
export const replaceSupportActors = transaction((requestId: Id, userIds: Id[]) => {
  supprimerActeurs.run(requestId);
  for (const userId of userIds) ajouterActeur.run(requestId, userId);
});

// --- Étiquettes posées sur une demande -------------------------------------

const supprimerEtiquettes = mutation("DELETE FROM support_request_labels WHERE request_id = ?");
const ajouterEtiquette = mutation(
  `INSERT OR IGNORE INTO support_request_labels (request_id, label_id)
   SELECT ?, id FROM support_labels WHERE id = ? AND company_id = ?`,
);

/**
 * Une demande ne porte que les étiquettes de sa propre société : celles d'une
 * autre sont ignorées plutôt que refusées, comme les membres d'une carte.
 */
export const replaceSupportLabels = transaction(
  (requestId: Id, labelIds: Id[], companyId: Id) => {
    supprimerEtiquettes.run(requestId);
    for (const labelId of labelIds) ajouterEtiquette.run(requestId, labelId, companyId);
  },
);

// --- Lecture d'un lot ------------------------------------------------------
// Les acteurs, les étiquettes et le nombre d'échanges se lisent pour tout le
// lot en trois requêtes, et non trois par demande.

type EtiquetteLieeRow = SupportLabel & { request_id: Id };

const etiquettesDesDemandes = selection<EtiquetteLieeRow>(
  `SELECT support_request_labels.request_id, support_labels.*
   FROM support_request_labels
   JOIN support_labels ON support_labels.id = support_request_labels.label_id
   WHERE support_request_labels.request_id IN (SELECT value FROM json_each(?))
   ORDER BY support_labels.position, support_labels.id`,
);

const acteursDesDemandes = selection<{ request_id: Id; id: Id; name: string; email: string }>(
  `SELECT support_request_actors.request_id, users.id, users.name, users.email
   FROM support_request_actors
   JOIN users ON users.id = support_request_actors.user_id
   WHERE support_request_actors.request_id IN (SELECT value FROM json_each(?))
   ORDER BY users.name`,
);

const echangesDesDemandes = selection<{ request_id: Id; count: number }>(
  `SELECT request_id, COUNT(*) AS count
   FROM support_comments
   WHERE request_id IN (SELECT value FROM json_each(?))
   GROUP BY request_id`,
);

/** Un lot de demandes, chacune avec ses acteurs, ses étiquettes et ses échanges. */
export const withRelations = (rows: SupportRequestRow[]): SupportRequest[] => {
  if (rows.length === 0) return [];
  const ids = JSON.stringify(rows.map((r) => r.id));

  const acteurs = new Map<Id, Actor[]>();
  for (const row of acteursDesDemandes.all(ids)) {
    const deja = acteurs.get(row.request_id);
    if (deja) deja.push(actorOf(row));
    else acteurs.set(row.request_id, [actorOf(row)]);
  }

  const etiquettes = new Map<Id, SupportLabel[]>();
  for (const { request_id, ...label } of etiquettesDesDemandes.all(ids)) {
    const deja = etiquettes.get(request_id);
    if (deja) deja.push(label);
    else etiquettes.set(request_id, [label]);
  }

  const echanges = new Map<Id, number>();
  for (const row of echangesDesDemandes.all(ids)) echanges.set(row.request_id, row.count);

  return rows.map((demande) => ({
    ...demande,
    actors: acteurs.get(demande.id) ?? [],
    labels: etiquettes.get(demande.id) ?? [],
    comment_count: echanges.get(demande.id) ?? 0,
  }));
};

/** Une demande seule, avec ce qui l'accompagne. */
export const oneWithRelations = (row: SupportRequestRow): SupportRequest =>
  withRelations([row])[0] as SupportRequest;

// --- Fil d'une demande -----------------------------------------------------

const SUPPORT_COMMENT_SELECT = `
  SELECT support_comments.*, users.name AS author_name, users.email AS author_email
  FROM support_comments
  LEFT JOIN users ON users.id = support_comments.user_id
`;

export const supportComments = {
  byId: selection<WithAuthorColumns<SupportCommentRow>>(
    `${SUPPORT_COMMENT_SELECT} WHERE support_comments.id = ?`,
  ),
  ofRequest: selection<WithAuthorColumns<SupportCommentRow>>(
    `${SUPPORT_COMMENT_SELECT} WHERE support_comments.request_id = ?
     ORDER BY support_comments.created_at ASC`,
  ),
  create: mutation(
    `INSERT INTO support_comments (request_id, user_id, text, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  ),
  createSystem: mutation(
    `INSERT INTO support_comments (request_id, user_id, text, system, created_at, updated_at)
     VALUES (?, ?, ?, 1, ?, ?)`,
  ),
  update: mutation("UPDATE support_comments SET text = ?, updated_at = ? WHERE id = ?"),
  remove: mutation("DELETE FROM support_comments WHERE id = ?"),
};

export const commentsOf = (requestId: Id): SupportComment[] =>
  supportComments.ofRequest.all(requestId).map(withAuthor);

/** La demande et tout ce qui l'accompagne, pour son tiroir. */
export const supportRequestDetail = (row: SupportRequestRow): SupportRequestDetail => ({
  ...oneWithRelations(row),
  comments: commentsOf(row.id),
});
