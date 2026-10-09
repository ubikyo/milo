import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ThemeHighlight from "./ThemeHighlight";
import ThemePanel, {
  THEME_INTERFACE_GAP,
  THEME_SCOPE_ATTRIBUTE,
  themePanelWidth,
} from "./ThemePanel";
import type { ThemePanelKind } from "./ThemePanel";
import { THEME_WINDOW_ATTRIBUTE } from "../../lib/themeWindow";
import panelClasses from "../../assets/styles/ThemePanel.module.css";

// The theme editor, once turned on ("Paramétrage" > "Affichage"): a panel
// docked at the right of the screen for the general interface — the
// application gives it room —, and one beside each open window and drawer,
// with the colors of that kind of element only: on the right of a window,
// on the other side of a drawer — the left of a drawer on the right.
//
// The windows are Mantine's, opened all over the application: rather than
// each one carrying its panel, the editor watches the page for their content.
// The panel lives inside the window's root: its scroll lock and stacking then
// include it, and a click in it is not a click outside the window.
//
// Its frame is created the moment the window's content enters the page — by
// the observer itself, without waiting for React —, then follows the
// window's actual place on screen, frame by frame, its animation included:
// the two arrive and leave together, whether the window was in the page
// beforehand (the widgets drawer) or only mounts when it opens. React then
// fills the frame with the panel's fields.

/**
 * The space between a window and its panel: that of the interface and its
 * docked panel (THEME_INTERFACE_GAP). A drawer's keeps one more pixel: its
 * scrollbar lies on its edge (CardDrawer.module.css), and the gap seen is
 * then the same.
 */
const GAP = THEME_INTERFACE_GAP;
const DRAWER_GAP = THEME_INTERFACE_GAP + 1;

/** A window's panel stops this far from the bottom of the screen. */
const SCREEN_MARGIN = 8;

/** The room kept on the modals' right for their panel (all modals share the Settings' one). */
const MODAL_ROOM = themePanelWidth("modal", "settings") + 2 * GAP;

/** A short window — a confirmation — still gets a usable panel. */
const MIN_HEIGHT = 360;

interface Host {
  content: HTMLElement;
  root: HTMLElement;
  kind: ThemePanelKind;
  /** The interface's own colors, when it has them. */
  scope: string | null;
  /** The window's name (themeWindow): a style may take a value for it only. */
  window: string | null;
  /** Its panel's width (themePanelWidth). */
  width: number;
}

const SELECTOR = ".mantine-Modal-content, .mantine-Drawer-content";

const findHosts = (): Host[] =>
  [...document.querySelectorAll<HTMLElement>(SELECTOR)].flatMap((content) => {
    const root = content.closest<HTMLElement>(".mantine-Modal-root, .mantine-Drawer-root");
    if (!root) return [];
    const kind: ThemePanelKind = content.classList.contains("mantine-Drawer-content") ? "drawer" : "modal";
    const scope = content.getAttribute(THEME_SCOPE_ATTRIBUTE);
    const window = content.getAttribute(THEME_WINDOW_ATTRIBUTE);
    return [{ content, root, kind, scope, window, width: themePanelWidth(kind, scope) }];
  });

/**
 * The window's place without its animation's transform: the fixed inner
 * box, which does not move, and the content's offset in it. Null when it
 * is not displayed.
 */
const layoutBox = (content: HTMLElement) => {
  const inner = content.offsetParent;
  if (!(inner instanceof HTMLElement) || !content.offsetWidth || !content.offsetHeight) return null;
  const rect = inner.getBoundingClientRect();
  const left = rect.left + content.offsetLeft;
  const top = rect.top + content.offsetTop;
  return { left, top, right: left + content.offsetWidth, height: content.offsetHeight };
};

/**
 * Places the frame: always on the right of a window, from its top; on the
 * other side of a drawer — a drawer on the right gets it on its left —, the
 * screen's full height. Its side is read from the window at rest; its place
 * moves with the window as it is drawn now — sliding, fading —, so that
 * both travel as one. Hidden with a window kept mounted but closed.
 */
const place = (frame: HTMLElement, host: Host) => {
  const box = layoutBox(host.content);
  if (!box) {
    frame.style.display = "none";
    return;
  }
  const drawn = host.content.getBoundingClientRect();
  const { width } = host;
  const gap = host.kind === "drawer" ? DRAWER_GAP : GAP;
  // A drawer is on the right when it ends where the screen does.
  const onLeft = host.kind === "drawer" && window.innerWidth - box.right <= box.left;
  const atRest = onLeft
    ? Math.max(box.left - gap - width, 0)
    : Math.min(box.right + gap, window.innerWidth - width);
  const top = host.kind === "drawer" ? 0 : box.top;
  const height =
    host.kind === "drawer"
      ? window.innerHeight
      : Math.min(Math.max(box.height, MIN_HEIGHT), window.innerHeight - box.top - SCREEN_MARGIN);
  frame.style.display = "flex";
  frame.style.width = `${width}px`;
  frame.style.left = `${atRest + drawn.left - box.left}px`;
  frame.style.top = `${top + (host.kind === "drawer" ? 0 : drawn.top - box.top)}px`;
  frame.style.height = `${height}px`;
  frame.style.opacity = getComputedStyle(host.content).opacity;
};

/**
 * A window's frame, created at once in its root: on the panels' background,
 * so that it shows before its fields do. Above the window's backdrop and
 * content, which come before it in the root, at their level — a window
 * opened from it, later in the page, still comes over it.
 */
const createFrame = (host: Host): HTMLDivElement => {
  const frame = document.createElement("div");
  frame.className = panelClasses.panel ?? "";
  Object.assign(frame.style, {
    position: "fixed",
    display: "none",
    zIndex: "var(--mb-z-index)",
    ...(host.kind === "modal" && {
      borderRadius: "var(--mantine-radius-sm)",
      boxShadow: "var(--mantine-shadow-md)",
      overflow: "hidden",
    }),
  });
  host.root.appendChild(frame);
  place(frame, host);
  return frame;
};

export default function ThemeEditor({ canEdit }: { canEdit: boolean }) {
  const [hosts, setHosts] = useState<{ host: Host; frame: HTMLDivElement }[]>([]);
  // Each window's frame, by the window's content.
  const frames = useRef(new Map<HTMLElement, { frame: HTMLDivElement; host: Host }>());

  useEffect(() => {
    const known = frames.current;
    /** The windows in the page now: a frame for each newcomer, none for those gone. */
    const update = () => {
      const found = findHosts();
      const present = new Set(found.map((h) => h.content));
      let changed = false;
      for (const [content, { frame }] of known) {
        if (present.has(content)) continue;
        frame.remove();
        known.delete(content);
        changed = true;
      }
      for (const host of found) {
        if (known.has(host.content)) continue;
        known.set(host.content, { frame: createFrame(host), host });
        changed = true;
      }
      if (changed) setHosts([...known.values()]);
    };
    update();
    const observer = new MutationObserver((mutations) => {
      if (mutations.some((m) => m.type === "childList")) update();
      // A step of a window's animation: its frame follows at once.
      for (const m of mutations) {
        const entry = m.type === "attributes" ? known.get(m.target as HTMLElement) : undefined;
        if (entry) place(entry.frame, entry.host);
      }
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style"],
    });
    // The window moves between two style changes — its transition runs —,
    // and its size and the screen's change without one: followed each frame.
    let animation = 0;
    const follow = () => {
      for (const { frame, host } of known.values()) place(frame, host);
      animation = requestAnimationFrame(follow);
    };
    follow();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(animation);
      for (const { frame } of known.values()) frame.remove();
      known.clear();
    };
  }, []);

  return (
    <>
      {/* The modals center in what the panel beside them leaves: on the
          right, its width and its gap are kept free. */}
      <style>{`.mantine-Modal-inner.mantine-Modal-inner { padding-inline-end: ${MODAL_ROOM}px; }`}</style>
      <ThemeHighlight />
      <ThemePanel
        kind="interface"
        canEdit={canEdit}
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          // Its edge, on a page as dark as it is.
          borderLeft: "1px solid #000",
          // Under the windows and their backdrop.
          zIndex: 150,
        }}
      />
      {hosts.map(({ host, frame }) =>
        createPortal(
          <ThemePanel
            kind={host.kind}
            scope={host.scope}
            window={host.window}
            canEdit={canEdit}
            style={{ height: "100%", width: "100%" }}
          />,
          frame,
          host.root.id,
        ),
      )}
    </>
  );
}
