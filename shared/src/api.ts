// What the client sends to the server. The responses are described by
// the domain types (domain.ts).

import type { DueShape, Reminder, Recurrence } from "./due.js";
import type { EntraPrincipal } from "./entra.js";
import type {
  CardKind,
  Id,
  ListColor,
  PublicUser,
  SectionWidthUnit,
  SupportStatus,
} from "./domain.js";

/** Every API error has this shape. */
export interface ApiError {
  error: string;
}

export interface AuthResult {
  token: string;
  user: PublicUser;
}

export interface SetupState {
  /** The "admin" account does not exist yet: it must be created. */
  needs_setup: boolean;
  /** The Entra application is configured: Microsoft sign-in is possible. */
  entra: boolean;
}

/**
 * The very first opening: the password of the "admin" account, and the
 * name of the first workspace.
 */
export interface SetupInput {
  password: string;
  /** The name of the first workspace. */
  workspace: string;
}

/** The sign-in of the "admin" account, the only one with a password. */
export interface AdminLoginInput {
  username: string;
  password: string;
}

/**
 * What an account sets itself. Its identity comes from Entra and is reread at
 * each sign-in: it is not edited here.
 */
export interface UpdateMeInput {
  /** The opening view: its id, as a string. */
  default_view?: string;
}

export interface ViewInput {
  name?: string;
}

/**
 * A view's sharing, as "Partager" saves it: each user or group, and its
 * boards with their level. Whoever is not listed no longer receives any.
 */
export interface ViewSharesInput {
  shares: { principal: EntraPrincipal; permissions: Record<string, string> }[];
}

/** A context: its name. */
export interface ContextInput {
  name?: string;
}

/** A board: its name, its settings, the label of "Tous les contextes". */
export interface BoardInput {
  view_id?: Id;
  name?: string;
  all_contexts_label?: string;
  show_card_numbers?: boolean;
}

/**
 * A section of a board, as its footer sets it. "width_value" only
 * makes sense with a unit that requires one: it is ignored for an
 * automatic width.
 */
export interface BoardSectionInput {
  width_unit?: SectionWidthUnit;
  width_value?: number | null;
  /** The gap separating it from the next section, in pixels. */
  gap?: number;
  /** On creation: the rank where the section is placed. Without it, at the end. */
  index?: number;
}

/**
 * The layout of a board, as it is exported and imported: its
 * sections, in order, and what each carries. Nothing in it designates a row
 * of the database — the import creates new sections and widgets.
 */
export interface ExportedLayout {
  /** The export format: an import rejects what it cannot read. */
  version: 1;
  sections: {
    width_unit: SectionWidthUnit;
    width_value: number | null;
    gap: number;
    widgets: { type: string; config: Record<string, unknown> }[];
  }[];
}

/** What the import did with the received layout. */
export interface ImportResult {
  /** The widgets placed. */
  placed: number;
  /** Those of the export that were not placed: an unknown type, or one the account cannot edit. */
  discarded: number;
  /** Those that had to be kept, for lack of being able to remove them: placed in the first section. */
  keptCount: number;
}

/** A widget: its configuration is that of the widget, the server stores it without rereading it. */
export interface BoardWidgetInput {
  section_id?: Id;
  type?: string;
  config?: Record<string, unknown>;
}

export interface TaskListInput {
  board_id?: Id;
  /** On creation: the "Tâches" widget that shows it. */
  list_key?: string;
  name?: string;
  position?: number;
  color?: ListColor;
}

/**
 * Copy of a list. Without `board_id`, the copy stays in the board of the
 * original list; without `name`, it reuses its own.
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
  /** ISO 8601 with the time, or empty to remove the due date. */
  due_date?: string;
  /** "AAAA-MM-JJ", or empty: a due date without a start. */
  start_date?: string;
  due_form?: DueShape;
  recurrence?: Recurrence;
  reminder?: Reminder;
  /** See `TaskCard.cover_interval`. */
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
  /** Another group: the label goes to its end. */
  group_id?: Id;
}

export interface ProjectInput {
  name?: string;
  description?: string;
  board_id?: Id;
  category_id?: Id;
  context_id?: Id;
  /** On creation: the "Projets" widget that shows it. */
  list_key?: string;
  milestone_type_id?: Id | null;
  status?: number;
  actor_ids?: Id[];
  label_ids?: Id[];
}

/**
 * Copy of a project. Without `board_id`, the copy stays in the board of the
 * original project; without `name`, it reuses its own. The category, for its part, is
 * always specified when the board changes: categories belong to the board.
 */
export interface ProjectCopyInput {
  board_id?: Id;
  category_id?: Id;
  name?: string;
}

/** "all" means "no filter"; it is the value of the dropdowns. */
export type FilterValue = string | "all" | null | undefined;

export interface ProjectFilters {
  board?: FilterValue;
  category?: FilterValue;
  context?: FilterValue;
  status?: FilterValue;
  actor?: FilterValue;
}

/** What a cascade deletion returns: enough to tell the user. */
export interface CascadeResult {
  deleted_projects: number;
}

/** The copy of the labels or categories of one board to another. */
export interface CopyToBoardInput {
  from_board: Id;
  to_board: Id;
}

/**
 * What it produced. What already had the same name in the destination
 * board is not duplicated: the report says so rather than keeping quiet.
 */
export interface CopyResult {
  copied: number;
  skipped: number;
  /** What the copy first erased from the destination board, when requested. */
  removed?: number;
  /**
   * What the replacement had to keep: the categories that still hold
   * projects.
   */
  kept?: number;
}

/**
 * The drawer of a ticket: its context, which can be changed to
 * another of the same board.
 */
export interface SupportRequestInput {
  context_id?: Id;
  /** On creation without a context: the board, whose first one it takes. */
  board_id?: Id;
  /** On creation: the "Tickets" widget that shows it. */
  list_key?: string;
  subject?: string;
  status?: SupportStatus;
  actor_ids?: Id[];
  /** ISO 8601 with the time, or empty to remove the due date. */
  due_date?: string;
  label_ids?: Id[];
}

/** The requests checked in the list, and what is done with them. */
export interface SupportBulkInput {
  ids: Id[];
}

/** "Assigner à": the accounts added to the actors of the checked requests. */
export interface SupportAssignInput extends SupportBulkInput {
  actor_ids: Id[];
}

/** The widgets' sections: those of a board. */
export type IndicatorSectionInput = BoardSectionInput;

export interface SupportLabelInput {
  name?: string;
  color?: string;
  /** Another group: the label goes to its end. */
  group_id?: Id;
}

/** The routes of a kind of labels: those of cards, of projects, of Support. */
export type LabelsBase = "/labels" | "/project-labels" | "/support-labels";

/**
 * The confirmation of a support mailbox: while it is pending, nothing is
 * fetched from it. "sent_at" is the last time the link was sent, empty if it has not gone out.
 */
export interface MailboxOptinState {
  email: string;
  status: "pending" | "confirmed";
  sent_at: string;
}
