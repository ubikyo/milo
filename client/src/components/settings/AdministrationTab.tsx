import { useCallback } from "react";
import { api } from "../../api";
import PrincipalsPermissions from "./PrincipalsPermissions";
import {
  SETTINGS_ACCESS,
  defaultAdminPermissions,
} from "@milo/shared";
import type { AdminPermissions, SettingsAccess, WorkspacesAccess } from "@milo/shared";

/**
 * La gestion des workspaces et le Paramétrage se disent par oui ou par non :
 * « update » pour oui, dans WORKSPACES_ACCESS comme dans SETTINGS_ACCESS. Le
 * Paramétrage en lecture seule (« view ») ne se choisit plus ; qui l'a encore
 * le voit sous « Voir », le temps qu'on lui donne oui ou non.
 */
const YES_NO = [
  { value: "", label: "Non" },
  { value: "update", label: "Oui" },
] as const satisfies readonly { value: WorkspacesAccess & SettingsAccess; label: string }[];

/** Le Paramétrage par oui ou par non, et « Voir » seulement pour qui l'a déjà. */
const settingsChoice = (current: SettingsAccess) =>
  current === "view" ? [...YES_NO, { value: "view", label: "Voir" }] : YES_NO;

/** La largeur de la colonne « Workspaces » : de quoi lire son en-tête. */
const WORKSPACES_WIDTH = 80;

/** Celle de la colonne « Paramétrage ». */
const SETTINGS_WIDTH = 80;

/** Ce qu'il administre, d'un coup d'œil. */
const summary = ({ settings, workspaces }: AdminPermissions): string =>
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
      empty={defaultAdminPermissions}
      summary={summary}
      // Deux permissions seulement : elles se règlent sur la ligne, en
      // colonnes comme les accès d'un workspace — le Paramétrage d'abord, puis
      // les workspaces, à l'ajout comme ensuite.
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
