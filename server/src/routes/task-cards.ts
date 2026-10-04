// Les cartes d'une liste : création, texte, déplacement, et la fiche complète
// avec ses membres, ses étiquettes et son fil.

import { Router } from "express";
import type { Request } from "express";
import {
  RAPPELS,
  RECURRENCES,
  isCardKind,
  isFormeEcheance,
  isRappel,
  isRecurrence,
  isRotationCouverture,
} from "@milo/shared";
import type { Id, Right } from "@milo/shared";
import { badRequest, forbidden, orNotFound, requireText, toIds } from "../lib/http.js";
import { descriptionPropre } from "../lib/html.js";
import { cite, consigner, date, ecarts, liste, messageModification } from "../lib/historique.js";
import type { Champ } from "../lib/historique.js";
import { concernes, notifier, notifierRattachement, notifierSuppression, racine } from "../lib/notify.js";
import { echeance, now } from "../lib/time.js";
import { touch } from "../middleware/events.js";
import { boardOuvert, boards } from "../repositories/boards.js";
import {
  cardComments,
  cardDetail,
  labelsOf,
  membersOf,
  replaceCardLabels,
  replaceCardMembers,
} from "../repositories/cards.js";
import { COMMENTAIRE_SYSTEME, motDeCreation, withAuthor } from "../repositories/comments.js";
import { duplicateTaskCard } from "../repositories/copy-list.js";
import { prochaineReference } from "../repositories/references.js";
import {
  boardOfCard,
  listsWithCards,
  reorderTaskCards,
  taskCards,
  taskLists,
} from "../repositories/tasks.js";
import { contexteDuTableau, contexts } from "../repositories/contexts.js";

const CARTE_INTROUVABLE = "Carte introuvable";
const COMMENTAIRE_INTROUVABLE = "Commentaire introuvable";

/** Ce que le fil note d'une carte quand sa fiche change (lib/historique.ts). */
const photo = (id: Id): Champ[] => {
  const carte = taskCards.byId.get(id)!;
  return [
    { libelle: "Titre", valeur: cite(carte.text) },
    {
      libelle: "Contexte",
      valeur: cite(carte.context_id ? contexts.byId.get(carte.context_id)?.name : null),
    },
    { libelle: "Description", valeur: carte.description ?? "", opaque: true },
    { libelle: "Début", valeur: carte.start_date ? date(carte.start_date) : "—" },
    { libelle: "Échéance", valeur: date(carte.due_date) },
    { libelle: "Récurrence", valeur: libelleDe(RECURRENCES, carte.recurrence) },
    { libelle: "Rappel", valeur: libelleDe(RAPPELS, carte.reminder) },
    { libelle: "Membres", valeur: liste(membersOf(id).map((m) => m.name)) },
    { libelle: "Étiquettes", valeur: liste(labelsOf(id).map((l) => l.name)) },
  ];
};

/** Le libellé d'une récurrence ou d'un rappel, pour le fil. */
const libelleDe = (
  options: readonly { value: string; label: string }[],
  valeur: string,
): string => options.find((o) => o.value === valeur)?.label ?? "—";

/** Le début d'une période : « AAAA-MM-JJ », ou vide. Absent, il reste tel quel. */
const debut = (valeur: unknown, actuel: string): string => {
  if (valeur === undefined) return actuel;
  const texte = String(valeur ?? "").trim();
  if (!texte) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texte)) badRequest("Date de début invalide");
  return texte;
};

/** Une valeur d'une liste fermée. Absente, elle reste telle quelle. */
const choix = <T extends string>(valeur: unknown, actuelle: T, valide: (v: unknown) => v is T): T => {
  if (valeur === undefined) return actuelle;
  const texte: unknown = valeur ?? "";
  if (valide(texte)) return texte;
  return badRequest("Valeur inconnue");
};

/** Un nombre d'une liste fermée. Absent, il reste tel quel. */
const choixNombre = (valeur: unknown, actuel: number, valide: (v: unknown) => v is number): number => {
  if (valeur === undefined) return actuel;
  if (valide(valeur)) return valeur;
  return badRequest("Valeur inconnue");
};

export const taskCardRoutes = Router();

taskCardRoutes.use(touch("task-lists"));

/**
 * La carte visée, si son tableau est ouvert à cette personne — avec `droit`
 * en plus dans sa société quand on y écrit. Son fil se lit avec elle, et y
 * écrire est la modifier.
 */
const carteOuverte = (id: unknown, req: Request, droit: Right = "view") => {
  const card = orNotFound(taskCards.byId.get(id), CARTE_INTROUVABLE);
  boardOuvert(boardOfCard(card), req, droit);
  return card;
};

taskCardRoutes.post("/", (req, res) => {
  const text = requireText(req.body.text, "Le texte de la carte est requis");
  const listId = req.body.list_id;
  const kind = req.body.kind ?? "card";
  if (!listId) badRequest("La liste est requise");
  if (!isCardKind(kind)) badRequest("Genre de carte inconnu");

  const list = orNotFound(taskLists.byId.get(listId), "Liste introuvable");
  boardOuvert(list.board_id, req, "create");
  // Le contexte qu'on dit, à défaut le premier du tableau.
  const contexte = contexteDuTableau(list.board_id, req.body.context_id);

  // Nouvelle carte ajoutée à la fin de sa liste.
  const { next } = taskCards.nextPosition(list.id);

  const timestamp = now();
  const { lastInsertRowid } = taskCards.create.run(
    list.id,
    text,
    next,
    // Un séparateur ne porte pas de référence, et n'en consomme donc pas.
    kind === "separator" ? 0 : prochaineReference(),
    kind,
    contexte,
    timestamp,
  );

  // Une carte créée depuis un autre mode (« Créer une tâche ») arrive avec sa
  // description : le lien vers l'élément d'où elle vient. Un séparateur n'a
  // pas de fiche, il n'en reçoit pas.
  const description = kind === "separator" ? "" : descriptionPropre(req.body.description ?? "");
  if (description) taskCards.describe.run(description, lastInsertRowid);

  // Le fil d'une carte s'ouvre sur sa création. Un séparateur n'a pas de
  // fiche, donc pas de fil.
  if (kind !== "separator") {
    cardComments.createSystem.run(
      lastInsertRowid,
      null,
      motDeCreation("Carte créée", timestamp, req.user.id),
      timestamp,
      timestamp,
    );
  }

  const creee = taskCards.byId.get(lastInsertRowid)!;
  // Suivre une liste, c'est suivre ses cartes : une carte de plus dans la
  // liste est une modification de ce qu'elle contient. Un séparateur, non :
  // il n'a pas de fiche, et rien à ouvrir.
  if (kind !== "separator") {
    notifier({
      kind: "card",
      targetId: creee.id,
      titre: creee.text,
      message: "a ajouté cette carte",
      auteur: req.user,
      base: racine(req),
    });
  }

  res.status(201).json(creee);
});

/**
 * Dupliquer une carte : la copie, avec tout ce qu'elle porte, se pose juste
 * sous l'original, dans la même liste (repositories/copy-list.ts). On la
 * reprend ensuite comme base d'une autre.
 */
taskCardRoutes.post("/:id/duplicate", (req, res) => {
  const source = carteOuverte(req.params.id, req, "create");
  const copie = taskCards.byId.get(duplicateTaskCard(source.id, req.user.id))!;

  if (copie.kind !== "separator") {
    notifier({
      kind: "card",
      targetId: copie.id,
      titre: copie.text,
      message: "a ajouté cette carte",
      auteur: req.user,
      base: racine(req),
    });
  }

  res.status(201).json(copie);
});

// Déplacement dans la liste ou d'une liste vers une autre. Déclaré avant
// « /:id », sinon « reorder » serait interprété comme un identifiant.
// L'ordre reçu est celui, complet, de la liste d'accueil : les cartes venues
// d'une autre liste y sont rattachées au passage.
taskCardRoutes.put("/reorder", (req, res) => {
  const { list_id, ids } = req.body;
  if (!Array.isArray(ids)) badRequest("ids doit être un tableau");
  const list = orNotFound(list_id ? taskLists.byId.get(list_id) : undefined, "Liste introuvable");
  boardOuvert(list.board_id, req, "update");

  const ordre = toIds(ids);

  // Une carte ne se déplace qu'entre les listes d'un même tableau.
  const connues = new Set(taskCards.idsOfBoard.all(list.board_id).map((c) => c.id));
  if (ordre.some((id) => !connues.has(id))) {
    badRequest("Une carte n'appartient pas à ce tableau");
  }

  // Un contexte choisi cache les cartes des autres : l'ordre reçu ne nomme
  // que celles qu'on voit. Elles reprennent, dans leur nouvel ordre, les
  // places qu'elles tenaient ; les cartes cachées gardent la leur, et celles
  // venues d'une autre liste se rangent à la suite.
  const recu = new Set(ordre);
  const restants = [...ordre];
  const complet = taskCards.idsOfList
    .all(list.id)
    .map((c) => (recu.has(c.id) ? (restants.shift() ?? c.id) : c.id));
  const ordreComplet = [...complet, ...restants];

  // D'où vient chaque carte, avant que l'écriture ne l'efface. Glisser une
  // carte dans sa propre liste ne change rien à ce qu'elle dit et ne notifie
  // personne ; la faire passer de « À faire » à « Terminé », si.
  const listeAvant = new Map<Id, Id>();
  for (const id of ordreComplet) {
    const carte = taskCards.byId.get(id);
    if (carte) listeAvant.set(carte.id, carte.list_id);
  }

  reorderTaskCards(list.id, ordreComplet);

  for (const [cardId, origine] of listeAvant) {
    if (origine === list.id) continue;
    const carte = taskCards.byId.get(cardId);
    if (!carte) continue;
    if (carte.kind !== "separator") {
      consigner(
        "card",
        carte.id,
        req.user,
        ecarts(
          [{ libelle: "Liste", valeur: cite(taskLists.byId.get(origine)?.name) }],
          [{ libelle: "Liste", valeur: cite(list.name) }],
        ),
      );
    }
    notifier({
      kind: "card",
      targetId: carte.id,
      titre: carte.text,
      message: `a déplacé cette carte vers « ${list.name} »`,
      auteur: req.user,
      base: racine(req),
      listeOrigine: origine,
    });
  }

  res.json(listsWithCards(list.board_id));
});

taskCardRoutes.get("/:id", (req, res) => {
  res.json(cardDetail(carteOuverte(req.params.id, req), req.user.id));
});

/**
 * Où se trouve cette carte : sa liste, son tableau, sa vue. Sert au lien
 * qui l'ouvre — l'application doit se placer sur le bon tableau avant de
 * pouvoir montrer la fiche, et le client ne peut pas le deviner d'une carte
 * qu'il n'affiche pas encore.
 */
taskCardRoutes.get("/:id/emplacement", (req, res) => {
  const card = carteOuverte(req.params.id, req);
  const list = orNotFound(taskLists.byId.get(card.list_id), "Liste introuvable");
  const board = orNotFound(boards.byId.get(list.board_id), "Tableau introuvable");

  res.json({ view_id: board.view_id, board_id: board.id, list_id: list.id });
});

// Modification d'une carte : son texte seul depuis le tableau, sa fiche
// entière depuis son tiroir. Chaque champ absent du corps reste tel quel.
taskCardRoutes.put("/:id", (req, res) => {
  const existing = carteOuverte(req.params.id, req, "update");
  const text = requireText(req.body.text ?? existing.text, "Le texte de la carte est requis");
  const description = descriptionPropre(req.body.description ?? existing.description ?? "");
  const dueDate = echeance(req.body.due_date, existing.due_date);
  // Sans échéance, ni début, ni récurrence, ni rappel : ils n'ont rien à quoi
  // se rapporter.
  const forme = dueDate ? choix(req.body.due_form, existing.due_form, isFormeEcheance) : "date";
  // Une date seule n'a pas de début.
  const startDate =
    dueDate && forme === "periode" ? debut(req.body.start_date, existing.start_date) : "";
  const recurrence = dueDate ? choix(req.body.recurrence, existing.recurrence, isRecurrence) : "";
  const reminder = dueDate ? choix(req.body.reminder, existing.reminder, isRappel) : "";
  // Un séparateur n'a pas de fiche, donc pas de fil où noter ce qui change.
  const avant = existing.kind === "separator" ? null : photo(existing.id);

  const contexte =
    req.body.context_id === undefined
      ? existing.context_id
      : contexteDuTableau(boardOfCard(existing), req.body.context_id);

  taskCards.update.run({
    id: existing.id,
    text,
    description,
    due_date: dueDate,
    start_date: startDate,
    due_form: forme,
    recurrence,
    reminder,
    context_id: contexte,
    cover_interval: choixNombre(req.body.cover_interval, existing.cover_interval, isRotationCouverture),
  });

  const membresAvant = new Set(membersOf(existing.id).map((m) => m.id));
  if (Array.isArray(req.body.member_ids)) {
    replaceCardMembers(existing.id, toIds(req.body.member_ids));
  }
  if (Array.isArray(req.body.label_ids)) {
    replaceCardLabels(existing.id, toIds(req.body.label_ids), boardOfCard(existing));
  }

  const suivante = taskCards.byId.get(existing.id)!;
  // Prévenir vient après l'écriture, jamais avant : on ne notifie que ce qui
  // est enregistré. Les suiveurs de la liste et les membres de la carte sont
  // prévenus au même titre que ceux qui la suivent (lib/notify.ts). Une fiche
  // enregistrée sans changement ne note rien et ne prévient personne.
  const lignes = avant ? ecarts(avant, photo(suivante.id)) : [];
  // Les nouveaux acteurs ont leur propre notification, à l'écran et par
  // e-mail ; celle de la modification ne les prévient pas une seconde fois.
  const rattaches =
    existing.kind === "separator"
      ? []
      : notifierRattachement({
          kind: "card",
          targetId: suivante.id,
          titre: suivante.text,
          message: "vous a ajouté comme acteur",
          destinataires: membersOf(suivante.id)
            .map((m) => m.id)
            .filter((id) => !membresAvant.has(id)),
          auteur: req.user,
          base: racine(req),
        });
  if (lignes.length) {
    consigner("card", suivante.id, req.user, lignes);
    notifier({
      kind: "card",
      targetId: suivante.id,
      titre: suivante.text,
      message: messageModification(lignes),
      auteur: req.user,
      sauf: rattaches,
      base: racine(req),
    });
  }

  res.json(cardDetail(suivante, req.user.id));
});

// Suppression d'une carte ou d'un séparateur : ses membres, étiquettes,
// checklists, pièces jointes et commentaires partent avec elle.
taskCardRoutes.delete("/:id", (req, res) => {
  const existing = carteOuverte(req.params.id, req, "delete");
  // Un séparateur n'est suivi par personne pour lui-même : il n'a pas de
  // fiche. Sa disparition ne s'annonce pas.
  const destinataires = existing.kind === "separator" ? [] : concernes.carte(existing.id);
  taskCards.remove.run(existing.id);
  notifierSuppression({
    kind: "card",
    targetId: existing.id,
    titre: existing.text,
    message: "a supprimé la carte",
    auteur: req.user,
    destinataires,
    disparu: true,
  });
  res.status(204).end();
});

// --- Fil d'une carte -------------------------------------------------------

taskCardRoutes.post("/:id/comments", (req, res) => {
  const card = carteOuverte(req.params.id, req, "update");
  const text = requireText(req.body.text, "text est requis");

  const timestamp = now();
  const { lastInsertRowid } = cardComments.create.run(
    card.id,
    req.user.id,
    text,
    timestamp,
    timestamp,
  );
  notifier({
    kind: "card",
    targetId: card.id,
    titre: card.text,
    message: "a commenté",
    auteur: req.user,
    base: racine(req),
  });

  res.status(201).json(withAuthor(cardComments.byId.get(lastInsertRowid)!));
});

/** Monté sous `/api/card-comments`. */
export const cardCommentRoutes = Router();

cardCommentRoutes.use(touch("task-lists"));

cardCommentRoutes.put("/:id", (req, res) => {
  const comment = orNotFound(cardComments.byId.get(req.params.id), COMMENTAIRE_INTROUVABLE);
  if (comment.system) forbidden(COMMENTAIRE_SYSTEME);
  carteOuverte(comment.card_id, req, "update");
  const text = requireText(req.body.text, "text est requis");

  // Un texte identique n'est pas une modification : la date ne bouge pas, et
  // le commentaire ne se met pas à porter « (modifié) ».
  if (text === comment.text) {
    res.json(withAuthor(comment));
    return;
  }

  cardComments.update.run(text, now(), comment.id);
  const carte = taskCards.byId.get(comment.card_id);
  if (carte) {
    notifier({
      kind: "card",
      targetId: carte.id,
      titre: carte.text,
      message: "a modifié un commentaire",
      auteur: req.user,
      base: racine(req),
    });
  }
  res.json(withAuthor(cardComments.byId.get(comment.id)!));
});

cardCommentRoutes.delete("/:id", (req, res) => {
  const comment = orNotFound(cardComments.byId.get(req.params.id), COMMENTAIRE_INTROUVABLE);
  if (comment.system) forbidden(COMMENTAIRE_SYSTEME);
  const carte = carteOuverte(comment.card_id, req, "update");

  cardComments.remove.run(comment.id);
  notifierSuppression({
    kind: "card",
    targetId: carte.id,
    titre: carte.text,
    message: "a supprimé un commentaire",
    auteur: req.user,
    destinataires: concernes.carte(carte.id),
    disparu: false,
  });
  res.status(204).end();
});
