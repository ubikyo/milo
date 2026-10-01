import { Box } from "@mantine/core";
import { useState } from "react";
import type { DragEvent } from "react";
import type { Id } from "@milo/shared";

// Le glisser-déposer des widgets d'une section, commun au mode Accès et aux
// panneaux des statistiques (SectionsBoard).
//
// Un widget se prend et se pose ailleurs : plus haut, plus bas, ou dans une
// autre section. On vise un widget, pas un interstice : survoler sa moitié
// haute pose avant lui, sa moitié basse après lui, et un trait le dit.
//
// Ce trait est posé par-dessus, en absolu. Une première version glissait de
// vraies fentes entre les widgets : elles s'ajoutaient à la hauteur de la
// colonne et faisaient descendre tout le contenu dès qu'on prenait un widget.
// Rien ne doit bouger tant que rien n'est déposé.
//
// Le glisser natif du navigateur suffit ici : un widget ne se réordonne pas
// au pixel comme une carte de tableau, il se pose entre deux autres.

/** Ce que la rangée des sections passe à ce qu'une section porte. */
export interface WidgetDrag {
  /** Le widget en cours de déplacement, ou « null » : il vient d'une section quelconque. */
  dragged: Id | null;
  onDragStart: (id: Id) => void;
  onDragEnd: () => void;
  /** Pose le widget déplacé dans cette section, à cette place. */
  onDrop: (sectionId: Id, index: number) => void;
}

/** Épaisseur du trait qui dit où le widget se posera. */
const TRAIT = 2;

/** Là où le widget tenu se posera : un widget, et de quel côté. */
export interface CibleWidget {
  id: Id;
  avant: boolean;
}

/**
 * Les gestes du glisser sur les widgets d'une section. « propsDe » se pose sur
 * ce qui enveloppe chaque widget ; « index » est sa place parmi ceux que la
 * section porte — celle que le dépôt attend.
 */
export const useWidgetDrop = (sectionId: Id, drag: WidgetDrag, locked: boolean) => {
  const [cible, setCible] = useState<CibleWidget | null>(null);

  const propsDe = (id: Id, index: number) => ({
    draggable: !locked,
    onDragStart: (e: DragEvent<HTMLElement>) => {
      // Certains navigateurs n'amorcent pas le glisser sans charge.
      e.dataTransfer.setData("text/plain", String(id));
      e.dataTransfer.effectAllowed = "move";
      drag.onDragStart(id);
    },
    onDragEnd: () => {
      setCible(null);
      drag.onDragEnd();
    },
    onDragOver: (e: DragEvent<HTMLElement>) => {
      if (drag.dragged === null || locked) return;
      e.preventDefault();
      const cadre = e.currentTarget.getBoundingClientRect();
      setCible({ id, avant: e.clientY < cadre.top + cadre.height / 2 });
    },
    onDragLeave: () => setCible((c) => (c?.id === id ? null : c)),
    onDrop: (e: DragEvent<HTMLElement>) => {
      if (drag.dragged === null || locked) return;
      e.preventDefault();
      const avant = cible?.avant ?? true;
      setCible(null);
      drag.onDrop(sectionId, avant ? index : index + 1);
    },
  });

  return { cible, propsDe };
};

/**
 * Le trait d'insertion, posé par-dessus le widget visé : il ne prend aucune
 * place, donc rien ne bouge tant que rien n'est déposé. « ecart » : l'air
 * entre deux widgets, au milieu duquel le trait se pose.
 */
export function TraitInsertion({ avant, ecart = 0 }: { avant: boolean; ecart?: number }) {
  return (
    <Box
      aria-hidden
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        [avant ? "top" : "bottom"]: -(ecart + TRAIT) / 2 - (ecart ? 0 : TRAIT / 2),
        height: TRAIT,
        borderRadius: TRAIT,
        backgroundColor: "var(--mantine-color-teal-filled)",
        pointerEvents: "none",
      }}
    />
  );
}
