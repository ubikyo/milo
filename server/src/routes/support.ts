// Le mode Support : ses demandes, leur fil, et les étiquettes qu'elles
// portent.
//
// Une demande pend à une société — celle de la liste déroulante de l'entête —
// et non à un tableau : il n'y a donc rien de privé ici, chacun voit les
// demandes des sociétés qu'il consulte.
//
// Les étiquettes ne passent pas par la fabrique de « routes/labels.ts » :
// celle-ci ne parle que de tableaux, et sait les copier de l'un à l'autre.
// Celles du support sont communes à toutes les sociétés et ne se copient pas.

import {
  TAILLE_MAX_ENVOI,
  TAILLE_MAX_ENVOI_MO,
  TAILLE_MAX_TICKET,
  ecrireTicket,
  fichiersDe,
  fichiersDeposes,
  oublierFichiers,
} from "../lib/ticket-files.js";
import express, { Router } from "express";
import type { Request } from "express";
import { DEFAULT_SUPPORT_STATUS, isSupportStatus, isLabelColor, DEFAULT_LABEL_COLOR } from "@milo/shared";
import type { Id, SupportStatus } from "@milo/shared";
import { selection, transaction } from "../db/query.js";
import type { CompanyRow, SupportRequestRow, UserRow } from "../db/rows.js";
import {
  concernes,
  notifier,
  notifierAssignations,
  notifierSuppression,
  racine,
  titreDemande,
} from "../lib/notify.js";
import {
  badRequest,
  conflict,
  forbidden,
  orNotFound,
  refuserSiUtilise,
  requireText,
  toIds,
} from "../lib/http.js";
import { descriptionPropre } from "../lib/html.js";
import { releverLesBoites } from "../lib/support-mail.js";
import { repondreParEmail } from "../lib/support-reply.js";
import { echeance, horodatage, now } from "../lib/time.js";
import { touch } from "../middleware/events.js";
import { COMMENTAIRE_SYSTEME } from "../repositories/comments.js";
import { ordreRecu, rangerSupportLabels } from "../repositories/reorder.js";
import {
  DEMANDE_INTROUVABLE,
  ETIQUETTE_SUPPORT_INTROUVABLE,
  assignerDemandes,
  fermerDemande,
  fusionnerDemandes,
  ajouterActeurs,
  oneWithRelations,
  prochainNumeroDeTicket,
  replaceSupportActors,
  replaceSupportLabels,
  supportCommentOf,
  supportComments,
  supportLabels,
  supportRequestDetail,
  supportRequests,
  withRelations,
} from "../repositories/support.js";
import { users } from "../repositories/users.js";

const SOCIETE_INTROUVABLE = "Société introuvable";
const COMMENTAIRE_INTROUVABLE = "Commentaire introuvable";

const societes = selection<CompanyRow>("SELECT * FROM companies WHERE id = ?");

/** La société visée, si elle existe : tout ce qui suit lui appartient. */
const societe = (id: unknown): CompanyRow => {
  if (!id) badRequest("La société est requise");
  return orNotFound(societes.get(id), SOCIETE_INTROUVABLE);
};

/** Le statut reçu. Une valeur inconnue est refusée plutôt que corrigée. */
const statut = (valeur: unknown, defaut: SupportStatus): SupportStatus => {
  if (valeur === undefined) return defaut;
  if (!isSupportStatus(valeur)) badRequest("Statut inconnu");
  return valeur as SupportStatus;
};

export const supportRequestRoutes = Router();

supportRequestRoutes.use(touch("support-requests"));

/** La demande visée, si elle existe. */
const demande = (id: unknown) => orNotFound(supportRequests.byId.get(id), DEMANDE_INTROUVABLE);

/** Une demande a changé : ceux qui la suivent en sont prévenus. */
const demandeModifiee = (req: Request, demandeId: Id, message: string): void => {
  const d = supportRequests.byId.get(demandeId);
  if (!d) return;
  notifier({
    kind: "support",
    targetId: d.id,
    titre: titreDemande(d),
    message,
    auteur: req.user,
    base: racine(req),
  });
};

/**
 * Des demandes vont être supprimées : leurs acteurs et ceux qui les suivent,
 * lus tant qu'ils sont là, sont prévenus une fois la suppression faite.
 */
const annoncerSuppressions = (req: Request, demandes: SupportRequestRow[]): (() => void) => {
  const annonces = demandes.map((d) => ({ d, destinataires: concernes.demande(d.id) }));
  return () => {
    for (const { d, destinataires } of annonces) {
      notifierSuppression({
        kind: "support",
        targetId: d.id,
        titre: titreDemande(d),
        message: "a supprimé la demande",
        auteur: req.user,
        destinataires,
        disparu: true,
      });
    }
  };
};

// Toutes les demandes d'une société, quel que soit leur statut : ce sont les
// onglets qui les rangent, et ils comptent ce que chacun contient.
//
// Sans société précise — la liste déroulante sur « toutes » —, elles sortent
// toutes : le mode s'ouvre là-dessus, et c'est la vue d'ensemble de ce qui est
// en cours chez tout le monde.
supportRequestRoutes.get("/", (req, res) => {
  const demande = req.query.company;
  const lignes =
    !demande || demande === "all"
      ? supportRequests.all.all()
      : supportRequests.ofCompany.all(societe(demande).id);
  res.json(withRelations(lignes));
});

// La relève des boîtes de support, à la demande : le mode s'ouvre dessus, sans
// attendre la prochaine relève périodique. Elle signale elle-même les demandes
// créées ; une relève qui n'apporte rien ne fait rien relire aux clients.
supportRequestRoutes.post("/sync", (_req, res, next) => {
  res.locals.touched?.clear();
  releverLesBoites()
    .then((created) => res.json({ created }))
    .catch(next);
});

// --- Actions sur les demandes cochées --------------------------------------
// Toutes prennent la liste des demandes cochées. Une demande qui n'existe plus
// — supprimée par quelqu'un d'autre entre-temps — fait refuser le tout : on
// n'agit pas sur une sélection qui n'est plus celle qu'on a vue.

/** Les demandes cochées, toutes existantes, sans doublon. */
const cochees = (valeur: unknown): SupportRequestRow[] => {
  const ids = [...new Set(toIds(valeur))];
  if (ids.length === 0) badRequest("Aucune demande sélectionnée");
  return ids.map((id) => demande(id));
};

// Fusionner : la plus récente reste et reçoit les échanges des autres, qui
// sont fermées. Elles doivent appartenir à la même société — une demande ne
// change pas de société en cachette.
supportRequestRoutes.post("/merge", (req, res) => {
  const demandes = cochees(req.body.ids);
  if (demandes.length < 2) badRequest("Sélectionnez au moins deux demandes à fusionner");
  if (new Set(demandes.map((d) => d.company_id)).size > 1) {
    badRequest("Seules des demandes d'une même société peuvent être fusionnées");
  }

  const [garde, ...autres] = [...demandes].sort((a, b) =>
    a.created_at === b.created_at ? b.id - a.id : a.created_at < b.created_at ? 1 : -1,
  ) as [SupportRequestRow, ...SupportRequestRow[]];
  fusionnerDemandes(garde, autres, req.user.id, horodatage(now()));
  demandeModifiee(
    req,
    garde.id,
    autres.length === 1
      ? `y a fusionné ${titreDemande(autres[0]!)}`
      : `y a fusionné ${autres.length} demandes`,
  );
  for (const autre of autres) {
    demandeModifiee(req, autre.id, `a fusionné la demande dans ${titreDemande(garde)}`);
  }

  res.json(supportRequestDetail(demande(garde.id)));
});

supportRequestRoutes.post("/close", (req, res) => {
  const demandes = cochees(req.body.ids);
  const note = `Fermée le ${horodatage(now())}`;
  transaction(() => {
    for (const d of demandes) fermerDemande(d, req.user.id, note);
  })();
  for (const d of demandes) demandeModifiee(req, d.id, "a fermé la demande");
  res.status(204).end();
});

/** Les fichiers rangés pour les e-mails d'une demande. */
const fichiersDeLaDemande = (demandeId: Id): string[] =>
  supportComments.attachmentsOfRequest
    .all(demandeId)
    .flatMap(({ attachments }) => fichiersDe(attachments).map((f) => f.file));

supportRequestRoutes.post("/delete", (req, res) => {
  const demandes = cochees(req.body.ids);
  const fichiers = demandes.flatMap((d) => fichiersDeLaDemande(d.id));
  const annoncer = annoncerSuppressions(req, demandes);
  // Leurs étiquettes et leur fil partent avec elles, par clé étrangère.
  transaction(() => {
    for (const d of demandes) supportRequests.remove.run(d.id);
  })();
  oublierFichiers(fichiers);
  annoncer();
  res.status(204).end();
});

// Assigner : les comptes choisis s'ajoutent aux acteurs, et ceux qui arrivent
// sur une demande en sont prévenus, à l'écran et par e-mail.
supportRequestRoutes.post("/assign", (req, res) => {
  const demandes = cochees(req.body.ids);
  const comptes = [...new Set(toIds(req.body.actor_ids))]
    .map((id) => users.byId.get(id))
    .filter((u): u is UserRow => Boolean(u && !u.system));
  if (comptes.length === 0) badRequest("Choisissez au moins un acteur");

  const arrivees = assignerDemandes(demandes, comptes.map((u) => u.id));
  const parId = new Map(comptes.map((u) => [u.id, u]));
  notifierAssignations(
    demandes
      .filter((d) => arrivees.has(d.id))
      .map((d) => ({
        demande: d,
        destinataires: arrivees.get(d.id)!.map((id) => parId.get(id)!),
        auteur: req.user,
        base: racine(req),
      })),
  );
  for (const d of demandes) {
    if (arrivees.has(d.id)) demandeModifiee(req, d.id, "a assigné la demande");
  }
  res.status(204).end();
});

supportRequestRoutes.post("/", (req, res) => {
  const company = societe(req.body.company_id);

  // Lus avant de prendre un numéro : une saisie refusée n'en consomme pas.
  const status = statut(req.body.status, DEFAULT_SUPPORT_STATUS);
  const dueDate = echeance(req.body.due_date, "");

  const timestamp = now();
  const { lastInsertRowid } = supportRequests.create.run(
    prochainNumeroDeTicket(),
    company.id,
    String(req.body.subject ?? "").trim(),
    status,
    dueDate,
    timestamp,
    timestamp,
  );

  // Le fil d'une demande s'ouvre sur sa création, comme celui d'une carte.
  supportComments.createSystem.run(
    lastInsertRowid,
    req.user.id,
    `Demande créée le ${horodatage(timestamp)}`,
    timestamp,
    timestamp,
  );

  const creee = demande(lastInsertRowid);
  if (Array.isArray(req.body.actor_ids)) {
    replaceSupportActors(creee.id, toIds(req.body.actor_ids));
    prevenirNouveauxActeurs(req, creee.id, new Set());
  }
  if (Array.isArray(req.body.label_ids)) {
    replaceSupportLabels(creee.id, toIds(req.body.label_ids));
  }

  res.status(201).json(supportRequestDetail(creee));
});

supportRequestRoutes.get("/:id", (req, res) => {
  res.json(supportRequestDetail(demande(req.params.id)));
});

// Chaque champ absent du corps reste tel quel. La société, elle, est
// modifiable : une demande ouverte sous « toutes les sociétés » part chez la
// première de la liste, et c'est ici qu'on la remet où il faut.
supportRequestRoutes.put("/:id", (req, res) => {
  const existing = demande(req.params.id);
  const avant = acteursActuels(existing.id);
  const companyId =
    req.body.company_id === undefined
      ? existing.company_id
      : societe(req.body.company_id).id;

  supportRequests.update.run(
    companyId,
    req.body.subject === undefined ? existing.subject : String(req.body.subject ?? "").trim(),
    statut(req.body.status, existing.status),
    echeance(req.body.due_date, existing.due_date),
    now(),
    existing.id,
  );

  if (Array.isArray(req.body.actor_ids)) {
    replaceSupportActors(existing.id, toIds(req.body.actor_ids));
    prevenirNouveauxActeurs(req, existing.id, avant);
  }
  // Les étiquettes sont communes : une demande qui change de société les
  // garde.
  if (Array.isArray(req.body.label_ids)) {
    replaceSupportLabels(existing.id, toIds(req.body.label_ids));
  }

  demandeModifiee(req, existing.id, "a modifié la demande");
  res.json(supportRequestDetail(demande(existing.id)));
});

supportRequestRoutes.delete("/:id", (req, res) => {
  // Ses étiquettes et son fil partent avec elle, par clé étrangère ; les
  // fichiers de ses e-mails, eux, sont effacés du disque.
  const existante = demande(req.params.id);
  const fichiers = fichiersDeLaDemande(existante.id);
  const annoncer = annoncerSuppressions(req, [existante]);
  supportRequests.remove.run(existante.id);
  oublierFichiers(fichiers);
  annoncer();
  res.status(204).end();
});

// --- Fil d'une demande -----------------------------------------------------

/**
 * Le texte d'un message : du HTML venu de l'éditeur, nettoyé de ce qu'il ne
 * sait pas produire. Un message vide est refusé.
 */
/** Une adresse e-mail, à peu près : de quoi refuser une faute de frappe. */
const ADRESSE = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;

/** Les adresses en copie d'une réponse : sans doublon, et bien formées. */
const adressesRecues = (valeur: unknown): string[] => {
  if (valeur === undefined) return [];
  if (!Array.isArray(valeur)) badRequest("Les adresses en copie doivent être une liste");
  const adresses = [...new Set((valeur as unknown[]).map((a) => String(a).trim().toLowerCase()))];
  const fausse = adresses.find((a) => !ADRESSE.test(a));
  if (fausse) badRequest(`Adresse e-mail invalide : ${fausse}`);
  return adresses;
};

const messageRecu = (valeur: unknown): string => {
  const text = descriptionPropre(valeur);
  if (!text) badRequest("Le message est vide");
  return text;
};

/**
 * Prévient ceux qui viennent d'arriver parmi les acteurs d'une demande, par le
 * geste de quelqu'un d'autre. S'ajouter soi-même ne prévient personne.
 */
const prevenirNouveauxActeurs = (
  req: Request,
  demandeId: Id,
  avant: Set<Id>,
): void => {
  const apres = demande(demandeId);
  const nouveaux = oneWithRelations(apres)
    .actors.filter((a) => !avant.has(a.id) && a.id !== req.user.id)
    .map((a) => users.byId.get(a.id))
    .filter((u): u is UserRow => Boolean(u));
  if (!nouveaux.length) return;
  notifierAssignations([
    { demande: apres, destinataires: nouveaux, auteur: req.user, base: racine(req) },
  ]);
};

const acteursActuels = (demandeId: Id): Set<Id> =>
  new Set(oneWithRelations(demande(demandeId)).actors.map((a) => a.id));

/**
 * Déposer une pièce jointe de réponse, avant d'envoyer la réponse : le fichier
 * arrive seul, en brut, et la réponse ne porte ensuite que son nom de
 * rangement. Un fichier déposé puis jamais envoyé reste sans message.
 */
const corpsFichier = express.raw({ type: () => true, limit: TAILLE_MAX_TICKET });

supportRequestRoutes.post("/:id/files", corpsFichier, (req, res) => {
  demande(req.params.id);
  const contenu = req.body as unknown;
  if (!Buffer.isBuffer(contenu) || contenu.length === 0) badRequest("Le fichier est vide");
  const name = String(req.query["name"] ?? "").trim() || "piece-jointe";
  const mime = String(req.query["type"] ?? "") || "application/octet-stream";
  const file = ecrireTicket(contenu as Buffer, name);
  res.status(201).json({ file, name, mime, size: (contenu as Buffer).length });
});

supportRequestRoutes.post("/:id/comments", (req, res, next) => {
  const existing = demande(req.params.id);

  // Un commentaire interne : du texte simple, entre membres de l'équipe,
  // comme ceux des cartes et des projets. Il ne part pas par e-mail.
  if (req.body.internal) {
    const texte = requireText(req.body.text, "Le commentaire est vide");
    const instant = now();
    const { lastInsertRowid } = supportComments.createInternal.run(
      existing.id,
      req.user.id,
      texte,
      instant,
      instant,
    );
    demandeModifiee(req, existing.id, "a ajouté un commentaire");
    res.status(201).json(supportCommentOf(supportComments.byId.get(lastInsertRowid)!));
    return;
  }

  const text = messageRecu(req.body.text);
  const copies = { cc: adressesRecues(req.body.cc), bcc: adressesRecues(req.body.bcc) };
  // Le bouton d'envoi dit aussi où en est la demande : en attente, résolue
  // ou fermée.
  const statut = req.body.status;
  if (statut !== undefined && !isSupportStatus(statut)) badRequest("Statut inconnu");
  // Les pièces jointes, déposées d'abord (POST /:id/files).
  const fichiers = fichiersDeposes(req.body.files);
  if (!fichiers) badRequest("Pièce jointe introuvable");
  if (
    existing.sender_email &&
    fichiers!.reduce((total, f) => total + f.size, 0) > TAILLE_MAX_ENVOI
  ) {
    badRequest(`Les pièces jointes d'une réponse ne dépassent pas ${TAILLE_MAX_ENVOI_MO} Mo au total`);
  }

  // Qui écrit sur une demande s'en occupe : il en devient acteur.
  if (!req.user.system) ajouterActeurs(existing.id, [req.user.id]);

  const timestamp = now();
  const { lastInsertRowid } = supportComments.create.run(
    existing.id,
    req.user.id,
    text,
    timestamp,
    timestamp,
  );

  // Sur une demande reçue par e-mail, le message part aussi à l'expéditeur —
  // ou fait semblant, tant que les envois sont simulés. Il est enregistré
  // quoi qu'il arrive : son état dit si l'e-mail est parti.
  if (statut && statut !== existing.status) {
    supportRequests.setStatus.run(statut, timestamp, existing.id);
  }
  if (fichiers!.length) {
    supportComments.setAttachments.run(JSON.stringify(fichiers), lastInsertRowid);
  }
  demandeModifiee(
    req,
    existing.id,
    existing.sender_email ? "a répondu par e-mail" : "a ajouté un message",
  );

  repondreParEmail(existing, lastInsertRowid as Id, text, copies, fichiers!)
    .then(() =>
      res.status(201).json(supportCommentOf(supportComments.byId.get(lastInsertRowid)!)),
    )
    .catch(next);
});

/** Monté sous `/api/support-comments`. */
export const supportCommentRoutes = Router();

supportCommentRoutes.use(touch("support-requests"));

supportCommentRoutes.put("/:id", (req, res) => {
  const comment = orNotFound(supportComments.byId.get(req.params.id), COMMENTAIRE_INTROUVABLE);
  if (comment.system) forbidden(COMMENTAIRE_SYSTEME);
  // Chaque fil garde sa forme : texte simple pour un commentaire interne,
  // HTML nettoyé pour un échange.
  const text = comment.internal
    ? requireText(req.body.text, "Le commentaire est vide")
    : messageRecu(req.body.text);

  // Un texte identique n'est pas une modification : la date ne bouge pas, et
  // le commentaire ne se met pas à porter « (modifié) ».
  if (text === comment.text) {
    res.json(supportCommentOf(comment));
    return;
  }

  supportComments.update.run(text, now(), comment.id);
  demandeModifiee(
    req,
    comment.request_id,
    comment.internal ? "a modifié un commentaire" : "a modifié un message",
  );
  res.json(supportCommentOf(supportComments.byId.get(comment.id)!));
});

supportCommentRoutes.delete("/:id", (req, res) => {
  const comment = orNotFound(supportComments.byId.get(req.params.id), COMMENTAIRE_INTROUVABLE);
  if (comment.system) forbidden(COMMENTAIRE_SYSTEME);

  supportComments.remove.run(comment.id);
  const parent = supportRequests.byId.get(comment.request_id);
  if (parent) {
    notifierSuppression({
      kind: "support",
      targetId: parent.id,
      titre: titreDemande(parent),
      message: comment.internal ? "a supprimé un commentaire" : "a supprimé un message",
      auteur: req.user,
      destinataires: concernes.demande(parent.id),
      disparu: false,
    });
  }
  res.status(204).end();
});

// --- Étiquettes ------------------------------------------------------------
// Elles sont communes à tout le support, quelle que soit la société : les
// renommer, les recolorer ou les supprimer touche toutes les demandes qui les
// portent.

/** Le poids reçu : un entier, positif ou non. */
const poidsEtiquette = (valeur: unknown): number => {
  const poids = Number(valeur);
  if (!Number.isInteger(poids)) badRequest("Le poids doit être un nombre entier");
  return poids;
};

export const supportLabelRoutes = Router();

supportLabelRoutes.use(touch("support-labels", "support-requests"));

supportLabelRoutes.get("/", (_req, res) => {
  res.json(supportLabels.all.all());
});

supportLabelRoutes.post("/", (req, res) => {
  const name = requireText(req.body.name, "Le nom de l'étiquette est requis");
  // Communes à toutes les sociétés : deux du même nom ne se distingueraient
  // plus dans une liste.
  if (supportLabels.byName.get(name)) conflict("Cette étiquette existe déjà");
  const color = req.body.color || DEFAULT_LABEL_COLOR;
  if (!isLabelColor(color)) badRequest("Couleur inconnue");
  const weight = poidsEtiquette(req.body.weight ?? 0);

  const { next } = supportLabels.nextPosition();
  const { lastInsertRowid } = supportLabels.create.run(name, color, weight, next, now());
  res.status(201).json(supportLabels.byId.get(lastInsertRowid));
});

// Ranger les étiquettes : l'ordre où les listes les présentent. Déclaré avant
// « /:id », sinon « reorder » serait pris pour un identifiant. Toutes se
// voient de tous : l'ordre reçu les nomme toutes, chacune une fois.
supportLabelRoutes.put("/reorder", (req, res) => {
  const ordre = ordreRecu(
    req.body.ids,
    supportLabels.all.all(),
    "L'ordre doit nommer chaque étiquette une fois",
  );
  rangerSupportLabels(ordre);
  res.json(supportLabels.all.all());
});

supportLabelRoutes.put("/:id", (req, res) => {
  const existing = orNotFound(
    supportLabels.byId.get(req.params.id),
    ETIQUETTE_SUPPORT_INTROUVABLE,
  );
  const name = requireText(req.body.name ?? existing.name, "Le nom de l'étiquette est requis");
  const homonyme = supportLabels.byName.get(name);
  if (homonyme && homonyme.id !== existing.id) conflict("Cette étiquette existe déjà");
  const color = req.body.color ?? existing.color;
  if (!isLabelColor(color)) badRequest("Couleur inconnue");
  const weight = poidsEtiquette(req.body.weight ?? existing.weight);

  supportLabels.update.run(name, color, weight, existing.id);
  res.json(supportLabels.byId.get(existing.id));
});

supportLabelRoutes.delete("/:id", (req, res) => {
  const existing = orNotFound(
    supportLabels.byId.get(req.params.id),
    ETIQUETTE_SUPPORT_INTROUVABLE,
  );
  refuserSiUtilise(existing.name, supportLabels.usage(existing.id).count);
  supportLabels.remove.run(existing.id);
  res.status(204).end();
});
