// The interface falling and landing: the Konami code makes it tumble down then
// come back; login lays it onto a blank page.

const random = (min: number, max: number): number => min + Math.random() * (max - min);

// Before the party, the interface comes loose: each piece tips onto a corner,
// like a poster losing a pin, then falls off screen. Everything
// comes back at the end, with a small bounce. Everything goes through the browser's
// animation API: nothing touches React's rendering, and cancelling returns each
// piece intact.
export const DETACH = 1300;
export const DETACH_SPREAD = 600;
const RETURN_DURATION = 700;
const RETURN_SPREAD = 400;
// No big pieces: beyond these measures, an element is a frame — the
// page, a column, a widget. It stays in place, loses its background, and its
// children are what fall.
const AREA_MAX = 0.05;
const WIDTH_MAX = 0.4;
const HEIGHT_MAX = 0.35;
// What falls as a block, whatever its size: a tab, a view, a
// task list.
const BLOCK_ELEMENTS = [
  ".mantine-Tabs-tab",
  ".mantine-SegmentedControl-control",
  ".mantine-SegmentedControl-indicator",
  "[data-list-id]",
].join(",");
// Lines do not fall — a rule tumbling down is not pretty: they
// fade out. Those of tabs and grids are not
// elements: a class set on the root turns them off, the transition
// eases them. It also cuts the pointer: otherwise, under the
// mouse, a hover would light up on what stays in place.
const FADE = 400;
const NO_DIVIDERS_CLASS = "milo-no-dividers";
const WITHOUT_DIVIDERS = `
.mantine-Tabs-list::before { transition: opacity ${FADE}ms; }
table, thead, tbody, tr, th, td { transition: border-color ${FADE}ms; }
.${NO_DIVIDERS_CLASS} .mantine-Tabs-list::before { opacity: 0; }
.${NO_DIVIDERS_CLASS} :is(table, thead, tbody, tr, th, td) { border-color: transparent !important; }
.${NO_DIVIDERS_CLASS} * { pointer-events: none !important; }
`;
// A line: a declared separator, or an element a few pixels thick.
const DIVIDER_SELECTOR = "hr, [role='separator'], .mantine-Divider-root";
const STROKE_THICKNESS = 4;

/** Elements that fall together, in a single movement, around the same corner. */
interface Fall {
  items: HTMLElement[];
  /** The corner still holding, on screen. */
  pivot: { x: number; y: number };
  direction: 1 | -1;
  /** The top of the group on screen: the fall is measured from it. */
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

/** The delay of a piece arranged left to right: it falls in cascade. */
const cascading = (left: number): number =>
  (Math.max(0, left) / window.innerWidth) * DETACH_SPREAD + random(0, 80);

/** A group falling around the top corner, left or right. */
function fallOf(items: HTMLElement[], rects: DOMRect[], delay: number): Fall {
  const direction = Math.random() < 0.5 ? -1 : 1;
  const left = Math.min(...rects.map((r) => r.left));
  const rightHand = Math.max(...rects.map((r) => r.right));
  const top = Math.min(...rects.map((r) => r.top));
  return { items, pivot: { x: direction > 0 ? left : rightHand, y: top }, direction, top, delay };
}

/** A grid falls column by column: the cells of a column together. */
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
 * Cuts the interface into pieces that will each fall their own way, and
 * collects the frames they leave behind: those lose their background.
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
  // A grid's rows stay in place when its columns fall: their
  // background — the hover one — must leave with them.
  const rows: HTMLElement[] = [];
  const lines: HTMLElement[] = [];
  const walk = (el: Element) => {
    for (const child of el.children) {
      if (!(child instanceof HTMLElement || child instanceof SVGSVGElement)) continue;
      if (["SCRIPT", "STYLE", "LINK", "TEMPLATE"].includes(child.tagName)) continue;
      const rect = child.getBoundingClientRect();
      // Without a size — "display: contents", a container whose children
      // are positioned —, the element may still carry visible things.
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
      // A drawing — a chart — falls in one piece: its parts are
      // not elements to cut up.
      if (child instanceof SVGSVGElement) {
        falls.push(fallOf([chunk], [rect], random(0, DETACH_SPREAD)));
        continue;
      }
      const small =
        rect.width * rect.height <= screen * AREA_MAX &&
        rect.width <= window.innerWidth * WIDTH_MAX &&
        rect.height <= window.innerHeight * HEIGHT_MAX;
      // A big element without children is not cut up, nor one that carries
      // text itself: the text would be left hanging. It falls as is.
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

/** Makes the interface fall; the returned function brings it back. */
export function detachInterface(): () => void {
  const rules = document.createElement("style");
  rules.textContent = WITHOUT_DIVIDERS;
  document.head.appendChild(rules);
  const root = document.documentElement;
  // The transition must be in place before the class, otherwise it does not play:
  // a layout read installs it there, without waiting for the next frame —
  // the pointer, though, must be cut right away.
  void root.offsetHeight;
  root.classList.add(NO_DIVIDERS_CLASS);

  const { falls, frames, rows, lines } = splitInterface();
  const before: StyleBefore = new Map();

  // The emptied frames lose their background, border and shadow. All of them:
  // a frame without a background today would take one on hover.
  const clearings = frames
    .map((frame) =>
      frame.animate(
        { backgroundColor: "transparent", borderColor: "transparent", boxShadow: "none" },
        { duration: FADE, easing: "ease-out", fill: "forwards" },
      ),
    );
  // A row's hover goes out at once: it must not trail behind
  // the falling columns.
  clearings.push(
    ...rows.map((row) =>
      row.animate({ backgroundColor: "transparent" }, { duration: 80, fill: "forwards" }),
    ),
  );
  // Lines fade out, without moving.
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
      // An inline element does not transform: it is made a block for the time of
      // the fall, if it fits on a single line.
      if (getComputedStyle(el).display === "inline" && el.getClientRects().length === 1) {
        el.style.display = "inline-block";
      }
      // All the group's elements rotate around the same corner: they
      // fall in one piece.
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
          // A piece caught in a column that clips its edges disappears by
          // fading, rather than all at once at the bottom of the column.
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
    // The return is set before the fall is cancelled: otherwise each
    // piece would reappear for a moment in its place.
    placePieces(falls, before);
    animations.forEach((a) => a.cancel());
  };
}

/** What a piece carried before its style was touched. */
type StyleBefore = Map<HTMLElement, { origin: string; display: string }>;

/**
 * Brings the pieces back to their place: each comes down a little and bounces.
 * Until its departure, a piece is invisible.
 */
function placePieces(falls: Fall[], before: StyleBefore) {
  for (const fall of falls) {
    // A group returns in a single movement, as it fell.
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

// At login, the interface builds itself before your eyes: the page starts blank
// while everything loads, then each piece lands as on the return of the
// Konami code.
const BLANK_PAGE_CLASS = "milo-blank-page";
const BLANK_PAGE = `.${BLANK_PAGE_CLASS} body > * { opacity: 0 !important; }`;
let blankPage: HTMLStyleElement | null = null;

/** Hides the interface, while waiting to lay it down. */
export function clearPage() {
  if (!blankPage) {
    blankPage = document.createElement("style");
    blankPage.textContent = BLANK_PAGE;
    document.head.appendChild(blankPage);
  }
  document.documentElement.classList.add(BLANK_PAGE_CLASS);
}

/** Lays the interface down, piece by piece, on the blank page. */
export function placeInterface() {
  const root = document.documentElement;
  const rules = document.createElement("style");
  rules.textContent = WITHOUT_DIVIDERS;
  document.head.appendChild(rules);
  void root.offsetHeight;
  root.classList.add(NO_DIVIDERS_CLASS);

  const { falls, frames, lines } = splitInterface();
  // Nothing has touched the pieces' style yet: nothing to restore.
  placePieces(falls, new Map());
  // The frames take their background, and the lines appear, fading in.
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
  // Everything is in place, invisible until its turn: the page may reappear.
  root.classList.remove(BLANK_PAGE_CLASS);
  root.classList.remove(NO_DIVIDERS_CLASS);
  window.setTimeout(() => rules.remove(), FADE);
}
