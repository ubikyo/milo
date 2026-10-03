import { useCallback } from "react";
import { api } from "../../api";
import PrincipalsPermissions from "./PrincipalsPermissions";
import {
  SETTINGS_ACCESS,
  WORKSPACES_ACCESS,
  defaultAdminPermissions,
} from "@milo/shared";
import type { AdminPermissions, SettingsAccess, WorkspacesAccess } from "@milo/shared";

/** Ce qu'il administre, d'un coup d'œil. */
const resume = ({ settings, workspaces }: AdminPermissions): string =>
  [
    settings && `Paramétrage : ${SETTINGS_ACCESS.find((a) => a.value === settings)?.label}`,
    workspaces && "Workspaces",
  ]
    .filter(Boolean)
    .join(" · ");

/**
 * L'administration de l'application : les utilisateurs et les groupes Entra
 * qui voient ou modifient le Paramétrage, et ceux qui gèrent les workspaces.
 * Elle ne dépend d'aucun workspace — leurs accès, eux, se règlent depuis
 * chacun (WorkspacesTab). Seul qui gère les workspaces peut en accorder la
 * gestion.
 */
export default function AdministrationTab({
  canManageWorkspaces,
  onChange,
}: {
  canManageWorkspaces: boolean;
  /** Après un changement : sa propre administration a pu changer. */
  onChange?: () => void;
}) {
  const load = useCallback(() => api.getAdministration(), []);

  return (
    <PrincipalsPermissions<AdminPermissions>
      load={load}
      save={(principal, permissions) => api.setAdministration(principal, permissions)}
      remove={(principal) => api.deleteAdministration(principal)}
      vide={defaultAdminPermissions}
      resume={resume}
      sections={(permissions, changer) => [
        {
          label: "Pour l'application",
          lignes: [
            {
              nom: "Paramétrage",
              options: SETTINGS_ACCESS,
              valeur: permissions.settings,
              onChange: (valeur) =>
                changer({ ...permissions, settings: valeur as SettingsAccess }),
            },
            {
              nom: "Workspaces",
              options: WORKSPACES_ACCESS,
              valeur: permissions.workspaces,
              onChange: (valeur) =>
                changer({ ...permissions, workspaces: valeur as WorkspacesAccess }),
              disabled: !canManageWorkspaces,
            },
          ],
        },
      ]}
      emptyText="Aucun administrateur pour le moment"
      onChange={onChange}
      retirer={{
        label: "Retirer l'administration",
        message: (nom) => (
          <>
            Voulez-vous vraiment retirer à « {nom} » le Paramétrage et la gestion des
            workspaces ?
          </>
        ),
      }}
    />
  );
}
