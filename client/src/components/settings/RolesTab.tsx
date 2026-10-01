import { IconShieldLock } from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "../../api";
import LookupManager from "../ui/LookupManager";
import RoleRightsModal from "./RoleRightsModal";
import type { Permissions, Role } from "@milo/shared";

/**
 * Les rôles : la même liste que les sociétés, et dans le menu de chaque ligne
 * « Permissions », qui ouvre sa grille de droits. L'administrateur est en tête, et
 * ne se supprime pas.
 */
export default function RolesTab() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [droitsDe, setDroitsDe] = useState<number | null>(null);

  const reload = useCallback(async () => setRoles(await api.getRoles()), []);

  useEffect(() => {
    reload();
  }, [reload]);

  /** Un appel à l'API, suivi de la relecture de la liste. */
  const puisRelire =
    <Args extends unknown[]>(fn: (...args: Args) => Promise<unknown>) =>
    async (...args: Args) => {
      await fn(...args);
      await reload();
    };

  return (
    <>
      <LookupManager
        items={roles}
        onCreate={puisRelire(api.createRole)}
        onUpdate={puisRelire((id: number, name: string) =>
          api.updateRole(id, { name }),
        )}
        onDelete={puisRelire(api.deleteRole)}
        canDelete={(item) => !roles.find((r) => r.id === item.id)?.is_admin}
        addTitle="Nouveau rôle"
        maxRows={10}
        emptyIcon={IconShieldLock}
        emptyText="Aucun rôle pour le moment"
        entityLabel="le rôle"
        renderActions={(item) => [
          {
            label: "Permissions",
            icon: IconShieldLock,
            onClick: () => setDroitsDe(item.id),
          },
        ]}
      />

      <RoleRightsModal
        role={roles.find((r) => r.id === droitsDe) ?? null}
        onClose={() => setDroitsDe(null)}
        onSave={puisRelire(async (permissions: Permissions) => {
          if (droitsDe !== null)
            await api.updateRole(droitsDe, { permissions });
        })}
      />
    </>
  );
}
