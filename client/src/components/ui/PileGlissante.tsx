import { Text } from "@mantine/core";
import { IconGripVertical } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { Id } from "@milo/shared";

// Le glisser-déposer d'une pile verticale : les checklists et leurs éléments
// (CardChecklists), les lignes d'attributs du mode Accès (widgets/numero).

/** Le glisser en cours : ce qu'on déplace, et le rang où il se posera. */
interface Glisser {
  id: Id;
  target: number;
}

/** Le même geste, suivi hors du rendu : il change à chaque mouvement. */
interface GlisserEnCours extends Glisser {
  index: number;
  startY: number;
  /** Faux tant que le pointeur n'a pas franchi le seuil de déclenchement. */
  started: boolean;
}

// Déplacement du pointeur à partir duquel on considère qu'il s'agit d'un
// glisser. Le même seuil que sur le tableau.
const DRAG_THRESHOLD = 4;

// Le trait d'insertion pendant un glisser : posé entre deux voisins, il ne
// prend aucune hauteur dans la pile — rien ne bouge, et les mesures prises au
// départ restent justes.
export function InsertLine({ gap = 0 }: { gap?: number }) {
  return (
    <div style={{ position: "relative", height: 0 }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: -gap / 2 - 1,
          borderTop: "2px solid var(--mantine-color-teal-5)",
        }}
      />
    </div>
  );
}

/**
 * Le glisser-déposer d'une pile, pour les checklists comme pour leurs
 * éléments. Rien ne bouge pendant le geste : ce qu'on déplace reste à sa
 * place, en transparence, et le trait d'insertion montre où il se posera. Les
 * positions mesurées valent donc du début à la fin.
 *
 * `selector` désigne, dans la zone, ce qui se glisse ; `onReorder` reçoit
 * l'ordre complet, une fois la main relâchée.
 */
export interface PileGlissante {
  ids: Id[];
  /** Ce qui, dans la zone, se glisse. */
  selector: string;
  onReorder: (ordre: Id[]) => void | Promise<void>;
}

export function usePileGlissante({ ids, selector, onReorder }: PileGlissante) {
  const [drag, setDrag] = useState<Glisser | null>(null);
  const dragRef = useRef<GlisserEnCours | null>(null);
  const zoneRef = useRef<HTMLDivElement | null>(null);
  // Le geste se joue sur des écouteurs posés une fois pour toutes : ils
  // lisent l'état courant par une ref, plutôt que de se réabonner à chaque
  // rendu.
  const etat = useRef({ ids, onReorder });
  etat.current = { ids, onReorder };

  const onPointerDown = (id: Id, index: number) => (event: ReactPointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    dragRef.current = {
      id,
      index,
      startY: event.clientY,
      started: false,
      target: index,
    };
  };

  useEffect(() => {
    const rangVise = (clientY: number): number | null => {
      const zone = zoneRef.current;
      if (!zone) return null;
      const lignes = [...zone.querySelectorAll(selector)];
      for (let i = 0; i < lignes.length; i += 1) {
        const rect = (lignes[i] as HTMLElement).getBoundingClientRect();
        if (clientY < rect.top + rect.height / 2) return i;
      }
      return lignes.length;
    };

    const onMove = (event: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      if (!d.started) {
        if (Math.abs(event.clientY - d.startY) < DRAG_THRESHOLD) return;
        d.started = true;
        document.body.style.userSelect = "none";
      }
      d.target = rangVise(event.clientY) ?? d.index;
      setDrag({ id: d.id, target: d.target });
    };

    const onUp = async () => {
      const d = dragRef.current;
      dragRef.current = null;
      document.body.style.userSelect = "";
      setDrag(null);
      if (!d || !d.started) return;

      // Le rang visé se lit sur la pile complète ; une fois l'élément ôté,
      // tout ce qui le suivait remonte d'un cran.
      const cible = d.target > d.index ? d.target - 1 : d.target;
      if (cible === d.index) return;
      const ordre = etat.current.ids.filter((id) => id !== d.id);
      ordre.splice(cible, 0, d.id);
      await etat.current.onReorder(ordre);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [selector]);

  return { zoneRef, drag, onPointerDown };
}

// La poignée par laquelle on glisse : seule elle déplace, tout le reste garde
// ses propres clics.
interface DragHandleProps {
  onPointerDown: (event: ReactPointerEvent) => void;
  visible?: boolean;
  label: string;
}

export function DragHandle({ onPointerDown, visible = true, label }: DragHandleProps) {
  return (
    <Text
      span
      c="dimmed"
      role="button"
      // Aucune infobulle : l'intitulé ne sert qu'au clavier et aux lecteurs
      // d'écran. La forme de la poignée dit déjà ce qu'elle fait.
      aria-label={label}
      onPointerDown={onPointerDown}
      style={{
        display: "inline-flex",
        cursor: "grab",
        touchAction: "none",
        flexShrink: 0,
        opacity: visible ? 1 : 0.35,
      }}
    >
      <IconGripVertical size={16} />
    </Text>
  );
}
