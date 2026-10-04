// Ce que le client envoie au serveur. Les réponses, elles, sont décrites par
// les types du domaine (domain.ts).

import type { DueShape, Reminder, Recurrence } from "./due.js";
import type {
  CardKind,
  Id,
  ListColor,
  PublicUser,
  SectionWidthUnit,
  SupportStatus,
} from "./domain.js";

/** Toute erreur de l'API a cette forme. */
export interface ApiError {
  error: string;
}

export interface AuthResult {
  token: string;
  user: PublicUser;
}

export interface SetupState {
  /** Le compte « admin » n'existe pas encore : il faut le créer. */
  needs_setup: boolean;
  /** L'application Entra est renseignée : la connexion par Microsoft est possible. */
  entra: boolean;
}

/**
 * La toute première ouverture : le mot de passe du compte « admin », et le
 * nom du premier workspace.
 */
export interface SetupInput {
  password: string;
  /** Le nom du premier workspace. */
  workspace: string;
}

/** La connexion du compte « admin », le seul qui ait un mot de passe. */
export interface AdminLoginInput {
  username: string;
  password: string;
}

/**
 * Ce qu'un compte règle lui-même. Son identité vient d'Entra et se relit à
 * chaque connexion : elle ne se modifie pas ici.
 */
export interface UpdateMeInput {
  /** La vue d'ouverture : son identifiant, en chaîne. */
  default_view?: string;
}

export interface ViewInput {
  name?: string;
  is_private?: boolean;
}

/** Un contexte : son nom. */
export interface ContextInput {
  name?: string;
}

/** Un tableau : son nom, ses réglages, le libellé de « Tous les contextes ». */
export interface BoardInput {
  view_id?: Id;
  name?: string;
  all_contexts_label?: string;
  show_card_numbers?: boolean;
  is_private?: boolean;
}

/**
 * Une section d'un tableau, telle que son pied la règle. « width_value » n'a
 * de sens qu'avec une unité qui en demande une : il est ignoré pour une
 * largeur automatique.
 */
export interface BoardSectionInput {
  width_unit?: SectionWidthUnit;
  width_value?: number | null;
  /** L'écart qui la sépare de la section suivante, en pixels. */
  gap?: number;
  /** À la création : le rang où la section prend place. Sans lui, au bout. */
  index?: number;
}

/**
 * La disposition d'un tableau, telle qu'elle s'exporte et s'importe : ses
 * sections, dans l'ordre, et ce que chacune porte. Rien n'y désigne une ligne
 * de la base — l'import pose des sections et des widgets neufs.
 */
export interface ExportedLayout {
  /** La forme de l'export : un import refuse ce qu'il ne sait pas lire. */
  version: 1;
  sections: {
    width_unit: SectionWidthUnit;
    width_value: number | null;
    gap: number;
    widgets: { type: string; config: Record<string, unknown> }[];
  }[];
}

/** Ce que l'import a fait de la disposition reçue. */
export interface ImportResult {
  /** Les widgets posés. */
  placed: number;
  /** Ceux de l'export qui n'ont pas été posés : un type inconnu, ou que le compte ne modifie pas. */
  discarded: number;
  /** Ceux qu'il fallait garder, faute de pouvoir les enlever : posés dans la première section. */
  keptCount: number;
}

/** Un widget : sa configuration est celle du widget, le serveur la range sans la relire. */
export interface BoardWidgetInput {
  section_id?: Id;
  type?: string;
  config?: Record<string, unknown>;
}

export interface TaskListInput {
  board_id?: Id;
  /** À la création : le widget « Tâches » qui la montre. */
  list_key?: string;
  name?: string;
  position?: number;
  color?: ListColor;
}

/**
 * Copie d'une liste. Sans `board_id`, la copie reste dans le tableau de la
 * liste d'origine ; sans `name`, elle reprend le sien.
 */
export interface TaskListCopyInput {
  board_id?: Id;
  name?: string;
}

export interface TaskCardInput {
  list_id?: Id;
  text?: string;
  kind?: CardKind;
  context_id?: Id;
  description?: string;
  /** ISO 8601 avec l'heure, ou vide pour retirer l'échéance. */
  due_date?: string;
  /** « AAAA-MM-JJ », ou vide : l'échéance sans début. */
  start_date?: string;
  due_form?: DueShape;
  recurrence?: Recurrence;
  reminder?: Reminder;
  /** Voir `TaskCard.cover_interval`. */
  cover_interval?: number;
  member_ids?: Id[];
  label_ids?: Id[];
}

export interface ChecklistItemInput {
  text?: string;
  done?: boolean;
  due_date?: string;
  member_ids?: Id[];
}

export interface LabelInput {
  board_id?: Id;
  name?: string;
  color?: string;
}

export interface ProjectInput {
  name?: string;
  description?: string;
  board_id?: Id;
  category_id?: Id;
  context_id?: Id;
  /** À la création : le widget « Projets » qui le montre. */
  list_key?: string;
  milestone_type_id?: Id | null;
  status?: number;
  actor_ids?: Id[];
  label_ids?: Id[];
}

/**
 * Copie d'un projet. Sans `board_id`, la copie reste dans le tableau du projet
 * d'origine ; sans `name`, elle reprend le sien. La catégorie, elle, est
 * toujours dite dès qu'on change de tableau : elles appartiennent au tableau.
 */
export interface ProjectCopyInput {
  board_id?: Id;
  category_id?: Id;
  name?: string;
}

/** « all » veut dire « pas de filtre » ; c'est la valeur des listes déroulantes. */
export type FilterValue = string | "all" | null | undefined;

export interface ProjectFilters {
  board?: FilterValue;
  category?: FilterValue;
  context?: FilterValue;
  status?: FilterValue;
  actor?: FilterValue;
}

/** Ce que renvoie une suppression en cascade : de quoi le dire à l'utilisateur. */
export interface CascadeResult {
  deleted_projects: number;
}

/** La copie des étiquettes ou des catégories d'un tableau vers un autre. */
export interface CopyToBoardInput {
  from_board: Id;
  to_board: Id;
}

/**
 * Ce qu'elle a donné. Ce qui portait déjà le même nom dans le tableau
 * d'accueil n'est pas redoublé : le compte rendu le dit plutôt que de le taire.
 */
export interface CopyResult {
  copied: number;
  skipped: number;
  /** Ce que la copie a d'abord effacé du tableau d'accueil, quand on l'a demandé. */
  removed?: number;
  /**
   * Ce que le remplacement a dû garder : les catégories qui rangent encore
   * des projets.
   */
  kept?: number;
}

/**
 * Le tiroir d'un ticket : son contexte, qu'on peut changer pour
 * un autre du même tableau.
 */
export interface SupportRequestInput {
  context_id?: Id;
  /** À la création sans contexte : le tableau, dont elle prend le premier. */
  board_id?: Id;
  /** À la création : le widget « Tickets » qui la montre. */
  list_key?: string;
  subject?: string;
  status?: SupportStatus;
  actor_ids?: Id[];
  /** ISO 8601 avec l'heure, ou vide pour retirer l'échéance. */
  due_date?: string;
  label_ids?: Id[];
}

/** Les demandes cochées dans la liste, et ce qu'on en fait. */
export interface SupportBulkInput {
  ids: Id[];
}

/** « Assigner à » : les comptes ajoutés aux acteurs des demandes cochées. */
export interface SupportAssignInput extends SupportBulkInput {
  actor_ids: Id[];
}

/** Les sections des widgets : celles d'un tableau. */
export type IndicatorSectionInput = BoardSectionInput;

export interface SupportLabelInput {
  name?: string;
  color?: string;
  weight?: number;
}

/**
 * La confirmation d'une boîte de support : tant qu'elle attend, rien n'en est
 * relevé. « sent_at » est le dernier envoi du lien, vide s'il n'est pas parti.
 */
export interface MailboxOptinState {
  email: string;
  status: "pending" | "confirmed";
  sent_at: string;
}
