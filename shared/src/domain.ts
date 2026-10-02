// Le vocabulaire de l'application : ce que le serveur renvoie, ce que le
// client reçoit. Un seul endroit le décrit, donc les deux côtés ne peuvent
// plus diverger en silence.
//
// Convention : SQLite n'a pas de booléen, il range 0 ou 1 dans un entier. Les
// champs qui en viennent sont donc typés `SqliteBool` et non `boolean` — le
// type dit la vérité plutôt que de la maquiller, et `Boolean(x)` reste
// nécessaire pour les lire.

import type { CompanyRights } from "./roles.js";
import type { WidgetRights } from "./widget-kinds.js";
import type { Mode } from "./modes.js";

export type SqliteBool = 0 | 1;

/** Identifiant de ligne SQLite. */
export type Id = number;

// --- Personnes -------------------------------------------------------------

/** Un compte, tel qu'il se montre : jamais son empreinte de mot de passe. */
export interface PublicUser {
  id: Id;
  first_name: string;
  last_name: string;
  /** Nom complet, ou l'e-mail à défaut. Alimente les initiales et les listes. */
  name: string;
  email: string;
  gravatar_url: string;
  /**
   * Ses droits sur le Paramétrage : le compte « admin » les a tous ; les
   * autres, s'ils ont un rôle qui les accorde dans au moins une société.
   * « view » ouvre le Paramétrage, « update » permet d'y enregistrer.
   */
  settings: { view: boolean; update: boolean };
  /**
   * Ses droits dans les modes (shared, roles.ts), déduits de ses permissions
   * par type de widget et communs à toutes les sociétés : le client s'en sert
   * pour taire ce que le compte ne voit pas et retirer ce qu'il ne peut pas
   * faire. Le serveur les vérifie de son côté.
   */
  rights: CompanyRights;
  /**
   * Ses permissions par type de widget — les siennes et celles de ses
   * groupes réunies : quels widgets il voit, lesquels il pose et modifie.
   */
  widgets: WidgetRights;
  /**
   * Le compte « admin » local : il ne sert qu'au paramétrage, ne se montre
   * dans aucune liste et n'est l'acteur de rien.
   */
  system: boolean;
  default_mode: Mode;
  created_at: string;
}

/**
 * Une personne telle qu'elle accompagne autre chose : acteur d'un projet,
 * membre d'une carte ou d'un élément de checklist, auteur d'un commentaire.
 * Le strict nécessaire pour l'afficher en bulle.
 */
export interface Actor {
  id: Id;
  name: string;
  email: string;
  gravatar_url: string;
}

/**
 * Milo lui-même, auteur des mots que l'application écrit sans personne
 * derrière — l'ouverture d'un fil à la création d'un projet, d'une carte ou
 * d'une demande. Aucun compte ne porte cet identifiant : la pastille le
 * reconnaît pour montrer le logo plutôt que des initiales.
 */
export const MILO_ACTOR_ID = -1;
export const MILO_ACTOR: Actor = { id: MILO_ACTOR_ID, name: "Milo", email: "", gravatar_url: "" };

// --- Sociétés ---------------------------------------------------------------

export interface Company {
  id: Id;
  name: string;
  /** L'adresse à laquelle écrire au support de la société ; vide si aucune. */
  support_email: string;
  /** L'adresse du site de support, toujours en https:// ; vide si aucune. */
  support_url: string;
  /** Ce que la suppression en cascade emporterait. */
  project_count: number;
}

// --- Mode Projet -----------------------------------------------------------

export interface ProjectBoard {
  id: Id;
  name: string;
  position: number;
  is_private: SqliteBool;
  /** Nul pour un tableau d'avant l'option « Privé », ou dont l'auteur est parti. */
  owner_id: Id | null;
  created_at: string;
}

/**
 * Un jalon du curseur d'avancement : un pourcentage, la couleur de la tranche
 * qu'il ferme, et un libellé facultatif.
 *
 * Les jalons découpent la progression en tranches : de 0 au premier jalon,
 * puis de jalon en jalon. Un projet prend la couleur de la tranche où tombe
 * sa progression — à 15 %, entre un jalon à 10 % et un autre à 20 %, celle du
 * jalon à 20 %.
 */
export interface Milestone {
  /** De 0 à 100. */
  value: number;
  /** Vide : le jalon colore sa tranche, mais ne s'écrit pas sous le curseur. */
  label: string;
  /** Une couleur d'étiquette (« teinte.nuance ») ; absente sur les anciens jalons. */
  color?: string;
}

/**
 * Un type de jalons — Commande, Développement… —, réglé une fois pour toute
 * l'application. Un projet en choisit un : ses jalons posent les marques et
 * les couleurs du curseur d'avancement.
 */
export interface MilestoneType {
  id: Id;
  name: string;
  /** Rangés par valeur ; vide tant qu'on ne les a pas réglés. */
  milestones: Milestone[];
}

export interface Category {
  id: Id;
  board_id: Id;
  name: string;
  /** Les jalons des projets de cette catégorie, rangés par valeur ; vide si aucun. */
  milestones: Milestone[];
  /** Présent sur la liste. */
  project_count?: number;
}

export interface ProjectLabel {
  id: Id;
  board_id: Id;
  name: string;
  /** « teinte.nuance » de la palette Mantine, par exemple « red.6 ». */
  color: string;
  /** Le poids : les plus lourdes passent devant, dans les grilles. */
  weight: number;
  position: number;
  created_at: string;
}

export interface Project {
  id: Id;
  /** Sa référence (« HLP-12 »), donnée par le compteur commun aux modes. */
  number: number;
  name: string;
  description: string;
  board_id: Id;
  category_id: Id;
  company_id: Id | null;
  /** Le type de jalons de son curseur ; aucun, le curseur reste nu. */
  milestone_type_id: Id | null;
  /** Avancement, de 0 à 100. */
  status: number;
  created_at: string;
  updated_at: string;
  category_name: string;
  company_name: string | null;
  actors: Actor[];
  labels: ProjectLabel[];
}

export interface Comment {
  id: Id;
  project_id: Id;
  user_id: Id | null;
  text: string;
  /** Les mots que l'application écrit elle-même : ni retouchés, ni effacés. */
  system: SqliteBool;
  created_at: string;
  updated_at: string;
  /** Nul si le compte a été supprimé, ou pour un commentaire d'avant la colonne. */
  author: Actor | null;
}

export interface ProjectDetail extends Project {
  comments: Comment[];
}

// --- Mode Tâche ------------------------------------------------------------

export interface Board {
  id: Id;
  company_id: Id;
  name: string;
  position: number;
  show_card_numbers: SqliteBool;
  is_private: SqliteBool;
  /** Verrouillé : ses listes ne s'ajoutent, ne se déplacent ni ne se suppriment. */
  is_locked: SqliteBool;
  /** Nul pour un tableau d'avant l'option « Privé », ou dont l'auteur est parti. */
  owner_id: Id | null;
  created_at: string;
}

export interface Label {
  id: Id;
  board_id: Id;
  name: string;
  color: string;
  position: number;
  created_at: string;
}

/** Ce qu'une liste peut porter : une carte, ou un séparateur qui titre la suite. */
export const CARD_KINDS = ["card", "separator"] as const;
export type CardKind = (typeof CARD_KINDS)[number];

export const isCardKind = (value: unknown): value is CardKind =>
  CARD_KINDS.includes(value as CardKind);

/** Un élément de checklist non coché, tel que la pastille d'une carte le déplie. */
export interface OpenChecklistItem {
  id: Id;
  text: string;
}

/**
 * Une carte vue du tableau. Sa description ne suit pas : seule son existence
 * intéresse la carte (`has_description`), sa fiche ira chercher le texte.
 */
export interface TaskCard {
  id: Id;
  list_id: Id;
  text: string;
  position: number;
  /**
   * Sa référence (« HLP-12 »), donnée à la création par le compteur commun aux
   * modes. Zéro pour un séparateur.
   */
  number: number;
  kind: CardKind;
  /**
   * Échéance, en ISO 8601 avec l'heure, ou vide. À la différence de celle d'un
   * élément de checklist, elle porte une heure : une carte se rend pour une
   * heure dite.
   */
  due_date: string;
  created_at: string;
  has_description: boolean;
  members: Actor[];
  labels: Label[];
  checklist_total: number;
  checklist_done: number;
  checklist_open: OpenChecklistItem[];
}

export interface ChecklistItem {
  id: Id;
  checklist_id: Id;
  text: string;
  done: SqliteBool;
  /** « AAAA-MM-JJ », ou vide : une date absente se lit pareil partout. */
  due_date: string;
  position: number;
  created_at: string;
  members: Actor[];
}

export interface Checklist {
  id: Id;
  card_id: Id;
  title: string;
  position: number;
  created_at: string;
  items: ChecklistItem[];
}

/**
 * Une pièce jointe d'une carte : un fichier rangé dans « medias », et ce qu'il
 * faut pour l'afficher sans aller le lire — son nom d'origine, sa taille, et
 * l'adresse où le prendre.
 */
export interface Attachment {
  id: Id;
  card_id: Id;
  /** Le nom du fichier sur le disque. Tiré au sort, jamais celui d'origine. */
  file: string;
  /** Le nom qu'il portait sur la machine de celui qui l'a déposé. */
  name: string;
  mime: string;
  /** En octets. */
  size: number;
  created_at: string;
  /** Où le lire : « /api/medias/<file> ». */
  url: string;
  /** Vrai pour les images que le serveur rend telles quelles : l'encart les montre. */
  is_image: boolean;
}

export interface CardComment {
  id: Id;
  card_id: Id;
  user_id: Id | null;
  text: string;
  system: SqliteBool;
  created_at: string;
  updated_at: string;
  author: Actor | null;
}

/** La fiche d'une carte : tout ce que son tiroir affiche. */
export interface TaskCardDetail {
  id: Id;
  list_id: Id;
  text: string;
  description: string;
  position: number;
  number: number;
  kind: CardKind;
  /** ISO 8601 avec l'heure, ou vide. Voir `TaskCard.due_date`. */
  due_date: string;
  created_at: string;
  members: Actor[];
  labels: Label[];
  checklists: Checklist[];
  attachments: Attachment[];
  comments: CardComment[];
}

/**
 * Où se trouve une carte. Sert au lien qui l'ouvre : l'application doit se
 * placer sur la bonne société et le bon tableau avant de pouvoir montrer une
 * fiche, et elle ne peut pas le deviner d'une carte qu'elle n'affiche pas.
 */
export interface CardLocation {
  company_id: Id;
  board_id: Id;
  list_id: Id;
}

/** Une carte telle qu'elle revient d'une création ou d'un renommage : sans ses à-côtés. */
export interface TaskCardRow {
  id: Id;
  list_id: Id;
  text: string;
  description: string;
  position: number;
  number: number;
  kind: CardKind;
  created_at: string;
}

export interface TaskList {
  id: Id;
  board_id: Id;
  name: string;
  position: number;
  /** Couleur de fond choisie dans le menu de la liste ; vide = aucune. */
  color: string;
  created_at: string;
  cards: TaskCard[];
}

/** Couleurs proposées dans le menu d'une liste ; la chaîne vide vaut « aucune ». */
export const LIST_COLORS = [
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
] as const;

export type ListColor = (typeof LIST_COLORS)[number];

export const isListColor = (value: unknown): value is ListColor =>
  LIST_COLORS.includes(value as ListColor);

// --- Mode Accès ------------------------------------------------------------

/**
 * Une catégorie du mode Accès. Elle ne dépend d'aucune société ni d'aucun
 * tableau : c'est le premier niveau du mode, comme un tableau l'est ailleurs.
 */
export interface AccessCategory {
  id: Id;
  name: string;
  position: number;
  /** Privée : la catégorie ne se montre qu'à son auteur. */
  is_private: SqliteBool;
  /** Verrouillée : ce qu'elle porte se lit, mais ne se déplace ni ne se modifie. */
  is_locked: SqliteBool;
  /** Nul quand le compte de l'auteur a été supprimé : la catégorie s'ouvre alors à tous. */
  owner_id: Id | null;
  /**
   * « Hérité », pour le compte qui lit : vrai s'il voit la structure publique
   * de la catégorie, faux s'il travaille sur sa propre copie. Absent des
   * réponses qui ne rendent qu'une catégorie.
   */
  inherited?: boolean;
  created_at: string;
}

/**
 * L'écart qui suit une section neuve d'une catégorie d'accès, en pixels. Dit
 * ici plutôt que dans la page : la base le range par défaut, le serveur le
 * pose à la création, et les deux doivent s'accorder.
 */
export const ACCESS_GAP_DEFAUT = 20;

/**
 * L'écart qui suit une section neuve des autres modes — Support, Assets,
 * Projet et Tâche —, tant que son champ n'en a pas fixé un autre.
 */
export const SECTIONS_GAP_DEFAUT = 50;

/** L'écart le plus large qu'une section puisse laisser : au-delà, la rangée se disloque. */
export const SECTIONS_GAP_MAX = 100;

/**
 * Comment la largeur d'une section est dite. « auto » laisse la rangée la
 * répartir ; les deux autres la fixent, en pour-cent de la largeur disponible
 * ou en pixels.
 */
export const SECTION_WIDTH_UNITS = ["auto", "percent", "px"] as const;

export type SectionWidthUnit = (typeof SECTION_WIDTH_UNITS)[number];

export const isSectionWidthUnit = (value: unknown): value is SectionWidthUnit =>
  SECTION_WIDTH_UNITS.includes(value as SectionWidthUnit);

/**
 * Une section d'une catégorie d'accès : une colonne. Elle ne porte pas de nom
 * — sa largeur la définit entièrement, ce qu'elle contiendra la nommera.
 */
export interface AccessSection {
  id: Id;
  category_id: Id;
  width_unit: SectionWidthUnit;
  /** Nul quand la largeur est automatique ; le nombre qui va avec l'unité sinon. */
  width_value: number | null;
  /** L'écart qui la sépare de la section suivante, en pixels. Celui de la dernière ne sert pas. */
  gap: number;
  position: number;
  /** Nul : la structure publique ; sinon, celle de ce compte (« Hérité » décoché). */
  owner_id: Id | null;
  created_at: string;
}

// --- Mode Support ----------------------------------------------------------

/**
 * Où en est une demande de support. Ce sont les onglets du mode, dans leur
 * ordre d'affichage — « Tous » n'en est pas un : il ne filtre rien.
 */
export const SUPPORT_STATUSES = [
  { value: "new", label: "Nouveau" },
  { value: "open", label: "Ouvert" },
  { value: "pending", label: "En attente" },
  { value: "resolved", label: "Résolu" },
  { value: "closed", label: "Fermé" },
] as const;

export type SupportStatus = (typeof SUPPORT_STATUSES)[number]["value"];

/**
 * L'état d'une demande qu'on vient d'ouvrir, ou qui arrive dans la boîte de
 * support de sa société : personne ne s'en est encore saisi.
 */
export const DEFAULT_SUPPORT_STATUS: SupportStatus = "new";

/**
 * L'état d'une demande close que l'expéditeur relance par e-mail : elle a déjà
 * été prise en main, elle n'est pas « nouvelle » pour autant.
 */
export const REOPENED_SUPPORT_STATUS: SupportStatus = "open";

export const isSupportStatus = (value: unknown): value is SupportStatus =>
  SUPPORT_STATUSES.some((s) => s.value === value);

/**
 * Les étiquettes d'urgence du support, posées une fois pour toutes. Ce
 * sont des étiquettes comme les autres : elles se renomment, se recolorent, et
 * ne se suppriment que lorsque plus aucune demande ne les porte.
 */
export const SUPPORT_URGENCY_LABELS = [
  { name: "Sans urgence", color: "green.8", weight: 10 },
  { name: "Dès que possible", color: "orange.8", weight: 20 },
  { name: "Urgent", color: "red.8", weight: 30 },
] as const;

/**
 * Le canal par lequel une demande est arrivée : posé avec les étiquettes
 * d'urgence à l'installation, sans poids.
 */
export const SUPPORT_CHANNEL_LABELS = [
  { name: "E-mail", color: "gray.7", weight: 0 },
  { name: "Téléphone", color: "gray.7", weight: 0 },
  { name: "Sur place", color: "gray.7", weight: 0 },
] as const;

/** Ce qu'une installation neuve pose d'office sur un e-mail entrant. */
export const SUPPORT_NEW_MESSAGE_LABELS = ["Sans urgence", "E-mail"] as const;

/** L'échéance d'un e-mail entrant sur une installation neuve, en jours ouvrés. */
export const SUPPORT_NEW_MESSAGE_DUE_DAYS = 15;


/**
 * Le préfixe des références : « HLP-1 », « HLP-2 »… Un seul compteur les
 * donne, aux demandes du support, aux projets et aux cartes : une référence
 * désigne une seule chose, quel que soit le mode.
 */
export const REFERENCE_PREFIX = "HLP-";

/** L'ancien préfixe, que portent encore les fils d'e-mails ouverts avant. */
export const LEGACY_REFERENCE_PREFIX = "LMA-";
export const SUPPORT_TICKET_PREFIX = REFERENCE_PREFIX;

/** Une référence telle qu'on la lit et qu'on la cite. */
export const reference = (number: number): string => `${REFERENCE_PREFIX}${number}`;

/**
 * Les projets lisent le même compteur sous leur propre préfixe : « PRJ-12 »
 * et « HLP-12 » ne peuvent pas désigner deux choses à la fois.
 */
export const PROJECT_REFERENCE_PREFIX = "PRJ-";

/** La référence d'un projet, telle qu'on la lit et qu'on la cite. */
export const projectReference = (number: number): string =>
  `${PROJECT_REFERENCE_PREFIX}${number}`;

/** De même pour les tâches : « TSK-12 ». */
export const TASK_REFERENCE_PREFIX = "TSK-";

/** La référence d'une tâche, telle qu'on la lit et qu'on la cite. */
export const taskReference = (number: number): string => `${TASK_REFERENCE_PREFIX}${number}`;

/** Le numéro de ticket d'une demande, tel qu'on le lit et qu'on le cite. */
export const supportTicketRef = reference;

/** Ce que dit l'onglet, pour un statut donné. */
export const supportStatusLabel = (status: SupportStatus): string =>
  SUPPORT_STATUSES.find((s) => s.value === status)?.label ?? "";

/**
 * Une étiquette du mode Support. Jumelle de celles des cartes et des projets,
 * mais commune à tout le support : toutes les sociétés partagent les mêmes.
 */
export interface SupportLabel {
  id: Id;
  name: string;
  /** « teinte.nuance » de la palette Mantine, par exemple « red.6 ». */
  color: string;
  /** Le poids : les plus lourdes passent devant, dans les grilles. */
  weight: number;
  position: number;
  created_at: string;
}

/**
 * Une demande de support. Elle appartient à la société choisie dans la liste
 * déroulante de l'entête, et porte ceux qui s'en occupent — autant qu'il faut,
 * comme les membres d'une carte.
 */
export interface SupportRequest {
  id: Id;
  /**
   * Le numéro de ticket, qui suit celui de la demande précédente — toutes
   * sociétés confondues — et ne resert jamais, même après une suppression.
   */
  number: number;
  company_id: Id;
  /** L'objet : celui de l'e-mail reçu, ou ce qu'on a saisi ; vide sinon. */
  subject: string;
  status: SupportStatus;
  /** ISO 8601 avec l'heure, ou vide — comme l'échéance d'une carte. */
  due_date: string;
  created_at: string;
  updated_at: string;
  /** Vide tant que personne n'est désigné. */
  actors: Actor[];
  labels: SupportLabel[];
  /** Les échanges tenus sur la demande, comptés pour la liste. */
  comment_count: number;
  /**
   * Qui a écrit à la boîte de support, pour une demande reçue par e-mail ;
   * vides pour une demande saisie. C'est l'acteur qu'on montre tant que
   * personne d'autre n'est désigné.
   */
  sender_name: string;
  sender_email: string;
}

export interface SupportComment {
  id: Id;
  request_id: Id;
  user_id: Id | null;
  text: string;
  /** Les mots que l'application écrit elle-même : ni retouchés, ni effacés. */
  system: SqliteBool;
  /**
   * Ce qu'il est advenu du message côté e-mail, pour une réponse de l'équipe
   * à une demande reçue par e-mail : vide s'il n'avait pas à partir.
   */
  mail_status: SupportMailStatus;
  /** À qui il est parti — ou serait parti, en simulation. */
  mail_to: string;
  /** Qui était en copie, et en copie cachée : des adresses séparées par des virgules. */
  mail_cc: string;
  mail_bcc: string;
  /**
   * Un commentaire interne à l'équipe — l'onglet « Commentaires » — plutôt
   * qu'un échange avec l'expéditeur : du texte simple, jamais envoyé.
   */
  internal: SqliteBool;
  /** « email » : un e-mail reçu, à montrer tel quel. Vide : le HTML de l'éditeur. */
  format: SupportCommentFormat;
  /** Les pièces jointes de l'e-mail ; ses images intégrées n'y figurent pas. */
  attachments: SupportAttachment[];
  /** L'évènement d'une réponse par défaut partie d'office ; vide sinon. */
  auto_event?: string;
  created_at: string;
  updated_at: string;
  author: Actor | null;
}

export type SupportCommentFormat = "" | "email";

/** Une pièce jointe d'un e-mail reçu. */
export interface SupportAttachment {
  name: string;
  /** L'adresse du fichier, sous /api/ticket-files. */
  url: string;
  mime: string;
  /** En octets. */
  size: number;
}

/**
 * « sent » : parti. « simulated » : préparé, mais les envois sont simulés
 * (MILO_SUPPORT_REPLY). « failed » : Graph l'a refusé.
 */
export type SupportMailStatus = "" | "sent" | "simulated" | "failed";

/** La fiche d'une demande : tout ce que son tiroir affiche. */
export interface SupportRequestDetail extends SupportRequest {
  comments: SupportComment[];
}

/**
 * Une section d'un panneau des statistiques — Support, Assets, Projet ou
 * Tâche : une colonne, comme une section d'accès. Sa largeur se lit de la
 * même façon.
 */
/**
 * « Hérité » : coché, on voit la structure publique d'un panneau ou d'une
 * catégorie d'accès — ses sections et ce qu'elles portent, partagées avec
 * tous. Décoché, on travaille sur sa propre copie.
 */
export interface LayoutState {
  inherited: boolean;
}

export interface IndicatorSection {
  id: Id;
  width_unit: SectionWidthUnit;
  /** Nul quand la largeur est automatique ; le nombre qui va avec l'unité sinon. */
  width_value: number | null;
  /** L'écart qui la sépare de la section suivante, en pixels. Celui de la dernière ne sert pas. */
  gap: number;
  position: number;
  /** Nul : la structure publique ; sinon, celle de ce compte (« Hérité » décoché). */
  owner_id: Id | null;
  created_at: string;
}

/**
 * Ce que le panneau des statistiques du mode Support peut montrer. Chaque
 * valeur désigne un widget du client (client/src/indicators) : c'est lui qui
 * sait calculer l'indicateur et le configurer. La chaîne est rangée telle
 * quelle en base, elle ne change donc jamais.
 */
export const SUPPORT_INDICATOR_TYPES = [
  "list",
  "category",
  "subcategory",
  "link",
  "number",
  "clock",
  "tickets",
  "status",
  "actors",
  "trend",
  "age",
  "due",
  "labels",
  "senders",
] as const;

export type SupportIndicatorType = (typeof SUPPORT_INDICATOR_TYPES)[number];

export const isSupportIndicatorType = (value: unknown): value is SupportIndicatorType =>
  SUPPORT_INDICATOR_TYPES.includes(value as SupportIndicatorType);

/**
 * Un indicateur du panneau des statistiques. Commun à toutes les sociétés,
 * comme les étiquettes du support : il se calcule sur les demandes de celle
 * qu'on regarde. Le serveur range sa configuration sans la relire.
 */
export interface SupportIndicator {
  id: Id;
  /** La section du panneau qui le porte. */
  section_id: Id;
  type: SupportIndicatorType;
  config: Record<string, unknown>;
  position: number;
  created_at: string;
}

/**
 * Ce que le panneau des statistiques du mode Assets peut montrer. Comme pour
 * le Support, chaque valeur désigne un widget du client
 * (client/src/asset-indicators), et la chaîne rangée en base ne change jamais.
 */
export const ASSET_INDICATOR_TYPES = [
  "list",
  "category",
  "subcategory",
  "link",
  "number",
  "clock",
  "assets", "compliance", "systems", "disks"] as const;

export type AssetIndicatorType = (typeof ASSET_INDICATOR_TYPES)[number];

export const isAssetIndicatorType = (value: unknown): value is AssetIndicatorType =>
  ASSET_INDICATOR_TYPES.includes(value as AssetIndicatorType);

/**
 * Un indicateur du panneau des statistiques du mode Assets. Commun à toutes
 * les sociétés : il se calcule sur les postes de celle qu'on regarde.
 */
export interface AssetIndicator {
  id: Id;
  /** La section du panneau qui le porte. */
  section_id: Id;
  type: AssetIndicatorType;
  config: Record<string, unknown>;
  position: number;
  created_at: string;
}

/**
 * Ce que les sections du mode Projet peuvent montrer. Comme pour le Support,
 * chaque valeur désigne un widget du client (client/src/project-indicators),
 * et la chaîne rangée en base ne change jamais.
 */
export const PROJECT_INDICATOR_TYPES = [
  "list",
  "category",
  "subcategory",
  "link",
  "number",
  "clock",
  "projects",
  "progress",
  "categories",
  "actors",
  "labels",
] as const;

export type ProjectIndicatorType = (typeof PROJECT_INDICATOR_TYPES)[number];

export const isProjectIndicatorType = (value: unknown): value is ProjectIndicatorType =>
  PROJECT_INDICATOR_TYPES.includes(value as ProjectIndicatorType);

/**
 * Un indicateur des sections du mode Projet. Commun à tous les tableaux : il
 * se calcule sur les projets de celui qu'on regarde.
 */
export interface ProjectIndicator {
  id: Id;
  /** La section du panneau qui le porte. */
  section_id: Id;
  type: ProjectIndicatorType;
  config: Record<string, unknown>;
  position: number;
  created_at: string;
}

/**
 * Ce que les sections du mode Tâche peuvent montrer : le tableau de listes,
 * et les indicateurs (client/src/task-indicators).
 */
export const TASK_INDICATOR_TYPES = [
  "list",
  "category",
  "subcategory",
  "link",
  "number",
  "clock",
  "cards",
  "lists",
  "due",
  "members",
  "labels",
] as const;

export type TaskIndicatorType = (typeof TASK_INDICATOR_TYPES)[number];

export const isTaskIndicatorType = (value: unknown): value is TaskIndicatorType =>
  TASK_INDICATOR_TYPES.includes(value as TaskIndicatorType);

/**
 * Un indicateur des sections du mode Tâche. Commun à tous les tableaux : il se
 * calcule sur les cartes de celui qu'on regarde.
 */
export interface TaskIndicator {
  id: Id;
  /** La section du panneau qui le porte. */
  section_id: Id;
  type: TaskIndicatorType;
  config: Record<string, unknown>;
  position: number;
  created_at: string;
}

/**
 * Ce qu'une section peut porter. Chaque valeur désigne un widget du client
 * (client/src/widgets) : c'est lui qui sait l'afficher et le configurer. La
 * chaîne est rangée telle quelle en base, elle ne change donc jamais.
 */
export const ACCESS_BLOCK_TYPES = [
  "category",
  "subcategory",
  "link",
  "number",
  "clock",
  "rss",
  "uptime",
] as const;

export type AccessBlockType = (typeof ACCESS_BLOCK_TYPES)[number];

export const isAccessBlockType = (value: unknown): value is AccessBlockType =>
  ACCESS_BLOCK_TYPES.includes(value as AccessBlockType);

/**
 * Les éléments qui se convertissent l'un en l'autre, et en quoi. La catégorie
 * et la sous-catégorie sont le même titre à deux niveaux : même configuration,
 * seul le type change. Les autres widgets n'ont rien en commun, et un lien
 * ne devient pas une horloge.
 */
export const ACCESS_BLOCK_CONVERSIONS: Partial<Record<AccessBlockType, AccessBlockType>> = {
  category: "subcategory",
  subcategory: "category",
};

/**
 * Un élément posé dans une section. Le serveur ne connaît pas sa
 * configuration : il la range et la rend telle quelle, sa forme appartient au
 * widget qui la lit.
 */
export interface AccessBlock {
  id: Id;
  section_id: Id;
  type: AccessBlockType;
  config: Record<string, unknown>;
  position: number;
  created_at: string;
}

/** Un article d'un flux, tel que le serveur le tire de la source. */
export interface AccessFeedArticle {
  title: string;
  /** Vide quand la source n'en donne aucune, ou une adresse qui n'est pas http(s). */
  url: string;
  /** ISO 8601, ou nulle quand la source n'en donne aucune de lisible. */
  date: string | null;
}

/**
 * Le flux d'un widget RSS, tel que la base le garde. Le serveur relève la
 * source à son rythme — l'intervalle que chaque élément règle — et range ses
 * derniers articles, déjà lus, qu'ils viennent de RSS, d'Atom ou de JSON : la
 * page les lit en base plutôt que d'aller chercher la source à chaque visite.
 */
export interface AccessFeed {
  articles: AccessFeedArticle[];
  /** La dernière relève réussie, ISO 8601. */
  fetched_at: string;
}

/** L'intervalle de relève d'un flux, en minutes : par défaut, et ses bornes. */
export const ACCESS_FEED_INTERVAL_DEFAUT = 30;
export const ACCESS_FEED_INTERVAL_MIN = 5;
export const ACCESS_FEED_INTERVAL_MAX = 24 * 60;

/** Les articles qu'un élément montre au plus, et donc que la base en garde. */
export const ACCESS_FEED_QUANTITE_MAX = 50;

/**
 * Les vérifications d'un widget Uptime. « icmp » : un ping. « tcp » : une
 * connexion au port. « snmp » : la lecture d'un OID en SNMP v2c. « zabbix » :
 * la clé « agent.ping » demandée à l'agent Zabbix de la machine.
 */
export const UPTIME_CHECK_TYPES = ["icmp", "tcp", "snmp", "zabbix"] as const;

export type UptimeCheckType = (typeof UPTIME_CHECK_TYPES)[number];

export const isUptimeCheckType = (value: unknown): value is UptimeCheckType =>
  UPTIME_CHECK_TYPES.includes(value as UptimeCheckType);

/** Le port de chaque vérification quand l'élément n'en donne pas. */
export const UPTIME_PORTS_DEFAUT: Record<UptimeCheckType, number | null> = {
  icmp: null,
  tcp: null,
  snmp: 161,
  zabbix: 10050,
};

/** « pending » : pas encore vérifiée depuis qu'elle a été ajoutée. */
export type UptimeState = "up" | "down" | "pending";

/** L'état d'une machine, tel que la dernière vérification du serveur l'a laissé. */
export interface UptimeStatus {
  /** L'identifiant de la machine dans la configuration de l'élément. */
  machine: string;
  state: UptimeState;
  /** Depuis quand elle est dans cet état, ISO 8601. */
  since: string | null;
  /** La dernière vérification, ISO 8601. */
  checked_at: string | null;
  /** Ce que la vérification a vu : la valeur lue, ou la raison de l'échec. */
  detail: string;
}

export interface AccessUptime {
  statuses: UptimeStatus[];
}

/** L'intervalle de vérification, en secondes : par défaut, et ses bornes. */
export const UPTIME_INTERVAL_DEFAUT = 60;
export const UPTIME_INTERVAL_MIN = 10;
export const UPTIME_INTERVAL_MAX = 24 * 60 * 60;

// --- Mode Assets -----------------------------------------------------------
// Les postes, tels qu'un agent d'inventaire (FusionInventory, GLPI Agent) les
// décrit. Rien n'est trié pour l'instant : l'inventaire arrive entier, la
// liste ne montre que le nom, et le tiroir déroule tout le reste — c'est en le
// voyant qu'on décidera de ce qu'on garde.

/** Une entrée d'une section : ses champs, dans l'ordre où l'agent les donne. */
export type AssetEntry = Record<string, string>;

/**
 * Une section de l'inventaire — BIOS, CPUS, SOFTWARES… Les sections qui ne
 * décrivent qu'une chose n'ont qu'une entrée ; les autres en ont autant que la
 * machine porte de barrettes, de disques ou de logiciels.
 */
export interface AssetSection {
  name: string;
  entries: AssetEntry[];
}

/** Un poste dans la liste : son nom, qui s'en sert, son disque système. */
export interface Asset {
  id: Id;
  /** Ce que la machine dit d'elle-même (HARDWARE/NAME). */
  name: string;
  /** Vide tant que le « tag » de l'agent ne désigne aucune société connue. */
  company_id: Id | null;
  /**
   * La dernière personne connectée sur le poste, telle que l'agent l'a vue :
   * la session ouverte au moment de l'inventaire, ou à défaut la dernière
   * ouverture connue. Vide quand l'agent n'a rien su en dire.
   */
  user: string;
  /**
   * L'heure du dernier inventaire, en ISO 8601 : celle que l'agent y inscrit
   * (ACCESSLOG/LOGDATE), à défaut celle de sa réception.
   */
  last_inventory: string;
  /**
   * Le volume système — « C: » sous Windows, « / » ailleurs —, en Mo, tel que
   * l'agent l'a mesuré au dernier inventaire. Vide quand l'agent ne l'a pas
   * déclaré, ou sans taille.
   */
  system_disk: { free: number; total: number } | null;
  /** Le volume système est-il chiffré ? « null » quand l'agent ne le dit pas. */
  system_disk_encrypted: boolean | null;
  /**
   * Le système : sa famille, pour le logo, son nom tel que l'agent le donne
   * (« Windows 11 Professionnel », « macOS »), sa version (« 23H2 »,
   * « 14.5 ») et celle de son noyau (« 10.0.22631 »). Vides quand l'agent ne
   * les donne pas.
   */
  os: { family: AssetOsFamily; name: string; version: string; kernel: string } | null;
  /** La protection du poste : antivirus, EPP ou EDR. */
  protection: AssetProtection;
}

/** Les familles de systèmes que la liste sait représenter par un logo. */
export type AssetOsFamily =
  | "windows"
  | "macos"
  | "ubuntu"
  | "debian"
  | "redhat"
  | "fedora"
  | "linux"
  | "other";

/**
 * La protection d'un poste, telle que Windows la déclare au centre de
 * sécurité — la première active, à défaut la première connue.
 *
 * « unknown » : l'agent n'en dit rien, ce qui est la règle hors de Windows ;
 * « none » : Windows n'en déclare aucune.
 */
export interface AssetProtection {
  state: "active" | "inactive" | "none" | "unknown";
  name: string;
  company: string;
}

/** Un poste ouvert : tout ce que l'agent a remonté. */
export interface AssetDetail extends Asset {
  /** L'identifiant que l'agent se donne : « poste-2026-09-28-14-22-31 ». */
  deviceid: string;
  /** Le « tag » passé à l'agent, tel quel. */
  tag: string;
  created_at: string;
  /**
   * Les sections de l'inventaire, sauf celles qui ne servent qu'au serveur
   * (ACCESSLOG, ACCOUNTINFO) ou qu'on ne montre pas (ENVS, LICENSEINFOS,
   * VERSIONCLIENT, VERSIONPROVIDER).
   * Certaines sont réduites à quelques champs, d'autres délestées de ceux qui
   * n'apprennent rien, et quelques lignes sont écartées : le détail est dans
   * repositories/assets.ts.
   */
  sections: AssetSection[];
  /**
   * L'identifiant TeamViewer du poste, tiré de REMOTE_MGMT. Vide quand
   * TeamViewer n'est pas installé — ou quand l'agent n'a pas su le lire.
   */
  teamviewer_id: string;
  /**
   * L'adresse par laquelle joindre le poste : celle d'une carte réseau active,
   * à défaut celle que la machine déclare. Vide quand aucune ne convient — le
   * poste est alors injoignable depuis le serveur, et l'inventaire ne peut pas
   * être redemandé.
   */
  address: string;
  /** L'onglet « Résumé » de la fiche : l'essentiel, tiré de l'inventaire. */
  summary: AssetSummary;
  /**
   * La fin de support du système, d'après endoflife.date. « null » quand on
   * ne sait pas : système non reconnu, version absente de leur liste, ou
   * service injoignable.
   */
  support: AssetSupport | null;
}

/** La fin de support d'un système, telle qu'endoflife.date la publie. */
export interface AssetSupport {
  /** La version reconnue, sous le nom d'endoflife.date : « 11 25H2 (E) », « 27 ». */
  cycle: string;
  /**
   * La date de fin des correctifs de sécurité (AAAA-MM-JJ). « null » quand
   * l'éditeur n'en a pas encore annoncé.
   */
  eol: string | null;
  /** Le support est-il terminé ? Vrai aussi quand la date n'est pas connue. */
  ended: boolean;
}

/** Une carte réseau physique, telle que le résumé la montre. */
export interface AssetNetwork {
  kind: "ethernet" | "wifi";
  /** Le nom de la carte (« Intel(R) Wi-Fi 6 AX201 »). */
  description: string;
  /** Ses adresses IPv4, dans l'ordre de l'agent. */
  ips: string[];
  /**
   * Le VLAN du Paramétrage dont le sous-réseau contient l'une de ses
   * adresses — la première qui en a un —, ou null.
   */
  vlan: { vlan: number; name: string } | null;
}

/** L'essentiel d'un poste. Chaque champ est vide quand l'agent ne le donne pas. */
export interface AssetSummary {
  /** La carte réseau qui sert — une au plus : connectée, le Wi-Fi d'abord. */
  networks: AssetNetwork[];
  manufacturer: string;
  model: string;
  /** Le numéro de série du fabricant (BIOS/SSN). */
  serial: string;
  /** « Intel(R) Core(TM) i7-1165G7 @ 2.80GHz », et combien il y en a. */
  cpu: { name: string; count: number; cores: number | null; threads: number | null } | null;
  /** La mémoire vive, en Mo. */
  memory: number | null;
  /** L'architecture du système : « ARM », « x64 » ou « x86 » ; vide si l'agent ne la dit pas. */
  arch: "ARM" | "x64" | "x86" | "";
  /**
   * Le chiffrement du volume système, tel que l'agent le nomme : « BitLocker »,
   * « FileVault 2 », et son algorithme (« XTS_AES_128 »). Vides quand l'agent
   * ne les donne pas ; l'algorithme l'est aussi quand le volume n'est pas
   * chiffré (l'agent écrit alors « None »).
   */
  encryption: { name: string; algorithm: string };
  /**
   * Le pare-feu : actif partout (« on »), nulle part (« off »), sur une partie
   * des profils de Windows seulement (« partial »), ou « unknown » quand
   * l'agent n'en dit rien. « disabled » nomme les profils éteints : « Domaine »,
   * « Privé », « Public ».
   */
  firewall: { state: "on" | "off" | "partial" | "unknown"; disabled: string[] };
}

/** Ce que rend une demande d'inventaire immédiat. */
export interface AssetRefresh {
  /** L'adresse effectivement appelée, pour la dire quand ça échoue. */
  address: string;
}
