import { useCallback } from "react";
import { api } from "../../api";
import PrincipalsPermissions from "./PrincipalsPermissions";
import {
  SETTINGS_ACCESS,
  defaultAdminPermissions,
} from "@milo/shared";
import type { AdminPermissions, SettingsAccess, WorkspacesAccess } from "@milo/shared";

/**
 * Workspace management and "Paramétrage" are expressed as yes or no:
 * "update" for yes, in WORKSPACES_ACCESS as in SETTINGS_ACCESS. Read-only
 * "Paramétrage" ("view") can no longer be chosen; whoever still has it
 * sees it under "Voir", until they are given yes or no.
 */
const YES_NO = [
  { value: "", label: "Non" },
  { value: "update", label: "Oui" },
] as const satisfies readonly { value: WorkspacesAccess & SettingsAccess; label: string }[];

/** "Paramétrage" as yes or no, and "Voir" only for whoever already has it. */
const settingsChoice = (current: SettingsAccess) =>
  current === "view" ? [...YES_NO, { value: "view", label: "Voir" }] : YES_NO;

/** The width of the "Workspaces" column: enough to read its header. */
const WORKSPACES_WIDTH = 80;

/** That of the "Paramétrage" column. */
const SETTINGS_WIDTH = 80;

/** What it administers, at a glance. */
const summary = ({ settings, workspaces }: AdminPermissions): string =>
  [
    settings && `Paramétrage : ${SETTINGS_ACCESS.find((a) => a.value === settings)?.label}`,
    workspaces && "Workspaces",
  ]
    .filter(Boolean)
    .join(" · ");

/**
 * The application's administration: the Entra users and groups
 * who view or edit "Paramétrage", and those who manage workspaces.
 * It depends on no workspace — their access is set from
 * each one (WorkspacesTab). Only whoever manages workspaces can grant
 * that management.
 */
export default function AdministrationTab({
  canManageWorkspaces,
  onChange,
}: {
  canManageWorkspaces: boolean;
  /** After a change: one's own administration may have changed. */
  onChange?: () => void;
}) {
  const load = useCallback(() => api.getAdministration(), []);

  return (
    <PrincipalsPermissions<AdminPermissions>
      load={load}
      save={(principal, permissions) => api.setAdministration(principal, permissions)}
      remove={(principal) => api.deleteAdministration(principal)}
      empty={defaultAdminPermissions}
      summary={summary}
      // Only two permissions: they are set on the row, in
      // columns like a workspace's access — "Paramétrage" first, then
      // workspaces, on adding as afterwards.
      inColumns
      inline={(permissions, change) => [
        {
          name: "Paramétrage",
          options: settingsChoice(permissions.settings),
          value: permissions.settings,
          onChange: (value) => change({ ...permissions, settings: value as SettingsAccess }),
          width: SETTINGS_WIDTH,
        },
        {
          name: "Workspaces",
          options: YES_NO,
          value: permissions.workspaces,
          width: WORKSPACES_WIDTH,
          onChange: (value) =>
            change({ ...permissions, workspaces: value as WorkspacesAccess }),
          disabled: !canManageWorkspaces,
        },
      ]}
      emptyText="Aucun administrateur pour le moment"
      onChange={onChange}
      removeDialog={{
        label: "Retirer l'administration",
        message: (name) => (
          <>
            Voulez-vous vraiment retirer à « {name} » le Paramétrage et la gestion des
            workspaces ?
          </>
        ),
      }}
    />
  );
}
