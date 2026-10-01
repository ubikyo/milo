// La copie d'une liste, avec tout ce qu'elle porte.
//
// Copier une liste ne se résume pas à recopier une ligne : la liste tient ses
// cartes, qui tiennent leurs membres, leurs étiquettes et leurs checklists,
// qui tiennent à leur tour leurs éléments et les membres de chacun. Sept
// tables, donc, parcourues une fois pour toutes ici plutôt qu'une requête par
// carte depuis la route.
//
// Ce qui ne se copie pas : le fil des cartes. Un commentaire porte un auteur
// et une date ; le recopier fabriquerait une conversation qui n'a pas eu lieu.
// La copie s'ouvre sur son propre mot de création, comme une carte neuve.
//
// Les pièces jointes, elles, suivent : ce sont des pièces au dossier, pas une
// conversation. Seules les lignes sont recopiées — les deux cartes citent le
// même fichier.

import type { Id } from "@milo/shared";
import { mutation, scalar, selection, transaction } from "../db/query.js";
import type {
  AttachmentRow,
  ChecklistItemRow,
  ChecklistRow,
  LabelRow,
  TaskCardRow,
} from "../db/rows.js";
import { horodatage, now } from "../lib/time.js";
import { cardComments } from "./cards.js";
import { prochaineReference } from "./references.js";
import { reorderTaskCards, taskCards, taskLists } from "./tasks.js";

// --- Lectures de la source -------------------------------------------------

const cartesDeLaListe = selection<TaskCardRow>(
  "SELECT * FROM task_cards WHERE list_id = ? ORDER BY position, id",
);
const membresDeLaCarte = selection<{ user_id: Id }>(
  "SELECT user_id FROM card_members WHERE card_id = ?",
);
const etiquettesDeLaCarte = selection<LabelRow>(
  `SELECT labels.*
   FROM card_labels
   JOIN labels ON labels.id = card_labels.label_id
   WHERE card_labels.card_id = ?
   ORDER BY labels.position, labels.id`,
);
const checklistsDeLaCarte = selection<ChecklistRow>(
  "SELECT * FROM card_checklists WHERE card_id = ? ORDER BY position, id",
);
const elementsDeLaChecklist = selection<ChecklistItemRow>(
  "SELECT * FROM checklist_items WHERE checklist_id = ? ORDER BY position, id",
);
const membresDeLElement = selection<{ user_id: Id }>(
  "SELECT user_id FROM checklist_item_members WHERE item_id = ?",
);
const piecesDeLaCarte = selection<AttachmentRow>(
  "SELECT * FROM card_attachments WHERE card_id = ? ORDER BY id",
);

// --- Écritures de la copie -------------------------------------------------

const creerListe = mutation(
  "INSERT INTO task_lists (board_id, name, position, color, created_at) VALUES (?, ?, ?, ?, ?)",
);
// Ni l'une ni l'autre ne passe par `taskCards.create`, qui ne les prend pas :
// elles se posent juste après l'insertion.
const poserDescription = mutation("UPDATE task_cards SET description = ? WHERE id = ?");
const poserEcheance = mutation("UPDATE task_cards SET due_date = ? WHERE id = ?");
const lierMembre = mutation("INSERT OR IGNORE INTO card_members (card_id, user_id) VALUES (?, ?)");
const lierEtiquette = mutation(
  "INSERT OR IGNORE INTO card_labels (card_id, label_id) VALUES (?, ?)",
);
const creerChecklist = mutation(
  "INSERT INTO card_checklists (card_id, title, position, created_at) VALUES (?, ?, ?, ?)",
);
const creerElement = mutation(
  `INSERT INTO checklist_items (checklist_id, text, done, due_date, position, created_at)
   VALUES (?, ?, ?, ?, ?, ?)`,
);
const lierMembreElement = mutation(
  "INSERT OR IGNORE INTO checklist_item_members (item_id, user_id) VALUES (?, ?)",
);
// La copie cite le même fichier que l'original : rien n'est recopié sur le
// disque, et le fichier ne s'en va qu'avec la dernière ligne qui le cite
// (repositories/attachments.ts).
const reprendrePiece = mutation(
  `INSERT INTO card_attachments (card_id, file, name, mime, size, user_id, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?)`,
);

// --- Étiquettes d'un tableau à l'autre --------------------------------------
// Une étiquette appartient à son tableau. Copier vers un autre tableau ne peut
// donc pas reprendre le lien tel quel : on cherche là-bas la même étiquette,
// au nom et à la couleur, et on la crée si elle manque. Sans cela, les cartes
// arriveraient nues et on ne saurait plus ce qu'elles portaient.

const etiquetteJumelle = selection<LabelRow>(
  `SELECT * FROM labels
   WHERE board_id = ? AND name = ? COLLATE NOCASE AND color = ?
   ORDER BY position, id`,
);
const rangEtiquetteSuivant = scalar<{ next: number }>(
  "SELECT COALESCE(MAX(position), -1) + 1 AS next FROM labels WHERE board_id = ?",
);
const creerEtiquette = mutation(
  "INSERT INTO labels (board_id, name, color, position, created_at) VALUES (?, ?, ?, ?, ?)",
);

/**
 * L'étiquette du tableau d'accueil qui correspond à celle-ci. Dans le tableau
 * d'origine, c'est elle-même ; ailleurs, sa jumelle, créée au besoin.
 */
const etiquetteCorrespondante = (
  label: LabelRow,
  boardCible: Id,
  cache: Map<Id, Id>,
  timestamp: string,
): Id => {
  if (label.board_id === boardCible) return label.id;

  const deja = cache.get(label.id);
  if (deja !== undefined) return deja;

  const jumelle = etiquetteJumelle.get(boardCible, label.name, label.color);
  const id =
    jumelle?.id ??
    Number(
      creerEtiquette.run(
        boardCible,
        label.name,
        label.color,
        rangEtiquetteSuivant(boardCible).next,
        timestamp,
      ).lastInsertRowid,
    );

  cache.set(label.id, id);
  return id;
};

// --- Une carte --------------------------------------------------------------

/** Où va la copie d'une carte, et ce qui l'accompagne. */
interface CopieDeCarte {
  listeId: Id;
  rang: number;
  /** Le tableau de la liste d'accueil : il tient les étiquettes. */
  boardId: Id;
  text: string;
  userId: Id;
  timestamp: string;
  /** Les étiquettes déjà appariées d'un tableau à l'autre. */
  etiquettes: Map<Id, Id>;
}

/** Recopie une carte et tout ce qu'elle porte ; rend l'identifiant de la copie. */
const copierCarte = (carte: TaskCardRow, copie: CopieDeCarte): Id => {
  const { listeId, rang, boardId, text, userId, timestamp, etiquettes } = copie;
  const separateur = carte.kind === "separator";

  // La référence n'est pas celle de l'original : deux cartes ne peuvent pas
  // porter le même repère. Un séparateur n'en a pas.
  const numero = separateur ? 0 : prochaineReference();
  const carteId = Number(
    taskCards.create.run(listeId, text, rang, numero, carte.kind, timestamp).lastInsertRowid,
  );

  if (carte.description) poserDescription.run(carte.description, carteId);
  // L'échéance suit la carte : une copie a la même date à tenir.
  if (carte.due_date) poserEcheance.run(carte.due_date, carteId);

  for (const { user_id } of membresDeLaCarte.all(carte.id)) {
    lierMembre.run(carteId, user_id);
  }

  for (const label of etiquettesDeLaCarte.all(carte.id)) {
    lierEtiquette.run(carteId, etiquetteCorrespondante(label, boardId, etiquettes, timestamp));
  }

  for (const piece of piecesDeLaCarte.all(carte.id)) {
    reprendrePiece.run(
      carteId,
      piece.file,
      piece.name,
      piece.mime,
      piece.size,
      // La copie est déposée par celui qui copie, maintenant : c'est lui qui
      // l'apporte dans cette liste-ci.
      userId,
      timestamp,
    );
  }

  for (const checklist of checklistsDeLaCarte.all(carte.id)) {
    const checklistId = Number(
      creerChecklist.run(carteId, checklist.title, checklist.position, timestamp)
        .lastInsertRowid,
    );

    for (const element of elementsDeLaChecklist.all(checklist.id)) {
      const elementId = Number(
        creerElement.run(
          checklistId,
          element.text,
          element.done,
          element.due_date,
          element.position,
          timestamp,
        ).lastInsertRowid,
      );
      for (const { user_id } of membresDeLElement.all(element.id)) {
        lierMembreElement.run(elementId, user_id);
      }
    }
  }

  // Le fil s'ouvre comme celui de n'importe quelle carte neuve : la copie a
  // bien été créée maintenant. Un séparateur n'a pas de fiche, donc pas de
  // fil.
  if (!separateur) {
    cardComments.createSystem.run(
      carteId,
      userId,
      `Carte créée le ${horodatage(timestamp)}`,
      timestamp,
      timestamp,
    );
  }

  return carteId;
};

// --- La copie ---------------------------------------------------------------

export interface CopieDeListe {
  /** La liste d'origine. */
  sourceId: Id;
  /** Le tableau d'accueil ; ce peut être celui de la liste d'origine. */
  boardId: Id;
  /** Le nom de la copie. */
  name: string;
  /** La couleur de la liste d'origine, que la copie reprend. */
  color: string;
  /** Qui copie : c'est l'auteur du mot qui ouvre le fil de chaque carte. */
  userId: Id;
}

/**
 * Copie la liste et rend l'identifiant de la copie. Tout passe ou rien : une
 * erreur au milieu ne doit pas laisser une liste à moitié garnie.
 */
export const copyTaskList = transaction((copie: CopieDeListe): Id => {
  const { sourceId, boardId, name, color, userId } = copie;
  const timestamp = now();

  // La copie se range à la fin du tableau d'accueil, comme une liste qu'on
  // viendrait d'y créer — y compris quand c'est le tableau d'origine.
  const { next } = taskLists.nextPosition(boardId);
  const listeId = Number(creerListe.run(boardId, name, next, color, timestamp).lastInsertRowid);

  // Les étiquettes déjà appariées d'un tableau à l'autre, pour ne les chercher
  // — et ne les créer — qu'une fois par liste copiée.
  const etiquettes = new Map<Id, Id>();

  for (const [rang, carte] of cartesDeLaListe.all(sourceId).entries()) {
    copierCarte(carte, { listeId, rang, boardId, text: carte.text, userId, timestamp, etiquettes });
  }

  return listeId;
});

/**
 * Duplique une carte dans sa propre liste, juste après l'original, et rend
 * l'identifiant de la copie : une base pour une carte voisine.
 */
export const duplicateTaskCard = transaction((cardId: Id, userId: Id): Id => {
  const carte = taskCards.byId.get(cardId);
  if (!carte) throw new Error(`Carte ${cardId} introuvable`);
  const liste = taskLists.byId.get(carte.list_id);
  if (!liste) throw new Error(`Carte ${cardId} sans liste`);

  const separateur = carte.kind === "separator";
  const copieId = copierCarte(carte, {
    listeId: liste.id,
    rang: taskCards.nextPosition(liste.id).next,
    boardId: liste.board_id,
    // Un séparateur tranche toujours au même endroit : son libellé reste.
    text: separateur ? carte.text : `${carte.text} (copie)`,
    userId,
    timestamp: now(),
    etiquettes: new Map(),
  });

  // La copie se range juste sous l'original, pas au bout de la liste.
  const ordre = cartesDeLaListe
    .all(liste.id)
    .map((c) => c.id)
    .filter((id) => id !== copieId);
  ordre.splice(ordre.indexOf(carte.id) + 1, 0, copieId);
  reorderTaskCards(liste.id, ordre);

  return copieId;
});
