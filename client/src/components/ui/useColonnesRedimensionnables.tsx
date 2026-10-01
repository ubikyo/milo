import { useRef, useState } from "react";
import type { CSSProperties, MouseEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import classes from "../../assets/styles/Grille.module.css";

// Des colonnes de grille qu'on élargit ou rétrécit en tirant le bord droit de
// leur en-tête.
//
// Tant que personne n'y a touché, la grille garde sa mise en page naturelle :
// chaque colonne prend la largeur de son contenu, sur toute la largeur de la
// section. Au premier glissement, les largeurs affichées sont relevées et
// figées (table-layout: fixed) : la colonne tirée suit la souris, les autres
// ne bougent plus, et la dernière prend ce qui reste de la section. Un double-clic
// sur une poignée rend à la grille sa mise en page naturelle.
//
// Les largeurs restent dans le navigateur, par grille : c'est un confort de
// lecture, pas un réglage partagé.

/** En deçà, la colonne ne montrerait plus qu'une ellipse. */
const LARGEUR_MIN = 40;
/** Pour une colonne montrée après coup, dont on n'a pas encore la largeur. */
const LARGEUR_PAR_DEFAUT = 150;

/** La classe posée sur le body pendant un glissement. */
const GLISSE = classes.glisse ?? "";

type Largeurs = Record<string, number>;

const cleStockage = (nom: string) => `milo.colonnes.${nom}`;

function lire(nom: string): Largeurs | null {
  try {
    const brut = localStorage.getItem(cleStockage(nom));
    return brut ? (JSON.parse(brut) as Largeurs) : null;
  } catch {
    return null;
  }
}

function ecrire(nom: string, largeurs: Largeurs | null) {
  try {
    if (largeurs) localStorage.setItem(cleStockage(nom), JSON.stringify(largeurs));
    else localStorage.removeItem(cleStockage(nom));
  } catch {
    // Stockage refusé (navigation privée…) : les largeurs valent pour la page.
  }
}

const arreter = (e: MouseEvent) => e.stopPropagation();

/**
 * « nom » distingue la grille dans le stockage ; « cles » liste ses colonnes
 * montrées, dans l'ordre de leurs en-têtes — y compris celles sans poignée,
 * comme la case à cocher du support.
 */
export function useColonnesRedimensionnables(nom: string, cles: string[]) {
  const tableRef = useRef<HTMLTableElement>(null);
  const [largeurs, setLargeurs] = useState<Largeurs | null>(() => lire(nom));

  const largeurDe = (cle: string) => largeurs?.[cle] ?? LARGEUR_PAR_DEFAUT;

  // Les largeurs telles qu'affichées. Celles des colonnes masquées sont
  // gardées, pour le jour où elles reviennent.
  const mesurer = (): Largeurs => {
    const mesures: Largeurs = { ...largeurs };
    const cellules = tableRef.current?.tHead?.rows[0]?.cells;
    cles.forEach((cle, i) => {
      const cellule = cellules?.[i];
      if (cellule) mesures[cle] = Math.round(cellule.getBoundingClientRect().width);
    });
    return mesures;
  };

  const commencer = (cle: string) => (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const poignee = e.currentTarget;
    const departX = e.clientX;
    let courantes = mesurer();
    const depart = courantes[cle] ?? LARGEUR_PAR_DEFAUT;
    setLargeurs(courantes);

    poignee.setPointerCapture(e.pointerId);
    poignee.dataset.actif = "";
    document.body.classList.add(GLISSE);

    const bouger = (ev: PointerEvent) => {
      courantes = {
        ...courantes,
        [cle]: Math.max(LARGEUR_MIN, Math.round(depart + ev.clientX - departX)),
      };
      setLargeurs(courantes);
    };
    const finir = () => {
      poignee.removeEventListener("pointermove", bouger);
      poignee.removeEventListener("pointerup", finir);
      poignee.removeEventListener("pointercancel", finir);
      delete poignee.dataset.actif;
      document.body.classList.remove(GLISSE);
      ecrire(nom, courantes);
    };
    poignee.addEventListener("pointermove", bouger);
    poignee.addEventListener("pointerup", finir);
    poignee.addEventListener("pointercancel", finir);
  };

  const reinitialiser = (e: MouseEvent) => {
    e.stopPropagation();
    setLargeurs(null);
    ecrire(nom, null);
  };

  // La grille fait toute la largeur de sa section, et au moins la somme des
  // colonnes : au-delà, la section la fait défiler de côté. L'air qui reste
  // va à la dernière colonne, seule à ne pas dire sa largeur : rétrécir une
  // autre ne regonfle pas ses voisines.
  const style: CSSProperties | undefined = largeurs
    ? {
        tableLayout: "fixed",
        width: "100%",
        minWidth: cles.reduce((somme, cle) => somme + largeurDe(cle), 0),
      }
    : undefined;

  return {
    /** À étaler sur la « Table ». */
    tableProps: { ref: tableRef, className: classes.grille, style },
    /** À poser en tête de la « Table », avant « Table.Thead ». */
    colgroup: largeurs ? (
      <colgroup>
        {cles.map((cle, i) => (
          <col key={cle} style={i < cles.length - 1 ? { width: largeurDe(cle) } : undefined} />
        ))}
      </colgroup>
    ) : null,
    /** La poignée d'une colonne, à poser dans son en-tête. */
    poignee: (cle: string): ReactNode => (
      <div
        className={classes.poignee}
        role="separator"
        aria-orientation="vertical"
        aria-label="Redimensionner la colonne"
        onPointerDown={commencer(cle)}
        onClick={arreter}
        onDoubleClick={reinitialiser}
      />
    ),
  };
}
