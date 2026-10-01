// Ce que le client envoie au serveur. Les réponses, elles, sont décrites par
// les types du domaine (domain.ts).

import type {
  AccessBlockType,
  AssetIndicatorType,
  CardKind,
  ProjectIndicatorType,
  TaskIndicatorType,
  Id,
  ListColor,
  PublicUser,
  SectionWidthUnit,
  SupportIndicatorType,
  SupportStatus,
} from "./domain.js";
import type { Mode } from "./modes.js";

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

/** Le mot de passe du compte « admin », posé à la toute première ouverture. */
export interface SetupInput {
  password: string;
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
  default_mode?: Mode;
}

export interface BoardInput {
  company_id?: Id;
  name?: string;
  show_card_numbers?: boolean;
  is_private?: boolean;
  is_locked?: boolean;
}

export interface ProjectBoardInput {
  name?: string;
  is_private?: boolean;
}

/** Le tiroir d'une catégorie d'accès : son nom et « Privé ». */
export interface AccessCategoryInput {
  name?: string;
  is_private?: boolean;
  is_locked?: boolean;
}

/**
 * Le tiroir d'une section. « width_value » n'a de sens qu'avec une unité qui
 * en demande une : il est ignoré pour une largeur automatique.
 */
export interface AccessSectionInput {
  category_id?: Id;
  width_unit?: SectionWidthUnit;
  width_value?: number | null;
  /** L'écart qui la sépare de la section suivante, en pixels. */
  gap?: number;
  /** À la création : le rang où la section prend place. Sans lui, au bout. */
  index?: number;
}

/**
 * Le tiroir d'un élément de section. Sa configuration est celle du widget :
 * le serveur ne la relit pas, il la range.
 */
export interface AccessBlockInput {
  section_id?: Id;
  type?: AccessBlockType;
  config?: Record<string, unknown>;
}

/**
 * Le rangement des éléments d'une section : la liste complète de ce qu'elle
 * porte, dans le nouvel ordre. Un élément venu d'une autre section de la même
 * catégorie y est admis — c'est ainsi qu'on le déplace.
 */
export interface AccessBlockReorderInput {
  section_id: Id;
  ids: Id[];
}

export interface TaskListInput {
  board_id?: Id;
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
  description?: string;
  /** ISO 8601 avec l'heure, ou vide pour retirer l'échéance. */
  due_date?: string;
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
  company_id?: Id | null;
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
  company?: FilterValue;
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
}

/**
 * Le tiroir d'une demande de support. La société est dite à la création et ne
 * change plus : une demande suit la société sous laquelle elle a été ouverte.
 */
export interface SupportRequestInput {
  company_id?: Id;
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

/** Le tiroir d'une section d'un panneau des statistiques. */
export interface IndicatorSectionInput {
  width_unit?: SectionWidthUnit;
  width_value?: number | null;
  /** L'écart qui la sépare de la section suivante, en pixels. */
  gap?: number;
  /** À la création : le rang où la section prend place. Sans lui, au bout. */
  index?: number;
}

export interface SupportIndicatorInput {
  /** À la création : la section qui le reçoit. */
  section_id?: Id;
  type?: SupportIndicatorType;
  config?: Record<string, unknown>;
}

export interface AssetIndicatorInput {
  /** À la création : la section qui le reçoit. */
  section_id?: Id;
  type?: AssetIndicatorType;
  config?: Record<string, unknown>;
}

export interface ProjectIndicatorInput {
  /** À la création : la section qui le reçoit. */
  section_id?: Id;
  type?: ProjectIndicatorType;
  config?: Record<string, unknown>;
}

export interface TaskIndicatorInput {
  /** À la création : la section qui le reçoit. */
  section_id?: Id;
  type?: TaskIndicatorType;
  config?: Record<string, unknown>;
}

export interface SupportLabelInput {
  name?: string;
  color?: string;
  weight?: number;
}
