// A user's or group's access to a workspace: a permission per widget type
// (widget-kinds.ts), the notifications they receive there — on screen, by
// e-mail —, and what they may do with its interface. Without any notification
// right, the "Notifications" menu is not offered.

import { WIDGET_KINDS, validWidgetRights } from "./widget-kinds.js";
import type { WidgetRights } from "./widget-kinds.js";

export const NOTIFICATION_RIGHTS = [
  { value: "screen", label: "Notifications à l'écran" },
  { value: "email", label: "Notifications par e-mail" },
] as const;

export type NotificationRight = (typeof NOTIFICATION_RIGHTS)[number]["value"];

/** What someone may receive, right by right. */
export type NotificationRights = { [R in NotificationRight]: boolean };

/**
 * What one may do with the workspace's interface: modify it — its views,
 * boards, sections, the widgets placed there —, and import or export a
 * board's layout. Each one is a yes or a no.
 */
export const APPLICATION_RIGHTS = [
  { value: "interface", label: "Modifier" },
  { value: "layout", label: "Import / export" },
] as const;

export type ApplicationRight = (typeof APPLICATION_RIGHTS)[number]["value"];

/** What someone may do, right by right. */
export type ApplicationRights = { [R in ApplicationRight]: boolean };

/**
 * The workspace's structure — its views, their boards, a board's contexts —
 * and what one may do with each: read it (without it, nothing of it is
 * shown), create one, delete one. Renaming and reordering follow the right
 * to modify the interface.
 */
export const STRUCTURE_SECTIONS = [
  { value: "views", label: "Vue" },
  { value: "boards", label: "Tableau" },
  { value: "contexts", label: "Contexte" },
] as const;

export const STRUCTURE_RIGHTS = [
  { value: "view", label: "Lire" },
  { value: "create", label: "Créer" },
  { value: "delete", label: "Supprimer" },
] as const;

export type StructureSection = (typeof STRUCTURE_SECTIONS)[number]["value"];
export type StructureRight = (typeof STRUCTURE_RIGHTS)[number]["value"];

/** The rights held on each part of the structure. */
export type StructurePermissions = Record<StructureSection, StructureRight[]>;

/** What someone may do with each part of the structure, right by right. */
export type StructureRights = Record<StructureSection, Record<StructureRight, boolean>>;

/** Structure rights received from outside, reduced to what exists, in order. */
export const validStructurePermissions = (value: unknown): StructurePermissions => {
  const source = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return Object.fromEntries(
    STRUCTURE_SECTIONS.map((s) => {
      const list = Array.isArray(source[s.value]) ? (source[s.value] as unknown[]) : [];
      return [s.value, STRUCTURE_RIGHTS.map((r) => r.value).filter((r) => list.includes(r))];
    }),
  ) as StructurePermissions;
};

/** Several sets combined — one's own and one's groups': each right held by one. */
export const mergeStructureRights = (sets: StructurePermissions[]): StructureRights =>
  Object.fromEntries(
    STRUCTURE_SECTIONS.map((s) => [
      s.value,
      Object.fromEntries(
        STRUCTURE_RIGHTS.map((r) => [r.value, sets.some((p) => p[s.value].includes(r.value))]),
      ),
    ]),
  ) as StructureRights;

/** Every right on the structure: the "admin" account's. */
export const fullStructureRights = (): StructureRights =>
  mergeStructureRights([
    Object.fromEntries(
      STRUCTURE_SECTIONS.map((s) => [s.value, STRUCTURE_RIGHTS.map((r) => r.value)]),
    ) as StructurePermissions,
  ]);

export interface WorkspacePermissions {
  widgets: WidgetRights;
  notifications: NotificationRight[];
  application: ApplicationRight[];
  structure: StructurePermissions;
}

/** That of someone who has none yet: nothing. */
export const emptyWorkspacePermissions = (): WorkspacePermissions => ({
  widgets: validWidgetRights({}),
  notifications: [],
  application: [],
  structure: validStructurePermissions({}),
});

/** Application rights received from outside, reduced to what exists, in order. */
export const validApplicationRights = (value: unknown): ApplicationRight[] => {
  const list = Array.isArray(value) ? value : [];
  return APPLICATION_RIGHTS.map((r) => r.value).filter((r) => list.includes(r));
};

/** Every right on the interface: the "admin" account's. */
export const fullApplicationRights = (): ApplicationRights =>
  mergeApplicationRights([APPLICATION_RIGHTS.map((r) => r.value)]);

/** Several sets combined — one's own and one's groups': each right held by one. */
export const mergeApplicationRights = (sets: ApplicationRight[][]): ApplicationRights =>
  Object.fromEntries(
    APPLICATION_RIGHTS.map((r) => [r.value, sets.some((s) => s.includes(r.value))]),
  ) as ApplicationRights;

/** Notification rights received from outside, reduced to what exists, in order. */
export const validNotificationRights = (value: unknown): NotificationRight[] => {
  const list = Array.isArray(value) ? value : [];
  return NOTIFICATION_RIGHTS.map((r) => r.value).filter((r) => list.includes(r));
};

/** Several sets combined — one's own and one's groups': each right held by one. */
export const mergeNotificationRights = (sets: NotificationRight[][]): NotificationRights =>
  Object.fromEntries(
    NOTIFICATION_RIGHTS.map((r) => [r.value, sets.some((s) => s.includes(r.value))]),
  ) as NotificationRights;

/** Does it grant anything at all — a widget type to read, a notification? */
export const grantsAnything = (p: WorkspacePermissions): boolean =>
  p.notifications.length > 0 ||
  p.application.length > 0 ||
  STRUCTURE_SECTIONS.some((s) => p.structure[s.value].length > 0) ||
  WIDGET_KINDS.some((k) => p.widgets[k.value] !== "");
