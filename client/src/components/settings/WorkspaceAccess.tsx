import { useCallback } from "react";
import { api } from "../../api";
import PrincipalsPermissions from "./PrincipalsPermissions";
import SectionRights from "./SectionRights";
import type { RightsSection, SectionPermissions } from "./SectionRights";
import { usePermissionsDraft } from "./usePermissionsDraft";
import type { SaveRef } from "./usePermissionsDraft";
import { pluralize, ROW_BACKGROUND } from "../ui/DrawerRows";
import {
  APPLICATION_RIGHTS,
  NOTIFICATION_RIGHTS,
  STRUCTURE_RIGHTS,
  STRUCTURE_SECTIONS,
  WIDGET_ACCESS,
  WIDGET_KINDS,
  emptyWorkspacePermissions,
  validApplicationRights,
  validNotificationRights,
  validStructurePermissions,
} from "@milo/shared";
import type {
  Id,
  StructureSection,
  WidgetAccess,
  WidgetRights,
  WorkspacePermissions,
} from "@milo/shared";

/** The section of the notifications, under "Application". */
const NOTIFICATIONS = "notifications";

/** The section of the interface rights, under "Application". */
const INTERFACE = "interface-rights";

/** A widget type's rights, in their order: each one brings the previous ones. */
const LEVELS = WIDGET_ACCESS.filter((a) => a.value !== "");

/** The views and boards, as the access lists them. */
const STRUCTURE_LABELS: Record<StructureSection, string> = {
  views: "Gestion des vues",
  boards: "Gestion des tableaux",
};

/**
 * One section per widget type, under "Widgets" — Utiliser, Modifier,
 * Supprimer —, then under "Application" the notifications — À l'écran, Par
 * e-mail —, the layout of the views — Modifier la disposition, Import /
 * export —, and the views and boards — Créer, Supprimer. Each label says what
 * it is about: "Widget Commun", "Gestion des vues".
 */
const SECTIONS: RightsSection[] = [
  ...WIDGET_KINDS.map((k) => ({
    value: k.value,
    label: `Widget ${k.label}`,
    group: "Widgets",
    rights: LEVELS,
  })),
  {
    value: NOTIFICATIONS,
    label: "Recevoir des notifications",
    group: "Application",
    rights: NOTIFICATION_RIGHTS,
  },
  {
    value: INTERFACE,
    label: "Gestion de la disposition des vues",
    group: "Application",
    rights: APPLICATION_RIGHTS,
  },
  ...STRUCTURE_SECTIONS.map((s) => ({
    value: s.value,
    label: STRUCTURE_LABELS[s.value],
    group: "Application",
    rights: STRUCTURE_RIGHTS,
  })),
];

const isStructure = (section: string) => STRUCTURE_SECTIONS.some((s) => s.value === section);

/** A level's rank among the rights: 0 for none. */
const rank = (access: string) => LEVELS.findIndex((l) => l.value === access) + 1;

/** A type's level as rights: it holds the lower ones too. */
const levelRights = (access: WidgetAccess): string[] =>
  LEVELS.slice(0, rank(access)).map((l) => l.value);

const toSections = (p: WorkspacePermissions): SectionPermissions => ({
  ...Object.fromEntries(WIDGET_KINDS.map((k) => [k.value, levelRights(p.widgets[k.value])])),
  [NOTIFICATIONS]: p.notifications,
  [INTERFACE]: p.application,
  ...p.structure,
});

const fromSections = (s: SectionPermissions): WorkspacePermissions => ({
  widgets: Object.fromEntries(
    WIDGET_KINDS.map((k) => {
      const held = s[k.value] ?? [];
      // The highest right held.
      const level = [...LEVELS].reverse().find((l) => held.includes(l.value));
      return [k.value, level?.value ?? ""];
    }),
  ) as WidgetRights,
  notifications: validNotificationRights(s[NOTIFICATIONS]),
  application: validApplicationRights(s[INTERFACE]),
  structure: validStructurePermissions(
    Object.fromEntries(STRUCTURE_SECTIONS.map((x) => [x.value, s[x.value] ?? []])),
  ),
});

/**
 * A widget type's rights stay a level: a right chosen brings the lower ones,
 * a right removed takes the higher ones with it — one cannot delete what one
 * cannot modify, nor modify what one cannot use. On views and boards,
 * deleting brings creating, and creating removed takes deleting away. The
 * notifications and application rights are independent.
 */
const normalize = (section: string, before: string[], after: string[]): string[] => {
  if (isStructure(section)) {
    if (before.includes("create") && !after.includes("create")) return [];
    return after.includes("delete") && !after.includes("create") ? ["create", ...after] : after;
  }
  if (!WIDGET_KINDS.some((k) => k.value === section)) return after;
  const removed = LEVELS.find((l) => before.includes(l.value) && !after.includes(l.value));
  const top = removed
    ? rank(removed.value) - 1
    : Math.max(0, ...after.map((r) => rank(r)));
  return LEVELS.slice(0, top).map((l) => l.value);
};

const same = (a: WorkspacePermissions, b: WorkspacePermissions) =>
  WIDGET_KINDS.every((k) => a.widgets[k.value] === b.widgets[k.value]) &&
  a.notifications.length === b.notifications.length &&
  a.notifications.every((n) => b.notifications.includes(n)) &&
  a.application.length === b.application.length &&
  a.application.every((r) => b.application.includes(r)) &&
  STRUCTURE_SECTIONS.every(
    (x) => a.structure[x.value].join() === b.structure[x.value].join(),
  );

/** How many sections it has rights in: "3 autorisations". */
const summary = (p: WorkspacePermissions) =>
  pluralize(
    WIDGET_KINDS.filter((k) => p.widgets[k.value] !== "").length +
      (p.notifications.length > 0 ? 1 : 0) +
      (p.application.length > 0 ? 1 : 0) +
      STRUCTURE_SECTIONS.filter((x) => p.structure[x.value].length > 0).length,
    "autorisation",
  );

/**
 * A workspace's access, opened from its row (WorkspacesTab): the Entra users
 * and groups, and their rights there — per widget type, which applies to the
 * widget as well as its data, the notifications they receive, what they may
 * do with the interface, and with its views and boards. As in the
 * administration, a chevron unfolds them under the row; someone just added
 * has none. Unlike it, one's own access can be changed: it only concerns this
 * workspace. Nothing goes to the server before the modal's "Enregistrer"
 * (usePermissionsDraft). Rights on Settings and on workspaces are not part of
 * it: they apply to the whole application (AdministrationTab).
 */
export default function WorkspaceAccess({
  workspace,
  readOnly = false,
  invite = false,
  saveRef,
  onChange,
}: {
  workspace: Id;
  /** Those just added receive the "Nouvel accès à un élément" e-mail, on save. */
  invite?: boolean;
  /** Without the "Créer" right on workspaces: shown, not changed. */
  readOnly?: boolean;
  /** Where the tab deposits its save function, for the modal's "Enregistrer". */
  saveRef?: SaveRef;
  /** After a save: its own access may have changed. */
  onChange?: () => void;
}) {
  const read = useCallback(() => api.getAssignments(workspace), [workspace]);
  const draft = usePermissionsDraft<WorkspacePermissions>({
    read,
    write: (principal, permissions) =>
      api.setAssignments(principal, permissions, workspace, invite),
    erase: (principal) => api.deleteAssignments(principal, workspace),
    same,
    saveRef,
    onSaved: onChange,
  });

  return (
    <PrincipalsPermissions<WorkspacePermissions>
      load={draft.load}
      save={draft.save}
      remove={draft.remove}
      empty={emptyWorkspacePermissions}
      summary={summary}
      // As in the administration (AdministrationTab).
      headerBackground={ROW_BACKGROUND}
      details={(permissions, change) => (
        <SectionRights
          sections={SECTIONS}
          permissions={toSections(permissions)}
          onChange={(p) => change(fromSections(p))}
          normalize={normalize}
          readOnly={readOnly}
          attached
        />
      )}
      emptyText="Aucun accès pour le moment"
      readOnly={readOnly}
      protectOwn={false}
      removeDialog={{
        label: "Retirer l'accès",
        message: (name) => <>Voulez-vous vraiment retirer à « {name} » son accès à ce workspace ?</>,
      }}
    />
  );
}
