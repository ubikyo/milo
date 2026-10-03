import { Group, Modal, Stack, Text } from "@mantine/core";
import { IconStack2, IconUsers } from "@tabler/icons-react";
import { useState } from "react";
import { api } from "../../api";
import { MODAL_PADDING, modalHeaderStyles } from "../../themes/modals";
import BoutonFermer from "../ui/BoutonFermer";
import LookupManager from "../ui/LookupManager";
import WorkspaceAccess from "./WorkspaceAccess";
import type { Workspace } from "@milo/shared";

interface WorkspacesTabProps {
  workspaces: Workspace[];
  /** Relit la liste — et le compte, dont le sélecteur la propose. */
  onChanged: () => Promise<void>;
  /** Relit le compte, après un changement des accès : le sélecteur en dépend. */
  onAccessChanged: () => void;
}

/**
 * Les workspaces : une équipe chacun, avec ses vues, ses tableaux et ses
 * contextes, isolés de ceux des autres. On les ajoute, les renomme et les
 * supprime ici ; leurs accès s'ouvrent au clic droit sur leur ligne, chacun
 * les siens. Le dernier ne se supprime pas.
 */
export default function WorkspacesTab({
  workspaces,
  onChanged,
  onAccessChanged,
}: WorkspacesTabProps) {
  // Le workspace dont la fenêtre des accès est ouverte.
  const [accesDe, setAccesDe] = useState<Workspace | null>(null);

  const puisRelire =
    <Args extends unknown[]>(action: (...args: Args) => Promise<unknown>) =>
    async (...args: Args) => {
      await action(...args);
      await onChanged();
    };

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        Un workspace naît avec une vue et son tableau, sans aucun accès :
        chacun a les siens, à régler par un clic droit sur sa ligne.
        Le supprimer emporte toutes ses vues et tout ce qu'elles contiennent.
      </Text>
      <LookupManager
        items={workspaces}
        addTitle="Ajouter un workspace"
        onCreate={puisRelire((name: string) => api.createWorkspace(name))}
        onUpdate={puisRelire((id: number, name: string) => api.updateWorkspace(id, name))}
        onDelete={puisRelire((id: number) => api.deleteWorkspace(id))}
        canDelete={() => workspaces.length > 1}
        renderActions={(item) => [
          {
            label: "Accès",
            icon: IconUsers,
            onClick: () => setAccesDe(workspaces.find((w) => w.id === item.id) ?? null),
          },
        ]}
        emptyIcon={IconStack2}
        entityLabel="workspace"
        maxRows={10}
      />

      <Modal
        opened={accesDe !== null}
        onClose={() => setAccesDe(null)}
        title={`Accès — ${accesDe?.name ?? ""}`}
        centered
        size="lg"
        padding={MODAL_PADDING}
        withCloseButton={false}
        styles={modalHeaderStyles(MODAL_PADDING)}
      >
        <Stack gap="xl">
          {accesDe && <WorkspaceAccess workspace={accesDe.id} onChange={onAccessChanged} />}
          <Group justify="flex-end">
            <BoutonFermer onClick={() => setAccesDe(null)} />
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
