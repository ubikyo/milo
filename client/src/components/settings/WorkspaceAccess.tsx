import { useCallback } from "react";
import { api } from "../../api";
import PrincipalsPermissions from "./PrincipalsPermissions";
import { WIDGET_ACCESS, WIDGET_KINDS, peutLire, widgetRightsPartout } from "@milo/shared";
import type { EntraPrincipal, Id, WidgetAccess, WidgetRights } from "@milo/shared";

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? "s" : ""}`;

/**
 * Les accès d'un workspace, ouverts depuis sa ligne (WorkspacesTab) : les
 * utilisateurs et les groupes Entra qui y lisent au moins un type de widget,
 * et une permission par type — Aucun, Lire ou Modifier —, qui vaut pour le
 * widget comme pour ses données. Le Paramétrage et la gestion des workspaces
 * n'en font pas partie : ils valent pour toute l'application
 * (AdministrationTab).
 */
export default function WorkspaceAccess({
  workspace,
  onChange,
}: {
  workspace: Id;
  /** Après un changement : ses propres accès ont pu changer. */
  onChange?: () => void;
}) {
  const load = useCallback(() => api.getAssignments(workspace), [workspace]);

  return (
    <PrincipalsPermissions<WidgetRights>
      load={load}
      save={(principal: EntraPrincipal, widgets) =>
        api.setAssignments(principal, widgets, workspace)
      }
      remove={(principal) => api.deleteAssignments(principal, workspace)}
      vide={() => widgetRightsPartout("")}
      resume={(widgets) => pluriel(Object.values(widgets).filter(peutLire).length, "type")}
      sections={(widgets, changer) => [
        {
          label: "Par type de widget",
          lignes: WIDGET_KINDS.map((k) => ({
            nom: k.label,
            options: WIDGET_ACCESS,
            valeur: widgets[k.value],
            onChange: (valeur) => changer({ ...widgets, [k.value]: valeur as WidgetAccess }),
          })),
        },
      ]}
      emptyText="Aucun accès pour le moment"
      onChange={onChange}
      retirer={{
        label: "Retirer l'accès",
        message: (nom) => <>Voulez-vous vraiment retirer à « {nom} » son accès à ce workspace ?</>,
      }}
    />
  );
}
