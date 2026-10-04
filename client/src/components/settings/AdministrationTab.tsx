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
const OUI_NON = [
  { value: "", label: "Non" },
  { value: "update", label: "Oui" },
] as const satisfies readonly { value: WorkspacesAccess & SettingsAccess; label: string }[];

/** Le Paramétrage par oui ou par non, et « Voir » seulement pour qui l'a déjà. */
const choixParametrage = (actuel: SettingsAccess) =>
  actuel === "view" ? [...OUI_NON, { value: "view", label: "Voir" }] : OUI_NON;

/** La largeur de la colonne « Workspaces » : de quoi lire son en-tête. */
const LARGEUR_WORKSPACES = 80;

/** Celle de la colonne « Paramétrage ». */
const LARGEUR_PARAMETRAGE = 80;

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
      // Deux permissions seulement : elles se règlent sur la ligne, en
      // colonnes comme les accès d'un workspace — le Paramétrage d'abord, puis
      // les workspaces, à l'ajout comme ensuite.
      enColonnes
      enLigne={(permissions, changer) => [
        {
          nom: "Paramétrage",
          options: choixParametrage(permissions.settings),
          valeur: permissions.settings,
          onChange: (valeur) => changer({ ...permissions, settings: valeur as SettingsAccess }),
          largeur: LARGEUR_PARAMETRAGE,
        },
        {
          nom: "Workspaces",
          options: OUI_NON,
          valeur: permissions.workspaces,
          largeur: LARGEUR_WORKSPACES,
          onChange: (valeur) =>
            changer({ ...permissions, workspaces: valeur as WorkspacesAccess }),
          disabled: !canManageWorkspaces,
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
