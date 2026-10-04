// Raw rows, as SQLite returns them. They never leave the server: what the
// API returns is described by @milo/shared. The difference matters — a
// "users" row carries the password hash, a `PublicUser` does not.

import type {
  SupportCommentFormat,
  SupportMailStatus,
  CardKind,
  Id,
  DueShape,
  Reminder,
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
  /** The opening view: its id, or empty. */
  default_view: string;
  created_at: string;
  entra_id: string;
  /** JSON: the ids of the account's Entra groups. */
  entra_groups: string;
  system: SqliteBool;
  /** The chosen workspace: null, or perhaps one it no longer has (users.ts, currentWorkspace). */
  workspace_id: Id | null;
}

export interface SessionRow {
  token: string;
  user_id: Id;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
}


/** A view of the bottom selector. */
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


/** A milestone type: its milestones are JSON text here. */
export interface MilestoneTypeRow {
  id: Id;
  name: string;
  /** JSON: an array of { value, label, color }. */
  milestones: string;
}

/** A default Support reply. */
export interface SupportReplyRow {
  id: Id;
  name: string;
  html: string;
  /** A SupportReplyEvent, or empty. */
  event: string;
}

/** A default Support content. */
export interface SupportContentRow {
  id: Id;
  name: string;
  html: string;
  /** A SupportContentEvent, or empty. */
  event: string;
}

export interface CategoryRow {
  id: Id;
  board_id: Id;
  name: string;
  /** JSON: an array of { value, label }. */
  milestones: string;
  position: number;
}


/** A section of a board: a column of widgets. */
export interface BoardSectionRow {
  id: Id;
  board_id: Id;
  width_unit: SectionWidthUnit;
  width_value: number | null;
  /** The gap separating it from the next column, in pixels. */
  gap: number;
  position: number;
  /** Null: the public structure; otherwise, that of this account. */
  owner_id: Id | null;
  created_at: string;
}


/**
 * A widget of a section, as the database stores it: its configuration is
 * JSON text there. The API, for its part, returns an object (`BoardWidget`).
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
  /** The list of items, as JSON. */
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
  list_key: string;
  milestone_type_id: Id | null;
  status: number;
  created_at: string;
  updated_at: string;
}

/** A project row joined to its reference tables. */
export interface ProjectJoinedRow extends ProjectRow {
  category_name: string;
}

/** A board of a view. */
export interface BoardRow {
  id: Id;
  view_id: Id;
  name: string;
  all_contexts_label: string;
  context_group: string;
  position: number;
  show_card_numbers: SqliteBool;
  is_private: SqliteBool;
  is_locked: SqliteBool;
  owner_id: Id | null;
  created_at: string;
}

/** Project boards are boards like any other. */
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
  description: string;
  due_date: string;
  start_date: string;
  due_form: DueShape;
  recurrence: Recurrence;
  reminder: Reminder;
  reminded_for: string;
  overdue_for: string;
  cover_interval: number;
  created_at: string;
}

export interface LabelRow {
  id: Id;
  board_id: Id;
  group_id: Id;
  /** Its group's name, on the queries that read it along. */
  group_name?: string;
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
 * A comment joined to its author. Both threads (projects and cards) have the
 * same shape, hence the generic type.
 */
export type WithAuthorColumns<T> = T & {
  author_name: string | null;
  author_email: string | null;
};

/** A ticket: it hangs off a board. */
export interface SupportRequestRow {
  id: Id;
  number: number;
  board_id: Id;
  list_key: string;
  /** The mailbox it arrived in; empty for a request entered by hand. */
  mailbox: string;
  subject: string;
  status: SupportStatus;
  due_date: string;
  sender_name: string;
  sender_email: string;
  /** The Internet id of the original e-mail; empty for a request entered by hand. */
  mail_id: string;
  conversation_id: string;
  created_at: string;
  updated_at: string;
}

/** A Support-mode label: twin of "LabelRow", shared by the whole support. */
export interface SupportLabelRow {
  id: Id;
  group_id: Id;
  group_name?: string;
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
  /** The sender of a received e-mail, when no account matches it. */
  sender_name: string;
  sender_email: string;
  mail_status: SupportMailStatus;
  mail_to: string;
  mail_cc: string;
  mail_bcc: string;
  internal: SqliteBool;
  mail_id: string;
  format: SupportCommentFormat;
  /** The e-mail's files, as JSON: TicketFileRow[]. */
  attachments: string;
  /** The event of a default reply sent automatically; empty otherwise. */
  auto_event: string;
  created_at: string;
  updated_at: string;
}

/** An e-mail file as the database keeps it. */
export interface TicketFileRow {
  /** The storage name, in the tickets folder. */
  file: string;
  name: string;
  mime: string;
  size: number;
  /** An image embedded in the body ("cid:") rather than an attachment. */
  inline: boolean;
}

export interface CountRow {
  count: number;
}

/** "COALESCE(MAX(position), -1) + 1": the rank of a new item. */
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
 * A workstation of Assets mode. "content" is the whole inventory as JSON,
 * exactly as the agent sent it: it is only read back when the drawer opens.
 */
export interface AssetRow {
  id: Id;
  deviceid: string;
  name: string;
  tag: string;
  board_id: Id | null;
  list_key: string;
  content: string;
  last_user: string;
  last_inventory: string;
  created_at: string;
}
