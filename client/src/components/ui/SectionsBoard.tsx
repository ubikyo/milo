import { Box, Center, Group, Menu, ScrollArea } from "@mantine/core";
import {
  IconColumns,
  IconCopyPlus,
  IconGripHorizontal,
  IconPencil,
  IconTrash,
} from "@tabler/icons-react";
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { RED } from "../../themes/colors";
import AddButton from "./AddButton";
import ColumnInsert, { COLUMN_INSERT_ZONE as INSERT_ZONE } from "./ColumnInsert";
import DeleteConfirmModal from "./DeleteConfirmModal";
import EmptyPanel from "./EmptyPanel";
import PointMenu, { positionDuMenu, type PointMenuPosition } from "./PointMenu";
import SectionDropZone, { POINTILLE } from "./SectionDropZone";
import type { WidgetDrag } from "./WidgetDrop";
import type { Id, SectionWidthUnit } from "@milo/shared";

// Des sections en colonnes, et les widgets qu'elles portent. C'est la rangée
// du mode Accès — les sections d'une catégorie — et celle des modes Support
// et Assets, où la liste est un widget parmi les indicateurs.
//
// Une section n'a qu'une largeur : laissée à la rangée, ou fixée en pour-cent
// ou en pixels. Elle se glisse par sa poignée pour changer de rang, s'insère
// entre deux autres par le « + » qui paraît au survol de l'écart, et son clic
// droit la modifie, la duplique ou la supprime. Vide, elle montre une zone
// d'ajout ; garnie, un « Ajouter un widget » sous son dernier widget.
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
}

interface SectionsBoardProps<S extends BoardSection> {
  /** « null » tant que les sections ne sont pas lues ; rien ne s'affiche alors. */
  sections: S[] | null;
  locked: boolean;
  /** L'écart entre deux colonnes, en pixels. */
  gap: number;
  /** Les widgets d'une section, dans l'ordre : le dépôt se calcule sur eux. */
  widgetIds: (section: S) => Id[];
  /** Ce que la section porte. « drag » est inerte pour les copies qui suivent le pointeur. */
  renderWidgets: (section: S, drag: WidgetDrag) => ReactNode;
  /** Le « + » d'une section : il ouvre la boîte de choix des widgets. */
  onAddWidget: (section: S) => void;
  /** Ce que la section porte désormais, dans l'ordre : le rangement part au serveur. */
  onReorderWidgets: (sectionId: Id, ids: Id[]) => void | Promise<void>;
  /** Sans rang, la section va au bout ; le « + » entre deux colonnes en donne un. */
  onAddSection: (index?: number) => void;
  onEditSection: (section: S) => void;
  /** La copie, avec ses widgets, se pose à droite de l'original. */
  onDuplicateSection: (section: S) => void | Promise<void>;
  /** Supprimée depuis le clic droit : la rangée a déjà posé la question. */
  onDeleteSection: (section: S) => void | Promise<void>;
  /** Le nouvel ordre des colonnes, posé par leur poignée. */
  onReorderSections: (ids: Id[]) => void | Promise<void>;
}

// Largeur en deçà de laquelle une colonne automatique ne se resserre plus : la
// même respiration que la rangée de listes du mode Tâche.
const SECTION_MIN_WIDTH = 200;

// Espace entre le dernier widget d'une colonne et le geste d'ajout qui la
// termine.
const AJOUT_GAP = 12;

// Course en deçà de laquelle l'appui sur la poignée reste un clic.
const DRAG_THRESHOLD = 5;

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

interface GlisserSectionEnCours extends GlisserSection {
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
  started: boolean;
  /**
   * La place des autres colonnes, relevée au premier appui. Le rang se lit
   * sur elles et non sur la rangée du moment : l'emplacement d'accueil y
   * pousse les colonnes, et le rang visé changerait sous le pointeur.
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
 * La largeur que la section dit. « Automatique » laisse la rangée la répartir
 * à parts égales ; les deux autres la fixent, et la colonne ne se resserre ni
 * ne s'étire — celles qui ne tiennent plus passent à la ligne suivante.
 *
 * Un pourcentage se lit sur ce qui reste de la rangée une fois les écarts
 * retirés, et non sur la rangée entière : sans cela, trois sections à 25, 50
 * et 25 % réclameraient 100 % plus deux écarts, et la dernière retournerait à
 * la ligne. D'où « nombre », le compte des colonnes qui se partagent la
 * rangée, et « ecart », celui qu'on laisse entre deux.
 */
const largeurDe = (section: BoardSection, nombre: number, ecart: number): CSSProperties => {
  if (section.width_unit === "auto") {
    return { flex: `1 1 ${SECTION_MIN_WIDTH}px`, minWidth: SECTION_MIN_WIDTH };
  }
  if (section.width_unit === "percent") {
    const ecarts = ecart * Math.max(nombre - 1, 0);
    const part = section.width_value ?? 0;
    return {
      flex: `0 0 calc((100% - ${ecarts}px) * ${part} / 100)`,
      minWidth: 0,
    };
  }
  return { flex: `0 0 ${section.width_value ?? 0}px`, minWidth: 0 };
};

export default function SectionsBoard<S extends BoardSection>({
  sections,
  locked,
  gap: ecart,
  widgetIds,
  renderWidgets,
  onAddWidget,
  onReorderWidgets,
  onAddSection,
  onEditSection,
  onDuplicateSection,
  onDeleteSection,
  onReorderSections,
}: SectionsBoardProps<S>) {
  // Le widget que l'on tient, ou « null ». Il vit ici et non dans une
  // colonne : on le prend dans l'une et on le pose dans une autre.
  const [widgetGlisse, setWidgetGlisse] = useState<Id | null>(null);
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
  // Le même geste que les listes du mode Tâche : la colonne quitte sa place,
  // une copie suit le pointeur, et la colonne elle-même, à demi effacée,
  // montre où elle se posera. Au pointeur et non au glisser natif : celui-ci
  // ne laisse voir qu'une image figée.
  const ordonnees = !sections
    ? null
    : ordreLocal
      ? ordreLocal
          .map((id) => sections.find((s) => s.id === id))
          .filter((s): s is S => s !== undefined)
      : sections;

  // Les écouteurs sont posés une fois : ils lisent l'état courant par une ref.
  const etat = useRef({ ordonnees, onReorderSections });
  useLayoutEffect(() => {
    etat.current = { ordonnees, onReorderSections };
  });

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
   * Le cadre d'une colonne et ce qu'il porte. « inerte » : la copie qui suit
   * le pointeur et l'emplacement d'accueil, qui se montrent sans répondre.
   */
  const cadre = (section: S, inerte = false) => {
    const nombre = widgetIds(section).length;
    return (
      <Box
        // Le clic droit dans le vide de la colonne. Sur un widget, c'est le
        // menu du widget qui s'ouvre : il a déjà pris l'événement.
        onContextMenu={(e) => {
          if (inerte || locked || e.defaultPrevented) return;
          setMenuSection({ section, position: positionDuMenu(e) });
        }}
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          ...(locked
            ? {}
            : {
                border: `1px dashed ${POINTILLE}`,
                borderRadius: "var(--mantine-radius-md)",
                padding: "var(--mantine-spacing-xs) var(--mantine-spacing-xs) 0",
              }),
        }}
      >
        {renderWidgets(section, inerte ? INERTE : drag)}

        {/* Une colonne garnie n'a plus sa grande zone d'accueil, mais elle
            doit rester ouverte : sans ce geste, on ne pourrait plus lui
            ajouter un second widget. Discret, sous le dernier, comme au bout
            d'une liste du mode Tâche. */}
        {nombre > 0 && !locked && (
          <AddButton
            label="Ajouter un widget"
            onClick={() => onAddWidget(section)}
            mt={AJOUT_GAP}
          />
        )}

        {/* L'invite ne paraît que pour une colonne vide. Verrouillée, la zone
            garde sa place sans se montrer ; sinon elle ne double pas le cadre
            de la colonne. */}
        {nombre === 0 && (
          <SectionDropZone
            onClick={() => onAddWidget(section)}
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

        {/* La poignée, tout en bas : c'est par elle, et par elle seule, que la
            colonne se déplace — le reste appartient à ses widgets, qui ont
            leur propre glisser. */}
        {!locked && (
          <Center
            onPointerDown={(e) => prendreColonne(e, section)}
            aria-label="Déplacer la section"
            c="dimmed"
            py={4}
            // Poussée au pied du cadre, même quand la colonne est plus haute
            // que ce qu'elle porte.
            mt="auto"
            style={{ cursor: "grab", touchAction: "none" }}
          >
            <IconGripHorizontal size={16} />
          </Center>
        )}
      </Box>
    );
  };

  /** L'emplacement d'accueil : la colonne tenue, à demi effacée, là où elle se posera. */
  const accueil = tenue && sections && (
    <Box
      key="accueil"
      style={{
        ...largeurDe(tenue, sections.length, ecart),
        display: "flex",
        flexDirection: "column",
        opacity: 0.5,
        pointerEvents: "none",
      }}
    >
      {cadre(tenue, true)}
    </Box>
  );

  const visibles = ordonnees && glisse ? ordonnees.filter((s) => s.id !== glisse.id) : ordonnees;

  const rangee = sections && (
    <Group
      align="stretch"
      gap={ecart}
      wrap="wrap"
      // Les colonnes occupent la hauteur restante : c'est elle que la zone en
      // pointillé remplit, sous ce que la section porte déjà.
      style={{ flexGrow: 1 }}
    >
      {(visibles ?? []).map((section, rang) => {
        const dernier = rang === (visibles ?? []).length - 1;
        return (
          <Fragment key={section.id}>
            {glisse?.target === rang && accueil}
            {/* La place de la colonne dans la rangée. Hors verrou, elle porte
                un cadre en pointillé — celui de la zone d'ajout —, sa poignée
                en bas, et les « + » qui insèrent une colonne à côté. */}
            <Box
              data-section-id={section.id}
              style={{
                ...largeurDe(section, sections.length, ecart),
                display: "flex",
                flexDirection: "column",
                position: "relative",
              }}
            >
              {!locked && !glisse && widgetGlisse === null && (
                <>
                  <ColumnInsert
                    label="Insérer une section ici"
                    // Centré dans l'écart qui la précède ; avant la première,
                    // juste à sa gauche.
                    style={{ left: rang === 0 ? -INSERT_ZONE : -(ecart + INSERT_ZONE) / 2 }}
                    onClick={() => onAddSection(rang)}
                  />
                  {dernier && (
                    <ColumnInsert
                      label="Insérer une section ici"
                      style={{ right: -INSERT_ZONE }}
                      onClick={() => onAddSection(sections.length)}
                    />
                  )}
                </>
              )}
              {cadre(section)}
            </Box>
          </Fragment>
        );
      })}
      {glisse && glisse.target >= (visibles ?? []).length && accueil}
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
      style={{ flex: 1, minHeight: 0, marginInline: -INSERT_ZONE }}
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
        viewport: { paddingInline: INSERT_ZONE },
        content: { display: "flex", flexDirection: "column", minHeight: "100%" },
      }}
    >
      {rangee}
    </ScrollArea>
  );

  return (
    <>
      {contenu}

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
          {cadre(tenue, true)}
        </Box>
      )}

      {menuSection && (
        <PointMenu position={menuSection.position} onClose={() => setMenuSection(null)}>
          <Menu.Item
            leftSection={<IconPencil size={16} />}
            onClick={() => onEditSection(menuSection.section)}
          >
            Modifier
          </Menu.Item>
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
