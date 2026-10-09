import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { MANTINE_COLOR_KEYS, THEME_COLORS, THEME_SIZES } from "@milo/shared";
import type { Scheme } from "../../lib/themeColors";
import { THEME_WINDOW_ATTRIBUTE } from "../../lib/themeWindow";

// What the theme editor's field in focus colors: a dotted frame around each
// element of the page that uses it.
//
// Nothing tells which element uses which variable. For a moment, too short
// to be painted, the variable takes an unlikely value: the elements whose
// computed style changes are the ones. Of an element and its children that
// change the same way — a text color, inherited —, only the outermost is
// framed; of the elements a size grows, only the innermost.
//
// The page then shows them: the elements of a state — a box unchecked —
// take it for as long as the field is in focus (data-theme-preview: the
// key's group, which style sheets read), only in their look; and when none
// shows, the tab that holds the first one opens, and it scrolls into view.

/** The element marks the editor's own parts, which are never framed. */
export const THEME_EDITOR_ATTRIBUTE = "data-theme-editor";

interface Target {
  key: string;
  scheme: Scheme;
}

let target: Target | null = null;
/** Bumped to frame the same key again, once its elements have changed. */
let version = 0;
const subscribers = new Set<() => void>();

const notify = () => {
  for (const subscriber of subscribers) subscriber();
};

/** The theme key whose elements are framed, or none. */
export const highlightThemeKey = (next: Target | null) => {
  if (next?.key === target?.key && next?.scheme === target?.scheme) return;
  target = next;
  notify();
};

/**
 * Looks for the key's elements again: some only exist once shown — a
 * select's list, opened for the key (ThemeList).
 */
export const refreshThemeHighlight = () => {
  version += 1;
  notify();
};

const subscribe = (subscriber: () => void) => {
  subscribers.add(subscriber);
  return () => subscribers.delete(subscriber);
};

const SHADE = /^shade-(\d)$/;

/** The CSS variable of a theme key (themeColors' style sheet). */
const variableOf = (key: string, scheme: Scheme): string => {
  const shade = SHADE.exec(key);
  if (shade) return `--mantine-color-${scheme === "dark" ? "dark" : "gray"}-${shade[1]}`;
  return MANTINE_COLOR_KEYS.has(key) ? `--mantine-color-${key}` : `--milo-${key}`;
};

/** A value the variable surely doesn't have, and which its uses accept. */
const sentinelOf = (key: string): string => {
  const size = THEME_SIZES.find((s) => s.key === key);
  if (!size) return "rgb(1, 2, 3)";
  return size.unit === "px" ? "997px" : "1";
};

const PROPERTIES = [
  "backgroundColor",
  "backgroundImage",
  "color",
  "borderTopColor",
  "borderRightColor",
  "borderBottomColor",
  "borderLeftColor",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "outlineColor",
  "boxShadow",
  "fill",
  "stroke",
  "fontSize",
  "fontWeight",
  "textDecorationColor",
  "width",
  "height",
  // A margin's, a padding's, a gap's: the element that has them.
  "marginTop",
  "marginRight",
  "marginBottom",
  "marginLeft",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "rowGap",
  "columnGap",
] as const;

type Property = (typeof PROPERTIES)[number];

/**
 * A size — an icon's — changes its element, and with it every parent around
 * it: of those, only the innermost is the one that uses the key.
 */
const LAYOUT = new Set<Property>(["width", "height"]);

const BORDER_SIDE: Partial<Record<Property, "Top" | "Right" | "Bottom" | "Left">> = {
  borderTopColor: "Top",
  borderRightColor: "Right",
  borderBottomColor: "Bottom",
  borderLeftColor: "Left",
};

/** A change that shows: a border's color only counts when the border is drawn. */
const shows = (property: Property, style: CSSStyleDeclaration): boolean => {
  const side = BORDER_SIDE[property];
  if (side) return style[`border${side}Style`] !== "none" && parseFloat(style[`border${side}Width`]) > 0;
  if (property === "outlineColor") return style.outlineStyle !== "none";
  return true;
};

/**
 * A size only counts when it grows — the unlikely value is huge —: the
 * elements beside, which it squeezes, don't use the key.
 */
const grows = (property: Property, before: string, after: string): boolean =>
  !LAYOUT.has(property) || parseFloat(after) > parseFloat(before);

/**
 * The property follows its parent's change: the same one, or a drawing's
 * stroke and fill, which take the text color (an icon's "currentColor").
 */
const inherited = (property: Property, parent: Set<Property>): boolean =>
  parent.has(property) || ((property === "fill" || property === "stroke") && parent.has("color"));

const snapshot = (style: CSSStyleDeclaration) => PROPERTIES.map((p) => style[p]);

/** The elements of the page that use the key, outermost first. */
const usersOf = ({ key, scheme }: Target): Element[] => {
  const variable = variableOf(key, scheme);
  const elements = [...document.body.querySelectorAll("*")].filter(
    (el) => !el.closest(`[${THEME_EDITOR_ATTRIBUTE}]`),
  );
  // No transition starts towards the unlikely value, to show afterwards.
  const still = document.createElement("style");
  still.textContent = "*, *::before, *::after { transition: none !important; }";
  document.head.appendChild(still);
  const before = elements.map((el) => snapshot(getComputedStyle(el)));
  // The page, and the windows that set the variable again for themselves
  // (themeColors' windows' own values): each takes the unlikely value.
  const holders = [document.documentElement, ...document.querySelectorAll<HTMLElement>(`[${THEME_WINDOW_ATTRIBUTE}]`)];
  const previous = holders.map((h) => [h.style.getPropertyValue(variable), h.style.getPropertyPriority(variable)]);
  for (const h of holders) h.style.setProperty(variable, sentinelOf(key), "important");
  const changed = new Map<Element, Set<Property>>();
  elements.forEach((el, i) => {
    const style = getComputedStyle(el);
    const properties = PROPERTIES.filter(
      (p, j) => style[p] !== before[i]![j] && shows(p, style) && grows(p, before[i]![j]!, style[p]),
    );
    if (properties.length > 0) changed.set(el, new Set(properties));
  });
  holders.forEach((h, i) => {
    const [value, priority] = previous[i]!;
    if (value) h.style.setProperty(variable, value, priority);
    else h.style.removeProperty(variable);
  });
  // Read once more, still without transitions, before they come back.
  void getComputedStyle(document.body).color;
  still.remove();
  // The parents of an element whose size changed.
  const around = new Set<Element>();
  for (const [el, properties] of changed) {
    if (![...properties].some((p) => LAYOUT.has(p))) continue;
    for (let parent = el.parentElement; parent && !around.has(parent); parent = parent.parentElement)
      around.add(parent);
  }
  return [...changed].flatMap(([el, properties]) => {
    const styles = [...properties].filter((p) => !LAYOUT.has(p));
    const parent = el.parentElement && changed.get(el.parentElement);
    const ownStyle = styles.length > 0 && (!parent || styles.some((p) => !inherited(p, parent)));
    const ownSize = styles.length < properties.size && !around.has(el);
    return ownStyle || ownSize ? [el] : [];
  });
};

/** Set on the page while a key is edited: its group, whose state the elements show. */
export const THEME_PREVIEW_ATTRIBUTE = "data-theme-preview";

/**
 * Set on an element that a tab shows, outside its panel — a window's
 * footer —: the tab's value.
 */
export const THEME_TAB_ATTRIBUTE = "data-theme-tab";

const GROUPS = new Map([...THEME_COLORS, ...THEME_SIZES].map((d) => [d.key, d.group]));

const visible = (el: Element) => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
};

/** The tab that shows the element, when it is hidden in another one. */
const tabOf = (el: Element): HTMLElement | null => {
  const marked = el.closest<HTMLElement>(`[${THEME_TAB_ATTRIBUTE}]`);
  const root = el.closest(".mantine-Tabs-root");
  if (marked && root) {
    const value = marked.getAttribute(THEME_TAB_ATTRIBUTE);
    return root.querySelector<HTMLElement>(`[role="tab"][id$="-tab-${value}"]`);
  }
  const panel = el.closest(".mantine-Tabs-panel");
  const tab = panel?.getAttribute("aria-labelledby");
  return tab ? document.getElementById(tab) : null;
};

/**
 * Brings the elements into view: the first one shown, scrolled to; or else
 * the tab holding the first one, opened — a click, as the user's —, and it
 * scrolled to once shown. The field keeps the focus.
 */
const reveal = (elements: Element[]) => {
  const shown = elements.find(visible);
  if (shown) {
    shown.scrollIntoView({ block: "nearest" });
    return;
  }
  for (const el of elements) {
    const tab = tabOf(el);
    if (!tab) continue;
    tab.click();
    requestAnimationFrame(() => el.scrollIntoView({ block: "nearest" }));
    return;
  }
};

/** The windows' selects: those of the editable lists, and the others. */
const LIST_SELECT = '[data-theme-scope="settings"] [data-settings-list] .mantine-Select-input:not(:disabled)';
const FORM_SELECT =
  '[data-theme-scope="settings"] .mantine-Select-input:not(:disabled):not([data-settings-list] *)';

/** The groups of a select's list, and which selects show it once open. */
const SELECT_LISTS = new Map<string, string>([
  ...["dropdown", "options", "option", "option-hover"].map((g) => [`settings-theme-list-${g}`, LIST_SELECT] as const),
  ...["dropdown", "options", "option", "option-hover"].map((g) => [`settings-form-select-${g}`, FORM_SELECT] as const),
]);

/**
 * Opens a select's list while its group is edited — a click, as the user's:
 * the first one shown, or else the first one, its tab brought forward. The
 * list only exists once open: the key is framed again then. Closed again when
 * the field is left, unless it was already open.
 */
const openSelect = (group: string | undefined): (() => void) | undefined => {
  const selector = group && SELECT_LISTS.get(group);
  if (!selector) return undefined;
  const inputs = [...document.querySelectorAll<HTMLElement>(selector)];
  const input = inputs.find(visible) ?? inputs[0];
  if (!input) return undefined;
  reveal([input]);
  const opened = !input.hasAttribute("data-expanded");
  if (opened) input.click();
  const frame = requestAnimationFrame(() => requestAnimationFrame(refreshThemeHighlight));
  return () => {
    cancelAnimationFrame(frame);
    if (opened && input.hasAttribute("data-expanded")) input.click();
  };
};

/** Brings an element into view: its tab opened, if hidden, and scrolled to. */
export const revealElement = (el: Element) => reveal([el]);

/**
 * The group of the key being edited, or none: an element that only shows on
 * demand — a select's list — opens for it.
 */
export function useThemePreviewGroup(): string | null {
  return useSyncExternalStore(subscribe, () => (target ? (GROUPS.get(target.key) ?? null) : null));
}

/** Beyond this, the frames would only cover the screen. */
const MAX_FRAMES = 300;

interface Frame {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** The frame's margin around its element. */
const OUTSET = 2;

/**
 * The frames, around their element but within the screen: a drawer against
 * its edge keeps its four sides.
 */
const framesOf = (elements: Element[]): Frame[] =>
  elements.flatMap((el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return [];
    const top = Math.max(r.top - OUTSET, 0);
    const left = Math.max(r.left - OUTSET, 0);
    const bottom = Math.min(r.bottom + OUTSET, window.innerHeight);
    const right = Math.min(r.right + OUTSET, window.innerWidth);
    if (bottom <= top || right <= left) return [];
    return [{ top, left, width: right - left, height: bottom - top }];
  });

const sameFrames = (a: Frame[], b: Frame[]) =>
  a.length === b.length &&
  a.every(
    (f, i) =>
      f.top === b[i]!.top &&
      f.left === b[i]!.left &&
      f.width === b[i]!.width &&
      f.height === b[i]!.height,
  );

export default function ThemeHighlight() {
  const current = useSyncExternalStore(subscribe, () => target);
  const again = useSyncExternalStore(subscribe, () => version);
  const [frames, setFrames] = useState<Frame[]>([]);
  // The key is used nowhere in the page: a message says so.
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!current) {
      setFrames([]);
      setMissing(false);
      return;
    }
    // The state first: the elements in it are those that use the key.
    const page = document.documentElement;
    const group = GROUPS.get(current.key);
    if (group) page.setAttribute(THEME_PREVIEW_ATTRIBUTE, group);
    const elements = usersOf(current).slice(0, MAX_FRAMES);
    setMissing(elements.length === 0);
    reveal(elements);
    // The frames follow their element: a window opening, a scroll.
    let frame = 0;
    const follow = () => {
      const found = framesOf(elements);
      setFrames((before) => (sameFrames(before, found) ? before : found));
      frame = requestAnimationFrame(follow);
    };
    follow();
    return () => {
      cancelAnimationFrame(frame);
      page.removeAttribute(THEME_PREVIEW_ATTRIBUTE);
    };
  }, [current, again]);

  // A select's list, opened while one of its keys is edited: not again when
  // the key is framed anew.
  useEffect(() => openSelect(current ? GROUPS.get(current.key) : undefined), [current]);

  // Reset when the editor closes.
  useEffect(() => () => highlightThemeKey(null), []);

  if (frames.length === 0 && !missing) return null;
  return createPortal(
    <div {...{ [THEME_EDITOR_ATTRIBUTE]: "" }} style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 10000 }}>
      {/* At the bottom of the screen, white on red: fixed colors,
          outside the themes. */}
      {missing && (
        <div
          role="status"
          style={{
            position: "fixed",
            bottom: 16,
            left: "50%",
            transform: "translateX(-50%)",
            padding: "6px 12px",
            borderRadius: 4,
            backgroundColor: "#e03131",
            color: "#ffffff",
            fontSize: 13,
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.3)",
          }}
        >
          Aucun composant de ce type dans la fenêtre affichée
        </div>
      )}
      {frames.map((f, i) => (
        <div
          key={i}
          style={{
            position: "fixed",
            top: f.top,
            left: f.left,
            width: f.width,
            height: f.height,
            border: "1px dashed var(--milo-strong-text)",
            borderRadius: 2,
          }}
        />
      ))}
    </div>,
    document.body,
  );
}
