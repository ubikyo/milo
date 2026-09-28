// Ce que le client envoie au serveur. Les réponses, elles, sont décrites par
// les types du domaine (domain.ts).

import type {
  AccessBlockType,
  CardKind,
  Id,
  ListColor,
  PublicUser,
  SectionWidthUnit,
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
  needs_setup: boolean;
}

export interface SetupInput {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
}

export interface FirstLoginInput extends SetupInput {
  password_confirm: string;
}

export interface UpdateMeInput {
  first_name?: string;
  last_name?: string;
  email?: string;
  default_mode?: Mode;
  password?: string;
  password_confirm?: string;
}

export interface UserInput {
  email: string;
  first_name?: string;
  last_name?: string;
}

export interface BoardInput {
  company_id?: Id;
  name?: string;
  show_card_numbers?: boolean;
  is_private?: boolean;
}

export interface ProjectBoardInput {
  name?: string;
  is_private?: boolean;
}

/** Le tiroir d'une catégorie d'accès : son nom, et « Privé ». */
export interface AccessCategoryInput {
  name?: string;
  is_private?: boolean;
}

/**
 * Le tiroir d'une section. « width_value » n'a de sens qu'avec une unité qui
 * en demande une : il est ignoré pour une largeur automatique.
 */
export interface AccessSectionInput {
  category_id?: Id;
  width_unit?: SectionWidthUnit;
  width_value?: number | null;
}

/**
 * Le tiroir d'un élément de section. Sa configuration est celle du greffon :
 * le serveur ne la relit pas, il la range.
 */
export interface AccessBlockInput {
  section_id?: Id;
  type?: AccessBlockType;
  config?: Record<string, unknown>;
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
  status?: SupportStatus;
  actor_ids?: Id[];
  /** ISO 8601 avec l'heure, ou vide pour retirer l'échéance. */
  due_date?: string;
  label_ids?: Id[];
}

export interface SupportLabelInput {
  company_id?: Id;
  name?: string;
  color?: string;
}
