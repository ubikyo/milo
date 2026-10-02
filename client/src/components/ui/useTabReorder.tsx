import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";

// Le glisser-déposer des onglets d'une rangée : les tableaux des modes Projet,
// Tâche et Accès (BoardTabs), les statuts du mode Support, les familles du
// mode Assets. La rangée, elle, reste celle de ModeBar.

// Ce qui, dans la rangée, se glisse : le trait d'insertion et le bout de
// rangée sont posés entre les onglets, et ne doivent pas se compter avec eux.
const ATTRIBUT_ONGLET = "data-milo-tab";

// Course en deçà de laquelle l'appui reste un clic : sans ce seuil, le moindre
// tremblement de la main sur un onglet le déplacerait.
const DRAG_THRESHOLD = 5;

/**
 * Le geste en cours : l'onglet tenu et le rang où il se posera. Rien ne bouge
 * tant que la main n'est pas relâchée — seul le trait d'insertion se déplace,
 * et les mesures prises pendant le geste restent donc justes.
 */
interface Glisser<K> {
  id: K;
  target: number;
}

interface GlisserEnCours<K> extends Glisser<K> {
  index: number;
  startX: number;
  started: boolean;
}

// Le trait d'insertion, posé entre deux onglets. Il ne prend aucune largeur
// dans la rangée : les onglets ne s'écartent pas sur son passage.
export function InsertLine() {
  return (
    <div style={{ position: "relative", width: 0, alignSelf: "stretch" }}>
      <div
        style={{
          position: "absolute",
          top: 4,
          bottom: 4,
          left: -1,
          borderLeft: "2px solid var(--mantine-color-teal-5)",
        }}
      />
    </div>
  );
}

/**
 * Les onglets dans l'ordre montré, et de quoi les glisser. « items » est
 * l'ordre qui fait foi ; « onReorder » reçoit le nouveau une fois l'onglet
 * déposé — sans lui, les onglets ne se glissent pas. « zoneDe » retrouve la
 * rangée depuis l'élément touché, quand elle n'en est pas le parent direct
 * (le sélecteur de modes, ModeSwitch).
 */
export function useTabReorder<T, K extends string | number>(
  items: T[],
  keyOf: (item: T) => K,
  onReorder?: (keys: K[]) => void | Promise<void>,
  zoneDe: (element: HTMLElement) => HTMLElement | null = (element) => element.parentElement,
) {
  const [drag, setDrag] = useState<Glisser<K> | null>(null);
  const dragRef = useRef<GlisserEnCours<K> | null>(null);
  // La rangée, retenue au premier appui : elle appartient à ModeBar, et c'est
  // l'onglet touché qui la désigne — il en est un enfant direct.
  const zoneRef = useRef<HTMLElement | null>(null);
  /**
   * Le nouvel ordre est montré aussitôt, sans attendre la réponse du serveur.
   * Il s'efface dès que la liste revient lue : c'est elle qui fait foi.
   */
  const [ordreLocal, setOrdreLocal] = useState<K[] | null>(null);
  // Vrai entre un dépôt et le clic qu'il déclenche : glisser un onglet ne
  // revient pas à l'ouvrir. Remis à faux au début de chaque geste, pour qu'un
  // dépôt hors de la rangée — qui n'est suivi d'aucun clic — n'avale pas le
  // clic suivant.
  const vientDeGlisser = useRef(false);

  useEffect(() => {
    setOrdreLocal(null);
  }, [items]);

  const ordered = ordreLocal
    ? ordreLocal
        .map((cle) => items.find((item) => keyOf(item) === cle))
        .filter((item): item is T => item !== undefined)
    : items;

  // Les écouteurs du geste sont posés une fois pour toutes ; ils lisent l'état
  // courant par une ref plutôt que de se réabonner à chaque rendu.
  const etat = useRef({ ordered, keyOf, onReorder });
  useLayoutEffect(() => {
    etat.current = { ordered, keyOf, onReorder };
  });

  useEffect(() => {
    // Le rang visé : le premier onglet dont on n'a pas dépassé le milieu, ou
    // la fin de la rangée.
    const rangVise = (clientX: number): number | null => {
      const zone = zoneRef.current;
      if (!zone) return null;
      const rangee = [...zone.querySelectorAll(`[${ATTRIBUT_ONGLET}]`)];
      for (const [i, onglet] of rangee.entries()) {
        const rect = onglet.getBoundingClientRect();
        if (clientX < rect.left + rect.width / 2) return i;
      }
      return rangee.length;
    };

    const onMove = (event: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      if (!d.started) {
        if (Math.abs(event.clientX - d.startX) < DRAG_THRESHOLD) return;
        d.started = true;
        document.body.style.userSelect = "none";
        document.body.style.cursor = "grabbing";
      }
      d.target = rangVise(event.clientX) ?? d.index;
      setDrag({ id: d.id, target: d.target });
    };

    const onUp = async () => {
      const d = dragRef.current;
      dragRef.current = null;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      setDrag(null);
      if (!d || !d.started) return;
      vientDeGlisser.current = true;

      // Le rang visé se lit sur la rangée complète ; une fois l'onglet ôté,
      // tout ce qui le suivait remonte d'un cran.
      const cible = d.target > d.index ? d.target - 1 : d.target;
      if (cible === d.index) return;
      const { ordered: courants, keyOf: cleDe } = etat.current;
      const ordre = courants.map(cleDe).filter((cle) => cle !== d.id);
      ordre.splice(cible, 0, d.id);

      setOrdreLocal(ordre);
      try {
        await etat.current.onReorder?.(ordre);
      } catch {
        // Le rangement n'a pas pris : la liste relue par le mode fait foi, et
        // l'ordre montré ici s'efface pour lui laisser la place.
        setOrdreLocal(null);
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  /** Ce qu'un onglet porte pour se glisser, à étaler sur son Tabs.Tab. */
  const tabProps = (cle: K, index: number, style: CSSProperties) => ({
    // Ce par quoi le geste retrouve les onglets dans la rangée : voir
    // ATTRIBUT_ONGLET.
    [ATTRIBUT_ONGLET]: "",
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      vientDeGlisser.current = false;
      if (event.button !== 0 || !onReorder) return;
      zoneRef.current = zoneDe(event.currentTarget);
      dragRef.current = { id: cle, index, startX: event.clientX, started: false, target: index };
    },
    style: {
      ...style,
      // L'onglet tenu reste à sa place, en transparence : le trait
      // d'insertion dit à lui seul où il se posera.
      ...(drag?.id === cle ? { opacity: 0.4 } : {}),
      // Sur un écran tactile, le geste appartient à l'onglet : sans cela le
      // navigateur y verrait un défilement.
      ...(onReorder ? { touchAction: "none" } : {}),
    },
  });

  /**
   * Le changement d'onglet, filtré : le clic qui suit un dépôt n'ouvre rien,
   * la main a déplacé l'onglet, elle n'a pas demandé à l'ouvrir.
   */
  const guardChange =
    <V,>(onChange: (value: V) => void) =>
    (value: V) => {
      if (vientDeGlisser.current) {
        vientDeGlisser.current = false;
        return;
      }
      onChange(value);
    };

  /** Vrai quand le trait d'insertion se pose avant le rang donné (ou en bout, au rang « ordered.length »). */
  const insertAt = (index: number) => drag?.target === index;

  return { ordered, tabProps, guardChange, insertAt };
}
