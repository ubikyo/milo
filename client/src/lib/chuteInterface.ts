// L'interface qui tombe et se pose : le code Konami la fait dégringoler puis
// revenir ; la connexion la pose sur une page vierge.

const random = (min: number, max: number): number => min + Math.random() * (max - min);

// Avant la fête, l'interface se décroche : chaque morceau bascule sur un coin,
// comme une affiche qui perd une punaise, puis tombe hors de l'écran. Tout
// revient à la fin, d'un petit rebond. Tout passe par l'API d'animation du
// navigateur : rien ne touche au rendu de React, et l'annulation rend chaque
// morceau intact.
export const DETACH = 1300;
export const DETACH_SPREAD = 600;
const RETURN_DURATION = 700;
const RETURN_SPREAD = 400;
// Pas de gros morceau : au-delà de ces mesures, un élément est un cadre — la
// page, une colonne, un widget. Il reste en place, perd son fond, et ce sont
// ses enfants qui tombent.
const AREA_MAX = 0.05;
const WIDTH_MAX = 0.4;
const HEIGHT_MAX = 0.35;
// Ce qui tombe d'un bloc, quelle que soit sa taille : un onglet, une vue, une
// liste de tâches.
const BLOCK_ELEMENTS = [
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
const FADE = 400;
const NO_DIVIDERS_CLASS = "milo-sans-filets";
const WITHOUT_DIVIDERS = `
.mantine-Tabs-list::before { transition: opacity ${FADE}ms; }
table, thead, tbody, tr, th, td { transition: border-color ${FADE}ms; }
.${NO_DIVIDERS_CLASS} .mantine-Tabs-list::before { opacity: 0; }
.${NO_DIVIDERS_CLASS} :is(table, thead, tbody, tr, th, td) { border-color: transparent !important; }
.${NO_DIVIDERS_CLASS} * { pointer-events: none !important; }
`;
// Un trait : un séparateur déclaré, ou un élément de quelques pixels d'épais.
const DIVIDER_SELECTOR = "hr, [role='separator'], .mantine-Divider-root";
const STROKE_THICKNESS = 4;

/** Des éléments qui tombent ensemble, d'un seul mouvement, autour d'un même coin. */
interface Fall {
  items: HTMLElement[];
  /** Le coin qui tient encore, à l'écran. */
  pivot: { x: number; y: number };
  direction: 1 | -1;
  /** Le haut du groupe à l'écran : la chute se mesure depuis lui. */
  top: number;
  delay: number;
}

const visible = (rect: DOMRect): boolean =>
  rect.width > 0 &&
  rect.height > 0 &&
  rect.bottom > 0 &&
  rect.top < window.innerHeight &&
  rect.right > 0 &&
  rect.left < window.innerWidth;

/** Le retard d'un morceau rangé de gauche à droite : il tombe en cascade. */
const cascading = (left: number): number =>
  (Math.max(0, left) / window.innerWidth) * DETACH_SPREAD + random(0, 80);

/** Un groupe qui tombe autour du coin haut, à gauche ou à droite. */
function fallOf(items: HTMLElement[], rects: DOMRect[], delay: number): Fall {
  const direction = Math.random() < 0.5 ? -1 : 1;
  const left = Math.min(...rects.map((r) => r.left));
  const rightHand = Math.max(...rects.map((r) => r.right));
  const top = Math.min(...rects.map((r) => r.top));
  return { items, pivot: { x: direction > 0 ? left : rightHand, y: top }, direction, top, delay };
}

/** Une grille tombe colonne par colonne : les cellules d'une colonne ensemble. */
function columnsOf(table: HTMLTableElement): Fall[] {
  const columns = new Map<number, { items: HTMLElement[]; rects: DOMRect[] }>();
  for (const row of table.rows) {
    let rank = 0;
    for (const cell of row.cells) {
      const rect = cell.getBoundingClientRect();
      if (visible(rect)) {
        const column = columns.get(rank) ?? { items: [], rects: [] };
        column.items.push(cell);
        column.rects.push(rect);
        columns.set(rank, column);
      }
      rank += cell.colSpan;
    }
  }
  return [...columns.values()].map((c) =>
    fallOf(c.items, c.rects, cascading(Math.min(...c.rects.map((r) => r.left)))),
  );
}

/**
 * Découpe l'interface en morceaux qui tomberont chacun de leur côté, et
 * relève les cadres qu'ils laissent : ceux-là perdent leur fond.
 */
function splitInterface(): {
  falls: Fall[];
  frames: HTMLElement[];
  rows: HTMLElement[];
  lines: HTMLElement[];
} {
  const screen = window.innerWidth * window.innerHeight;
  const falls: Fall[] = [];
  const frames: HTMLElement[] = [];
  // Les lignes d'une grille restent en place quand ses colonnes tombent : leur
  // fond — celui du survol — doit partir avec elles.
  const rows: HTMLElement[] = [];
  const lines: HTMLElement[] = [];
  const walk = (el: Element) => {
    for (const child of el.children) {
      if (!(child instanceof HTMLElement || child instanceof SVGSVGElement)) continue;
      if (["SCRIPT", "STYLE", "LINK", "TEMPLATE"].includes(child.tagName)) continue;
      const rect = child.getBoundingClientRect();
      // Sans taille — « display: contents », un conteneur dont les enfants
      // sont positionnés —, l'élément peut encore porter des choses visibles.
      if (rect.width === 0 || rect.height === 0) {
        walk(child);
        continue;
      }
      if (!visible(rect)) continue;
      const chunk = child as HTMLElement;
      if (child.matches(DIVIDER_SELECTOR) || Math.min(rect.width, rect.height) <= STROKE_THICKNESS) {
        lines.push(chunk);
        continue;
      }
      if (child.matches(BLOCK_ELEMENTS)) {
        falls.push(fallOf([chunk], [rect], cascading(rect.left)));
        continue;
      }
      if (child instanceof HTMLTableElement) {
        falls.push(...columnsOf(child));
        frames.push(child);
        rows.push(...child.rows, ...child.tBodies);
        if (child.tHead) rows.push(child.tHead);
        continue;
      }
      // Un dessin — un graphique — tombe d'une pièce : ses parties ne sont
      // pas des éléments qu'on découpe.
      if (child instanceof SVGSVGElement) {
        falls.push(fallOf([chunk], [rect], random(0, DETACH_SPREAD)));
        continue;
      }
      const small =
        rect.width * rect.height <= screen * AREA_MAX &&
        rect.width <= window.innerWidth * WIDTH_MAX &&
        rect.height <= window.innerHeight * HEIGHT_MAX;
      // Un gros élément sans enfant ne se découpe pas, ni celui qui porte du
      // texte à même lui : le texte resterait en l'air. Il tombe tel quel.
      const text = [...child.childNodes].some(
        (n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim(),
      );
      if (small || text || child.children.length === 0) {
        falls.push(fallOf([chunk], [rect], random(0, DETACH_SPREAD)));
        continue;
      }
      frames.push(chunk);
      walk(child);
    }
  };
  walk(document.body);
  return { falls, frames, rows, lines };
}

/** Fait tomber l'interface ; la fonction rendue la fait revenir. */
export function detachInterface(): () => void {
  const rules = document.createElement("style");
  rules.textContent = WITHOUT_DIVIDERS;
  document.head.appendChild(rules);
  const root = document.documentElement;
  // La transition doit être en place avant la classe, sinon elle ne joue pas :
  // une lecture de mise en page l'y installe, sans attendre l'image suivante —
  // le pointeur, lui, doit être coupé tout de suite.
  void root.offsetHeight;
  root.classList.add(NO_DIVIDERS_CLASS);

  const { falls, frames, rows, lines } = splitInterface();
  const before: StyleBefore = new Map();

  // Les cadres vidés perdent leur fond, leur bordure et leur ombre. Tous :
  // un cadre sans fond aujourd'hui en prendrait un au survol.
  const clearings = frames
    .map((frame) =>
      frame.animate(
        { backgroundColor: "transparent", borderColor: "transparent", boxShadow: "none" },
        { duration: FADE, easing: "ease-out", fill: "forwards" },
      ),
    );
  // Le survol d'une ligne s'éteint aussitôt : il ne doit pas traîner derrière
  // les colonnes qui tombent.
  clearings.push(
    ...rows.map((row) =>
      row.animate({ backgroundColor: "transparent" }, { duration: 80, fill: "forwards" }),
    ),
  );
  // Les traits s'effacent, sans bouger.
  clearings.push(
    ...lines.map((line) =>
      line.animate({ opacity: 0 }, { duration: FADE, easing: "ease-out", fill: "forwards" }),
    ),
  );

  const animations = falls.flatMap((fall) => {
    const { direction, pivot } = fall;
    const fallDistance = window.innerHeight - fall.top + 80;
    const drift = direction * random(10, 60);
    const angle = direction * random(25, 60);
    return fall.items.map((el) => {
      before.set(el, { origin: el.style.transformOrigin, display: el.style.display });
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
          { transform: `rotate(${direction * 9}deg)`, offset: 0.2, easing: "ease-in-out" },
          { transform: `rotate(${direction * 4}deg)`, offset: 0.35, easing: "ease-in-out" },
          {
            transform: `rotate(${direction * 12}deg)`,
            opacity: 1,
            offset: 0.5,
            easing: "cubic-bezier(.55,0,1,.45)",
          },
          // Un morceau pris dans une colonne qui coupe ses bords disparaît en
          // s'effaçant, plutôt que d'un coup au bas de la colonne.
          { opacity: 1, offset: 0.85 },
          { transform: `translate(${drift}px, ${fallDistance}px) rotate(${angle}deg)`, opacity: 0 },
        ],
        { duration: DETACH, delay: fall.delay, fill: "forwards" },
      );
    });
  });

  return () => {
    root.classList.remove(NO_DIVIDERS_CLASS);
    window.setTimeout(() => rules.remove(), FADE);
    clearings.forEach((e) => {
      e.reverse();
      e.onfinish = () => e.cancel();
    });
    // Le retour se pose avant que la chute ne s'annule : sans quoi chaque
    // morceau reparaîtrait un instant à sa place.
    placePieces(falls, before);
    animations.forEach((a) => a.cancel());
  };
}

/** Ce qu'un morceau portait avant qu'on ne touche à son style. */
type StyleBefore = Map<HTMLElement, { origin: string; display: string }>;

/**
 * Fait revenir les morceaux à leur place : chacun descend un peu et rebondit.
 * Jusqu'à son départ, un morceau est invisible.
 */
function placePieces(falls: Fall[], before: StyleBefore) {
  for (const fall of falls) {
    // Un groupe revient d'un seul mouvement, comme il est tombé.
    const delay = random(0, RETURN_SPREAD);
    for (const el of fall.items) {
      const returnAnimation = el.animate(
        [
          { transform: "translateY(-40px) scale(0.95)", opacity: 0 },
          { transform: "none", opacity: 1 },
        ],
        { duration: RETURN_DURATION, delay: delay, easing: "cubic-bezier(.34,1.56,.64,1)", fill: "backwards" },
      );
      returnAnimation.onfinish = () => {
        const style = before.get(el);
        if (!style) return;
        el.style.transformOrigin = style.origin;
        el.style.display = style.display;
      };
    }
  }
}

// À la connexion, l'interface se construit sous les yeux : la page part vierge
// le temps que tout se charge, puis chaque morceau se pose comme au retour du
// code Konami.
const BLANK_PAGE_CLASS = "milo-page-vierge";
const BLANK_PAGE = `.${BLANK_PAGE_CLASS} body > * { opacity: 0 !important; }`;
let blankPage: HTMLStyleElement | null = null;

/** Cache l'interface, en attendant de la poser. */
export function clearPage() {
  if (!blankPage) {
    blankPage = document.createElement("style");
    blankPage.textContent = BLANK_PAGE;
    document.head.appendChild(blankPage);
  }
  document.documentElement.classList.add(BLANK_PAGE_CLASS);
}

/** Pose l'interface, morceau par morceau, sur la page vierge. */
export function placeInterface() {
  const root = document.documentElement;
  const rules = document.createElement("style");
  rules.textContent = WITHOUT_DIVIDERS;
  document.head.appendChild(rules);
  void root.offsetHeight;
  root.classList.add(NO_DIVIDERS_CLASS);

  const { falls, frames, lines } = splitInterface();
  // Rien n'a encore touché au style des morceaux : on ne restaure rien.
  placePieces(falls, new Map());
  // Les cadres prennent leur fond, et les traits paraissent, en fondu.
  const start = { backgroundColor: "transparent", borderColor: "transparent", boxShadow: "none" };
  frames.forEach((frame) =>
    frame.animate([{ ...start, offset: 0 }], { duration: FADE * 2, easing: "ease-out" }),
  );
  lines.forEach((line) =>
    line.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: FADE,
      delay: RETURN_SPREAD,
      easing: "ease-out",
      fill: "backwards",
    }),
  );
  // Tout est en place, invisible jusqu'à son tour : la page peut reparaître.
  root.classList.remove(BLANK_PAGE_CLASS);
  root.classList.remove(NO_DIVIDERS_CLASS);
  window.setTimeout(() => rules.remove(), FADE);
}
