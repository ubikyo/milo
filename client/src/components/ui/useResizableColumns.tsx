import { useRef, useState } from "react";
import type { CSSProperties, MouseEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import classes from "../../assets/styles/Grid.module.css";

// Des colonnes de grille qu'on élargit ou rétrécit en tirant le bord droit de
// leur en-tête.
//
// Tant que personne n'y a touché, la grille garde sa mise en page naturelle :
// chaque colonne prend la largeur de son contenu, sur toute la largeur de la
// section. Au premier glissement, les largeurs affichées sont relevées et
// figées (table-layout: fixed) : la colonne tirée suit la souris, les autres
// ne bougent plus, et une seule prend ce qui reste de la section. Un double-clic
// sur une poignée rend à la grille sa mise en page naturelle.
//
// Les largeurs restent dans le navigateur, par grille : c'est un confort de
// lecture, pas un réglage partagé.

/** En deçà, la colonne ne montrerait plus qu'une ellipse. */
const WIDTH_MIN = 40;
/** Pour une colonne montrée après coup, dont on n'a pas encore la largeur. */
const DEFAULT_WIDTH = 150;

/** La classe posée sur le body pendant un glissement. */
const DRAGGING = classes.dragging ?? "";

type Widths = Record<string, number>;

const storageKey = (name: string) => `milo.columns.${name}`;

/** Où les largeurs de cette grille se rangeaient avant la traduction des noms. */
const legacyKey = (name: string) =>
  `milo.colonnes.${name === "projects" ? "projets" : name.replace(/^inventory\./, "inventaire.")}`;

/** Les colonnes renommées : la case à cocher du support s'appelait « case ». */
const LEGACY_COLUMNS: Record<string, string> = { case: "checkbox" };

function read(name: string): Widths | null {
  try {
    const raw = localStorage.getItem(storageKey(name));
    if (raw) return JSON.parse(raw) as Widths;
    // Les largeurs d'avant : reprises sous leur nouveau nom, une fois.
    const legacy = localStorage.getItem(legacyKey(name));
    if (!legacy) return null;
    const widths = Object.fromEntries(
      Object.entries(JSON.parse(legacy) as Widths).map(([id, w]) => [LEGACY_COLUMNS[id] ?? id, w]),
    );
    localStorage.setItem(storageKey(name), JSON.stringify(widths));
    localStorage.removeItem(legacyKey(name));
    return widths;
  } catch {
    return null;
  }
}

function write(name: string, widths: Widths | null) {
  try {
    if (widths) localStorage.setItem(storageKey(name), JSON.stringify(widths));
    else localStorage.removeItem(storageKey(name));
  } catch {
    // Stockage refusé (navigation privée…) : les largeurs valent pour la page.
  }
}

const stop = (e: MouseEvent) => e.stopPropagation();

/**
 * « nom » distingue la grille dans le stockage ; « cles » liste ses colonnes
 * montrées, dans l'ordre de leurs en-têtes — y compris celles sans poignée,
 * comme la case à cocher du support.
 *
 * « initiales » donne à la grille, tant que personne n'y a touché, des
 * largeurs de départ au lieu de sa mise en page naturelle : les colonnes
 * qu'elle nomme les prennent, celles qu'elle tait se partagent le reste de la
 * section. Le double-clic y ramène.
 */
export function useResizableColumns(
  name: string,
  keys: string[],
  initials?: Widths,
) {
  const tableRef = useRef<HTMLTableElement>(null);
  const [widths, setWidths] = useState<Widths | null>(() => read(name));

  const widthOf = (key: string) => widths?.[key] ?? DEFAULT_WIDTH;

  // Les largeurs telles qu'affichées. Celles des colonnes masquées sont
  // gardées, pour le jour où elles reviennent.
  const measure = (): Widths => {
    const measures: Widths = { ...widths };
    const cells = tableRef.current?.tHead?.rows[0]?.cells;
    keys.forEach((key, i) => {
      const cell = cells?.[i];
      if (cell) measures[key] = Math.round(cell.getBoundingClientRect().width);
    });
    return measures;
  };

  const start = (key: string) => (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const handle = e.currentTarget;
    const startX = e.clientX;
    let currentWidths = measure();
    const start = currentWidths[key] ?? DEFAULT_WIDTH;
    setWidths(currentWidths);

    handle.setPointerCapture(e.pointerId);
    handle.dataset.active = "";
    document.body.classList.add(DRAGGING);

    const move = (ev: PointerEvent) => {
      currentWidths = {
        ...currentWidths,
        [key]: Math.max(WIDTH_MIN, Math.round(start + ev.clientX - startX)),
      };
      setWidths(currentWidths);
    };
    const finish = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", finish);
      handle.removeEventListener("pointercancel", finish);
      delete handle.dataset.active;
      document.body.classList.remove(DRAGGING);
      write(name, currentWidths);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", finish);
    handle.addEventListener("pointercancel", finish);
  };

  const reset = (e: MouseEvent) => {
    e.stopPropagation();
    setWidths(null);
    write(name, null);
  };

  // La grille fait toute la largeur de sa section, et au moins la somme des
  // colonnes : au-delà, la section la fait défiler de côté. L'air qui reste
  // va à une seule colonne, seule à ne pas dire sa largeur : rétrécir une
  // autre ne regonfle pas ses voisines. C'est la dernière, ou, quand la
  // grille a des largeurs de départ, la première à ne pas en avoir.
  const flexible = keys.find((key) => initials && !initials[key]) ?? keys[keys.length - 1];
  const style: CSSProperties | undefined = widths
    ? {
        tableLayout: "fixed",
        width: "100%",
        minWidth: keys.reduce((sum, key) => sum + widthOf(key), 0),
      }
    : initials
      ? {
          tableLayout: "fixed",
          width: "100%",
          minWidth: keys.reduce((sum, key) => sum + (initials[key] ?? WIDTH_MIN), 0),
        }
      : undefined;

  return {
    /** À étaler sur la « Table ». */
    tableProps: { ref: tableRef, className: classes.grid, style },
    /** À poser en tête de la « Table », avant « Table.Thead ». */
    colgroup: widths ? (
      <colgroup>
        {keys.map((key) => (
          <col key={key} style={key !== flexible ? { width: widthOf(key) } : undefined} />
        ))}
      </colgroup>
    ) : initials ? (
      <colgroup>
        {keys.map((key) => (
          <col key={key} style={initials[key] ? { width: initials[key] } : undefined} />
        ))}
      </colgroup>
    ) : null,
    /** La poignée d'une colonne, à poser dans son en-tête. */
    handle: (key: string): ReactNode => (
      <div
        className={classes.handle}
        role="separator"
        aria-orientation="vertical"
        aria-label="Redimensionner la colonne"
        onPointerDown={start(key)}
        onClick={stop}
        onDoubleClick={reset}
      />
    ),
  };
}
