import { Box, Center, Group, Menu, ScrollArea } from "@mantine/core";
import { useWidgetAccess } from "../../lib/rights";
import {
  IconClipboard,
  IconColumns,
  IconCopyPlus,
  IconGripHorizontal,
  IconTrash,
} from "@tabler/icons-react";
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { RED } from "../../themes/colors";
import { PAGE_GUTTER } from "../../themes/layout";
import { PLUS_SIZE } from "../../themes/plus";
import AddButton from "./AddButton";
import ColumnInsert, { COLUMN_INSERT_ZONE as INSERT_ZONE } from "./ColumnInsert";
import DeleteConfirmModal from "./DeleteConfirmModal";
import GapField, { ECART_FIELD_HEIGHT, ECART_FIELD_WIDTH } from "./GapField";
import EmptyPanel from "./EmptyPanel";
import WidthField from "./WidthField";
import PointMenu, { menuPosition, type PointMenuPosition } from "./PointMenu";
import SectionDropZone, { DOTTED } from "./SectionDropZone";
import WidgetDrawer, { type WidgetChoice } from "./WidgetDrawer";
import { InsertionLine, type WidgetDrag } from "./WidgetDrop";
import type { Id, SectionWidthUnit } from "@milo/shared";

// Des sections en colonnes, et les widgets qu'elles portent. C'est la rangée
// du mode Accès — les sections d'une catégorie — et celle des modes Support
// et Assets, où la liste est un widget parmi les indicateurs.
//
// Une section a une largeur — laissée à la rangée, ou fixée en pour-cent ou
// en pixels — et l'écart qui la sépare de la suivante, saisis tous deux au
// pied de la colonne. Elle se glisse par sa poignée du haut pour changer de
// rang, s'insère entre deux autres par le « + » qui paraît au survol de
// l'écart — glissé, cet écart redimensionne celle de ses deux voisines qui est
// en pixels, la gauche d'abord —, et son clic droit la duplique ou la
// supprime. Vide, elle montre une zone d'ajout.
//
// Un widget s'ajoute depuis le tiroir de gauche (WidgetDrawer), qu'ouvrent la
// zone d'une colonne vide et « Ajouter un widget », en bas à droite de la
// page : on le glisse là où il doit se poser, comme un widget déjà rangé.
//
// Ce que la section porte n'appartient pas à cette rangée : « renderWidgets »
// le dessine, et reçoit le glisser des widgets, que la rangée tient parce
// qu'un widget se prend dans une section et se pose dans une autre.
// Verrouillée, la rangée se lit : plus de cadre, de poignée ni d'ajout.

/** Ce que la rangée lit d'une section. */
export interface BoardSection {
  id: Id;
  width_unit: SectionWidthUnit;
  width_value: number | null;
  /** L'écart qui la sépare de la section suivante, en pixels. */
  gap: number;
}

interface SectionsBoardProps<S extends BoardSection> {
  /** « null » tant que les sections ne sont pas lues ; rien ne s'affiche alors. */
  sections: S[] | null;
  locked: boolean;
  /**
   * Déverrouiller la rangée. Avec lui, une rangée vide et verrouillée propose
   * tout de même d'ajouter une section : le geste la déverrouille d'abord.
   * Sans lui — figée faute de droit —, elle ne propose rien.
   */
  onUnlock?: () => void | Promise<void>;
  /** Les widgets d'une section, dans l'ordre : le dépôt se calcule sur eux. */
  widgetIds: (section: S) => Id[];
  /** Ce que la section porte. « drag » est inerte pour les copies qui suivent le pointeur. */
  renderWidgets: (section: S, drag: WidgetDrag) => ReactNode;
  /** Ce que le tiroir de gauche propose, dans l'ordre. */
  widgets: WidgetChoice[];
  /** Un widget du tiroir posé dans cette section, à cette place. */
  onCreateWidget: (section: S, type: string, index: number) => void | Promise<void>;
  /** Ce que la section porte désormais, dans l'ordre : le rangement part au serveur. */
  onReorderWidgets: (sectionId: Id, ids: Id[]) => void | Promise<void>;
  /** Sans rang, la section va au bout ; le « + » entre deux colonnes en donne un. */
  onAddSection: (index?: number) => void;
  /** La copie, avec ses widgets, se pose à droite de l'original. */
  onDuplicateSection: (section: S) => void | Promise<void>;
  /**
   * Le widget copié (lib/presse-papiers.ts), à coller au bout d'une section :
   * son nom, et de quoi le poser. Sans lui, le menu ne propose pas de coller.
   */
  paste?: { label: string; onPaste: (section: S) => void | Promise<void> };
  /**
   * Un widget lâché sur la corbeille, qui paraît à gauche d'« Ajouter un
   * widget » le temps du glisser. Sans lui, pas de corbeille.
   */
  onDeleteWidget?: (id: Id) => void;
  /** Supprimée depuis le clic droit : la rangée a déjà posé la question. */
  onDeleteSection: (section: S) => void | Promise<void>;
  /** Le nouvel ordre des colonnes, posé par leur poignée. */
  onReorderSections: (ids: Id[]) => void | Promise<void>;
  /** Ce qui se règle au pied de la colonne : sa largeur, l'écart qui la suit. */
  onChangeSection: (section: S, change: EditSection) => void | Promise<void>;
}

/** Ce que le pied d'une colonne change : sa largeur, ou l'écart qui la suit. */
export type EditSection = Partial<Pick<BoardSection, "width_unit" | "width_value" | "gap">>;

// Largeur en deçà de laquelle une colonne automatique ne se resserre plus.
// Faute de cette place, elle disparaît plutôt que de renvoyer ses voisines à
// la ligne.
const SECTION_MIN_WIDTH = 20;

// Tolérance des calculs de largeur : le navigateur place les colonnes au
// demi-pixel près.
const ROUNDING = 0.5;

// « Ajouter un widget », posé à gauche du « ? » des raccourcis
// (ShortcutsHelp) : à sa hauteur — celle d'un ActionIcon « lg » —, et l'air
// qui l'en sépare.
const HELP_SIZE = 34;
const HELP_OFFSET = 10;

// Ce que la rangée tient quand le widget vient du tiroir : il n'a pas encore
// d'identifiant, et aucun widget rangé n'a celui-ci.
const NEW_VALUE: Id = -1;

// Course en deçà de laquelle l'appui sur la poignée reste un clic.
const DRAG_THRESHOLD = 5;

// La taille de l'icône des poignées.
const GRIP_SIZE = 16;

// L'écart minimal entre le trait du cadre et ce qui le côtoie : le « + » de
// l'écart, l'icône d'une poignée.
const LINE_GAP = 2;

// La bande que la poignée occupe en haut de chaque colonne, hors du cadre —
// l'icône, à son écart du trait —, et celle du pied, à la même hauteur, où se
// règlent la largeur et l'écart. Elle est tenue même
// verrouillée, pour que le contenu ne bouge pas quand on passe de l'édition à
// la lecture.
const GRIP_ZONE = GRIP_SIZE + 2 * LINE_GAP;

// L'air entre le trait du cadre et le contenu, en haut et en bas.
const FRAME_PADDING = 8;

// Ce qui coiffe le contenu d'une colonne : la bande de la poignée et l'air
// sous le trait. Il ne prend pas de place au-dessus des widgets : la colonne
// le porte en débord, et la zone de défilement remonte d'autant pour le
// montrer — les sections commencent ainsi juste sous la marge de la rangée.
const TOP_BAND = GRIP_ZONE + FRAME_PADDING;

/** Ce dont le cadre d'une colonne déborde dans l'écart, de chaque côté. */
interface Overflows {
  left: number;
  rightHand: number;
}

/** Le glisser d'une colonne, tel que le rendu le voit. */
interface SectionDrag {
  id: Id;
  /** Le coin haut gauche de la copie qui suit le pointeur. */
  x: number;
  y: number;
  /** Sa taille à l'écran : la copie montre la colonne entière. */
  width: number;
  height: number;
  /** Le rang où elle se posera, parmi les autres colonnes. */
  target: number;
}

/** Le redimensionnement d'une colonne en pixels, par l'écart qui la suit. */
interface Resizing {
  id: Id;
  startX: number;
  /** Sa largeur au premier appui. */
  largeur: number;
  /**
   * 1 quand la colonne est à gauche de l'écart, -1 à droite : tirer vers la
   * gauche élargit alors celle-ci.
   */
  direction: 1 | -1;
  started: boolean;
}

interface SectionDragInProgress extends SectionDrag {
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
  started: boolean;
  /**
   * La place des autres colonnes, relevée au premier appui : le rang visé se
   * lit sur elles.
   */
  places: DOMRect[];
}

/** Le glisser des copies : elles se montrent sans répondre. */
const INERT: WidgetDrag = {
  dragged: null,
  onDragStart: () => {},
  onDragEnd: () => {},
  onDrop: () => {},
};

/**
 * Le rang visé : la première colonne dont on n'a pas dépassé le milieu, ligne
 * par ligne — les colonnes qui ne tiennent plus passent à la ligne suivante.
 */
const rankFrom = (places: DOMRect[], x: number, y: number): number => {
  const rank = places.findIndex((r) => y < r.top || (y <= r.bottom && x < r.left + r.width / 2));
  return rank === -1 ? places.length : rank;
};

/**
 * La largeur que la section dit. « Automatique » laisse la rangée lui répartir
 * à parts égales ce que les autres laissent : elle ne compte pour rien dans le
 * passage à la ligne, et « masquees » la retire quand ce reste ne lui donne
 * pas sa largeur minimale. Les deux autres la fixent, et la colonne ne se
 * resserre ni ne s'étire — celles qui ne tiennent plus passent à la ligne
 * suivante.
 *
 * Un pourcentage se lit sur ce qui reste de la rangée une fois les écarts
 * retirés, et non sur la rangée entière : sans cela, trois sections à 25, 50
 * et 25 % réclameraient 100 % plus deux écarts, et la dernière retournerait à
 * la ligne. D'où « ecarts », la somme de ceux qui séparent les colonnes.
 */
const widthOf = (section: BoardSection, gaps: number): CSSProperties => {
  if (section.width_unit === "auto") {
    return { flex: "1 1 0px", minWidth: 0 };
  }
  if (section.width_unit === "percent") {
    const part = section.width_value ?? 0;
    return {
      flex: `0 0 calc((100% - ${gaps}px) * ${part} / 100)`,
      minWidth: 0,
    };
  }
  return { flex: `0 0 ${section.width_value ?? 0}px`, minWidth: 0 };
};

/**
 * Les colonnes automatiques qui n'ont pas la place d'être montrées. La rangée
 * est refaite ligne par ligne comme le navigateur la fera : chaque colonne
 * compte pour sa largeur plus l'écart qui la suit — sa marge droite —, les
 * colonnes fixes passent à la ligne quand elles ne tiennent plus, les
 * automatiques restent sur la ligne où elles tombent. Sur chaque ligne, elles
 * se gardent dans l'ordre tant que le reste leur donne à chacune sa largeur
 * minimale ; les suivantes disparaissent.
 */
const hiddenItems = (
  followUp: BoardSection[],
  largeur: number,
  gapAfter: (section: BoardSection) => number,
  gaps: number,
): Set<Id> => {
  const hidden = new Set<Id>();
  let fixed = 0;
  let autoSections: BoardSection[] = [];
  const sum = (list: BoardSection[]) => list.reduce((a, s) => a + gapAfter(s), 0);

  const finishRow = () => {
    let keptKeys: BoardSection[] = [];
    for (const section of autoSections) {
      const need =
        fixed + sum(keptKeys) + gapAfter(section) + SECTION_MIN_WIDTH * (keptKeys.length + 1);
      if (need <= largeur + ROUNDING) keptKeys = [...keptKeys, section];
      else hidden.add(section.id);
    }
    fixed = 0;
    autoSections = [];
  };

  for (const section of followUp) {
    if (section.width_unit === "auto") {
      autoSections.push(section);
      continue;
    }
    const part = section.width_value ?? 0;
    const w = section.width_unit === "percent" ? ((largeur - gaps) * part) / 100 : part;
    const occupe = fixed + sum(autoSections);
    const place = w + gapAfter(section);
    if ((fixed > 0 || autoSections.length > 0) && occupe + place > largeur + ROUNDING) finishRow();
    fixed += place;
  }
  finishRow();
  return hidden;
};

export default function SectionsBoard<S extends BoardSection>({
  sections,
  locked,
  onUnlock,
  widgetIds,
  renderWidgets,
  widgets,
  onCreateWidget,
  onReorderWidgets,
  onAddSection,
  onDuplicateSection,
  paste,
  onDeleteWidget,
  onDeleteSection,
  onReorderSections,
  onChangeSection,
}: SectionsBoardProps<S>) {
  // La permission du compte sur chaque type de widget : le tiroir s'y règle.
  const access = useWidgetAccess();

  // Le widget que l'on tient, ou « null ». Il vit ici et non dans une
  // colonne : on le prend dans l'une et on le pose dans une autre.
  const [draggedWidget, setDraggedWidget] = useState<Id | null>(null);
  /** Le tiroir des widgets, ouvert par une colonne. */
  const [drawerOpen, setDrawerOpened] = useState(false);
  // Sortir de la modification referme le tiroir : on n'y pose plus rien.
  useEffect(() => {
    if (locked) setDrawerOpened(false);
  }, [locked]);
  /** Le type du widget pris dans le tiroir, le temps du glisser. */
  const [newType, setNewType] = useState<string | null>(null);
  /**
   * La corbeille survolée par le widget tenu : elle se colore, et un widget
   * lâché au-dessus d'elle s'y jette à la fin du glisser, même si le
   * navigateur n'a pas livré le dépôt.
   */
  const [overTrash, setOverTrash] = useState(false);
  /** La colonne survolée pendant le glisser : c'est elle qui reçoit. */
  const [hoveredColumn, setHoveredColumn] = useState<Id | null>(null);
  /** La colonne tenue par sa poignée : voir « Colonnes : glisser ». */
  const [dragging, setDragged] = useState<SectionDrag | null>(null);
  const draggingRef = useRef<SectionDragInProgress | null>(null);
  /**
   * L'ordre posé, montré sans attendre le serveur : sans lui, la colonne
   * reviendrait à sa place le temps de l'aller-retour. Les sections relues
   * reprennent la main.
   */
  const [localOrder, setLocalOrder] = useState<Id[] | null>(null);
  useEffect(() => setLocalOrder(null), [sections]);
  /** Le menu du clic droit dans le vide d'une colonne. */
  const [sectionMenu, setSectionMenu] = useState<{
    section: S;
    position: PointMenuPosition;
  } | null>(null);
  const [sectionToDelete, setSectionToDelete] = useState<S | null>(null);
  /**
   * Les largeurs et les écarts saisis, montrés sans attendre le serveur, comme
   * l'ordre posé : sans eux, la colonne reviendrait à l'ancien réglage le
   * temps de l'aller-retour.
   */
  const [localEdits, setLocalEdits] = useState<ReadonlyMap<Id, EditSection>>(new Map());
  useEffect(() => setLocalEdits(new Map()), [sections]);

  const changerSection = async (section: S, change: EditSection) => {
    setLocalEdits((before) => new Map(before).set(section.id, { ...before.get(section.id), ...change }));
    await onChangeSection(section, change);
  };

  /**
   * Poser le widget tenu dans cette colonne, à cette place. La liste envoyée
   * est celle de la colonne d'accueil telle qu'elle sera : c'est elle qui dit
   * l'ordre, et le serveur y admet un widget venu d'ailleurs.
   */
  const drop = async (sectionId: Id, index: number) => {
    const id = draggedWidget;
    setDraggedWidget(null);
    setHoveredColumn(null);
    const section = sections?.find((s) => s.id === sectionId);
    if (id === null || !section) return;

    const currentIds = widgetIds(section);
    if (id === NEW_VALUE) {
      setNewType(null);
      if (newType) await onCreateWidget(section, newType, Math.min(index, currentIds.length));
      return;
    }
    const arrival = currentIds.filter((other) => other !== id);
    const place = Math.min(index, arrival.length);
    const next = [...arrival.slice(0, place), id, ...arrival.slice(place)];
    // Poser un widget là où il est déjà ne change rien.
    if (currentIds.length === next.length && currentIds.every((v, i) => v === next[i])) return;

    await onReorderWidgets(sectionId, next);
  };

  /** Le widget tenu, lâché sur la corbeille : une seule fois, par le dépôt ou la fin du glisser. */
  const moveToTrash = () => {
    const id = draggedWidget;
    setOverTrash(false);
    setDraggedWidget(null);
    setHoveredColumn(null);
    if (id !== null && id !== NEW_VALUE) onDeleteWidget?.(id);
  };

  const drag: WidgetDrag = {
    dragged: draggedWidget,
    onDragStart: setDraggedWidget,
    onDragEnd: () => {
      if (overTrash) moveToTrash();
      setDraggedWidget(null);
      setOverTrash(false);
    },
    onDrop: drop,
  };

  // --- Colonnes : glisser par la poignée ---------------------------------
  // Une copie suit le pointeur ; la colonne reste à sa place, à demi effacée,
  // et un trait dans l'écart montre où elle se posera. Au pointeur et non au glisser natif : celui-ci
  // ne laisse voir qu'une image figée.
  const bands = !sections
    ? null
    : localOrder
      ? localOrder
          .map((id) => sections.find((s) => s.id === id))
          .filter((s): s is S => s !== undefined)
      : sections;
  const ordonnees =
    bands?.map((s) => {
      const change = localEdits.get(s.id);
      return change ? { ...s, ...change } : s;
    }) ?? null;

  /** La colonne qu'on élargit par l'écart qui la suit, ou « null ». */
  const resizeRef = useRef<Resizing | null>(null);
  /**
   * Vrai le temps du clic qui suit un redimensionnement : ce clic tombe sur le
   * « + » de l'écart, et ne doit pas insérer de colonne.
   */
  const vientDeRedimensionner = useRef(false);

  // Les écouteurs sont posés une fois : ils lisent l'état courant par une ref.
  const state = useRef({ ordonnees, onReorderSections, changerSection });
  useLayoutEffect(() => {
    state.current = { ordonnees, onReorderSections, changerSection };
  });

  // --- Colonnes : redimensionner par l'écart ------------------------------
  // La largeur suit le pointeur sans attendre le serveur ; elle part au
  // relâcher. En deçà du seuil, l'appui reste le clic qui insère.
  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const r = resizeRef.current;
      if (!r) return;
      const dx = event.clientX - r.startX;
      if (!r.started) {
        if (Math.abs(dx) < DRAG_THRESHOLD) return;
        r.started = true;
        document.body.style.cursor = "col-resize";
      }
      const largeur = Math.max(1, Math.round(r.largeur + r.direction * dx));
      setLocalEdits((before) =>
        new Map(before).set(r.id, { ...before.get(r.id), width_value: largeur }),
      );
    };

    const onUp = async (event: PointerEvent) => {
      const r = resizeRef.current;
      resizeRef.current = null;
      if (!r?.started) return;
      document.body.style.cursor = "";
      vientDeRedimensionner.current = true;
      setTimeout(() => (vientDeRedimensionner.current = false));
      const { ordonnees: current, changerSection: change } = state.current;
      const section = current?.find((s) => s.id === r.id);
      if (!section) return;
      const largeur = Math.max(1, Math.round(r.largeur + r.direction * (event.clientX - r.startX)));
      await change(section, { width_unit: "px", width_value: largeur });
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  /** L'appui sur l'écart voisin d'une colonne en pixels. */
  const grabWidth = (event: ReactPointerEvent<HTMLElement>, section: S, direction: 1 | -1) => {
    if (event.button !== 0 || locked) return;
    // Pas de sélection du texte voisin pendant qu'on tire.
    event.preventDefault();
    resizeRef.current = {
      id: section.id,
      startX: event.clientX,
      largeur: section.width_value ?? measure(section, "px"),
      direction,
      started: false,
    };
  };

  /** Un « + » d'écart : il n'insère pas au clic qui termine un redimensionnement. */
  const insert = (rank: number) => () => {
    if (!vientDeRedimensionner.current) onAddSection(rank);
  };

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const d = draggingRef.current;
      if (!d) return;
      if (!d.started) {
        if (Math.hypot(event.clientX - d.startX, event.clientY - d.startY) < DRAG_THRESHOLD) return;
        d.started = true;
        document.body.style.cursor = "grabbing";
      }
      d.target = rankFrom(d.places, event.clientX, event.clientY);
      setDragged({
        id: d.id,
        x: event.clientX - d.offsetX,
        y: event.clientY - d.offsetY,
        width: d.width,
        height: d.height,
        target: d.target,
      });
    };

    const onUp = async () => {
      const d = draggingRef.current;
      draggingRef.current = null;
      document.body.style.cursor = "";
      setDragged(null);
      const { ordonnees: current, onReorderSections: store } = state.current;
      if (!d?.started || !current) return;

      const currentIds = current.map((s) => s.id);
      const others = currentIds.filter((id) => id !== d.id);
      const next = [...others.slice(0, d.target), d.id, ...others.slice(d.target)];
      if (next.every((v, i) => v === currentIds[i])) return;
      setLocalOrder(next);
      await store(next);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  const grabColumn = (event: ReactPointerEvent<HTMLElement>, section: S) => {
    if (event.button !== 0 || locked) return;
    const column = event.currentTarget.closest<HTMLElement>("[data-section-id]");
    const band = column?.parentElement;
    if (!column || !band) return;
    const frame = column.getBoundingClientRect();
    draggingRef.current = {
      id: section.id,
      x: frame.left,
      y: frame.top,
      width: frame.width,
      height: frame.height,
      target: 0,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - frame.left,
      offsetY: event.clientY - frame.top,
      started: false,
      places: [...band.querySelectorAll<HTMLElement>("[data-section-id]")]
        .filter((other) => other !== column)
        .map((other) => other.getBoundingClientRect()),
    };
  };

  const held = dragging && ordonnees ? ordonnees.find((s) => s.id === dragging.id) : undefined;

  /**
   * La poignée de la colonne : c'est par elle, et par elle seule, que la
   * colonne se déplace — le reste appartient à ses widgets, qui ont leur
   * propre glisser.
   */
  const handle = (section: S) => (
    <Center
      onPointerDown={(e) => grabColumn(e, section)}
      aria-label="Déplacer la section"
      c="dimmed"
      style={{
        position: "absolute",
        top: -TOP_BAND,
        left: 0,
        right: 0,
        height: GRIP_ZONE,
        cursor: "grab",
        touchAction: "none",
      }}
    >
      <IconGripHorizontal size={GRIP_SIZE} />
    </Center>
  );

  /**
   * La largeur que la colonne a à l'écran, dans l'unité choisie : passer de
   * « auto » à « px » ou « % » la garde telle qu'elle est. Les pour-cent se
   * lisent, comme dans « largeurDe », sur la rangée moins ses écarts.
   */
  const measure = (section: S, unit: "px" | "percent"): number => {
    const column = bandEl?.querySelector<HTMLElement>(`[data-section-id="${section.id}"]`);
    const largeur = column?.getBoundingClientRect().width ?? 0;
    if (unit === "px") return largeur;
    const available = (bandWidth ?? 0) - gaps;
    return available > 0 ? (largeur / available) * 100 : 100;
  };

  /**
   * Le cadre d'une colonne et ce qu'il porte. « inerte » : la copie qui suit
   * le pointeur et la colonne tenue, restée à sa place, qui se montrent sans
   * répondre.
   */
  const frame = (section: S, overflows: Overflows, inert = false) => {
    const count = widgetIds(section).length;
    return (
      <Box
        // Le clic droit dans le vide de la colonne. Sur un widget, c'est le
        // menu du widget qui s'ouvre : il a déjà pris l'événement.
        onContextMenu={(e) => {
          if (inert || locked || e.defaultPrevented) return;
          setSectionMenu({ section, position: menuPosition(e) });
        }}
        // Lâché dans le vide de la colonne, sous ses widgets, le widget tenu
        // va au bout. Sur un widget, c'est lui qui a reçu le dépôt.
        onDragOver={(e) => {
          if (inert || locked || draggedWidget === null) return;
          e.preventDefault();
        }}
        onDrop={(e) => {
          if (inert || locked || draggedWidget === null || e.defaultPrevented) return;
          e.preventDefault();
          void drop(section.id, count);
        }}
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          position: "relative",
          // La bande du pied, et l'air au-dessus du trait, tenus verrouillé ou
          // non : le contenu ne bouge pas d'un mode à l'autre. Celle de la
          // poignée déborde au-dessus (BANDE_HAUT).
          paddingBottom: GRIP_ZONE + FRAME_PADDING,
        }}
      >
        {/* Le cadre en pointillé, posé par-dessus et non autour : il déborde
            dans l'écart entre les colonnes, à distance du « + », sans rien
            pousser. La poignée est hors de lui, dans la bande du haut, et la
            largeur dans celle du pied, centrée sous la colonne. */}
        {!locked && (
          <>
            <Box
              style={{
                position: "absolute",
                top: -FRAME_PADDING,
              bottom: GRIP_ZONE,
              left: -overflows.left,
              right: -overflows.rightHand,
                border: `1px dashed ${DOTTED}`,
                borderRadius: "var(--mantine-radius-md)",
                pointerEvents: "none",
              }}
            />
            {handle(section)}
            {!inert && (
              <WidthField
                value={section}
                onChange={(largeur) => changerSection(section, largeur)}
                measure={(unit) => measure(section, unit)}
                style={{
                  bottom: (GRIP_ZONE - ECART_FIELD_HEIGHT) / 2,
                  left: "50%",
                  transform: "translateX(-50%)",
                }}
              />
            )}
          </>
        )}

        {renderWidgets(section, inert ? INERT : drag)}

        {/* L'invite ne paraît que pour une colonne vide. Verrouillée, la zone
            garde sa place sans se montrer ; sinon elle ne double pas le cadre
            de la colonne. */}
        {count === 0 && (
          <SectionDropZone
            onClick={() => setDrawerOpened(true)}
            accepting={!inert && hoveredColumn === section.id}
            invisible={locked}
            withoutFrame
            onDragOver={(e) => {
              if (locked || draggedWidget === null) return;
              e.preventDefault();
              setHoveredColumn(section.id);
            }}
            onDragLeave={() => setHoveredColumn((s) => (s === section.id ? null : s))}
            onDrop={(e) => {
              if (locked || draggedWidget === null) return;
              e.preventDefault();
              void drop(section.id, 0);
            }}
          />
        )}

      </Box>
    );
  };

  // La largeur de la rangée, relevée avant l'affichage et à chaque
  // redimensionnement : c'est sur elle que se décident les colonnes
  // automatiques masquées.
  const [bandEl, setBandEl] = useState<HTMLDivElement | null>(null);
  const [bandWidth, setBandWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (!bandEl) return;
    setBandWidth(bandEl.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setBandWidth(entry.contentRect.width);
    });
    observer.observe(bandEl);
    return () => observer.disconnect();
  }, [bandEl]);

  // L'écart qui suit chaque colonne, sa marge droite : la dernière n'en a
  // pas. Les pour-cent se lisent sur la rangée moins leur somme.
  const last = ordonnees?.[ordonnees.length - 1];
  const gapAfter = (section: BoardSection) => (section.id === last?.id ? 0 : section.gap);
  const gaps = (ordonnees ?? []).reduce((a, s) => a + gapAfter(s), 0);

  const hidden =
    ordonnees && bandWidth !== null
      ? hiddenItems(ordonnees, bandWidth, gapAfter, gaps)
      : new Set<Id>();
  const shown = (ordonnees ?? []).filter((s) => !hidden.has(s.id));

  // Les écarts de part et d'autre de chaque colonne montrée : celui qui la
  // précède est l'écart de la voisine de gauche, celui qui la suit le sien.
  // Aux bords de la rangée, il n'y a pas d'écart : on reprend celui de l'autre
  // côté, pour que le cadre et le « + » s'y posent comme dans un écart.
  const gapsAround = (section: BoardSection): Overflows & { before: number; after: number } => {
    const rank = shown.findIndex((s) => s.id === section.id);
    const previous = shown[rank - 1];
    const afterActual = rank >= 0 && rank < shown.length - 1 ? section.gap : null;
    const before = previous ? previous.gap : (afterActual ?? section.gap);
    const after = afterActual ?? before;
    // Ce dont le cadre déborde de chaque côté de la colonne, dans l'écart : il
    // s'écarte de ce qu'elle porte sans le pousser, ni rien changer à l'écart.
    // Au plus loin, avec deux pixels de jour entre les traits de deux voisines.
    const overflow = (gap: number) => Math.max(0, Math.floor(gap / 2) - 1);
    return { before, after, left: overflow(before), rightHand: overflow(after) };
  };

  // La marge laissée hors des colonnes du bord : le « + » s'y centre comme
  // dans un écart, et la zone de défilement ne le rogne pas.
  const edges = shown.length > 0
    ? Math.max(
        gapsAround(shown[0]!).before,
        gapsAround(shown[shown.length - 1]!).after,
      )
    : 0;
  const margin = Math.ceil((edges + PLUS_SIZE) / 2);
  // L'air entre deux lignes, quand des colonnes fixes passent à la ligne : le
  // plus large des écarts de la rangée.
  const rowsGap = Math.max(0, ...shown.map((s) => s.gap));

  // Où la colonne tenue se posera. Rien ne bouge pendant le glisser : elle
  // reste à sa place, à demi effacée, et un trait dans l'écart montre où elle
  // ira — au bord gauche de la colonne visée parmi les autres, ou à droite de
  // la dernière. Reposée à sa place, elle ne change rien : pas de trait.
  const others = dragging && ordonnees ? ordonnees.filter((s) => s.id !== dragging.id) : [];
  const heldRank = dragging && ordonnees ? ordonnees.findIndex((s) => s.id === dragging.id) : -1;
  const targeted =
    dragging && dragging.target !== heldRank
      ? dragging.target < others.length
        ? { id: others[dragging.target]!.id, before: true }
        : { id: others[others.length - 1]?.id, before: false }
      : null;

  const band = sections && (
    <Group
      ref={setBandEl}
      align="stretch"
      gap={0}
      wrap="wrap"
      // Les colonnes occupent la hauteur restante : c'est elle que la zone en
      // pointillé remplit, sous ce que la section porte déjà.
      style={{ flexGrow: 1, rowGap: rowsGap }}
    >
      {(ordonnees ?? []).map((section, rank) => {
        const isHidden = hidden.has(section.id);
        // Le « + » du bout se pose sur la dernière colonne montrée.
        const last = section.id === shown[shown.length - 1]?.id;
        const isHeld = section.id === dragging?.id;
        const surrounding = gapsAround(section);
        // L'écart entre la colonne montrée à gauche et celle-ci — celui de son
        // « + » de gauche — redimensionne celle des deux qui est en pixels, la
        // gauche d'abord. Aux bords de la rangée, il n'y a pas d'écart à tirer.
        const previous = shown[shown.findIndex((s) => s.id === section.id) - 1];
        const startResize = !previous
          ? undefined
          : previous.width_unit === "px"
            ? (e: ReactPointerEvent<HTMLElement>) => grabWidth(e, previous, 1)
            : section.width_unit === "px"
              ? (e: ReactPointerEvent<HTMLElement>) => grabWidth(e, section, -1)
              : undefined;
        const inEditing = !locked && !dragging && draggedWidget === null && !isHidden;
        return (
          <Fragment key={section.id}>
            {/* La place de la colonne dans la rangée, et l'écart qui la suit
                en marge droite. Hors verrou, elle porte un cadre en pointillé
                — celui de la zone d'ajout —, sa poignée en haut, sa largeur
                au pied, les « + » qui insèrent une colonne à côté, et le
                champ de l'écart qui la suit. */}
            <Box
              data-section-id={section.id}
              style={{
                ...widthOf(section, gaps),
                marginRight: gapAfter(section),
                display: isHidden ? "none" : "flex",
                flexDirection: "column",
                position: "relative",
                ...(isHeld ? { opacity: 0.5, pointerEvents: "none" } : {}),
              }}
            >
              {targeted?.id === section.id && (
                <InsertionLine
                  before={targeted.before}
                  gap={targeted.before ? surrounding.before : surrounding.after}
                  standing
                />
              )}
              {inEditing && (
                <>
                  <ColumnInsert
                    label="Insérer une section ici"
                    // Centré dans l'écart qui la précède ; avant la première,
                    // à la même distance, comme dans un écart. Entre la bande
                    // de la poignée et celle du pied, à la hauteur du cadre.
                    style={{
                      top: -FRAME_PADDING,
                      bottom: GRIP_ZONE,
                      left: -(surrounding.before + INSERT_ZONE) / 2,
                    }}
                    onClick={insert(rank)}
                    onResizeStart={startResize}
                  />
                  {last ? (
                    <ColumnInsert
                      label="Insérer une section ici"
                      style={{
                        top: -FRAME_PADDING,
                        bottom: GRIP_ZONE,
                        right: -(surrounding.after + INSERT_ZONE) / 2,
                      }}
                      onClick={insert(sections.length)}
                    />
                  ) : (
                    // L'écart qui suit la colonne se saisit sous lui, centré
                    // dans la bande du pied, à côté de la largeur.
                    <GapField
                      value={section.gap}
                      onChange={(gap) => changerSection(section, { gap })}
                      style={{
                        bottom: (GRIP_ZONE - ECART_FIELD_HEIGHT) / 2,
                        right: -(surrounding.after + ECART_FIELD_WIDTH) / 2,
                      }}
                    />
                  )}
                </>
              )}
              {frame(section, surrounding, isHeld)}
            </Box>
          </Fragment>
        );
      })}
    </Group>
  );

  // Tant que les sections ne sont pas lues, on n'affiche rien : « aucune
  // section » serait une conclusion prématurée. Verrouillée, la rangée vide
  // propose d'en ajouter si elle peut se déverrouiller : le geste la
  // déverrouille d'abord, puis pose la section.
  const canAdd = !locked || Boolean(onUnlock);
  // Verrouillée, une rangée dont aucune section ne porte rien n'a rien à
  // montrer : l'écran vide revient, comme sans section. Le geste la
  // déverrouille alors sans en ajouter une de plus — les siennes attendent.
  const empty =
    sections !== null &&
    (sections.length === 0 || (locked && sections.every((s) => widgetIds(s).length === 0)));
  const content = !sections ? null : empty ? (
    <EmptyPanel
      icon={IconColumns}
      message="Aucune section"
      actionLabel={canAdd ? "Créer une section" : undefined}
      onAction={
        canAdd
          ? async () => {
              if (locked) await onUnlock?.();
              if (sections.length === 0) onAddSection();
            }
          : undefined
      }
    />
  ) : (
    <ScrollArea
      style={{ flex: 1, minHeight: 0, marginInline: -margin, marginTop: -TOP_BAND }}
      type="always"
      scrollbarSize={2}
      styles={{
        // La barre pilote les colonnes mais se cale sur le bord droit de la
        // fenêtre, sur toute sa hauteur — comme aux modes Projet et Support.
        root: { position: "static" },
        scrollbar: {
          position: "fixed",
          top: 0,
          bottom: 0,
          right: 0,
          left: "auto",
          height: "auto",
          width: "var(--scrollarea-scrollbar-size)",
        },
        // Le contenu couvre au moins la hauteur visible : les colonnes s'y
        // étirent, et la zone en pointillé garde de quoi se remplir.
        //
        // Les « + » des bords débordent de la première et de la dernière
        // colonne, et la zone de défilement rogne ce qui dépasse : elle
        // s'élargit d'autant dans la marge de la page, et le contenu s'en
        // retire, pour que les colonnes restent à leur place.
        viewport: { paddingInline: margin, paddingTop: TOP_BAND },
        content: { display: "flex", flexDirection: "column", minHeight: "100%" },
      }}
    >
      {band}
    </ScrollArea>
  );

  return (
    <>
      {content}

      {/* Le tiroir des widgets s'ouvre d'ici, pour toutes les colonnes : on
          choisit la place en y glissant le widget. Verrouillée, ou sans
          section où le poser, la rangée ne le propose pas. */}
      {!locked && sections && sections.length > 0 && (
        <Box
          style={{
            position: "fixed",
            right: PAGE_GUTTER + HELP_SIZE + HELP_OFFSET,
            bottom: PAGE_GUTTER,
            zIndex: 200,
            display: "flex",
            alignItems: "center",
            gap: HELP_OFFSET,
          }}
        >
          {/* Le temps qu'on tient un widget posé — pas celui qu'on tire du
              tiroir —, une corbeille à gauche : y lâcher le widget le
              supprime, après la question habituelle. */}
          {onDeleteWidget && draggedWidget !== null && draggedWidget !== NEW_VALUE && (
            <Box
              aria-label="Supprimer le widget"
              onDragEnter={(e) => {
                e.preventDefault();
                setOverTrash(true);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setOverTrash(true);
              }}
              // Passer sur l'icône n'est pas sortir : seul compte ce qui mène
              // hors de la corbeille.
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                  setOverTrash(false);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                moveToTrash();
              }}
              style={{
                width: HELP_SIZE,
                height: HELP_SIZE,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                // Le rouge du projet, l'icône en blanc ; survolée par le
                // widget tenu, elle fonce d'un cran.
                color: "var(--mantine-color-white)",
                backgroundColor: RED,
                filter: overTrash ? "brightness(0.85)" : undefined,
                transition: "filter 120ms ease",
              }}
            >
              <IconTrash size={18} style={{ pointerEvents: "none" }} />
            </Box>
          )}
          <AddButton
            label="Ajouter un widget"
            onClick={() => setDrawerOpened(true)}
            h={HELP_SIZE}
          />
        </Box>
      )}

      {/* La copie qui suit le pointeur : la colonne entière, à sa taille,
          sans inclinaison. */}
      {dragging && held && (
        <Box
          style={{
            position: "fixed",
            left: dragging.x,
            top: dragging.y,
            width: dragging.width,
            height: dragging.height,
            zIndex: 400,
            pointerEvents: "none",
            display: "flex",
            flexDirection: "column",
            borderRadius: "var(--mantine-radius-md)",
            backgroundColor: "var(--mantine-color-body)",
            boxShadow: "var(--mantine-shadow-xl)",
          }}
        >
          {frame(held, gapsAround(held), true)}
        </Box>
      )}

      <WidgetDrawer
        opened={drawerOpen}
        onClose={() => setDrawerOpened(false)}
        // Le tiroir ne propose que les types que le compte peut modifier.
        widgets={widgets.filter((w) => access(w.kind) === "update")}
        onDragStart={(widget) => {
          setNewType(widget.type);
          setDraggedWidget(NEW_VALUE);
        }}
        onDragEnd={() => {
          setDraggedWidget(null);
          setHoveredColumn(null);
        }}
      />

      {sectionMenu && (
        <PointMenu position={sectionMenu.position} onClose={() => setSectionMenu(null)}>
          {paste && (
            <>
              <Menu.Item
                leftSection={<IconClipboard size={16} />}
                onClick={() => {
                  const { section } = sectionMenu;
                  setSectionMenu(null);
                  void paste.onPaste(section);
                }}
              >
                Coller « {paste.label} »
              </Menu.Item>
              <Menu.Divider />
            </>
          )}
          <Menu.Item
            leftSection={<IconCopyPlus size={16} />}
            onClick={() => void onDuplicateSection(sectionMenu.section)}
          >
            Dupliquer
          </Menu.Item>
          <Menu.Divider />
          <Menu.Item
            color={RED}
            leftSection={<IconTrash size={16} />}
            onClick={() => setSectionToDelete(sectionMenu.section)}
          >
            Supprimer
          </Menu.Item>
        </PointMenu>
      )}

      <DeleteConfirmModal
        opened={sectionToDelete !== null}
        onClose={() => setSectionToDelete(null)}
        onConfirm={async () => {
          const section = sectionToDelete;
          setSectionToDelete(null);
          if (section) await onDeleteSection(section);
        }}
        title="Supprimer la section"
        message={
          <>
            Voulez-vous vraiment supprimer cette section ?
            {sectionToDelete && widgetIds(sectionToDelete).length > 0 && (
              <>
                {" "}
                Ses widgets seront supprimés avec elle, et avec eux les projets, les tâches, les
                demandes ou les assets que leurs listes montrent.
              </>
            )}{" "}
            Cette action est irréversible.
          </>
        }
      />
    </>
  );
}
