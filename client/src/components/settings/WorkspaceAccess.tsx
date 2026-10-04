import { useCallback } from "react";
import { api } from "../../api";
import PrincipalsPermissions from "./PrincipalsPermissions";
import { WIDGET_ACCESS, WIDGET_KINDS, canRead, widgetRightsEverywhere } from "@milo/shared";
import type { EntraPrincipal, Id, WidgetAccess, WidgetRights } from "@milo/shared";

const pluralize = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;

/**
 * A workspace's access, opened from its row (WorkspacesTab): the Entra
 * users and groups who read at least one widget type there, and one
 * permission per type — Aucun, Lire or Modifier —, which applies to the
 * widget as well as its data. Settings and workspace management are not
 * part of it: they apply to the whole application
 * (AdministrationTab).
 */
export default function WorkspaceAccess({
  workspace,
  onChange,
}: {
  workspace: Id;
  /** After a change: its own access may have changed. */
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
      // One permission per widget type, set inline in the row, in
      // columns: one more type makes one more column.
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
