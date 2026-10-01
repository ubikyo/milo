import { Button, Group } from "@mantine/core";
import { IconTrash } from "@tabler/icons-react";
import { useEffect, useLayoutEffect, useRef } from "react";
import { RED } from "../../themes/colors";
import BoutonFermer from "./BoutonFermer";

// Le pied de tous les tiroirs. Il porte les trois gestes, toujours au même
// endroit : la suppression à gauche, « Fermer » et « Sauvegarder » à droite.
//
// Les tiroirs enregistraient jusqu'ici en se refermant — un clic au dehors
// suffisait. Rien ne distinguait donc « j'ai fini » de « je voulais juste
// regarder », et il n'y avait aucun moyen de renoncer à une saisie. Un tiroir
// n'enregistre plus que sur « Sauvegarder » — ou sur Entrée dans un de ses
// champs d'une ligne, qui revient au même.
interface DrawerFooterProps {
  onSave: () => void | Promise<void>;
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
  const pied = useRef<HTMLDivElement | null>(null);
  // Les écouteurs sont posés une fois : ils lisent l'état courant par une ref.
  const etat = useRef({ onSave, saving });
  useLayoutEffect(() => {
    etat.current = { onSave, saving };
  });

  // Entrée enregistre, depuis un champ d'une ligne du tiroir. Gardent la leur :
  // une zone de texte ou l'éditeur (Entrée y va à la ligne), un bouton (il se
  // déclenche), une case ou un interrupteur, et tout champ qui s'en sert déjà —
  // une liste de choix ouverte, l'ajout d'une étiquette : ceux-là la
  // consomment (« preventDefault »). Écouté sur le document, après React : ce
  // que les champs en ont fait est alors connu.
  useEffect(() => {
    const surTouche = (event: KeyboardEvent) => {
      if (
        event.key !== "Enter" ||
        event.defaultPrevented ||
        event.isComposing ||
        event.shiftKey ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      )
        return;
      const champ = event.target as HTMLElement;
      // Seulement dans ce tiroir : une boîte ouverte par-dessus a ses propres
      // gestes.
      const tiroir = pied.current?.closest('[role="dialog"], .mantine-Drawer-content');
      if (!tiroir?.contains(champ)) return;
      if (
        champ.tagName !== "INPUT" ||
        ["checkbox", "radio", "file", "button", "submit"].includes((champ as HTMLInputElement).type)
      )
        return;
      event.preventDefault();
      if (!etat.current.saving) void etat.current.onSave();
    };
    document.addEventListener("keydown", surTouche);
    return () => document.removeEventListener("keydown", surTouche);
  }, []);

  return (
    // « mt: auto » colle le pied au bas du tiroir, quelle que soit la hauteur
    // de ce qui précède.
    <Group ref={pied} justify="space-between" wrap="nowrap" mt="auto" pt={40}>
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
        <BoutonFermer onClick={onClose} />
        <Button color="teal" onClick={onSave} loading={saving}>
          Sauvegarder
        </Button>
      </Group>
    </Group>
  );
}
