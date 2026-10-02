import { Box, Center, Group, Menu, ScrollArea } from "@mantine/core";
import { useAccesWidget } from "../../lib/droits";
import {
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
import EcartField, { ECART_FIELD_HEIGHT, ECART_FIELD_WIDTH } from "./EcartField";
import EmptyPanel from "./EmptyPanel";
import LargeurField from "./LargeurField";
import PointMenu, { positionDuMenu, type PointMenuPosition } from "./PointMenu";
import SectionDropZone, { POINTILLE } from "./SectionDropZone";
import WidgetDrawer, { type ChoixDeWidget } from "./WidgetDrawer";
import { TraitInsertion, type WidgetDrag } from "./WidgetDrop";
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
  /** Les widgets d'une section, dans l'ordre : le dépôt se calcule sur eux. */
  widgetIds: (section: S) => Id[];
  /** Ce que la section porte. « drag » est inerte pour les copies qui suivent le pointeur. */
  renderWidgets: (section: S, drag: WidgetDrag) => ReactNode;
  /** Ce que le tiroir de gauche propose, dans l'ordre. */
  widgets: ChoixDeWidget[];
  /** Un widget du tiroir posé dans cette section, à cette place. */
  onCreateWidget: (section: S, type: string, index: number) => void | Promise<void>;
  /** Ce que la section porte désormais, dans l'ordre : le rangement part au serveur. */
  onReorderWidgets: (sectionId: Id, ids: Id[]) => void | Promise<void>;
  /** Sans rang, la section va au bout ; le « + » entre deux colonnes en donne un. */
  onAddSection: (index?: number) => void;
  /** La copie, avec ses widgets, se pose à droite de l'original. */
  onDuplicateSection: (section: S) => void | Promise<void>;
  /** Supprimée depuis le clic droit : la rangée a déjà posé la question. */
  onDeleteSection: (section: S) => void | Promise<void>;
  /** Le nouvel ordre des colonnes, posé par leur poignée. */
  onReorderSections: (ids: Id[]) => void | Promise<void>;
  /** Ce qui se règle au pied de la colonne : sa largeur, l'écart qui la suit. */
  onChangeSection: (section: S, modif: ModifSection) => void | Promise<void>;
}

/** Ce que le pied d'une colonne change : sa largeur, ou l'écart qui la suit. */
export type ModifSection = Partial<Pick<BoardSection, "width_unit" | "width_value" | "gap">>;

// Largeur en deçà de laquelle une colonne automatique ne se resserre plus.
// Faute de cette place, elle disparaît plutôt que de renvoyer ses voisines à
// la ligne.
const SECTION_MIN_WIDTH = 20;

// Tolérance des calculs de largeur : le navigateur place les colonnes au
// demi-pixel près.
const ARRONDI = 0.5;

// « Ajouter un widget », posé à gauche du « ? » des raccourcis
// (ShortcutsHelp) : à sa hauteur — celle d'un ActionIcon « lg » —, et l'air
// qui l'en sépare.
const AIDE_TAILLE = 34;
const AIDE_ECART = 10;

// Ce que la rangée tient quand le widget vient du tiroir : il n'a pas encore
// d'identifiant, et aucun widget rangé n'a celui-ci.
const NOUVEAU: Id = -1;

// Course en deçà de laquelle l'appui sur la poignée reste un clic.
const DRAG_THRESHOLD = 5;

// La taille de l'icône des poignées.
const GRIP_SIZE = 16;

// L'écart minimal entre le trait du cadre et ce qui le côtoie : le « + » de
// l'écart, l'icône d'une poignée.
const TRAIT_ECART = 2;

// La bande que la poignée occupe en haut de chaque colonne, hors du cadre —
// l'icône, à son écart du trait —, et celle du pied, à la même hauteur, où se
// règlent la largeur et l'écart. Elle est tenue même
// verrouillée, pour que le contenu ne bouge pas quand on passe de l'édition à
// la lecture.
const GRIP_ZONE = GRIP_SIZE + 2 * TRAIT_ECART;

// L'air entre le trait du cadre et le contenu, en haut et en bas.
const CADRE_PADDING = 8;

/** Ce dont le cadre d'une colonne déborde dans l'écart, de chaque côté. */
interface Debords {
  gauche: number;
  droite: number;
}

/** Le glisser d'une colonne, tel que le rendu le voit. */
interface GlisserSection {
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
interface Redimensionnement {
  id: Id;
  startX: number;
  /** Sa largeur au premier appui. */
  largeur: number;
  /**
   * 1 quand la colonne est à gauche de l'écart, -1 à droite : tirer vers la
   * gauche élargit alors celle-ci.
   */
  sens: 1 | -1;
  started: boolean;
}

interface GlisserSectionEnCours extends GlisserSection {
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
const INERTE: WidgetDrag = {
  dragged: null,
  onDragStart: () => {},
  onDragEnd: () => {},
  onDrop: () => {},
};

/**
 * Le rang visé : la première colonne dont on n'a pas dépassé le milieu, ligne
 * par ligne — les colonnes qui ne tiennent plus passent à la ligne suivante.
 */
const rangDepuis = (places: DOMRect[], x: number, y: number): number => {
  const rang = places.findIndex((r) => y < r.top || (y <= r.bottom && x < r.left + r.width / 2));
  return rang === -1 ? places.length : rang;
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
const largeurDe = (section: BoardSection, ecarts: number): CSSProperties => {
  if (section.width_unit === "auto") {
    return { flex: "1 1 0px", minWidth: 0 };
  }
  if (section.width_unit === "percent") {
    const part = section.width_value ?? 0;
    return {
      flex: `0 0 calc((100% - ${ecarts}px) * ${part} / 100)`,
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
const masquees = (
  suite: BoardSection[],
  largeur: number,
  ecartApres: (section: BoardSection) => number,
  ecarts: number,
): Set<Id> => {
  const cachees = new Set<Id>();
  let fixes = 0;
  let autos: BoardSection[] = [];
  const somme = (liste: BoardSection[]) => liste.reduce((a, s) => a + ecartApres(s), 0);

  const finirLigne = () => {
    let gardees: BoardSection[] = [];
    for (const section of autos) {
      const besoin =
        fixes + somme(gardees) + ecartApres(section) + SECTION_MIN_WIDTH * (gardees.length + 1);
      if (besoin <= largeur + ARRONDI) gardees = [...gardees, section];
      else cachees.add(section.id);
    }
    fixes = 0;
    autos = [];
  };

  for (const section of suite) {
    if (section.width_unit === "auto") {
      autos.push(section);
      continue;
    }
    const part = section.width_value ?? 0;
    const w = section.width_unit === "percent" ? ((largeur - ecarts) * part) / 100 : part;
    const occupe = fixes + somme(autos);
    const place = w + ecartApres(section);
    if ((fixes > 0 || autos.length > 0) && occupe + place > largeur + ARRONDI) finirLigne();
    fixes += place;
  }
  finirLigne();
  return cachees;
};

export default function SectionsBoard<S extends BoardSection>({
  sections,
  locked,
  widgetIds,
  renderWidgets,
  widgets,
  onCreateWidget,
  onReorderWidgets,
  onAddSection,
  onDuplicateSection,
  onDeleteSection,
  onReorderSections,
  onChangeSection,
}: SectionsBoardProps<S>) {
  // La permission du compte sur chaque type de widget : le tiroir s'y règle.
  const acces = useAccesWidget();

  // Le widget que l'on tient, ou « null ». Il vit ici et non dans une
  // colonne : on le prend dans l'une et on le pose dans une autre.
  const [widgetGlisse, setWidgetGlisse] = useState<Id | null>(null);
  /** Le tiroir des widgets, ouvert par une colonne. */
  const [tiroirOuvert, setTiroirOuvert] = useState(false);
  /** Le type du widget pris dans le tiroir, le temps du glisser. */
  const [typeNouveau, setTypeNouveau] = useState<string | null>(null);
  /** La colonne survolée pendant le glisser : c'est elle qui reçoit. */
  const [colonneSurvolee, setColonneSurvolee] = useState<Id | null>(null);
  /** La colonne tenue par sa poignée : voir « Colonnes : glisser ». */
  const [glisse, setGlisse] = useState<GlisserSection | null>(null);
  const glisseRef = useRef<GlisserSectionEnCours | null>(null);
  /**
   * L'ordre posé, montré sans attendre le serveur : sans lui, la colonne
   * reviendrait à sa place le temps de l'aller-retour. Les sections relues
   * reprennent la main.
   */
  const [ordreLocal, setOrdreLocal] = useState<Id[] | null>(null);
  useEffect(() => setOrdreLocal(null), [sections]);
  /** Le menu du clic droit dans le vide d'une colonne. */
  const [menuSection, setMenuSection] = useState<{
    section: S;
    position: PointMenuPosition;
  } | null>(null);
  const [sectionASupprimer, setSectionASupprimer] = useState<S | null>(null);
  /**
   * Les largeurs et les écarts saisis, montrés sans attendre le serveur, comme
   * l'ordre posé : sans eux, la colonne reviendrait à l'ancien réglage le
   * temps de l'aller-retour.
   */
  const [modifsLocales, setModifsLocales] = useState<ReadonlyMap<Id, ModifSection>>(new Map());
  useEffect(() => setModifsLocales(new Map()), [sections]);

  const changerSection = async (section: S, modif: ModifSection) => {
    setModifsLocales((avant) => new Map(avant).set(section.id, { ...avant.get(section.id), ...modif }));
    await onChangeSection(section, modif);
  };

  /**
   * Poser le widget tenu dans cette colonne, à cette place. La liste envoyée
   * est celle de la colonne d'accueil telle qu'elle sera : c'est elle qui dit
   * l'ordre, et le serveur y admet un widget venu d'ailleurs.
   */
  const deposer = async (sectionId: Id, index: number) => {
    const id = widgetGlisse;
    setWidgetGlisse(null);
    setColonneSurvolee(null);
    const section = sections?.find((s) => s.id === sectionId);
    if (id === null || !section) return;

    const actuel = widgetIds(section);
    if (id === NOUVEAU) {
      setTypeNouveau(null);
      if (typeNouveau) await onCreateWidget(section, typeNouveau, Math.min(index, actuel.length));
      return;
    }
    const arrivee = actuel.filter((autre) => autre !== id);
    const place = Math.min(index, arrivee.length);
    const suivant = [...arrivee.slice(0, place), id, ...arrivee.slice(place)];
    // Poser un widget là où il est déjà ne change rien.
    if (actuel.length === suivant.length && actuel.every((v, i) => v === suivant[i])) return;

    await onReorderWidgets(sectionId, suivant);
  };

  const drag: WidgetDrag = {
    dragged: widgetGlisse,
    onDragStart: setWidgetGlisse,
    onDragEnd: () => setWidgetGlisse(null),
    onDrop: deposer,
  };

  // --- Colonnes : glisser par la poignée ---------------------------------
  // Une copie suit le pointeur ; la colonne reste à sa place, à demi effacée,
  // et un trait dans l'écart montre où elle se posera. Au pointeur et non au glisser natif : celui-ci
  // ne laisse voir qu'une image figée.
  const rangees = !sections
    ? null
    : ordreLocal
      ? ordreLocal
          .map((id) => sections.find((s) => s.id === id))
          .filter((s): s is S => s !== undefined)
      : sections;
  const ordonnees =
    rangees?.map((s) => {
      const modif = modifsLocales.get(s.id);
      return modif ? { ...s, ...modif } : s;
    }) ?? null;

  /** La colonne qu'on élargit par l'écart qui la suit, ou « null ». */
  const redimRef = useRef<Redimensionnement | null>(null);
  /**
   * Vrai le temps du clic qui suit un redimensionnement : ce clic tombe sur le
   * « + » de l'écart, et ne doit pas insérer de colonne.
   */
  const vientDeRedimensionner = useRef(false);

  // Les écouteurs sont posés une fois : ils lisent l'état courant par une ref.
  const etat = useRef({ ordonnees, onReorderSections, changerSection });
  useLayoutEffect(() => {
    etat.current = { ordonnees, onReorderSections, changerSection };
  });

  // --- Colonnes : redimensionner par l'écart ------------------------------
  // La largeur suit le pointeur sans attendre le serveur ; elle part au
  // relâcher. En deçà du seuil, l'appui reste le clic qui insère.
  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const r = redimRef.current;
      if (!r) return;
      const dx = event.clientX - r.startX;
      if (!r.started) {
        if (Math.abs(dx) < DRAG_THRESHOLD) return;
        r.started = true;
        document.body.style.cursor = "col-resize";
      }
      const largeur = Math.max(1, Math.round(r.largeur + r.sens * dx));
      setModifsLocales((avant) =>
        new Map(avant).set(r.id, { ...avant.get(r.id), width_value: largeur }),
      );
    };

    const onUp = async (event: PointerEvent) => {
      const r = redimRef.current;
      redimRef.current = null;
      if (!r?.started) return;
      document.body.style.cursor = "";
      vientDeRedimensionner.current = true;
      setTimeout(() => (vientDeRedimensionner.current = false));
      const { ordonnees: actuelles, changerSection: changer } = etat.current;
      const section = actuelles?.find((s) => s.id === r.id);
      if (!section) return;
      const largeur = Math.max(1, Math.round(r.largeur + r.sens * (event.clientX - r.startX)));
      await changer(section, { width_unit: "px", width_value: largeur });
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  /** L'appui sur l'écart voisin d'une colonne en pixels. */
  const prendreLargeur = (event: ReactPointerEvent<HTMLElement>, section: S, sens: 1 | -1) => {
    if (event.button !== 0 || locked) return;
    // Pas de sélection du texte voisin pendant qu'on tire.
    event.preventDefault();
    redimRef.current = {
      id: section.id,
      startX: event.clientX,
      largeur: section.width_value ?? mesurer(section, "px"),
      sens,
      started: false,
    };
  };

  /** Un « + » d'écart : il n'insère pas au clic qui termine un redimensionnement. */
  const inserer = (rang: number) => () => {
    if (!vientDeRedimensionner.current) onAddSection(rang);
  };

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const d = glisseRef.current;
      if (!d) return;
      if (!d.started) {
        if (Math.hypot(event.clientX - d.startX, event.clientY - d.startY) < DRAG_THRESHOLD) return;
        d.started = true;
        document.body.style.cursor = "grabbing";
      }
      d.target = rangDepuis(d.places, event.clientX, event.clientY);
      setGlisse({
        id: d.id,
        x: event.clientX - d.offsetX,
        y: event.clientY - d.offsetY,
        width: d.width,
        height: d.height,
        target: d.target,
      });
    };

    const onUp = async () => {
      const d = glisseRef.current;
      glisseRef.current = null;
      document.body.style.cursor = "";
      setGlisse(null);
      const { ordonnees: actuelles, onReorderSections: ranger } = etat.current;
      if (!d?.started || !actuelles) return;

      const actuel = actuelles.map((s) => s.id);
      const autres = actuel.filter((id) => id !== d.id);
      const suivant = [...autres.slice(0, d.target), d.id, ...autres.slice(d.target)];
      if (suivant.every((v, i) => v === actuel[i])) return;
      setOrdreLocal(suivant);
      await ranger(suivant);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  const prendreColonne = (event: ReactPointerEvent<HTMLElement>, section: S) => {
    if (event.button !== 0 || locked) return;
    const colonne = event.currentTarget.closest<HTMLElement>("[data-section-id]");
    const rangee = colonne?.parentElement;
    if (!colonne || !rangee) return;
    const cadre = colonne.getBoundingClientRect();
    glisseRef.current = {
      id: section.id,
      x: cadre.left,
      y: cadre.top,
      width: cadre.width,
      height: cadre.height,
      target: 0,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - cadre.left,
      offsetY: event.clientY - cadre.top,
      started: false,
      places: [...rangee.querySelectorAll<HTMLElement>("[data-section-id]")]
        .filter((autre) => autre !== colonne)
        .map((autre) => autre.getBoundingClientRect()),
    };
  };

  const tenue = glisse && ordonnees ? ordonnees.find((s) => s.id === glisse.id) : undefined;

  /**
   * La poignée de la colonne : c'est par elle, et par elle seule, que la
   * colonne se déplace — le reste appartient à ses widgets, qui ont leur
   * propre glisser.
   */
  const poignee = (section: S) => (
    <Center
      onPointerDown={(e) => prendreColonne(e, section)}
      aria-label="Déplacer la section"
      c="dimmed"
      style={{
        position: "absolute",
        top: 0,
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
  const mesurer = (section: S, unite: "px" | "percent"): number => {
    const colonne = rangeeEl?.querySelector<HTMLElement>(`[data-section-id="${section.id}"]`);
    const largeur = colonne?.getBoundingClientRect().width ?? 0;
    if (unite === "px") return largeur;
    const disponible = (largeurRangee ?? 0) - ecarts;
    return disponible > 0 ? (largeur / disponible) * 100 : 100;
  };

  /**
   * Le cadre d'une colonne et ce qu'il porte. « inerte » : la copie qui suit
   * le pointeur et la colonne tenue, restée à sa place, qui se montrent sans
   * répondre.
   */
  const cadre = (section: S, debords: Debords, inerte = false) => {
    const nombre = widgetIds(section).length;
    return (
      <Box
        // Le clic droit dans le vide de la colonne. Sur un widget, c'est le
        // menu du widget qui s'ouvre : il a déjà pris l'événement.
        onContextMenu={(e) => {
          if (inerte || locked || e.defaultPrevented) return;
          setMenuSection({ section, position: positionDuMenu(e) });
        }}
        // Lâché dans le vide de la colonne, sous ses widgets, le widget tenu
        // va au bout. Sur un widget, c'est lui qui a reçu le dépôt.
        onDragOver={(e) => {
          if (inerte || locked || widgetGlisse === null) return;
          e.preventDefault();
        }}
        onDrop={(e) => {
          if (inerte || locked || widgetGlisse === null || e.defaultPrevented) return;
          e.preventDefault();
          void deposer(section.id, nombre);
        }}
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          position: "relative",
          // Les bandes de la poignée et du pied, et l'air sous le trait, tenus
          // verrouillé ou non : le contenu ne bouge pas d'un mode à l'autre.
          paddingBlock: GRIP_ZONE + CADRE_PADDING,
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
                top: GRIP_ZONE,
              bottom: GRIP_ZONE,
              left: -debords.gauche,
              right: -debords.droite,
                border: `1px dashed ${POINTILLE}`,
                borderRadius: "var(--mantine-radius-md)",
                pointerEvents: "none",
              }}
            />
            {poignee(section)}
            {!inerte && (
              <LargeurField
                value={section}
                onChange={(largeur) => changerSection(section, largeur)}
                mesurer={(unite) => mesurer(section, unite)}
                style={{
                  bottom: (GRIP_ZONE - ECART_FIELD_HEIGHT) / 2,
                  left: "50%",
                  transform: "translateX(-50%)",
                }}
              />
            )}
          </>
        )}

        {renderWidgets(section, inerte ? INERTE : drag)}

        {/* L'invite ne paraît que pour une colonne vide. Verrouillée, la zone
            garde sa place sans se montrer ; sinon elle ne double pas le cadre
            de la colonne. */}
        {nombre === 0 && (
          <SectionDropZone
            onClick={() => setTiroirOuvert(true)}
            accueille={!inerte && colonneSurvolee === section.id}
            invisible={locked}
            sansCadre
            onDragOver={(e) => {
              if (locked || widgetGlisse === null) return;
              e.preventDefault();
              setColonneSurvolee(section.id);
            }}
            onDragLeave={() => setColonneSurvolee((s) => (s === section.id ? null : s))}
            onDrop={(e) => {
              if (locked || widgetGlisse === null) return;
              e.preventDefault();
              void deposer(section.id, 0);
            }}
          />
        )}

      </Box>
    );
  };

  // La largeur de la rangée, relevée avant l'affichage et à chaque
  // redimensionnement : c'est sur elle que se décident les colonnes
  // automatiques masquées.
  const [rangeeEl, setRangeeEl] = useState<HTMLDivElement | null>(null);
  const [largeurRangee, setLargeurRangee] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (!rangeeEl) return;
    setLargeurRangee(rangeeEl.getBoundingClientRect().width);
    const observateur = new ResizeObserver(([entree]) => {
      if (entree) setLargeurRangee(entree.contentRect.width);
    });
    observateur.observe(rangeeEl);
    return () => observateur.disconnect();
  }, [rangeeEl]);

  // L'écart qui suit chaque colonne, sa marge droite : la dernière n'en a
  // pas. Les pour-cent se lisent sur la rangée moins leur somme.
  const derniere = ordonnees?.[ordonnees.length - 1];
  const ecartApres = (section: BoardSection) => (section.id === derniere?.id ? 0 : section.gap);
  const ecarts = (ordonnees ?? []).reduce((a, s) => a + ecartApres(s), 0);

  const cachees =
    ordonnees && largeurRangee !== null
      ? masquees(ordonnees, largeurRangee, ecartApres, ecarts)
      : new Set<Id>();
  const montrees = (ordonnees ?? []).filter((s) => !cachees.has(s.id));

  // Les écarts de part et d'autre de chaque colonne montrée : celui qui la
  // précède est l'écart de la voisine de gauche, celui qui la suit le sien.
  // Aux bords de la rangée, il n'y a pas d'écart : on reprend celui de l'autre
  // côté, pour que le cadre et le « + » s'y posent comme dans un écart.
  const ecartsAutour = (section: BoardSection): Debords & { avant: number; apres: number } => {
    const rang = montrees.findIndex((s) => s.id === section.id);
    const precedente = montrees[rang - 1];
    const apresReel = rang >= 0 && rang < montrees.length - 1 ? section.gap : null;
    const avant = precedente ? precedente.gap : (apresReel ?? section.gap);
    const apres = apresReel ?? avant;
    // Ce dont le cadre déborde de chaque côté de la colonne, dans l'écart : il
    // s'écarte de ce qu'elle porte sans le pousser, ni rien changer à l'écart.
    // Au plus loin, avec deux pixels de jour entre les traits de deux voisines.
    const debord = (ecart: number) => Math.max(0, Math.floor(ecart / 2) - 1);
    return { avant, apres, gauche: debord(avant), droite: debord(apres) };
  };

  // La marge laissée hors des colonnes du bord : le « + » s'y centre comme
  // dans un écart, et la zone de défilement ne le rogne pas.
  const bords = montrees.length > 0
    ? Math.max(
        ecartsAutour(montrees[0]!).avant,
        ecartsAutour(montrees[montrees.length - 1]!).apres,
      )
    : 0;
  const marge = Math.ceil((bords + PLUS_SIZE) / 2);
  // L'air entre deux lignes, quand des colonnes fixes passent à la ligne : le
  // plus large des écarts de la rangée.
  const ecartLignes = Math.max(0, ...montrees.map((s) => s.gap));

  // Où la colonne tenue se posera. Rien ne bouge pendant le glisser : elle
  // reste à sa place, à demi effacée, et un trait dans l'écart montre où elle
  // ira — au bord gauche de la colonne visée parmi les autres, ou à droite de
  // la dernière. Reposée à sa place, elle ne change rien : pas de trait.
  const autres = glisse && ordonnees ? ordonnees.filter((s) => s.id !== glisse.id) : [];
  const rangTenue = glisse && ordonnees ? ordonnees.findIndex((s) => s.id === glisse.id) : -1;
  const visee =
    glisse && glisse.target !== rangTenue
      ? glisse.target < autres.length
        ? { id: autres[glisse.target]!.id, avant: true }
        : { id: autres[autres.length - 1]?.id, avant: false }
      : null;

  const rangee = sections && (
    <Group
      ref={setRangeeEl}
      align="stretch"
      gap={0}
      wrap="wrap"
      // Les colonnes occupent la hauteur restante : c'est elle que la zone en
      // pointillé remplit, sous ce que la section porte déjà.
      style={{ flexGrow: 1, rowGap: ecartLignes }}
    >
      {(ordonnees ?? []).map((section, rang) => {
        const cachee = cachees.has(section.id);
        // Le « + » du bout se pose sur la dernière colonne montrée.
        const dernier = section.id === montrees[montrees.length - 1]?.id;
        const estTenue = section.id === glisse?.id;
        const autour = ecartsAutour(section);
        // L'écart entre la colonne montrée à gauche et celle-ci — celui de son
        // « + » de gauche — redimensionne celle des deux qui est en pixels, la
        // gauche d'abord. Aux bords de la rangée, il n'y a pas d'écart à tirer.
        const precedente = montrees[montrees.findIndex((s) => s.id === section.id) - 1];
        const redimensionne = !precedente
          ? undefined
          : precedente.width_unit === "px"
            ? (e: ReactPointerEvent<HTMLElement>) => prendreLargeur(e, precedente, 1)
            : section.width_unit === "px"
              ? (e: ReactPointerEvent<HTMLElement>) => prendreLargeur(e, section, -1)
              : undefined;
        const enEdition = !locked && !glisse && widgetGlisse === null && !cachee;
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
                ...largeurDe(section, ecarts),
                marginRight: ecartApres(section),
                display: cachee ? "none" : "flex",
                flexDirection: "column",
                position: "relative",
                ...(estTenue ? { opacity: 0.5, pointerEvents: "none" } : {}),
              }}
            >
              {visee?.id === section.id && (
                <TraitInsertion
                  avant={visee.avant}
                  ecart={visee.avant ? autour.avant : autour.apres}
                  debout
                />
              )}
              {enEdition && (
                <>
                  <ColumnInsert
                    label="Insérer une section ici"
                    // Centré dans l'écart qui la précède ; avant la première,
                    // à la même distance, comme dans un écart. Entre la bande
                    // de la poignée et celle du pied, à la hauteur du cadre.
                    style={{
                      top: GRIP_ZONE,
                      bottom: GRIP_ZONE,
                      left: -(autour.avant + INSERT_ZONE) / 2,
                    }}
                    onClick={inserer(rang)}
                    onResizeStart={redimensionne}
                  />
                  {dernier ? (
                    <ColumnInsert
                      label="Insérer une section ici"
                      style={{
                        top: GRIP_ZONE,
                        bottom: GRIP_ZONE,
                        right: -(autour.apres + INSERT_ZONE) / 2,
                      }}
                      onClick={inserer(sections.length)}
                    />
                  ) : (
                    // L'écart qui suit la colonne se saisit sous lui, centré
                    // dans la bande du pied, à côté de la largeur.
                    <EcartField
                      value={section.gap}
                      onChange={(gap) => changerSection(section, { gap })}
                      style={{
                        bottom: (GRIP_ZONE - ECART_FIELD_HEIGHT) / 2,
                        right: -(autour.apres + ECART_FIELD_WIDTH) / 2,
                      }}
                    />
                  )}
                </>
              )}
              {cadre(section, autour, estTenue)}
            </Box>
          </Fragment>
        );
      })}
    </Group>
  );

  // Tant que les sections ne sont pas lues, on n'affiche rien : « aucune
  // section » serait une conclusion prématurée. Verrouillée, la rangée vide
  // ne propose plus d'en ajouter.
  const contenu = !sections ? null : sections.length === 0 ? (
    <EmptyPanel
      icon={IconColumns}
      message="Aucune section"
      actionLabel={locked ? undefined : "Ajouter une section"}
      onAction={locked ? undefined : () => onAddSection()}
    />
  ) : (
    <ScrollArea
      style={{ flex: 1, minHeight: 0, marginInline: -marge }}
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
        viewport: { paddingInline: marge },
        content: { display: "flex", flexDirection: "column", minHeight: "100%" },
      }}
    >
      {rangee}
    </ScrollArea>
  );

  return (
    <>
      {contenu}

      {/* Le tiroir des widgets s'ouvre d'ici, pour toutes les colonnes : on
          choisit la place en y glissant le widget. Verrouillée, ou sans
          section où le poser, la rangée ne le propose pas. */}
      {!locked && sections && sections.length > 0 && (
        <AddButton
          label="Ajouter un widget"
          onClick={() => setTiroirOuvert(true)}
          h={AIDE_TAILLE}
          style={{
            position: "fixed",
            right: PAGE_GUTTER + AIDE_TAILLE + AIDE_ECART,
            bottom: PAGE_GUTTER,
            zIndex: 200,
          }}
        />
      )}

      {/* La copie qui suit le pointeur : la colonne entière, à sa taille,
          sans inclinaison. */}
      {glisse && tenue && (
        <Box
          style={{
            position: "fixed",
            left: glisse.x,
            top: glisse.y,
            width: glisse.width,
            height: glisse.height,
            zIndex: 400,
            pointerEvents: "none",
            display: "flex",
            flexDirection: "column",
            borderRadius: "var(--mantine-radius-md)",
            backgroundColor: "var(--mantine-color-body)",
            boxShadow: "var(--mantine-shadow-xl)",
          }}
        >
          {cadre(tenue, ecartsAutour(tenue), true)}
        </Box>
      )}

      <WidgetDrawer
        opened={tiroirOuvert}
        onClose={() => setTiroirOuvert(false)}
        // Le tiroir ne propose que les types que le compte peut modifier.
        widgets={widgets.filter((w) => acces(w.kind) === "update")}
        onDragStart={(widget) => {
          setTypeNouveau(widget.type);
          setWidgetGlisse(NOUVEAU);
        }}
        onDragEnd={() => {
          setWidgetGlisse(null);
          setColonneSurvolee(null);
        }}
      />

      {menuSection && (
        <PointMenu position={menuSection.position} onClose={() => setMenuSection(null)}>
          <Menu.Item
            leftSection={<IconCopyPlus size={16} />}
            onClick={() => void onDuplicateSection(menuSection.section)}
          >
            Dupliquer
          </Menu.Item>
          <Menu.Divider />
          <Menu.Item
            color={RED}
            leftSection={<IconTrash size={16} />}
            onClick={() => setSectionASupprimer(menuSection.section)}
          >
            Supprimer
          </Menu.Item>
        </PointMenu>
      )}

      <DeleteConfirmModal
        opened={sectionASupprimer !== null}
        onClose={() => setSectionASupprimer(null)}
        onConfirm={async () => {
          const section = sectionASupprimer;
          setSectionASupprimer(null);
          if (section) await onDeleteSection(section);
        }}
        title="Supprimer la section"
        message={
          <>
            Voulez-vous vraiment supprimer cette section ?
            {sectionASupprimer && widgetIds(sectionASupprimer).length > 0 && (
              <> Ses widgets seront supprimés avec elle.</>
            )}{" "}
            Cette action est irréversible.
          </>
        }
      />
    </>
  );
}
