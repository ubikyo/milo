import { Button, Group } from "@mantine/core";
import { IconTrash } from "@tabler/icons-react";
import { RED } from "../../themes/colors";
import CloseButton from "./BoutonFermer";

// Le pied de tous les tiroirs. Il porte les trois gestes, toujours au même
// endroit : la suppression à gauche, « Fermer » et « Sauvegarder » à droite.
//
// Les tiroirs enregistraient jusqu'ici en se refermant — un clic au dehors
// suffisait. Rien ne distinguait donc « j'ai fini » de « je voulais juste
// regarder », et il n'y avait aucun moyen de renoncer à une saisie. Un tiroir
// n'enregistre plus que sur « Sauvegarder » — pas même sur Entrée, qui valide
// un champ sans dire qu'on a fini.
interface DrawerFooterProps {
  /**
   * Sans lui — sans le droit d'enregistrer —, le tiroir ne fait que montrer :
   * seul « Fermer » reste.
   */
  onSave?: () => void | Promise<void>;
  onClose: () => void;
  /** La suppression : seulement quand l'objet existe déjà. */
  onDelete?: () => void;
  /** Vrai pendant l'aller-retour au serveur, pour ne pas enregistrer deux fois. */
  saving?: boolean;
}

export default function DrawerFooter({
  onSave,
  onClose,
  onDelete,
  saving = false,
}: DrawerFooterProps) {
  return (
    // « mt: auto » colle le pied au bas du tiroir, quelle que soit la hauteur
    // de ce qui précède.
    <Group justify="space-between" wrap="nowrap" mt="auto" pt={40}>
      {/* Toujours un élément à gauche, même sans suppression : sans lui, les
          deux autres boutons se recentreraient. */}
      {onDelete ? (
        <Button
          color={RED}
          variant="subtle"
          leftSection={<IconTrash size={16} />}
          onClick={onDelete}
        >
          Supprimer
        </Button>
      ) : (
        <span />
      )}

      <Group gap="sm" wrap="nowrap">
        <CloseButton onClick={onClose} />
        {onSave && (
          <Button color="teal" onClick={onSave} loading={saving}>
            Sauvegarder
          </Button>
        )}
      </Group>
    </Group>
  );
}
