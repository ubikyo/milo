// Les réglages de la section « Support » du Paramétrage, et le calcul des
// jours ouvrés qui s'en sert. Ils valent pour toute l'application.

import { supportStatusLabel, supportTicketRef } from "./domain.js";
import type { Id, SupportStatus } from "./domain.js";

/**
 * Ce qui envoie d'office une réponse par défaut à l'expéditeur d'une demande
 * reçue par e-mail. L'arrivée et la relance viennent de la boîte de support ;
 * les autres suivent le statut de la demande.
 */
export const SUPPORT_REPLY_EVENTS = [
  { value: "new", label: "Nouvelle demande" },
  { value: "reopened", label: "Demande réouverte" },
  { value: "open", label: "Demande prise en charge" },
  { value: "pending", label: "Demande en attente" },
  { value: "resolved", label: "Demande résolue" },
  { value: "closed", label: "Demande fermée" },
] as const;

export type SupportReplyEvent = (typeof SUPPORT_REPLY_EVENTS)[number]["value"];

export const isSupportReplyEvent = (value: unknown): value is SupportReplyEvent =>
  SUPPORT_REPLY_EVENTS.some((e) => e.value === value);

export const supportReplyEventLabel = (event: string): string =>
  SUPPORT_REPLY_EVENTS.find((e) => e.value === event)?.label ?? "";

/**
 * Quand un contenu par défaut se pose dans l'éditeur d'une réponse de l'équipe.
 * « Tout message » s'ajoute à la fin de tous — une signature ; les autres
 * suivent le fil de la demande, et passent devant :
 * - « Nouveau message » : le fil est vide, l'équipe écrit la première ;
 * - « Première réponse » : l'expéditeur a écrit, l'équipe pas encore ;
 * - « Réponse suivante » : l'équipe a déjà répondu.
 */
export const SUPPORT_CONTENT_EVENTS = [
  { value: "all", label: "Tout message" },
  { value: "new", label: "Nouveau message" },
  { value: "first_reply", label: "Première réponse" },
  { value: "reply", label: "Réponse suivante" },
] as const;

export type SupportContentEvent = (typeof SUPPORT_CONTENT_EVENTS)[number]["value"];

export const isSupportContentEvent = (value: unknown): value is SupportContentEvent =>
  SUPPORT_CONTENT_EVENTS.some((e) => e.value === value);

/**
 * Un contenu par défaut du Support : un intitulé, son modèle HTML, et
 * l'évènement qui le pose dans l'éditeur d'une réponse.
 */
export interface SupportContent {
  id: Id;
  name: string;
  html: string;
  /** « null » : il ne se pose nulle part. */
  event: SupportContentEvent | null;
}

/** D'où vient une variable : le compte qui écrit, l'expéditeur, la demande. */
export const SUPPORT_VARIABLE_GROUPS = ["Utilisateur", "Expéditeur", "Demande"] as const;

export type SupportVariableGroup = (typeof SUPPORT_VARIABLE_GROUPS)[number];

/**
 * Ce qu'un modèle peut citer : « {{demande.numero}} » devient « HLP-12 » dans
 * le message. L'utilisateur est le compte connecté, l'expéditeur celui de la
 * demande : leurs fiches viennent d'Entra.
 */
export const SUPPORT_REPLY_VARIABLES = [
  { group: "Utilisateur", key: "utilisateur.prenom", label: "Prénom" },
  { group: "Utilisateur", key: "utilisateur.nom", label: "Nom" },
  { group: "Utilisateur", key: "utilisateur.nom_complet", label: "Nom complet" },
  { group: "Utilisateur", key: "utilisateur.email", label: "Adresse e-mail" },
  { group: "Utilisateur", key: "utilisateur.telephone", label: "Téléphone professionnel" },
  { group: "Utilisateur", key: "utilisateur.mobile", label: "Téléphone mobile" },
  { group: "Utilisateur", key: "utilisateur.poste", label: "Poste" },
  { group: "Utilisateur", key: "utilisateur.service", label: "Département" },
  { group: "Utilisateur", key: "utilisateur.entreprise", label: "Nom de l'entreprise" },
  { group: "Utilisateur", key: "utilisateur.adresse", label: "Adresse postale" },
  { group: "Utilisateur", key: "utilisateur.ville", label: "Ville" },
  { group: "Utilisateur", key: "utilisateur.departement", label: "Département (adresse)" },
  { group: "Utilisateur", key: "utilisateur.code_postal", label: "Code postal" },
  { group: "Utilisateur", key: "utilisateur.pays", label: "Pays" },
  { group: "Expéditeur", key: "expediteur.prenom", label: "Prénom" },
  { group: "Expéditeur", key: "expediteur.nom", label: "Nom" },
  { group: "Expéditeur", key: "expediteur.nom_complet", label: "Nom complet" },
  { group: "Expéditeur", key: "expediteur.email", label: "Adresse e-mail" },
  { group: "Demande", key: "demande.numero", label: "Numéro" },
  { group: "Demande", key: "demande.objet", label: "Objet" },
  { group: "Demande", key: "demande.statut", label: "Statut" },
] as const satisfies readonly {
  group: SupportVariableGroup;
  key: string;
  label: string;
}[];

/**
 * La fiche d'une personne, telle que les variables la citent : celle d'Entra,
 * ou, à défaut, ce qu'en sait Milo — son nom, son adresse.
 */
export interface SupportPerson {
  prenom: string;
  nom: string;
  nom_complet: string;
  email: string;
  telephone: string;
  mobile: string;
  poste: string;
  service: string;
  entreprise: string;
  adresse: string;
  ville: string;
  departement: string;
  code_postal: string;
  pays: string;
}

export const emptySupportPerson = (): SupportPerson => ({
  prenom: "",
  nom: "",
  nom_complet: "",
  email: "",
  telephone: "",
  mobile: "",
  poste: "",
  service: "",
  entreprise: "",
  adresse: "",
  ville: "",
  departement: "",
  code_postal: "",
  pays: "",
});

/**
 * Le prénom et le nom d'une personne dont on n'a que le nom affiché — celui
 * que porte son e-mail. Les mots tout en capitales sont le nom (« QUINTARD
 * Jérôme ») ; sinon, le premier mot est le prénom et la suite le nom.
 */
export const splitPersonName = (complet: string): { prenom: string; nom: string } => {
  const mots = complet.trim().split(/\s+/).filter(Boolean);
  const capitales = (mot: string) =>
    /\p{L}{2}/u.test(mot) && mot === mot.toLocaleUpperCase("fr");
  if (mots.some(capitales) && !mots.every(capitales)) {
    return {
      prenom: mots.filter((m) => !capitales(m)).join(" "),
      nom: mots.filter(capitales).join(" "),
    };
  }
  return { prenom: mots[0] ?? "", nom: mots.slice(1).join(" ") };
};

/** Ce qu'il faut savoir d'une demande pour en remplir les variables. */
export interface DemandeAVariables {
  /** Zéro : la demande n'est pas encore créée, elle n'a pas de numéro. */
  number: number;
  subject: string;
  status: SupportStatus;
}

/**
 * Ce que valent les variables d'un modèle : l'utilisateur, l'expéditeur, la
 * demande. Une personne absente — pas d'expéditeur, pas d'utilisateur pour
 * une réponse partie d'office — laisse ses variables vides.
 */
export const supportReplyValues = ({
  utilisateur,
  expediteur,
  demande,
}: {
  utilisateur?: SupportPerson | null;
  expediteur?: SupportPerson | null;
  demande: DemandeAVariables;
}): Record<string, string> => {
  const valeurs: Record<string, string> = {
    "demande.numero": demande.number ? supportTicketRef(demande.number) : "",
    "demande.objet": demande.subject,
    "demande.statut": supportStatusLabel(demande.status),
  };
  const personnes = { utilisateur, expediteur };
  for (const v of SUPPORT_REPLY_VARIABLES) {
    const [qui, champ] = v.key.split(".") as [string, keyof SupportPerson];
    if (qui === "demande") continue;
    valeurs[v.key] = personnes[qui as keyof typeof personnes]?.[champ] ?? "";
  }
  return valeurs;
};

const echapperHtml = (texte: string): string =>
  texte
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * Un modèle HTML dont « {{demande.numero}} » est remplacé par sa valeur,
 * échappée ; une variable inconnue reste telle quelle.
 */
export const fillSupportTemplate = (modele: string, valeurs: Record<string, string>): string =>
  modele.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (tout, cle: string) =>
    cle in valeurs ? echapperHtml(valeurs[cle]!) : tout,
  );

export interface SupportSettings {
  /**
   * L'échéance donnée d'office à une demande qui arrive par e-mail, en jours
   * ouvrés après sa réception. Zéro : pas d'échéance.
   */
  default_due_days: number;
  /**
   * Les étiquettes posées d'office sur une demande qui arrive par e-mail.
   * Tant que le Paramétrage n'en a pas choisi, la priorité la plus légère.
   */
  default_label_ids: Id[];
}

/** Une réponse par défaut du Support : un intitulé, et son modèle HTML. */
export interface SupportReply {
  id: Id;
  name: string;
  html: string;
  /** L'évènement qui l'envoie d'office ; « null » : elle ne part qu'à la main. */
  event: SupportReplyEvent | null;
}

/** Au-delà, une échéance « par défaut » n'en est plus une. */
export const SUPPORT_DUE_DAYS_MAX = 60;

export const emptySupportSettings = (): SupportSettings => ({
  default_due_days: 0,
  default_label_ids: [],
});

/** Une date du calendrier, sans heure ni fuseau. */
export interface JourCalendrier {
  annee: number;
  /** De 1 à 12. */
  mois: number;
  jour: number;
}

const cle = (annee: number, mois: number, jour: number): string =>
  `${annee}-${String(mois).padStart(2, "0")}-${String(jour).padStart(2, "0")}`;

/** Le dimanche de Pâques (algorithme grégorien anonyme). */
const paques = (annee: number): Date => {
  const a = annee % 19;
  const b = Math.floor(annee / 100);
  const c = annee % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mois = Math.floor((h + l - 7 * m + 114) / 31);
  const jour = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(annee, mois - 1, jour));
};

const feries = new Map<number, Set<string>>();

/** Les jours fériés de France métropolitaine, pour une année. */
const feriesDe = (annee: number): Set<string> => {
  const deja = feries.get(annee);
  if (deja) return deja;
  const dimanche = paques(annee);
  const apresPaques = (n: number) => {
    const date = new Date(dimanche.getTime() + n * 86_400_000);
    return cle(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  };
  const jours = new Set([
    cle(annee, 1, 1),
    apresPaques(1), // lundi de Pâques
    cle(annee, 5, 1),
    cle(annee, 5, 8),
    apresPaques(39), // Ascension
    apresPaques(50), // lundi de Pentecôte
    cle(annee, 7, 14),
    cle(annee, 8, 15),
    cle(annee, 11, 1),
    cle(annee, 11, 11),
    cle(annee, 12, 25),
  ]);
  feries.set(annee, jours);
  return jours;
};

/**
 * Le jour ouvré qui tombe `n` jours ouvrés après `depart` : ni samedi, ni
 * dimanche, ni jour férié. Le jour de départ ne compte pas — reçu un vendredi,
 * « un jour » tombe le lundi.
 */
export const ajouterJoursOuvres = (depart: JourCalendrier, n: number): JourCalendrier => {
  const date = new Date(Date.UTC(depart.annee, depart.mois - 1, depart.jour));
  let restants = Math.max(0, Math.floor(n));
  while (restants > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    const semaine = date.getUTCDay();
    const annee = date.getUTCFullYear();
    const ferie = feriesDe(annee).has(cle(annee, date.getUTCMonth() + 1, date.getUTCDate()));
    if (semaine !== 0 && semaine !== 6 && !ferie) restants -= 1;
  }
  return { annee: date.getUTCFullYear(), mois: date.getUTCMonth() + 1, jour: date.getUTCDate() };
};
