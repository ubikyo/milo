import { useCallback } from "react";
import { api } from "../../api";
import PrincipalsPermissions from "./PrincipalsPermissions";
import SectionRights from "./SectionRights";
import type { SectionPermissions } from "./SectionRights";
import { usePermissionsDraft } from "./usePermissionsDraft";
import type { SaveRef } from "./usePermissionsDraft";
import { pluralize } from "../ui/DrawerRows";
import { ADMIN_SECTIONS, defaultAdminPermissions, validAdminPermissions } from "@milo/shared";
import type { AdminPermissions, WorkspaceRights } from "@milo/shared";

/** What it administers, at a glance: its number of rights, "3 autorisations". */
const summary = (permissions: AdminPermissions): string => {
  const count = ADMIN_SECTIONS.reduce((n, s) => n + permissions[s.value].length, 0);
  return pluralize(count, "autorisation");
};

/** Two administrations with the same rights, whatever their order. */
const same = (a: AdminPermissions, b: AdminPermissions) =>
  ADMIN_SECTIONS.every(
    (s) =>
      a[s.value].length === b[s.value].length &&
      (a[s.value] as string[]).every((r) => (b[s.value] as string[]).includes(r)),
  );

/**
 * The application's administration: the Entra users and groups, and their
 * rights on "Paramétrage" and on workspaces. It depends on no workspace —
 * their access is set from each one (WorkspacesTab). A chevron unfolds
 * someone's rights under their row; someone just added has none. A right on
 * workspaces is only granted or removed by whoever holds it; the author's
 * own rights, and their groups', are only added to. Nothing goes to the
 * server before the modal's "Enregistrer" (usePermissionsDraft).
 */
export default function AdministrationTab({
  workspaceRights,
  saveRef,
  onChange,
}: {
  /** The author's rights on workspaces: those they can grant. */
  workspaceRights: WorkspaceRights;
  /** Where the tab deposits its save function, for the modal's "Enregistrer". */
  saveRef?: SaveRef;
  /** After a save: one's own administration may have changed. */
  onChange?: () => void;
}) {
  const read = useCallback(() => api.getAdministration(), []);
  const draft = usePermissionsDraft<AdminPermissions>({
    read,
    write: api.setAdministration,
    erase: api.deleteAdministration,
    same,
    saveRef,
    onSaved: onChange,
  });

  return (
    <PrincipalsPermissions<AdminPermissions>
      load={draft.load}
      save={draft.save}
      remove={draft.remove}
      empty={defaultAdminPermissions}
      summary={summary}
      details={(permissions, change, entry) => (
        <SectionRights
          sections={ADMIN_SECTIONS}
          permissions={permissions as SectionPermissions}
          onChange={(p) => change(validAdminPermissions(p))}
          canGrant={(section, right) =>
            section !== "workspaces" || workspaceRights[right as keyof WorkspaceRights]
          }
          // Their own saved rights, or their group's, stay.
          kept={entry.own ? (draft.savedOf(entry.principal) as SectionPermissions) : undefined}
          attached
        />
      )}
      emptyText="Aucun administrateur pour le moment"
      removeDialog={{
        label: "Retirer l'administration",
        message: (name) => (
          <>
            Voulez-vous vraiment retirer à « {name} » ses droits sur le Paramétrage et les
            workspaces ?
          </>
        ),
      }}
    />
  );
}
