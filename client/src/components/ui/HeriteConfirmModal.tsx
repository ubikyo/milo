import DeleteConfirmModal from "./DeleteConfirmModal";

interface HeriteConfirmModalProps {
  opened: boolean;
  /** L'état qu'on quitte : vrai, on décoche « Hérité » ; faux, on le coche. */
  inherited: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

/**
 * La confirmation demandée quand on bascule « Hérité », dans un sens comme
 * dans l'autre. Le décocher quitte la structure partagée — ses sections et
 * ses widgets — pour sa propre copie ; le cocher efface cette copie. Le menu
 * d'onglet de chaque mode la pose.
 */
export default function HeriteConfirmModal({
  opened,
  inherited,
  onClose,
  onConfirm,
}: HeriteConfirmModalProps) {
  return inherited ? (
    <DeleteConfirmModal
      opened={opened}
      onClose={onClose}
      onConfirm={onConfirm}
      title="Retirer « Hérité »"
      message={
        <>
          Vous travaillerez sur votre propre copie des sections et des widgets : vous pourrez en
          modifier la structure sans toucher à celle des autres utilisateurs. Les changements de la
          structure partagée ne vous parviendront plus. Recocher « Hérité » effacera votre copie.
        </>
      }
      confirmLabel="Valider"
      cancelLabel="Annuler"
      confirmColor="teal"
    />
  ) : (
    // Effacer sa copie ne se rattrape pas : le bouton est rouge, comme une
    // suppression.
    <DeleteConfirmModal
      opened={opened}
      onClose={onClose}
      onConfirm={onConfirm}
      title="Cocher « Hérité »"
      message={
        <>
          Vous retrouverez la structure partagée et ses widgets. Votre propre copie des sections et
          des widgets sera effacée, avec tout ce que vous y avez modifié. Cette action est
          irréversible.
        </>
      }
      confirmLabel="Valider"
      cancelLabel="Annuler"
    />
  );
}

/** « Hérité » d'un panneau entier — Support, Assets, Projet, Tâche —, tel que les pages le reçoivent. */
export interface PanelInheritance {
  inherited: boolean;
  onToggle: () => void | Promise<void>;
}
