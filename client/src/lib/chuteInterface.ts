// L'interface qui tombe et se pose : le code Konami la fait dégringoler puis
// revenir ; la connexion la pose sur une page vierge.

const alea = (min: number, max: number): number => min + Math.random() * (max - min);

// Avant la fête, l'interface se décroche : chaque morceau bascule sur un coin,
// comme une affiche qui perd une punaise, puis tombe hors de l'écran. Tout
// revient à la fin, d'un petit rebond. Tout passe par l'API d'animation du
// navigateur : rien ne touche au rendu de React, et l'annulation rend chaque
// morceau intact.
export const DECROCHAGE = 1300;
export const DECROCHAGE_ETALEMENT = 600;
const RETOUR = 700;
const RETOUR_ETALEMENT = 400;
// Pas de gros morceau : au-delà de ces mesures, un élément est un cadre — la
// page, une colonne, un widget. Il reste en place, perd son fond, et ce sont
// ses enfants qui tombent.
const AIRE_MAX = 0.05;
const LARGEUR_MAX = 0.4;
const HAUTEUR_MAX = 0.35;
// Ce qui tombe d'un bloc, quelle que soit sa taille : un onglet, une vue, une
// liste de tâches.
const D_UN_BLOC = [
  ".mantine-Tabs-tab",
  ".mantine-SegmentedControl-control",
  ".mantine-SegmentedControl-indicator",
  "[data-list-id]",
].join(",");
// Les traits ne tombent pas — un filet qui dégringole n'a rien de beau : ils
// s'effacent en fondu. Ceux des onglets et des grilles ne sont pas des
// éléments : une classe posée sur la racine les éteint, la transition les
// fait passer en douceur. Elle coupe aussi le pointeur : sans quoi, sous la
// souris, un survol s'allumerait sur ce qui reste en place.
const FONDU = 400;
const CLASSE_SANS_FILETS = "milo-sans-filets";
const SANS_FILETS = `
.mantine-Tabs-list::before { transition: opacity ${FONDU}ms; }
table, thead, tbody, tr, th, td { transition: border-color ${FONDU}ms; }
.${CLASSE_SANS_FILETS} .mantine-Tabs-list::before { opacity: 0; }
.${CLASSE_SANS_FILETS} :is(table, thead, tbody, tr, th, td) { border-color: transparent !important; }
.${CLASSE_SANS_FILETS} * { pointer-events: none !important; }
`;
// Un trait : un séparateur déclaré, ou un élément de quelques pixels d'épais.
const TRAIT = "hr, [role='separator'], .mantine-Divider-root";
const EPAISSEUR_TRAIT = 4;

/** Des éléments qui tombent ensemble, d'un seul mouvement, autour d'un même coin. */
interface Chute {
  elements: HTMLElement[];
  /** Le coin qui tient encore, à l'écran. */
  pivot: { x: number; y: number };
  sens: 1 | -1;
  /** Le haut du groupe à l'écran : la chute se mesure depuis lui. */
  haut: number;
  retard: number;
}

const visible = (rect: DOMRect): boolean =>
  rect.width > 0 &&
  rect.height > 0 &&
  rect.bottom > 0 &&
  rect.top < window.innerHeight &&
  rect.right > 0 &&
  rect.left < window.innerWidth;

/** Le retard d'un morceau rangé de gauche à droite : il tombe en cascade. */
const enCascade = (gauche: number): number =>
  (Math.max(0, gauche) / window.innerWidth) * DECROCHAGE_ETALEMENT + alea(0, 80);

/** Un groupe qui tombe autour du coin haut, à gauche ou à droite. */
function chuteDe(elements: HTMLElement[], rects: DOMRect[], retard: number): Chute {
  const sens = Math.random() < 0.5 ? -1 : 1;
  const gauche = Math.min(...rects.map((r) => r.left));
  const droite = Math.max(...rects.map((r) => r.right));
  const haut = Math.min(...rects.map((r) => r.top));
  return { elements, pivot: { x: sens > 0 ? gauche : droite, y: haut }, sens, haut, retard };
}

/** Une grille tombe colonne par colonne : les cellules d'une colonne ensemble. */
function colonnesDe(table: HTMLTableElement): Chute[] {
  const colonnes = new Map<number, { elements: HTMLElement[]; rects: DOMRect[] }>();
  for (const ligne of table.rows) {
    let rang = 0;
    for (const cellule of ligne.cells) {
      const rect = cellule.getBoundingClientRect();
      if (visible(rect)) {
        const colonne = colonnes.get(rang) ?? { elements: [], rects: [] };
        colonne.elements.push(cellule);
        colonne.rects.push(rect);
        colonnes.set(rang, colonne);
      }
      rang += cellule.colSpan;
    }
  }
  return [...colonnes.values()].map((c) =>
    chuteDe(c.elements, c.rects, enCascade(Math.min(...c.rects.map((r) => r.left)))),
  );
}

/**
 * Découpe l'interface en morceaux qui tomberont chacun de leur côté, et
 * relève les cadres qu'ils laissent : ceux-là perdent leur fond.
 */
function decouperLInterface(): {
  chutes: Chute[];
  cadres: HTMLElement[];
  lignes: HTMLElement[];
  traits: HTMLElement[];
} {
  const ecran = window.innerWidth * window.innerHeight;
  const chutes: Chute[] = [];
  const cadres: HTMLElement[] = [];
  // Les lignes d'une grille restent en place quand ses colonnes tombent : leur
  // fond — celui du survol — doit partir avec elles.
  const lignes: HTMLElement[] = [];
  const traits: HTMLElement[] = [];
  const parcourir = (el: Element) => {
    for (const enfant of el.children) {
      if (!(enfant instanceof HTMLElement || enfant instanceof SVGSVGElement)) continue;
      if (["SCRIPT", "STYLE", "LINK", "TEMPLATE"].includes(enfant.tagName)) continue;
      const rect = enfant.getBoundingClientRect();
      // Sans taille — « display: contents », un conteneur dont les enfants
      // sont positionnés —, l'élément peut encore porter des choses visibles.
      if (rect.width === 0 || rect.height === 0) {
        parcourir(enfant);
        continue;
      }
      if (!visible(rect)) continue;
      const morceau = enfant as HTMLElement;
      if (enfant.matches(TRAIT) || Math.min(rect.width, rect.height) <= EPAISSEUR_TRAIT) {
        traits.push(morceau);
        continue;
      }
      if (enfant.matches(D_UN_BLOC)) {
        chutes.push(chuteDe([morceau], [rect], enCascade(rect.left)));
        continue;
      }
      if (enfant instanceof HTMLTableElement) {
        chutes.push(...colonnesDe(enfant));
        cadres.push(enfant);
        lignes.push(...enfant.rows, ...enfant.tBodies);
        if (enfant.tHead) lignes.push(enfant.tHead);
        continue;
      }
      // Un dessin — un graphique — tombe d'une pièce : ses parties ne sont
      // pas des éléments qu'on découpe.
      if (enfant instanceof SVGSVGElement) {
        chutes.push(chuteDe([morceau], [rect], alea(0, DECROCHAGE_ETALEMENT)));
        continue;
      }
      const petit =
        rect.width * rect.height <= ecran * AIRE_MAX &&
        rect.width <= window.innerWidth * LARGEUR_MAX &&
        rect.height <= window.innerHeight * HAUTEUR_MAX;
      // Un gros élément sans enfant ne se découpe pas, ni celui qui porte du
      // texte à même lui : le texte resterait en l'air. Il tombe tel quel.
      const texte = [...enfant.childNodes].some(
        (n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim(),
      );
      if (petit || texte || enfant.children.length === 0) {
        chutes.push(chuteDe([morceau], [rect], alea(0, DECROCHAGE_ETALEMENT)));
        continue;
      }
      cadres.push(morceau);
      parcourir(enfant);
    }
  };
  parcourir(document.body);
  return { chutes, cadres, lignes, traits };
}

/** Fait tomber l'interface ; la fonction rendue la fait revenir. */
export function decrocherLInterface(): () => void {
  const filets = document.createElement("style");
  filets.textContent = SANS_FILETS;
  document.head.appendChild(filets);
  const racine = document.documentElement;
  // La transition doit être en place avant la classe, sinon elle ne joue pas :
  // une lecture de mise en page l'y installe, sans attendre l'image suivante —
  // le pointeur, lui, doit être coupé tout de suite.
  void racine.offsetHeight;
  racine.classList.add(CLASSE_SANS_FILETS);

  const { chutes, cadres, lignes, traits } = decouperLInterface();
  const avant: StyleAvant = new Map();

  // Les cadres vidés perdent leur fond, leur bordure et leur ombre. Tous :
  // un cadre sans fond aujourd'hui en prendrait un au survol.
  const effacements = cadres
    .map((cadre) =>
      cadre.animate(
        { backgroundColor: "transparent", borderColor: "transparent", boxShadow: "none" },
        { duration: FONDU, easing: "ease-out", fill: "forwards" },
      ),
    );
  // Le survol d'une ligne s'éteint aussitôt : il ne doit pas traîner derrière
  // les colonnes qui tombent.
  effacements.push(
    ...lignes.map((ligne) =>
      ligne.animate({ backgroundColor: "transparent" }, { duration: 80, fill: "forwards" }),
    ),
  );
  // Les traits s'effacent, sans bouger.
  effacements.push(
    ...traits.map((trait) =>
      trait.animate({ opacity: 0 }, { duration: FONDU, easing: "ease-out", fill: "forwards" }),
    ),
  );

  const animations = chutes.flatMap((chute) => {
    const { sens, pivot } = chute;
    const tombe = window.innerHeight - chute.haut + 80;
    const derive = sens * alea(10, 60);
    const angle = sens * alea(25, 60);
    return chute.elements.map((el) => {
      avant.set(el, { origine: el.style.transformOrigin, display: el.style.display });
      // Un élément en ligne ne se transforme pas : on le fait bloc le temps de
      // la chute, s'il tient sur une seule ligne.
      if (getComputedStyle(el).display === "inline" && el.getClientRects().length === 1) {
        el.style.display = "inline-block";
      }
      // Tous les éléments du groupe tournent autour du même coin : ils
      // tombent d'une pièce.
      const rect = el.getBoundingClientRect();
      el.style.transformOrigin = `${pivot.x - rect.left}px ${pivot.y - rect.top}px`;
      return el.animate(
        [
          { transform: "none", easing: "ease-out" },
          { transform: `rotate(${sens * 9}deg)`, offset: 0.2, easing: "ease-in-out" },
          { transform: `rotate(${sens * 4}deg)`, offset: 0.35, easing: "ease-in-out" },
          {
            transform: `rotate(${sens * 12}deg)`,
            opacity: 1,
            offset: 0.5,
            easing: "cubic-bezier(.55,0,1,.45)",
          },
          // Un morceau pris dans une colonne qui coupe ses bords disparaît en
          // s'effaçant, plutôt que d'un coup au bas de la colonne.
          { opacity: 1, offset: 0.85 },
          { transform: `translate(${derive}px, ${tombe}px) rotate(${angle}deg)`, opacity: 0 },
        ],
        { duration: DECROCHAGE, delay: chute.retard, fill: "forwards" },
      );
    });
  });

  return () => {
    racine.classList.remove(CLASSE_SANS_FILETS);
    window.setTimeout(() => filets.remove(), FONDU);
    effacements.forEach((e) => {
      e.reverse();
      e.onfinish = () => e.cancel();
    });
    // Le retour se pose avant que la chute ne s'annule : sans quoi chaque
    // morceau reparaîtrait un instant à sa place.
    poserLesMorceaux(chutes, avant);
    animations.forEach((a) => a.cancel());
  };
}

/** Ce qu'un morceau portait avant qu'on ne touche à son style. */
type StyleAvant = Map<HTMLElement, { origine: string; display: string }>;

/**
 * Fait revenir les morceaux à leur place : chacun descend un peu et rebondit.
 * Jusqu'à son départ, un morceau est invisible.
 */
function poserLesMorceaux(chutes: Chute[], avant: StyleAvant) {
  for (const chute of chutes) {
    // Un groupe revient d'un seul mouvement, comme il est tombé.
    const retard = alea(0, RETOUR_ETALEMENT);
    for (const el of chute.elements) {
      const retour = el.animate(
        [
          { transform: "translateY(-40px) scale(0.95)", opacity: 0 },
          { transform: "none", opacity: 1 },
        ],
        { duration: RETOUR, delay: retard, easing: "cubic-bezier(.34,1.56,.64,1)", fill: "backwards" },
      );
      retour.onfinish = () => {
        const style = avant.get(el);
        if (!style) return;
        el.style.transformOrigin = style.origine;
        el.style.display = style.display;
      };
    }
  }
}

// À la connexion, l'interface se construit sous les yeux : la page part vierge
// le temps que tout se charge, puis chaque morceau se pose comme au retour du
// code Konami.
const CLASSE_PAGE_VIERGE = "milo-page-vierge";
const PAGE_VIERGE = `.${CLASSE_PAGE_VIERGE} body > * { opacity: 0 !important; }`;
let pageVierge: HTMLStyleElement | null = null;

/** Cache l'interface, en attendant de la poser. */
export function viderLaPage() {
  if (!pageVierge) {
    pageVierge = document.createElement("style");
    pageVierge.textContent = PAGE_VIERGE;
    document.head.appendChild(pageVierge);
  }
  document.documentElement.classList.add(CLASSE_PAGE_VIERGE);
}

/** Pose l'interface, morceau par morceau, sur la page vierge. */
export function poserLInterface() {
  const racine = document.documentElement;
  const filets = document.createElement("style");
  filets.textContent = SANS_FILETS;
  document.head.appendChild(filets);
  void racine.offsetHeight;
  racine.classList.add(CLASSE_SANS_FILETS);

  const { chutes, cadres, traits } = decouperLInterface();
  // Rien n'a encore touché au style des morceaux : on ne restaure rien.
  poserLesMorceaux(chutes, new Map());
  // Les cadres prennent leur fond, et les traits paraissent, en fondu.
  const depart = { backgroundColor: "transparent", borderColor: "transparent", boxShadow: "none" };
  cadres.forEach((cadre) =>
    cadre.animate([{ ...depart, offset: 0 }], { duration: FONDU * 2, easing: "ease-out" }),
  );
  traits.forEach((trait) =>
    trait.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: FONDU,
      delay: RETOUR_ETALEMENT,
      easing: "ease-out",
      fill: "backwards",
    }),
  );
  // Tout est en place, invisible jusqu'à son tour : la page peut reparaître.
  racine.classList.remove(CLASSE_PAGE_VIERGE);
  racine.classList.remove(CLASSE_SANS_FILETS);
  window.setTimeout(() => filets.remove(), FONDU);
}
