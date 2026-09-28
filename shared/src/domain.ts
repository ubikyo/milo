// Le vocabulaire de l'application : ce que le serveur renvoie, ce que le
// client reçoit. Un seul endroit le décrit, donc les deux côtés ne peuvent
// plus diverger en silence.
//
// Convention : SQLite n'a pas de booléen, il range 0 ou 1 dans un entier. Les
// champs qui en viennent sont donc typés `SqliteBool` et non `boolean` — le
// type dit la vérité plutôt que de la maquiller, et `Boolean(x)` reste
// nécessaire pour les lire.

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
  /** Un mot de passe vide signifie « première connexion à faire ». */
  activated: boolean;
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

// --- Sociétés ---------------------------------------------------------------

export interface Company {
  id: Id;
  name: string;
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

export interface Category {
  id: Id;
  board_id: Id;
  name: string;
  /** Présent sur la liste. */
  project_count?: number;
}

export interface ProjectLabel {
  id: Id;
  board_id: Id;
  name: string;
  /** « teinte.nuance » de la palette Mantine, par exemple « red.6 ». */
  color: string;
  position: number;
  created_at: string;
}

export interface Project {
  id: Id;
  name: string;
  description: string;
  board_id: Id;
  category_id: Id;
  company_id: Id | null;
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
  /** Compté par tableau, attribué à la création. Zéro pour un séparateur. */
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
  /** Nul quand le compte de l'auteur a été supprimé : la catégorie s'ouvre alors à tous. */
  owner_id: Id | null;
  created_at: string;
}

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
  position: number;
  created_at: string;
}

// --- Mode Support ----------------------------------------------------------

/**
 * Où en est une demande de support. Ce sont les onglets du mode, dans leur
 * ordre d'affichage — « Tous » n'en est pas un : il ne filtre rien.
 */
export const SUPPORT_STATUSES = [
  { value: "unresolved", label: "Non résolu" },
  { value: "pending", label: "En attente" },
  { value: "resolved", label: "Résolu" },
  { value: "closed", label: "Fermé" },
] as const;

export type SupportStatus = (typeof SUPPORT_STATUSES)[number]["value"];

/** L'état d'une demande qu'on vient d'ouvrir : elle attend d'être traitée. */
export const DEFAULT_SUPPORT_STATUS: SupportStatus = "unresolved";

export const isSupportStatus = (value: unknown): value is SupportStatus =>
  SUPPORT_STATUSES.some((s) => s.value === value);

/** Ce que dit l'onglet, pour un statut donné. */
export const supportStatusLabel = (status: SupportStatus): string =>
  SUPPORT_STATUSES.find((s) => s.value === status)?.label ?? "";

/**
 * Une étiquette du mode Support. Jumelle de celles des cartes et des projets,
 * mais rattachée à une société : c'est le niveau au-dessus d'une demande, comme
 * le tableau l'est d'une carte.
 */
export interface SupportLabel {
  id: Id;
  company_id: Id;
  name: string;
  /** « teinte.nuance » de la palette Mantine, par exemple « red.6 ». */
  color: string;
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
  company_id: Id;
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
}

export interface SupportComment {
  id: Id;
  request_id: Id;
  user_id: Id | null;
  text: string;
  /** Les mots que l'application écrit elle-même : ni retouchés, ni effacés. */
  system: SqliteBool;
  created_at: string;
  updated_at: string;
  author: Actor | null;
}

/** La fiche d'une demande : tout ce que son tiroir affiche. */
export interface SupportRequestDetail extends SupportRequest {
  comments: SupportComment[];
}

/**
 * Ce qu'une section peut porter. Chaque valeur désigne un greffon du client
 * (client/src/plugins) : c'est lui qui sait l'afficher et le configurer. La
 * chaîne est rangée telle quelle en base, elle ne change donc jamais.
 */
export const ACCESS_BLOCK_TYPES = [
  "category",
  "subcategory",
  "link",
  "number",
  "clock",
] as const;

export type AccessBlockType = (typeof ACCESS_BLOCK_TYPES)[number];

export const isAccessBlockType = (value: unknown): value is AccessBlockType =>
  ACCESS_BLOCK_TYPES.includes(value as AccessBlockType);

/**
 * Un élément posé dans une section. Le serveur ne connaît pas sa
 * configuration : il la range et la rend telle quelle, sa forme appartient au
 * greffon qui la lit.
 */
export interface AccessBlock {
  id: Id;
  section_id: Id;
  type: AccessBlockType;
  config: Record<string, unknown>;
  position: number;
  created_at: string;
}
