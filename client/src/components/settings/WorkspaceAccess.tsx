import { useCallback } from "react";
import { api } from "../../api";
import PrincipalsPermissions from "./PrincipalsPermissions";
import SectionRights from "./SectionRights";
import type { RightsSection, SectionPermissions } from "./SectionRights";
import { usePermissionsDraft } from "./usePermissionsDraft";
import type { SaveRef } from "./usePermissionsDraft";
import { pluralize } from "../ui/DrawerRows";
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
import type { Id, WidgetAccess, WidgetRights, WorkspacePermissions } from "@milo/shared";

/** The section of the notifications, under "Application". */
const NOTIFICATIONS = "notifications";

/** The section of the interface rights, under "Application". */
const INTERFACE = "interface-rights";

/** A widget type's rights, in their order: each one brings the previous ones. */
const LEVELS = WIDGET_ACCESS.filter((a) => a.value !== "");

/**
 * One section per widget type, under "Widgets" — Lire, Modifier, Supprimer —,
 * then under "Application" the notifications, the interface — Modifier,
 * Import / export, Rendre privé, Désactiver héritage —, and the views, boards and contexts — Lire, Créer, Supprimer.
 */
const SECTIONS: RightsSection[] = [
  ...WIDGET_KINDS.map((k) => ({
    value: k.value,
    label: k.label,
    group: "Widgets",
    rights: LEVELS,
  })),
  {
    value: NOTIFICATIONS,
    label: "Notifications",
    group: "Application",
    rights: NOTIFICATION_RIGHTS,
  },
  {
    value: INTERFACE,
    label: "Interface",
    group: "Application",
    rights: APPLICATION_RIGHTS,
  },
  ...STRUCTURE_SECTIONS.map((s) => ({
    value: s.value,
    label: s.label,
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
 * cannot modify, nor modify what one cannot read. On views, boards and
 * contexts, creating or deleting brings reading, and reading removed takes
 * them away. The notifications and application rights are independent.
 */
const normalize = (section: string, before: string[], after: string[]): string[] => {
  if (isStructure(section)) {
    if (before.includes("view") && !after.includes("view")) return [];
    return after.length > 0 && !after.includes("view") ? ["view", ...after] : after;
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
 * do with the interface, and with its views, boards and contexts. As in the
 * administration, a chevron unfolds them under the row; someone just added
 * has none. Unlike it, one's own access can be changed: it only concerns this
 * workspace. Nothing goes to the server before the modal's "Enregistrer"
 * (usePermissionsDraft). Rights on Settings and on workspaces are not part of
 * it: they apply to the whole application (AdministrationTab).
 */
export default function WorkspaceAccess({
  workspace,
  readOnly = false,
  saveRef,
  onChange,
}: {
  workspace: Id;
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
    write: (principal, permissions) => api.setAssignments(principal, permissions, workspace),
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
