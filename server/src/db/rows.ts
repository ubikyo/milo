// Les lignes brutes, telles que SQLite les rend. Elles ne sortent pas du
// serveur : ce que l'API renvoie est décrit par @milo/shared. La différence
// compte — une ligne « users » porte l'empreinte du mot de passe, un
// `PublicUser` non.

import type {
  AccessBlockType,
  CardKind,
  Id,
  SectionWidthUnit,
  SqliteBool,
  SupportStatus,
} from "@milo/shared";

export interface UserRow {
  id: Id;
  name: string;
  first_name: string;
  last_name: string;
  email: string;
  password_hash: string;
  default_mode: string;
  created_at: string;
}

export interface SessionRow {
  token: string;
  user_id: Id;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
}

export interface CompanyRow {
  id: Id;
  name: string;
}

export interface ProjectBoardRow {
  id: Id;
  name: string;
  position: number;
  is_private: SqliteBool;
  owner_id: Id | null;
  created_at: string;
}

export interface CategoryRow {
  id: Id;
  board_id: Id;
  name: string;
}

/** Une catégorie du mode Accès : le premier niveau du mode, sans parent. */
export interface AccessCategoryRow {
  id: Id;
  name: string;
  position: number;
  owner_id: Id | null;
  is_private: SqliteBool;
  created_at: string;
}

/** Une section d'une catégorie d'accès : une colonne, et la largeur qu'elle dit. */
export interface AccessSectionRow {
  id: Id;
  category_id: Id;
  width_unit: SectionWidthUnit;
  width_value: number | null;
  position: number;
  created_at: string;
}

/**
 * Un élément d'une section, tel que la base le range : sa configuration y est
 * du texte JSON. L'API, elle, rend un objet (`AccessBlock`).
 */
export interface AccessBlockRow {
  id: Id;
  section_id: Id;
  type: AccessBlockType;
  config: string;
  position: number;
  created_at: string;
}

export interface ProjectRow {
  id: Id;
  name: string;
  description: string;
  board_id: Id;
  category_id: Id;
  company_id: Id | null;
  status: number;
  created_at: string;
  updated_at: string;
}

/** Une ligne de projet jointe à ses tables de référence. */
export interface ProjectJoinedRow extends ProjectRow {
  category_name: string;
  company_name: string | null;
}

export interface BoardRow {
  id: Id;
  company_id: Id;
  name: string;
  position: number;
  show_card_numbers: SqliteBool;
  is_private: SqliteBool;
  owner_id: Id | null;
  created_at: string;
}

export interface TaskListRow {
  id: Id;
  board_id: Id;
  name: string;
  position: number;
  color: string;
  created_at: string;
}

export interface TaskCardRow {
  id: Id;
  list_id: Id;
  text: string;
  position: number;
  number: number;
  kind: CardKind;
  description: string;
  due_date: string;
  created_at: string;
}

export interface LabelRow {
  id: Id;
  board_id: Id;
  name: string;
  color: string;
  position: number;
  created_at: string;
}

export interface ChecklistRow {
  id: Id;
  card_id: Id;
  title: string;
  position: number;
  created_at: string;
}

export interface ChecklistItemRow {
  id: Id;
  checklist_id: Id;
  text: string;
  done: SqliteBool;
  due_date: string;
  position: number;
  created_at: string;
}

export interface AttachmentRow {
  id: Id;
  card_id: Id;
  file: string;
  name: string;
  mime: string;
  size: number;
  user_id: Id | null;
  created_at: string;
}

export interface CommentRow {
  id: Id;
  project_id: Id;
  user_id: Id | null;
  text: string;
  system: SqliteBool;
  created_at: string;
  updated_at: string;
}

export interface CardCommentRow {
  id: Id;
  card_id: Id;
  user_id: Id | null;
  text: string;
  system: SqliteBool;
  created_at: string;
  updated_at: string;
}

/**
 * Un commentaire joint à son auteur. Les deux fils (projets et cartes) ont la
 * même forme, d'où le type générique.
 */
export type WithAuthorColumns<T> = T & {
  author_name: string | null;
  author_email: string | null;
};

/** Une demande de support : elle pend à une société. */
export interface SupportRequestRow {
  id: Id;
  company_id: Id;
  status: SupportStatus;
  due_date: string;
  created_at: string;
  updated_at: string;
}

/** Une étiquette du mode Support : jumelle de « LabelRow », côté société. */
export interface SupportLabelRow {
  id: Id;
  company_id: Id;
  name: string;
  color: string;
  position: number;
  created_at: string;
}

export interface SupportCommentRow {
  id: Id;
  request_id: Id;
  user_id: Id | null;
  text: string;
  system: SqliteBool;
  created_at: string;
  updated_at: string;
}

export interface CountRow {
  count: number;
}

/** « COALESCE(MAX(position), -1) + 1 » : le rang d'un nouvel élément. */
export interface NextRow {
  next: number;
}

export interface IdRow {
  id: Id;
}

export interface SettingRow {
  key: string;
  value: string;
}

export interface FollowRow {
  user_id: Id;
  kind: string;
  target_id: Id;
  created_at: string;
}
