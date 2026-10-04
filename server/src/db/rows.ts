// Les lignes brutes, telles que SQLite les rend. Elles ne sortent pas du
// serveur : ce que l'API renvoie est décrit par @milo/shared. La différence
// compte — une ligne « users » porte l'empreinte du mot de passe, un
// `PublicUser` non.

import type {
  SupportCommentFormat,
  SupportMailStatus,
  CardKind,
  Id,
  FormeEcheance,
  Rappel,
  Recurrence,
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
  /** La vue d'ouverture : son identifiant, ou vide. */
  default_view: string;
  created_at: string;
  entra_id: string;
  /** JSON : les identifiants des groupes Entra du compte. */
  entra_groups: string;
  system: SqliteBool;
  /** Le workspace choisi : nul, ou peut-être un qu'il n'a plus (users.ts, workspaceCourant). */
  workspace_id: Id | null;
}

export interface SessionRow {
  token: string;
  user_id: Id;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
}

/** Un contexte d'un tableau. */
export interface ContextRow {
  id: Id;
  board_id: Id;
  name: string;
  position: number;
  created_at: string;
}


/** Une vue du sélecteur du bas. */
export interface WorkspaceRow {
  id: Id;
  name: string;
  position: number;
  created_at: string;
}

export interface ViewRow {
  id: Id;
  workspace_id: Id;
  name: string;
  position: number;
  is_private: SqliteBool;
  owner_id: Id | null;
  created_at: string;
}


/** Un type de jalons : ses jalons y sont du texte JSON. */
export interface MilestoneTypeRow {
  id: Id;
  name: string;
  /** JSON : un tableau de { value, label, color }. */
  milestones: string;
}

/** Une réponse par défaut du Support. */
export interface SupportReplyRow {
  id: Id;
  name: string;
  html: string;
  /** Un SupportReplyEvent, ou vide. */
  event: string;
}

/** Un contenu par défaut du Support. */
export interface SupportContentRow {
  id: Id;
  name: string;
  html: string;
  /** Un SupportContentEvent, ou vide. */
  event: string;
}

export interface CategoryRow {
  id: Id;
  board_id: Id;
  name: string;
  /** JSON : un tableau de { value, label }. */
  milestones: string;
  position: number;
}


/** Une section d'un tableau : une colonne de widgets. */
export interface BoardSectionRow {
  id: Id;
  board_id: Id;
  width_unit: SectionWidthUnit;
  width_value: number | null;
  /** L'écart qui la sépare de la colonne suivante, en pixels. */
  gap: number;
  position: number;
  /** Nul : la structure publique ; sinon, celle de ce compte. */
  owner_id: Id | null;
  created_at: string;
}


/**
 * Un widget d'une section, tel que la base le range : sa configuration y est
 * du texte JSON. L'API, elle, rend un objet (`BoardWidget`).
 */
export interface BoardWidgetRow {
  id: Id;
  section_id: Id;
  type: string;
  config: string;
  position: number;
  created_at: string;
}


export interface AccessFeedRow {
  url: string;
  /** La liste des articles, en JSON. */
  articles: string;
  quantity: number;
  fetched_at: string | null;
  tried_at: string;
  error: string;
}

export interface ProjectRow {
  id: Id;
  number: number;
  name: string;
  description: string;
  board_id: Id;
  category_id: Id;
  context_id: Id | null;
  list_key: string;
  milestone_type_id: Id | null;
  status: number;
  created_at: string;
  updated_at: string;
}

/** Une ligne de projet jointe à ses tables de référence. */
export interface ProjectJoinedRow extends ProjectRow {
  category_name: string;
  context_name: string | null;
}

/** Un tableau d'une vue. */
export interface BoardRow {
  id: Id;
  view_id: Id;
  name: string;
  all_contexts_label: string;
  position: number;
  show_card_numbers: SqliteBool;
  is_private: SqliteBool;
  is_locked: SqliteBool;
  owner_id: Id | null;
  created_at: string;
}

/** Les tableaux de projets sont des tableaux comme les autres. */
export type ProjectBoardRow = BoardRow;


export interface TaskListRow {
  id: Id;
  board_id: Id;
  name: string;
  position: number;
  color: string;
  list_key: string;
  created_at: string;
}

export interface TaskCardRow {
  id: Id;
  list_id: Id;
  text: string;
  position: number;
  number: number;
  kind: CardKind;
  context_id: Id | null;
  description: string;
  due_date: string;
  start_date: string;
  due_form: FormeEcheance;
  recurrence: Recurrence;
  reminder: Rappel;
  reminded_for: string;
  overdue_for: string;
  cover_interval: number;
  created_at: string;
}

export interface LabelRow {
  id: Id;
  board_id: Id;
  name: string;
  color: string;
  /** Le poids : celles des projets seules en portent un. */
  weight?: number;
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
  overdue_for: string;
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
  position: number;
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

/** Un ticket : il pend à un contexte. */
export interface SupportRequestRow {
  id: Id;
  number: number;
  board_id: Id;
  context_id: Id | null;
  list_key: string;
  /** La boîte où elle est arrivée ; vide pour une demande saisie. */
  mailbox: string;
  subject: string;
  status: SupportStatus;
  due_date: string;
  sender_name: string;
  sender_email: string;
  /** L'identifiant Internet de l'e-mail d'origine ; vide pour une demande saisie. */
  mail_id: string;
  conversation_id: string;
  created_at: string;
  updated_at: string;
}

/** Une étiquette du mode Support : jumelle de « LabelRow », commune à tout le support. */
export interface SupportLabelRow {
  id: Id;
  name: string;
  color: string;
  weight: number;
  position: number;
  created_at: string;
}



export interface SupportCommentRow {
  id: Id;
  request_id: Id;
  user_id: Id | null;
  text: string;
  system: SqliteBool;
  /** L'expéditeur d'un e-mail reçu, quand aucun compte ne lui correspond. */
  sender_name: string;
  sender_email: string;
  mail_status: SupportMailStatus;
  mail_to: string;
  mail_cc: string;
  mail_bcc: string;
  internal: SqliteBool;
  mail_id: string;
  format: SupportCommentFormat;
  /** Les fichiers de l'e-mail, en JSON : TicketFileRow[]. */
  attachments: string;
  /** L'évènement d'une réponse par défaut partie d'office ; vide sinon. */
  auto_event: string;
  created_at: string;
  updated_at: string;
}

/** Un fichier d'e-mail tel que la base le garde. */
export interface TicketFileRow {
  /** Le nom de rangement, dans le dossier des tickets. */
  file: string;
  name: string;
  mime: string;
  size: number;
  /** Une image intégrée au corps (« cid: ») plutôt qu'une pièce jointe. */
  inline: boolean;
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

/**
 * Un poste du mode Assets. « content » est l'inventaire entier en JSON, tel
 * que l'agent l'a envoyé : il n'est relu qu'à l'ouverture du tiroir.
 */
export interface AssetRow {
  id: Id;
  deviceid: string;
  name: string;
  tag: string;
  board_id: Id | null;
  context_id: Id | null;
  list_key: string;
  content: string;
  last_user: string;
  last_inventory: string;
  created_at: string;
}
