import { Group, Modal } from "@mantine/core";
import { IconFlag } from "@tabler/icons-react";
import { useState } from "react";
import { api } from "../../api";
import { MODAL_PADDING, modalHeaderStyles } from "../../themes/modals";
import BoutonFermer from "../ui/BoutonFermer";
import LookupManager from "../ui/LookupManager";
import MilestonesModal from "./MilestonesModal";
import type { Milestone, MilestoneType } from "@milo/shared";

interface MilestoneTypesModalProps {
  opened: boolean;
  onClose: () => void;
  /** Les types de jalons (Commande, Développement…) que les projets choisissent. */
  milestoneTypes: MilestoneType[];
  /** Relire ce que l'application affiche après chaque geste. */
  onChanged: () => void | Promise<void>;
}

/**
 * Les types de jalons, communs à tous les tableaux de projets, ouverts depuis
 * le menu d'un onglet. Chaque type porte ses jalons, réglés dans la fenêtre
 * qu'ouvre le menu de sa ligne (« Jalons »). Le supprimer ne supprime aucun
 * projet : ceux qui le portaient gardent leur avancement, sans marques.
 */
export default function MilestoneTypesModal({
  opened,
  onClose,
  milestoneTypes,
  onChanged,
}: MilestoneTypesModalProps) {
  // Le type dont la fenêtre des jalons est ouverte.
  const [jalonsDe, setJalonsDe] = useState<number | null>(null);

  /** Un appel à l'API, suivi du rechargement de ce que l'application affiche. */
  const puisRelire =
    <Args extends unknown[]>(fn: (...args: Args) => Promise<unknown>) =>
    async (...args: Args) => {
      await fn(...args);
      await onChanged();
    };

  return (
    <>
      <Modal
        opened={opened}
        onClose={onClose}
        title="Jalons"
        centered
        size="lg"
        padding={MODAL_PADDING}
        withCloseButton={false}
        styles={modalHeaderStyles(MODAL_PADDING)}
      >
        <LookupManager
          items={milestoneTypes}
          onCreate={puisRelire(api.createMilestoneType)}
          onUpdate={puisRelire((id: number, name: string) =>
            api.updateMilestoneType(id, { name }),
          )}
          onDelete={puisRelire(api.deleteMilestoneType)}
          addTitle="Nouveau type de jalons"
          maxRows={8}
          minRows={8}
          emptyIcon={IconFlag}
          emptyText="Aucun type de jalons pour le moment"
          entityLabel="le type de jalons"
          renderActions={(item) => [
            {
              label: "Jalons",
              icon: IconFlag,
              onClick: () => setJalonsDe(item.id),
            },
          ]}
        />
        <Group justify="flex-end" mt={MODAL_PADDING}>
          <BoutonFermer onClick={onClose} />
        </Group>
      </Modal>

      <MilestonesModal
        type={milestoneTypes.find((t) => t.id === jalonsDe) ?? null}
        onClose={() => setJalonsDe(null)}
        onSave={puisRelire(async (milestones: Milestone[]) => {
          if (jalonsDe !== null) await api.updateMilestoneType(jalonsDe, { milestones });
        })}
      />
    </>
  );
}
