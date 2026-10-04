import DeleteConfirmModal from "./DeleteConfirmModal";

interface InheritConfirmModalProps {
  opened: boolean;
  /** The state being left: true, "Hérité" is being unchecked; false, it is being checked. */
  inherited: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

/**
 * The confirmation asked when "Hérité" is toggled, in either direction.
 * Unchecking it leaves the shared structure — its sections and widgets — for
 * its own copy; checking it erases that copy. Each mode's tab menu places it.
 */
export default function InheritConfirmModal({
  opened,
  inherited,
  onClose,
  onConfirm,
}: InheritConfirmModalProps) {
  return inherited ? (
    <DeleteConfirmModal
      opened={opened}
      onClose={onClose}
      onConfirm={onConfirm}
      title="Retirer « Héritée »"
      message={
        <>
          Vous travaillerez sur votre propre copie des sections et des widgets : vous pourrez en
          modifier la structure sans toucher à celle des autres utilisateurs. Les changements de la
          structure partagée ne vous parviendront plus. Recocher « Héritée » effacera votre copie.
        </>
      }
      confirmLabel="Valider"
      cancelLabel="Annuler"
      confirmColor="teal"
    />
  ) : (
    // Erasing one's copy cannot be undone: the button is red, like a deletion.
    <DeleteConfirmModal
      opened={opened}
      onClose={onClose}
      onConfirm={onConfirm}
      title="Cocher « Héritée »"
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
