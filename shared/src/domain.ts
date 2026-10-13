// The application vocabulary: what the server returns, what the
// client receives. A single place describes it, so the two sides can no
// longer diverge silently.
//
// Convention: SQLite has no boolean, it stores 0 or 1 in an integer. The
// fields that come from it are therefore typed `SqliteBool` and not `boolean` — the
// type tells the truth rather than disguising it, and `Boolean(x)` remains
// necessary to read them.

import type { CardLink } from "./dependencies.js";
import type { DueShape, Reminder, Recurrence } from "./due.js";
import type { AdminPermissions, CompanyRights, WorkspaceRights } from "./roles.js";
import type { WidgetRights } from "./widget-kinds.js";
import type { EntraPrincipal, PrincipalPermissions } from "./entra.js";
import type { NotificationSettings } from "./notification-settings.js";
import type { SearchKind } from "./search.js";
import type {
  ApplicationRights,
  NotificationRights,
  StructureRights,
} from "./workspace-access.js";

export type SqliteBool = 0 | 1;

/** SQLite row identifier. */
export type Id = number;

// --- People ----------------------------------------------------------------

/** An account, as it is shown: never its password hash. */
export interface PublicUser {
  id: Id;
  first_name: string;
  last_name: string;
  /** Full name, or the email by default. Feeds the initials and the lists. */
  name: string;
  email: string;
  gravatar_url: string;
  /**
   * Their rights on the Settings ("Gestion du paramétrage"): the "admin"
   * account has them all. "view" opens the Settings, "update" allows saving
   * in them — both go together.
   */
  settings: { view: boolean; update: boolean };
  /**
   * Their rights in the modes (shared, roles.ts), derived from their permissions
   * per widget type and common to all companies: the client uses them
   * to hide what the account does not see and remove what it cannot
   * do. The server checks them on its side.
   */
  rights: CompanyRights;
  /**
   * Their permissions per widget type — their own and those of their
   * groups combined: which widgets they see, which they place and edit.
   */
  widgets: WidgetRights;
  /**
   * The notifications they receive in the workspace they work in — their own
   * and their groups' combined. Without any, no "Notifications" menu.
   */
  notifications: NotificationRights;
  /**
   * What they may do with the interface of the workspace they work in —
   * modify it, import or export a layout —, their own and their groups'
   * combined.
   */
  application: ApplicationRights;
  /**
   * What they may do with the views, boards and contexts of the workspace
   * they work in — read, create, delete —, their own and their groups'
   * combined.
   */
  structure: StructureRights;
  /**
   * The local "admin" account: it is only used for configuration, is not shown
   * in any list and is the actor of nothing.
   */
  system: boolean;
  /**
   * The workspace opened at sign-in: null for the one they were working in.
   * The opening view and board are taken from it.
   */
  default_workspace: Id | null;
  /** The opening view: its id as a string, empty for the first. */
  default_view: string;
  /** The opening board, in the opening view: its id as a string, empty for the first. */
  default_board: string;
  /** How they are notified: on screen, by e-mail, grouped or not. */
  notification_settings: NotificationSettings;
  /** How an e-mail being written first shows: its text alone, or in its template. */
  reply_editor: ReplyEditorView;
  /** Forgives typing mistakes in the search; without it, only the text as
   *  typed is found, whatever "search_threshold" says. */
  fuzzy_search: boolean;
  /**
   * How far the search (Spotlight) strays from what is typed: Fuse.js's
   * threshold, from 0 (the text as typed, nothing else) to 1 (anything).
   */
  search_threshold: number;
  /** The kinds of content the search leaves out: the others are searched. */
  search_excluded: SearchKind[];
  /**
   * The workspace they work in: its views, boards and rights are
   * those of this workspace. "null" if they have none.
   */
  workspace: Id | null;
  /** The workspaces they have access to: the selector offers more than one. */
  workspaces: WorkspaceRef[];
  /**
   * Their rights on workspaces: see them (their tab, each one's access),
   * create them — rename them and set their access too —, delete them.
   */
  workspace_rights: WorkspaceRights;
  /**
   * Their administration, section by section — their own and their groups'
   * merged; all of it for the "admin" account. The Settings' tabs, and what
   * can be granted in the Administration one, follow it.
   */
  administration: AdminPermissions;
  created_at: string;
}

/**
 * A workspace: a team, with its views, boards and contexts,
 * isolated from those of the others, and its own access.
 */
export interface Workspace {
  id: Id;
  name: string;
  position: number;
  created_at: string;
}

/** A workspace as the selector offers it. */
export type WorkspaceRef = Pick<Workspace, "id" | "name">;

/**
 * A person as they accompany something else: actor of a project,
 * member of a card or of a checklist item, author of a comment.
 * The bare minimum to display them as a bubble.
 */
export interface Actor {
  id: Id;
  name: string;
  email: string;
  gravatar_url: string;
}

/**
 * Milo itself, author of the notes the application writes with no one
 * behind them — the opening of a thread when a project, card or
 * request is created. No account carries this id: the badge
 * recognizes it to show the logo rather than initials.
 */
export const MILO_ACTOR_ID = -1;
export const MILO_ACTOR: Actor = { id: MILO_ACTOR_ID, name: "Milo", email: "", gravatar_url: "" };

// --- Contexts --------------------------------------------------------------

/**
 * A board's contexts are labels: the board chooses one label group by its
 * name (shared, contexts.ts). Its tab offers the labels of that group;
 * choosing one shows, in each list, what carries the label of that name.
 */

/** What the context list shows for a board that has none. */
export const NO_CONTEXT = "Aucun contexte";

/** The label, renamable, of the entry that shows all the contexts. */
export const ALL_CONTEXTS = "Tous les contextes";

// --- Views and boards ------------------------------------------------------

/**
 * A view: what the bottom selector offers. It carries boards, which
 * carry the widgets. It belongs to whoever created it; others see it once
 * one of its boards is shared with them (ViewShares).
 */
export interface View {
  id: Id;
  name: string;
  position: number;
  /** Its author. Null once that account is gone. */
  owner_id: Id | null;
  /** True for its owner: renaming, deleting, sharing it and adding boards are theirs. */
  is_owner: boolean;
  /**
   * Hidden by this account: shown, greyed, at the end of the row in interface
   * editing only. At least one view stays shown.
   */
  is_hidden: boolean;
  created_at: string;
}

/**
 * What a board's sharing grants: "read", its layout stays as it is —
 * its widgets still work, by widget rights; "full", everything but
 * deleting and sharing it, which stay its owner's.
 */
export const SHARE_LEVELS = [
  { value: "read", label: "Lecture seule" },
  { value: "full", label: "Contrôle total" },
] as const;

export type ShareLevel = (typeof SHARE_LEVELS)[number]["value"];

export const isShareLevel = (value: unknown): value is ShareLevel =>
  SHARE_LEVELS.some((l) => l.value === value);

/** What the reading account holds on a board: it owns it, or it was shared with it. */
export type BoardAccess = "owner" | ShareLevel;

/**
 * What a user or a group receives in a view: its boards shared with them,
 * by id, and how far. A board left out is not shared with them.
 */
export type ViewSharePermissions = Record<string, ShareLevel>;

/**
 * A view's sharing, as its "Partager" window reads it: its boards, whom they
 * can go to — the users and groups with access to its workspace, and each
 * user of these groups —, and to whom they went.
 */
export interface ViewShares {
  boards: { id: Id; name: string }[];
  principals: EntraPrincipal[];
  shares: PrincipalPermissions<ViewSharePermissions>[];
}

/**
 * A board of a view: a tab. It contains its projects and its task lists,
 * and its widgets; what comes from elsewhere — requests received by
 * email, machines from the agents — shows up there through its widgets. Everything it
 * carries belongs to one of its contexts; they are all shown, or just one.
 */
export interface Board {
  id: Id;
  view_id: Id;
  name: string;
  /**
   * The label group that gives its contexts, by its name — or all of them
   * (ALL_CONTEXT_GROUPS); null for none.
   */
  context_group: string | null;
  /** The label groups it can choose: their names, each once, in order. */
  context_group_options: string[];
  /**
   * Its contexts: the names of the labels of its context group, in order,
   * each name once.
   */
  contexts: string[];
  /**
   * The same contexts under the name of their group, groups in order: what
   * the list shows when the board takes all groups.
   */
  context_sections: { group: string; contexts: string[] }[];
  /** The context groups of each of its lists, by list key; absent: none. */
  context_groups: Record<string, Id[]>;
  /** The label of the "Tous les contextes" entry, which can be renamed. */
  all_contexts_label: string;
  /** The context this account chose in this board — a label name; null for all. */
  context: string | null;
  position: number;
  show_card_numbers: SqliteBool;
  /** Locked in this window: the client sets it, the server does not keep it. */
  is_locked: SqliteBool;
  /** Its author. Null once that account is gone. */
  owner_id: Id | null;
  /** What the reading account may do with it. */
  access: BoardAccess;
  /**
   * Hidden by this account: shown, greyed, at the end of the row in interface
   * editing only. At least one board of its view stays shown.
   */
  is_hidden: boolean;
  created_at: string;
}

/** Project boards are boards like the others. */
export type ProjectBoard = Board;

/** A section of a board: a column, which carries widgets. */
export interface BoardSection {
  id: Id;
  board_id: Id;
  width_unit: SectionWidthUnit;
  /** Null when the width is automatic; otherwise the number that goes with the unit. */
  width_value: number | null;
  /** The gap separating it from the next section, in pixels. The last one's is unused. */
  gap: number;
  position: number;
  created_at: string;
}

/**
 * A widget placed in a section. The server does not know its
 * configuration: it stores it and returns it as is, its shape belongs to the
 * widget that reads it. "type" is one of BOARD_WIDGET_TYPES.
 */
export interface BoardWidget {
  id: Id;
  section_id: Id;
  type: string;
  config: Record<string, unknown>;
  position: number;
  created_at: string;
}

// --- Projects mode ---------------------------------------------------------

/**
 * A milestone of the progress slider: a percentage, the color of the segment
 * it closes, and an optional label.
 *
 * Milestones cut the progress into segments: from 0 to the first milestone,
 * then from milestone to milestone. A project takes the color of the segment where
 * its progress falls — at 15%, between a milestone at 10% and another at 20%, that of the
 * milestone at 20%.
 */
export interface Milestone {
  /** From 0 to 100. */
  value: number;
  /** Empty: the milestone colors its segment, but is not written under the slider. */
  label: string;
  /** A label color ("hue.shade"); absent on old milestones. */
  color?: string;
}

/**
 * A milestone type — Commande, Développement… —, set once for the whole
 * application. A project picks one: its milestones place the marks and
 * colors of the progress slider.
 */
/** The milestone type placed with the first projects widget, which a new project receives. */
export const DEFAULT_MILESTONE_TYPE = "Défaut";

export interface MilestoneType {
  id: Id;
  /** The "Projets" widget that owns it: its board and its list key. */
  board_id: Id;
  list_key: string;
  name: string;
  /** Stored by value; empty until they have been set. */
  milestones: Milestone[];
}

/**
 * A category of a board's tree — "Interne > Informatique > Réseau" —: its
 * parent's id, none at the root. The board's are read in their order, a
 * parent before its children.
 */
export interface Category {
  id: Id;
  board_id: Id;
  /** The list widget that owns it: its key (shared, LIST_KEY). */
  list_key: string;
  name: string;
  parent_id: Id | null;
  /** The milestones of the projects of this category, stored by value; empty if none. */
  milestones: Milestone[];
  /** Present on the list. */
  project_count?: number;
}

export interface ProjectLabel {
  id: Id;
  board_id: Id;
  /** The list widget that owns it: its key (shared, LIST_KEY). */
  list_key: string;
  /** Its group: every label belongs to one (LabelGroup). */
  group_id: Id;
  /** The name of its group, on the lists that read it along. */
  group_name?: string;
  name: string;
  /** "hue.shade" of the Mantine palette, for example "red.6". */
  color: string;
  position: number;
  created_at: string;
}

export interface Project {
  id: Id;
  /** Its reference ("PRJ-12"), counted per "Projets" widget from 1. */
  number: number;
  name: string;
  description: string;
  board_id: Id;
  category_id: Id;
  /** The list — the "Projets" widget — that shows it (shared, LIST_KEY). */
  list_key: string;
  /** The milestone type of its slider; none, the slider stays bare. */
  milestone_type_id: Id | null;
  /** Progress, from 0 to 100. */
  status: number;
  created_at: string;
  updated_at: string;
  /** Its category's path: "Interne > Informatique > Réseau". */
  category_name: string;
  actors: Actor[];
  labels: ProjectLabel[];
}

export interface Comment {
  id: Id;
  project_id: Id;
  user_id: Id | null;
  text: string;
  /** The notes the application writes itself: neither edited nor deleted. */
  system: SqliteBool;
  created_at: string;
  updated_at: string;
  /** Null if the account was deleted, or for a comment from before the column. */
  author: Actor | null;
}

/** A document of a project, as a card's attachment. */
export interface ProjectAttachment extends Omit<Attachment, "card_id"> {
  project_id: Id;
}

export interface ProjectDetail extends Project {
  comments: Comment[];
  attachments: ProjectAttachment[];
}

// --- Tasks mode ------------------------------------------------------------

/**
 * A group of labels: a title that gathers some of them. Every label belongs to
 * one, and the groups are ordered among themselves. A board's labels have their
 * own (board_id); those of Support belong to no board.
 */
export interface LabelGroup {
  id: Id;
  board_id?: Id;
  /** The list widget that owns them: its key (shared, LIST_KEY). */
  list_key: string;
  name: string;
  position: number;
  created_at: string;
}

/** A group and its labels, in order: what is sent to arrange them. */
export interface LabelGroupLayout {
  id: Id;
  label_ids: Id[];
}

export interface Label {
  id: Id;
  board_id: Id;
  /** The list widget that owns it: its key (shared, LIST_KEY). */
  list_key: string;
  /** Its group: every label belongs to one (LabelGroup). */
  group_id: Id;
  /** The name of its group, on the lists that read it along. */
  group_name?: string;
  name: string;
  color: string;
  position: number;
  created_at: string;
}

/** What a list can carry: a card, or a separator that titles what follows. */
export const CARD_KINDS = ["card", "separator"] as const;
export type CardKind = (typeof CARD_KINDS)[number];

export const isCardKind = (value: unknown): value is CardKind =>
  CARD_KINDS.includes(value as CardKind);

/** An unchecked checklist item, as a card's badge unfolds it. */
export interface OpenChecklistItem {
  id: Id;
  text: string;
}

/**
 * A card as seen from the board. Its description does not follow: only its existence
 * matters to the card (`has_description`), its record will fetch the text.
 */
export interface TaskCard {
  id: Id;
  list_id: Id;
  text: string;
  position: number;
  /**
   * Its reference ("TSK-12"), counted per "Tâches" widget from 1. Zero for a
   * separator.
   */
  number: number;
  kind: CardKind;
  /**
   * Due date, in ISO 8601 with the time, or empty. Unlike that of a
   * checklist item, it carries a time: a card is due at
   * a given hour.
   */
  due_date: string;
  /** The start of the period, "AAAA-MM-JJ", or empty: the due date alone. */
  start_date: string;
  due_form: DueShape;
  recurrence: Recurrence;
  reminder: Reminder;
  created_at: string;
  has_description: boolean;
  members: Actor[];
  labels: Label[];
  checklist_total: number;
  checklist_done: number;
  checklist_open: OpenChecklistItem[];
  /** The addresses of the cover images, in their order. */
  cover_urls: string[];
  /** The seconds between two covers on the board; zero, the first one stays. */
  cover_interval: number;
  /** How many dependencies link it to other cards, in either direction. */
  link_count: number;
  /** How many attachments it carries. */
  attachment_count: number;
  /** How many comments its thread carries. */
  comment_count: number;
}

export interface ChecklistItem {
  id: Id;
  checklist_id: Id;
  text: string;
  done: SqliteBool;
  /** "AAAA-MM-JJ", or empty: an absent date reads the same everywhere. */
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
 * An attachment of a card: a file stored in "medias", and what is
 * needed to display it without reading it — its original name, its size, and
 * the address to fetch it from.
 */
/**
 * A cover image of a card. They are ordered among themselves: the
 * first one is the one the card shows on the board.
 */
export interface CardCover {
  id: Id;
  card_id: Id;
  file: string;
  /** The original name, and the size in bytes. */
  name: string;
  size: number;
  position: number;
  created_at: string;
  /** Where to read it: "/api/media/<file>". */
  url: string;
}

export interface Attachment {
  id: Id;
  card_id: Id;
  /** The file name on disk. Randomly generated, never the original. */
  file: string;
  /** The name it had on the machine of whoever uploaded it. */
  name: string;
  mime: string;
  /** In bytes. */
  size: number;
  /** The order in the record: the smallest first. */
  position: number;
  created_at: string;
  /** Where to read it: "/api/media/<file>". */
  url: string;
  /** True for the images the server returns as is: the inset shows them. */
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

/** The record of a card: everything its drawer displays. */
export interface TaskCardDetail {
  id: Id;
  list_id: Id;
  text: string;
  description: string;
  position: number;
  number: number;
  kind: CardKind;
  /** ISO 8601 with the time, or empty. See `TaskCard.due_date`. */
  due_date: string;
  /** See `TaskCard.start_date`. */
  start_date: string;
  due_form: DueShape;
  recurrence: Recurrence;
  reminder: Reminder;
  cover_interval: number;
  created_at: string;
  members: Actor[];
  labels: Label[];
  checklists: Checklist[];
  attachments: Attachment[];
  covers: CardCover[];
  /** Its dependencies, read from it: "bloque" here, "est bloqué par" on the other. */
  links: CardLink[];
  comments: CardComment[];
}

/**
 * Where a card is. Used by the link that opens it: the application must
 * position itself on the right view and board before it can show a
 * record, and it cannot guess it for a card it is not displaying.
 */
export interface CardLocation {
  view_id: Id;
  board_id: Id;
  list_id: Id;
}

/** A card as it comes back from a creation or a rename: without its side data. */
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
  /** Background color chosen in the list menu; empty = none. */
  color: string;
  /** The "Tâches" widget that shows it (shared, LIST_KEY). */
  list_key: string;
  created_at: string;
  cards: TaskCard[];
}

/** Colors offered in a list menu; the empty string means "none". */
export const LIST_COLORS = [
  "",
  // The menu swatches: the red, orange, green and blue of the
  // projects, the yellow and the violet (shade 8), and two lighter shades
  // of each.
  ...(["8", "6", "4"] as const).flatMap(
    (n) =>
      [`red.${n}`, `orange.${n}`, `yellow.${n}`, `green.${n}`, `blue.${n}`, `violet.${n}`] as const,
  ),
  // The former colors, which some lists still carry.
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

// --- Sections ----------------------------------------------------------------

/** The gap after a new section, until its field has set another one. */
export const SECTIONS_GAP_DEFAULT = 50;

/** The widest gap a section can leave: beyond it, the row falls apart. */
export const SECTIONS_GAP_MAX = 100;

/**
 * How the width of a section is expressed. "auto" lets the row
 * distribute it; the other two fix it, as a percentage of the available width
 * or in pixels.
 */
export const SECTION_WIDTH_UNITS = ["auto", "percent", "px"] as const;

export type SectionWidthUnit = (typeof SECTION_WIDTH_UNITS)[number];

export const isSectionWidthUnit = (value: unknown): value is SectionWidthUnit =>
  SECTION_WIDTH_UNITS.includes(value as SectionWidthUnit);


// --- Support mode ----------------------------------------------------------

/**
 * Where a ticket stands. These are the tabs of the mode, in their
 * display order — "Tous" is not one: it filters nothing.
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
 * The state of a request that has just been opened, or that arrives in the support
 * mailbox of its company: no one has picked it up yet.
 */
export const DEFAULT_SUPPORT_STATUS: SupportStatus = "new";

/**
 * The state of a closed request that the sender follows up by email: it has already
 * been handled, it is not "new" for all that.
 */
export const REOPENED_SUPPORT_STATUS: SupportStatus = "open";

export const isSupportStatus = (value: unknown): value is SupportStatus =>
  SUPPORT_STATUSES.some((s) => s.value === value);

/**
 * The support urgency labels, set once and for all, from the least to the
 * most urgent. They are labels like the others: they can be renamed,
 * recolored, and deleted only when no request carries them anymore.
 */
export const SUPPORT_URGENCY_LABELS = [
  { name: "Sans urgence", color: "green.8" },
  { name: "Dès que possible", color: "orange.8" },
  { name: "Urgent", color: "red.8" },
] as const;

/**
 * The channel through which a request arrived: set with the urgency
 * labels when the first Support widget is placed.
 */
export const SUPPORT_CHANNEL_LABELS = [
  { name: "E-mail", color: "gray.7" },
  { name: "Téléphone", color: "gray.7" },
  { name: "Teams", color: "gray.7" },
  { name: "SMS", color: "gray.7" },
  { name: "Sur place", color: "gray.7" },
] as const;

/**
 * The priority labels a board's first projects widget brings, from the most to
 * the least important, in the "Priorités" group (DEFAULT_LABEL_GROUP). Labels
 * like the others: renamed, recolored, deleted at will.
 */
export const PROJECT_PRIORITY_LABELS = [
  { name: "Importante", color: "red.6" },
  { name: "Haute", color: "orange.6" },
  { name: "Normale", color: "blue.6" },
  { name: "Faible", color: "gray.6" },
] as const;

/** The groups the urgency and channel labels are gathered in. */
export const SUPPORT_URGENCY_GROUP = "Priorité";
export const SUPPORT_CHANNEL_GROUP = "Canal";

/**
 * What an incoming email receives automatically, as long as its list has not
 * chosen (NEW_MESSAGE_LABELS): the labels of its board bearing these names.
 */
export const SUPPORT_NEW_MESSAGE_LABELS = ["Sans urgence", "E-mail"] as const;

/**
 * The configuration key of a request list: the ids of its board's labels an
 * incoming email receives automatically. Absent: SUPPORT_NEW_MESSAGE_LABELS.
 */
export const NEW_MESSAGE_LABELS = "new_message_label_ids";

/** The due date of an incoming email on a fresh installation, in business days. */
export const SUPPORT_NEW_MESSAGE_DUE_DAYS = 15;


/**
 * The prefix of the tickets' references: "HLP-1", "HLP-2"… Each list widget
 * numbers its own items from 1 (server, repositories/references.ts): a
 * reference designates only one thing within its widget.
 */
export const REFERENCE_PREFIX = "HLP-";

/** The former prefix, which email threads opened before still carry. */
export const LEGACY_REFERENCE_PREFIX = "LMA-";
export const SUPPORT_TICKET_PREFIX = REFERENCE_PREFIX;

/** A reference as it is read and cited. */
export const reference = (number: number): string => `${REFERENCE_PREFIX}${number}`;

/** Projects carry their own prefix: "PRJ-12" is not "HLP-12". */
export const PROJECT_REFERENCE_PREFIX = "PRJ-";

/** The reference of a project, as it is read and cited. */
export const projectReference = (number: number): string =>
  `${PROJECT_REFERENCE_PREFIX}${number}`;

/** Likewise for tasks: "TSK-12". */
export const TASK_REFERENCE_PREFIX = "TSK-";

/** The reference of a task, as it is read and cited. */
export const taskReference = (number: number): string => `${TASK_REFERENCE_PREFIX}${number}`;

/** The ticket number of a request, as it is read and cited. */
export const supportTicketRef = reference;

/** What the tab says, for a given status. */
export const supportStatusLabel = (status: SupportStatus): string =>
  SUPPORT_STATUSES.find((s) => s.value === status)?.label ?? "";

/**
 * A Support mode label. Twin of those of cards and projects,
 * but common to all of support: all companies share the same ones.
 */
export interface SupportLabel {
  id: Id;
  /** Its board: Support's labels, like the other kinds, belong to one. */
  board_id: Id;
  /** The list widget that owns it: its key (shared, LIST_KEY). */
  list_key: string;
  /** Its group: every label belongs to one (LabelGroup). */
  group_id: Id;
  /** The name of its group, on the lists that read it along. */
  group_name?: string;
  name: string;
  /** "hue.shade" of the Mantine palette, for example "red.6". */
  color: string;
  position: number;
  created_at: string;
}

/**
 * A ticket. It belongs to the company chosen in the dropdown
 * of the header, and carries those who handle it — as many as needed,
 * like the members of a card.
 */
export interface SupportRequest {
  id: Id;
  /**
   * The ticket number, which follows that of the previous request — all
   * companies combined — and is never reused, even after a deletion.
   */
  number: number;
  /** The board that shows it. */
  board_id: Id;
  /** The "Tickets" widget that shows it (shared, LIST_KEY). */
  list_key: string;
  /**
   * The support mailbox it arrived in, and from which replies go out;
   * empty for an entered request, whose replies go out from the shared
   * sending address.
   */
  mailbox: string;
  /** The subject: that of the received email, or what was entered; empty otherwise. */
  subject: string;
  status: SupportStatus;
  /** ISO 8601 with the time, or empty — like a card's due date. */
  due_date: string;
  created_at: string;
  updated_at: string;
  /** Empty as long as no one is designated. */
  actors: Actor[];
  labels: SupportLabel[];
  /** The exchanges held on the request, counted for the list. */
  comment_count: number;
  /**
   * Who wrote to the support mailbox, for a request received by email;
   * empty for an entered request. It is the actor shown as long as
   * no one else is designated.
   */
  sender_name: string;
  sender_email: string;
}

export interface SupportComment {
  id: Id;
  request_id: Id;
  user_id: Id | null;
  text: string;
  /** The notes the application writes itself: neither edited nor deleted. */
  system: SqliteBool;
  /**
   * What happened to the message on the email side, for a team reply
   * to a request received by email: empty if it did not have to go out.
   */
  mail_status: SupportMailStatus;
  /** Who it went to — or would have gone to, in simulation. */
  mail_to: string;
  /** Who was in copy, and in blind copy: comma-separated addresses. */
  mail_cc: string;
  mail_bcc: string;
  /**
   * An internal team comment — the "Commentaires" tab — rather
   * than an exchange with the sender: plain text, never sent.
   */
  internal: SqliteBool;
  /** "email": a received email, to be shown as is. Empty: the editor HTML. */
  format: SupportCommentFormat;
  /** The attachments of the email; its embedded images are not included. */
  attachments: SupportAttachment[];
  /** The event of a default reply sent automatically; empty otherwise. */
  auto_event?: string;
  created_at: string;
  updated_at: string;
  author: Actor | null;
}

export type SupportCommentFormat = "" | "email";

/** An attachment of a received email. */
export interface SupportAttachment {
  name: string;
  /** The address of the file, under /api/ticket-files. */
  url: string;
  mime: string;
  /** In bytes. */
  size: number;
}

/**
 * "sent": gone out. "simulated": prepared, but sends are simulated
 * (MILO_SUPPORT_REPLY). "failed": Graph refused it.
 */
export type SupportMailStatus = "" | "sent" | "simulated" | "failed";

/** The record of a request: everything its drawer displays. */
export interface SupportRequestDetail extends SupportRequest {
  comments: SupportComment[];
}

/**
 * A section of a statistics panel — Support, Assets, Project or
 * Task: a column, like an access section. Its width is read the
 * same way.
 */
/** The widgets' sections: those of a board. */
export type IndicatorSection = BoardSection;

/**
 * What the statistics panel of the Support mode can show. Each
 * value designates a client widget (client/src/indicators): it is the one that
 * knows how to compute the indicator and configure it. The string is stored as is
 * in the database, so it never changes.
 */
export const SUPPORT_INDICATOR_TYPES = [
  "list",
  "category",
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
 * What the statistics panel of the Assets mode can show. As for
 * Support, each value designates a client widget
 * (client/src/asset-indicators), and the string stored in the database never changes.
 */
export const MANAGED_DEVICE_ASSET_INDICATOR_TYPES = [
  "list",
  "category",
  "link",
  "number",
  "clock",
  "assets", "compliance", "systems", "disks"] as const;

export type ManagedDeviceAssetIndicatorType = (typeof MANAGED_DEVICE_ASSET_INDICATOR_TYPES)[number];

export const isManagedDeviceAssetIndicatorType = (value: unknown): value is ManagedDeviceAssetIndicatorType =>
  MANAGED_DEVICE_ASSET_INDICATOR_TYPES.includes(value as ManagedDeviceAssetIndicatorType);


/**
 * What the sections of the Projects mode can show. As for Support,
 * each value designates a client widget (client/src/project-indicators),
 * and the string stored in the database never changes.
 */
export const PROJECT_INDICATOR_TYPES = [
  "list",
  "category",
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
 * What the sections of the Tasks mode can show: the list board,
 * and the indicators (client/src/task-indicators).
 */
export const TASK_INDICATOR_TYPES = [
  "list",
  "category",
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
 * What a section can carry. Each value designates a client widget
 * (client/src/widgets): it is the one that knows how to display and configure it. The
 * string is stored as is in the database, so it never changes.
 */
export const ACCESS_BLOCK_TYPES = [
  "category",
  "link",
  "number",
  "clock",
  "date",
  "quote",
  "rss",
  "image",
  "weather",
  "calendar",
  "mail",
  "todo",
] as const;

export type AccessBlockType = (typeof ACCESS_BLOCK_TYPES)[number];

export const isAccessBlockType = (value: unknown): value is AccessBlockType =>
  ACCESS_BLOCK_TYPES.includes(value as AccessBlockType);



/** An article of a feed, as the server pulls it from the source. */
export interface AccessFeedArticle {
  title: string;
  /** Empty when the source gives none, or an address that is not http(s). */
  url: string;
  /** ISO 8601, or null when the source gives no readable one. */
  date: string | null;
}

/**
 * A source of an RSS widget, as the database keeps it. The server fetches
 * the source at its own pace — the interval each item sets — and stores
 * its latest articles, already parsed, whether from RSS, Atom or JSON:
 * the page reads them from the database rather than fetching the source on each
 * visit.
 */
export interface AccessFeedSource {
  url: string;
  articles: AccessFeedArticle[];
  /** The last successful fetch, ISO 8601; null until one has succeeded. */
  fetched_at: string | null;
  /** What prevented reading it, when there is nothing to show; otherwise null. */
  error: string | null;
}

/**
 * The feed of an RSS widget: its sources, in the order the item sets.
 * A source that fails does not prevent the others from showing.
 */
export interface AccessFeed {
  sources: AccessFeedSource[];
}

/**
 * What a feed address yields, probed from the settings of an RSS widget:
 * unreachable, readable but not as a feed, or a feed of this format
 * ("RSS 2.0", "Atom", "JSON Feed"…).
 */
export type AccessFeedProbe =
  | { state: "ok"; format: string }
  | { state: "unreachable" | "invalid"; message: string };

/** The fetch interval of a feed, in minutes: the default, and its bounds. */
export const ACCESS_FEED_INTERVAL_DEFAULT = 30;
export const ACCESS_FEED_INTERVAL_MIN = 5;
export const ACCESS_FEED_INTERVAL_MAX = 24 * 60;

/** The most articles an item shows, and therefore the database keeps. */
export const ACCESS_FEED_QUANTITY_MAX = 50;

/** A place found for a Weather widget: enough to name and locate it. */
export interface WeatherPlace {
  name: string;
  /** The region and country, to tell apart two places of the same name. */
  detail: string;
  latitude: number;
  longitude: number;
}

/** An hour or a day of forecast. */
export interface WeatherPoint {
  /** ISO 8601, in the local time of the place. */
  time: string;
  /** The WMO weather code (WMO 4677), which the client translates into a pictogram. */
  code: number;
  temperature: number;
  /** The minimum temperature, for a day. */
  min?: number;
  /** The probability of precipitation, in percent. */
  precipitation: number;
}

/**
 * The weather of a place, as Open-Meteo gives it and as the server keeps it
 * for a quarter of an hour: the instant, the next hours and the next days.
 */
export interface AccessWeather {
  current: {
    time: string;
    code: number;
    temperature: number;
    feelsLike: number;
    humidity: number;
    wind: number;
    is_day: boolean;
  };
  hourly: WeatherPoint[];
  daily: WeatherPoint[];
}

/**
 * Where a Citation widget takes what it shows: quotes, or jokes. Each value
 * is stored in the widget's configuration, so it never changes.
 */
export const QUOTE_SOURCES = [
  { value: "quote", label: "Citation" },
  { value: "joke", label: "Blague" },
] as const;

export type QuoteSource = (typeof QUOTE_SOURCES)[number]["value"];

export const isQuoteSource = (value: unknown): value is QuoteSource =>
  QUOTE_SOURCES.some((s) => s.value === value);

/**
 * What a Citation widget shows, as the server keeps it for the interval the
 * widget sets: a quote with its author and its work, or a joke — its question
 * in "text", its answer in "answer" when it comes in two parts.
 */
export interface AccessQuote {
  source: QuoteSource;
  text: string;
  answer?: string;
  author?: string;
  /** The book, the film… with its year when known. */
  work?: string;
}

/** An appointment of the person's Outlook calendar, read through Graph. */
export interface AccessCalendarEvent {
  id: string;
  subject: string;
  /** ISO 8601, in UTC. */
  start: string;
  end: string;
  all_day: boolean;
  location: string;
  /** "busy", "tentative", "free", "oof"… as Graph says it. */
  show_as: string;
  /** The address of the appointment in Outlook. */
  url: string;
  /** Whose calendar it comes from: their address; empty, the viewer's own. */
  owner: string;
}

/** One of a person's Outlook calendars, as the Calendar widget offers it. */
export interface AccessCalendarChoice {
  id: string;
  name: string;
  /** Their main calendar. */
  is_default: boolean;
}

/**
 * What a Calendar widget shows over a period: the appointments of the
 * calendars that could be read, and why the others could not.
 */
export interface AccessCalendar {
  events: AccessCalendarEvent[];
  errors: { owner: string; message: string }[];
}

/** An email address: its name and its address. */
export interface MailAddress {
  name: string;
  email: string;
}

/** An email of the inbox, as the Mail widget grid shows it. */
export interface AccessMail {
  id: string;
  subject: string;
  from: MailAddress;
  to: MailAddress[];
  /** ISO 8601, in UTC. */
  received_at: string;
  preview: string;
  is_read: boolean;
  has_attachments: boolean;
  /** "low", "normal" or "high". */
  importance: string;
  /** Its Outlook categories. */
  categories: string[];
  /** Whose mailbox it comes from: their address; empty, the viewer's own. */
  owner: string;
  /** The name of the folder it sits in. */
  folder: string;
}

/**
 * A page of the mailboxes a Mail widget reads, merged from most recent to
 * oldest.
 */
export interface AccessMailPage {
  messages: AccessMail[];
  /** True when the mailboxes have more beyond this page. */
  more: boolean;
  /** Where the next page starts: to send back as is. */
  cursor: string;
  /** The unread ones of the folders read, given with the first page only. */
  unread?: number;
  /** The mailboxes that could not be read, and why — the others still are. */
  errors: { owner: string; message: string }[];
}

/** One of a person's Outlook mail folders, as the Mail widget offers it. */
export interface AccessMailFolder {
  id: string;
  /** Its path: "Boîte de réception / Clients". */
  name: string;
  /** Their inbox. */
  is_default: boolean;
}

/**
 * A mail folder's counts, as Exchange keeps them on the folder: the "Messages
 * par dossier" widget shows them without reading any e-mail.
 */
export interface AccessMailFolderCount {
  id: string;
  name: string;
  /** Whose mailbox it belongs to: their address. */
  owner: string;
  total: number;
  unread: number;
  /** Which of Outlook's own folders it is (MAIL_FOLDER_KINDS); empty, one of the person's. */
  kind: MailFolderKind | "";
}

/**
 * Outlook's own folders, by their Exchange well-known names: whatever the
 * mailbox's language, they are recognized.
 */
export const MAIL_FOLDER_KINDS = ["inbox", "sentitems", "drafts", "deleteditems", "junkemail"] as const;
export type MailFolderKind = (typeof MAIL_FOLDER_KINDS)[number];

/** What the mail widgets that count read: the folders, and the mailboxes that failed. */
export interface AccessMailFolderCounts {
  folders: AccessMailFolderCount[];
  errors: { owner: string; message: string }[];
}

/**
 * What the mail "Indicateur" counts: the unread ones and the total, kept by
 * Exchange on each folder; those received since a moment, and those flagged,
 * counted by Graph ($count) — none of them reads an e-mail.
 */
export const MAIL_METRICS = ["unread", "total", "today", "flagged"] as const;
export type MailMetric = (typeof MAIL_METRICS)[number];

export const isMailMetric = (value: unknown): value is MailMetric =>
  MAIL_METRICS.includes(value as MailMetric);

/** The count of an "Indicateur", over every folder it reads. */
export interface AccessMailCount {
  value: number;
  errors: { owner: string; message: string }[];
}

/** An attachment of an opened email: its content is requested separately. */
export interface AccessMailAttachment {
  id: string;
  name: string;
  size: number;
}

/** An email opened in the drawer: its body, cleaned by the server, and the rest. */
export interface AccessMailDetail extends AccessMail {
  cc: MailAddress[];
  /** The body, as cleaned HTML: embedded images are already in it. */
  html: string;
  attachments: AccessMailAttachment[];
  /** The address of the message in Outlook on the web. */
  url: string;
}

// --- Assets mode -----------------------------------------------------------
// Machines, as an inventory agent (FusionInventory, GLPI Agent)
// describes them. Nothing is sorted for now: the inventory arrives whole, the
// list only shows the name, and the drawer unfolds everything else — it is by
// looking at it that we will decide what to keep.

/** An entry of a section: its fields, in the order the agent gives them. */
export type ManagedDeviceAssetEntry = Record<string, string>;

/**
 * A section of the inventory — BIOS, CPUS, SOFTWARES… Sections that
 * describe only one thing have a single entry; the others have as many as the
 * machine has memory modules, disks or software.
 */
export interface ManagedDeviceAssetSection {
  name: string;
  entries: ManagedDeviceAssetEntry[];
}

/** A machine in the list: its name, who uses it, its system disk. */
export interface ManagedDeviceAsset {
  id: Id;
  /** What the machine says about itself (HARDWARE/NAME). */
  name: string;
  /** The board of the list whose collectors name its tag; null otherwise. */
  board_id: Id | null;
  /** The "Assets" widget that shows it, the one that receives its tag; empty otherwise. */
  list_key: string;
  /**
   * The GLPI agent tag: an "Assets" list with a collector of that tag — case
   * aside — receives the machine.
   */
  tag: string;
  /** The asset labels of its board named as its tag. */
  labels: Label[];
  /**
   * The last person signed in on the machine, as the agent saw it:
   * the session open at the time of the inventory, or failing that the last
   * known login. Empty when the agent could not tell.
   */
  user: string;
  /**
   * The time of the last inventory, in ISO 8601: the one the agent records in it
   * (ACCESSLOG/LOGDATE), failing that that of its receipt.
   */
  last_inventory: string;
  /**
   * The system volume — "C:" on Windows, "/" elsewhere —, in MB, as
   * the agent measured it at the last inventory. Empty when the agent did not
   * declare it, or without a size.
   */
  system_disk: { free: number; total: number } | null;
  /** Is the system volume encrypted? "null" when the agent does not say. */
  system_disk_encrypted: boolean | null;
  /**
   * The system: its family, for the logo, its name as the agent gives it
   * ("Windows 11 Professionnel", "macOS"), its version ("23H2",
   * "14.5") and that of its kernel ("10.0.22631"). Empty when the agent does not
   * give them.
   */
  os: { family: ManagedDeviceAssetOsFamily; name: string; version: string; kernel: string } | null;
  /** The machine protection: antivirus, EPP or EDR. */
  protection: ManagedDeviceAssetProtection;
}

/** The system families the list can represent with a logo. */
export type ManagedDeviceAssetOsFamily =
  | "windows"
  | "macos"
  | "ubuntu"
  | "debian"
  | "redhat"
  | "fedora"
  | "linux"
  | "other";

/**
 * The protection of a machine, as Windows declares it to the security
 * center — the first active one, failing that the first known.
 *
 * "unknown": the agent says nothing, which is the rule outside Windows;
 * "none": Windows declares none.
 */
export interface ManagedDeviceAssetProtection {
  state: "active" | "inactive" | "none" | "unknown";
  name: string;
  company: string;
}

/** An open machine: everything the agent reported. */
export interface ManagedDeviceAssetDetail extends ManagedDeviceAsset {
  /** The id the agent gives itself: "poste-2026-09-28-14-22-31". */
  deviceid: string;
  /** The "tag" passed to the agent, as is. */
  tag: string;
  created_at: string;
  /**
   * The inventory sections, except those that only serve the server
   * (ACCESSLOG, ACCOUNTINFO) or that are not shown (ENVS, LICENSEINFOS,
   * VERSIONCLIENT, VERSIONPROVIDER).
   * Some are reduced to a few fields, others stripped of those that
   * tell nothing, and a few rows are dropped: the detail is in
   * repositories/assets.ts.
   */
  sections: ManagedDeviceAssetSection[];
  /**
   * The TeamViewer id of the machine, taken from REMOTE_MGMT. Empty when
   * TeamViewer is not installed — or when the agent could not read it.
   */
  teamviewer_id: string;
  /**
   * The address to reach the machine: that of an active network card,
   * failing that the one the machine declares. Empty when none fits — the
   * machine is then unreachable from the server, and the inventory cannot
   * be requested again.
   */
  address: string;
  /** The "Résumé" tab of the record: the essentials, taken from the inventory. */
  summary: ManagedDeviceAssetSummary;
  /**
   * The end of support of the system, according to endoflife.date. "null" when
   * unknown: unrecognized system, version missing from their list, or
   * unreachable service.
   */
  support: ManagedDeviceAssetSupport | null;
}

/** The end of support of a system, as endoflife.date publishes it. */
export interface ManagedDeviceAssetSupport {
  /** The recognized version, under the endoflife.date name: "11 25H2 (E)", "27". */
  cycle: string;
  /**
   * The end date of security fixes (AAAA-MM-JJ). "null" when
   * the vendor has not announced one yet.
   */
  eol: string | null;
  /** Is support over? True also when the date is not known. */
  ended: boolean;
}

/** A physical network card, as the summary shows it. */
export interface ManagedDeviceAssetNetwork {
  kind: "ethernet" | "wifi";
  /** The name of the card ("Intel(R) Wi-Fi 6 AX201"). */
  description: string;
  /** Its IPv4 addresses, in the agent's order. */
  ips: string[];
  /**
   * The Settings VLAN whose subnet contains one of its
   * addresses — the first that has one —, or null.
   */
  vlan: { vlan: number; name: string } | null;
}

/** The essentials of a machine. Each field is empty when the agent does not give it. */
export interface ManagedDeviceAssetSummary {
  /** The network card in use — at most one: connected, Wi-Fi first. */
  networks: ManagedDeviceAssetNetwork[];
  manufacturer: string;
  model: string;
  /** The manufacturer serial number (BIOS/SSN). */
  serial: string;
  /** "Intel(R) Core(TM) i7-1165G7 @ 2.80GHz", and how many there are. */
  cpu: { name: string; count: number; cores: number | null; threads: number | null } | null;
  /** The RAM, in MB. */
  memory: number | null;
  /** The system architecture: "ARM", "x64" or "x86"; empty if the agent does not say. */
  arch: "ARM" | "x64" | "x86" | "";
  /**
   * The system volume encryption, as the agent names it: "BitLocker",
   * "FileVault 2", and its algorithm ("XTS_AES_128"). Empty when the agent
   * does not give them; the algorithm is also empty when the volume is not
   * encrypted (the agent then writes "None").
   */
  encryption: { name: string; algorithm: string };
  /**
   * The firewall: active everywhere ("on"), nowhere ("off"), on only some
   * of the Windows profiles ("partial"), or "unknown" when
   * the agent says nothing. "disabled" names the disabled profiles: "Domaine",
   * "Privé", "Public".
   */
  firewall: { state: "on" | "off" | "partial" | "unknown"; disabled: string[] };
}

/** What an immediate inventory request returns. */
export interface ManagedDeviceAssetRefresh {
  /** The address actually called, to report it when it fails. */
  address: string;
}

/**
 * How an e-mail being written shows in its editor: "content", the text
 * alone; "layout", inside its template — what it opens on, unless the
 * profile says otherwise.
 */
export const REPLY_EDITOR_VIEWS = ["content", "layout"] as const;

export type ReplyEditorView = (typeof REPLY_EDITOR_VIEWS)[number];

export const isReplyEditorView = (value: unknown): value is ReplyEditorView =>
  (REPLY_EDITOR_VIEWS as readonly unknown[]).includes(value);

/** The search's tolerance by default: a letter or two off in a short word. */
export const DEFAULT_SEARCH_THRESHOLD = 0.45;
