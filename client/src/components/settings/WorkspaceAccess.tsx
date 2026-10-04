import { useCallback } from "react";
import { api } from "../../api";
import PrincipalsPermissions from "./PrincipalsPermissions";
import { WIDGET_ACCESS, WIDGET_KINDS, canRead, widgetRightsEverywhere } from "@milo/shared";
import type { EntraPrincipal, Id, WidgetAccess, WidgetRights } from "@milo/shared";

const pluralize = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;

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
      empty={() => widgetRightsEverywhere("")}
      summary={(widgets) => pluralize(Object.values(widgets).filter(canRead).length, "type")}
      // Une permission par type de widget, réglée à même la ligne, en
      // colonnes : un type de plus fait une colonne de plus.
      inColumns
      inline={(widgets, change) =>
        WIDGET_KINDS.map((k) => ({
          name: k.label,
          options: WIDGET_ACCESS,
          value: widgets[k.value],
          onChange: (value: string) =>
            change({ ...widgets, [k.value]: value as WidgetAccess }),
        }))
      }
      emptyText="Aucun accès pour le moment"
      onChange={onChange}
      removeDialog={{
        label: "Retirer l'accès",
        message: (name) => <>Voulez-vous vraiment retirer à « {name} » son accès à ce workspace ?</>,
      }}
    />
  );
}
