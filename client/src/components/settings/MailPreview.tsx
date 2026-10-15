import { Box, ScrollArea, UnstyledButton, useComputedColorScheme } from "@mantine/core";
import type { SplitterPaneSize } from "@mantine/hooks";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { MAIL_DARK_CLASS, MAIL_NOTE_CLASS, MAIL_NOTE_DARK_BG } from "@milo/shared";
import { MODAL_PADDING, modalHeaderStyles } from "../../themes/modals";
import { themeWindow } from "../../lib/themeWindow";

// What the template windows share — the MJML one (MailTemplateModal) and the
// support one (SupportReplyModal): their panes, side by side in a Splitter,
// and the preview of the e-mail, in the theme its switch chooses.

/**
 * The panes' widths on opening, the same in every template window: the
 * variables a fixed 350 px, the code and the preview sharing the rest.
 */
export const PANE_SIZES = { variables: "350px", editor: 55, preview: 45 } as const;

// Narrower than this — in the unit of its width —, a dragged pane folds.
export const PANE_MINS = { variables: "120px", editor: 15, preview: 15 } as const;

/** The panes' height. */
export const PANES_HEIGHT = 560;

/** The scrollbars of every pane, thin. */
export const SCROLLBAR_SIZE = 2;

/**
 * A pane: its content does not spill over its neighbor once folded, and only
 * the outer corners are rounded. The rounding is the panes' own, not the
 * splitter's: clipping the splitter would cut the grip of a handle that a
 * folded pane has pushed against the edge. Isolated, whatever it holds —
 * a scrollbar, a sticky toolbar with its own z-index — stays below the
 * handles' grips, which overhang it.
 */
export const paneStyle = (side?: "left" | "right", folded = false) => {
  const radius = "var(--mantine-radius-default)";
  return {
    overflow: "hidden",
    isolation: "isolate",
    // Folded, it keeps a column for its name (FoldablePane), over its content.
    position: "relative",
    ...(folded && { minWidth: FOLDED_WIDTH }),
    ...(side === "left" && { borderTopLeftRadius: radius, borderBottomLeftRadius: radius }),
    ...(side === "right" && { borderTopRightRadius: radius, borderBottomRightRadius: radius }),
  } as const;
};

// --- Escape --------------------------------------------------------------
//
// A template being edited must not be lost to Escape. Each open Mantine
// window or drawer listens for it on the whole page — the Settings around a
// template, a widget's drawer —, before anyone else: "closeOnEscape" on the
// template's own window does not stop its parent from closing, and the
// template with it. Mantine spares an event whose target carries
// "data-mantine-stop-propagation": while a template is being edited, this
// listener — set up as the module loads, so before any window's — marks
// the target of every Escape, then takes the mark back. Escape still closes
// what the code shows: the completion list.

let editingTemplates = 0;
const STOP = "data-mantine-stop-propagation";

if (typeof window !== "undefined") {
  window.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Escape" || editingTemplates === 0) return;
      const target = event.target;
      if (!(target instanceof Element) || target.hasAttribute(STOP)) return;
      target.setAttribute(STOP, "true");
      setTimeout(() => target.removeAttribute(STOP));
    },
    { capture: true },
  );
}

/** While "active", Escape closes no window: a template is being edited. */
export function useNoEscape(active: boolean) {
  useEffect(() => {
    if (!active) return undefined;
    editingTemplates += 1;
    return () => {
      editingTemplates -= 1;
    };
  }, [active]);
}

/** A folded pane's column. */
const FOLDED_WIDTH = 30;

/** The panes on opening: the variables folded, the code and the preview sharing the width. */
const OPENING_SIZES: SplitterPaneSize[] = ["0px", PANE_SIZES.editor, PANE_SIZES.preview];

/** Each pane's own size, which it unfolds to when it had none before — the variables 350 px. */
const OWN_SIZES: SplitterPaneSize[] = [PANE_SIZES.variables, PANE_SIZES.editor, PANE_SIZES.preview];

const isFolded = (size: SplitterPaneSize | undefined) => parseFloat(String(size)) === 0;

/**
 * The panes' sizes, the variables folded at each opening — "opened" changes.
 * Folded, a pane is at zero: its column (FoldablePane) unfolds it to the size
 * it had — or to its own, the first time.
 */
export function useFoldingPanes(opened: unknown) {
  const [sizes, setSizes] = useState<SplitterPaneSize[]>(OPENING_SIZES);
  // The size each pane had before it folded.
  const [before, setBefore] = useState<SplitterPaneSize[]>(OWN_SIZES);
  // Adjusted during the render that sees the new opening.
  const [seen, setSeen] = useState(opened);
  if (opened !== seen) {
    setSeen(opened);
    if (opened) {
      setSizes(OPENING_SIZES);
      setBefore(OWN_SIZES);
    }
  }

  /** Any change of sizes — a drag, a fold —: what was open before is remembered. */
  const change = (next: SplitterPaneSize[]) => {
    setBefore(before.map((size, i) => (!isFolded(sizes[i]) && isFolded(next[i]) ? sizes[i]! : size)));
    setSizes(next);
  };

  return {
    /** The Splitter's props. */
    splitterProps: { sizes, onSizeChange: change },
    folded: (index: number) => isFolded(sizes[index]),
    unfold: (index: number) => setSizes(sizes.map((size, i) => (i === index ? before[i]! : size))),
    fold: (index: number) => change(sizes.map((size, i) => (i === index ? "0px" : size))),
  };
}

/**
 * A pane's content, and once folded, a column of its name, written upward,
 * that unfolds it on a click. The content is kept — with its state — but
 * hidden: its scrollbars would show along the column.
 */
export function FoldablePane({
  label,
  folded,
  onUnfold,
  children,
}: {
  label: string;
  folded: boolean;
  onUnfold: () => void;
  children: ReactNode;
}) {
  return (
    <>
      {folded && (
        <UnstyledButton
          onClick={onUnfold}
          aria-label={`Afficher ${label.toLowerCase()}`}
          pos="absolute"
          top={0}
          bottom={0}
          left={0}
          w={FOLDED_WIDTH}
          style={{
            zIndex: 1,
            display: "flex",
            alignItems: "center",
            // At the start of its line — the text's left, read upward: the
            // column's bottom.
            justifyContent: "flex-start",
            paddingInlineStart: 12,
            backgroundColor: "var(--mantine-color-body)",
            // White on the dark theme; black on the light one, where white would
            // not read on the page's background.
            color: "var(--milo-strong-text)",
            fontSize: "var(--mantine-font-size-sm)",
            writingMode: "vertical-rl",
            transform: "rotate(180deg)",
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </UnstyledButton>
      )}
      <Box h="100%" style={{ visibility: folded ? "hidden" : undefined }}>
        {children}
      </Box>
    </>
  );
}

// The handles and the panes' frame: a neutral gray — Mantine's leans blue.
export const HANDLE_COLOR = "var(--milo-header-bg)";

/**
 * The handles above the panes, which are isolated (paneStyle); around the
 * three panes, a frame of the handles' gray, rounded as their outer corners.
 */
export const SPLITTER_STYLES = {
  root: { border: `1px solid ${HANDLE_COLOR}`, borderRadius: "var(--mantine-radius-default)" },
  handle: { zIndex: 1 },
};

// --- The template windows' look ------------------------------------------
//
// The e-mail, label and asset number templates' windows (MailTemplateModal,
// LabelTemplateModal, AssetNumberTemplateModal), at their size and over the
// whole browser window: the themes' ("Thèmes spécifiques" > "Éditeur de
// modèles" > "Fenêtre normale", "Fenêtre plein écran").

const templateVar = (key: string) => `var(--milo-settings-template-${key})`;

/**
 * The window's content attributes (Mantine's "attributes"): its name
 * (themeWindow), and the mark the windows' style sheet reads to give it its
 * header and body over the whole window (SettingsModal.module.css).
 */
export const templateWindow = (id: string) => ({
  content: { ...themeWindow(id).content, "data-template-editor": "" },
});

/** The window's width at its size. */
export const TEMPLATE_WIDTH = templateVar("width");

/** The panes' height at the window's size; over the whole window, the room the rest leaves. */
export const TEMPLATE_PANES_HEIGHT = templateVar("panes-height");

/** The icon that switches between the two sizes. */
export const templateIconColor = (full: boolean) => templateVar(full ? "full-icon" : "icon");

/** The handles: the frame's color at the window's size, the lines' over the whole window. */
export const templateHandleColor = (full: boolean) => templateVar(full ? "full-line" : "frame");

/**
 * The splitter: framed at the window's size; over the whole window, no
 * frame — the panes run to its edges, a line above and under them sets them
 * apart from the title and the buttons.
 */
export const templateSplitterStyles = (full: boolean) => {
  const line = `${templateVar(full ? "full-line-width" : "frame-width")} solid ${templateHandleColor(full)}`;
  return {
    ...SPLITTER_STYLES,
    root: full
      ? { border: 0, borderTop: line, borderBottom: line, borderRadius: 0 }
      : { ...SPLITTER_STYLES.root, border: line },
  };
};

/** The window's styles (Mantine's "styles"): over the whole window, the panes take the height the rest leaves. */
export const templateModalStyles = (full: boolean) => {
  const headerStyles = modalHeaderStyles(MODAL_PADDING);
  if (!full) return { ...headerStyles, title: { ...headerStyles.title, flex: 1 } };
  return {
    ...headerStyles,
    // A thinner banner — its padding, the style sheet's —: the room goes to
    // the panes. Mantine gives the header 60 px at least: dropped, the title
    // and its icon set the height.
    header: { ...headerStyles.header, minHeight: 0, backgroundColor: templateVar("full-header-bg") },
    title: {
      ...headerStyles.title,
      flex: 1,
      color: templateVar("full-title"),
      fontSize: templateVar("full-title-size"),
      fontWeight: templateVar("full-title-weight"),
    },
    content: { display: "flex", flexDirection: "column" as const },
    // The panes against the edges — no padding, the style sheet's —; the
    // buttons' bar keeps its own inset.
    body: {
      flex: 1,
      minHeight: 0,
      display: "flex",
      flexDirection: "column" as const,
    },
  };
};

/**
 * The space above the buttons' bar, in a column of Mantine's "md" gap at the
 * window's size (Footer's "parentGap"); none over the whole window.
 */
export const templateFooterMargin = (full: boolean) =>
  full ? 0 : `calc(${templateVar("footer-margin-top")} - var(--mantine-spacing-md))`;

/** The buttons' bar: over the whole window, its own inset. */
export const templateFooterStyle = (full: boolean) =>
  full ? { padding: templateVar("full-footer-padding") } : undefined;

// The preview sits on the background of the theme it shows:
// white in light, as a mail client shows a message, whatever the interface's
// — its page background is gray in light, dark in dark; in dark, the fields'
// gray, a notch lighter than the page's — the reply editor's (MailFrame).
const PREVIEW_DARK_BG = "var(--mantine-color-default)";
const PREVIEW_BG = { light: "#ffffff", dark: PREVIEW_DARK_BG };

/**
 * The e-mail, transparent over the preview's background. The dark preview
 * does what most mail clients do with a message that has no dark theme of
 * its own: it inverts its colors, hues kept — images excepted, turned back,
 * and what is already dark (MAIL_DARK_CLASS), which the clients leave as is;
 * a note takes the gray they give it (MAIL_NOTE_CLASS).
 * The document takes the interface's color scheme: a different one would
 * make the browser paint it opaque.
 */
const DARK_FILTER = "invert(1) hue-rotate(180deg)";

/**
 * An image wider than the pane fits it: the preview scrolls only down, and a
 * pasted screenshot shows whole. Mail clients mostly do the same.
 */
const PREVIEW_IMAGES = "img{max-width:100%;height:auto}";

const previewed = (html: string, dark: boolean, scheme: "light" | "dark"): string =>
  html.replace(
    "</head>",
    `<style>:root{color-scheme:${scheme}}html,body{background:transparent}${PREVIEW_IMAGES}${
      dark
        ? `body>*{filter:${DARK_FILTER}}img,.${MAIL_DARK_CLASS},.${MAIL_NOTE_CLASS}{filter:${DARK_FILTER}}` +
          `.${MAIL_NOTE_CLASS}{background-color:${MAIL_NOTE_DARK_BG}!important;color:#ffffff!important}`
        : ""
    }</style></head>`,
  );

/**
 * The preview's theme: that of the interface each time "opened" changes —
 * the window opens on another template —, then whatever the switch says.
 */
export function usePreviewTheme(opened: unknown) {
  const scheme = useComputedColorScheme("light", { getInitialValueInEffect: false });
  const [dark, setDark] = useState(scheme === "dark");
  // Adjusted during the render that sees the new opening, as React advises
  // for state that follows a prop.
  const [seen, setSeen] = useState(opened);
  if (opened !== seen) {
    setSeen(opened);
    if (opened) setDark(scheme === "dark");
  }
  return { dark, setDark, scheme };
}

interface MailPreviewProps {
  html: string;
  dark: boolean;
  scheme: "light" | "dark";
  /**
   * A handle is being dragged: the preview lets the pointer through — an
   * iframe keeps its moves to itself, and the drag would stall over it.
   */
  dragging: boolean;
}

/**
 * The compiled e-mail, over its pane's full height. Mantine's scrollbars, not
 * the browser's: the iframe takes the e-mail's full height, measured once it
 * has loaded, and the area scrolls it. Measuring needs the document's origin
 * — scripts stay forbidden, the e-mail's HTML runs nothing.
 */
export default function MailPreview({ html, dark, scheme, dragging }: MailPreviewProps) {
  const [height, setHeight] = useState(0);
  // Hidden until its first page has loaded: an empty iframe paints white
  // — the browser's own background — over the dark theme. Hidden again
  // once emptied, for the next opening.
  const [ready, setReady] = useState(false);
  if (!html && ready) setReady(false);
  const observer = useRef<ResizeObserver | null>(null);
  useEffect(() => () => observer.current?.disconnect(), []);
  return (
    <Box
      h="100%"
      style={{
        // No frame of its own: the panes' one goes around it (SPLITTER_STYLES).
        background: dark ? PREVIEW_BG.dark : PREVIEW_BG.light,
      }}
    >
      {/* Down only, as the variables: no horizontal bar along its bottom —
          the e-mail fits the pane's width. */}
      <ScrollArea h="100%" type="auto" scrollbars="y" scrollbarSize={SCROLLBAR_SIZE}>
        <Box
          component="iframe"
          title="Aperçu"
          srcDoc={html && previewed(html, dark, scheme)}
          sandbox="allow-same-origin"
          onLoad={(e) => {
            // Followed afterwards: a pane widened or narrowed reflows the e-mail.
            observer.current?.disconnect();
            if (html) setReady(true);
            const page = e.currentTarget.contentDocument?.documentElement;
            if (!page) return setHeight(0);
            // The page's own box: its height follows the content, margins
            // included — a paragraph's last margin escapes the body's height.
            // Its scrolling height would never shrink below the iframe's.
            const measure = () => setHeight(Math.ceil(page.getBoundingClientRect().height));
            measure();
            observer.current = new ResizeObserver(measure);
            observer.current.observe(page);
            // An image grows the page as it arrives.
            for (const image of page.querySelectorAll("img")) image.addEventListener("load", measure);
          }}
          style={{
            display: "block",
            width: "100%",
            height,
            border: 0,
            background: "transparent",
            pointerEvents: dragging ? "none" : undefined,
            visibility: ready ? "visible" : "hidden",
          }}
        />
      </ScrollArea>
    </Box>
  );
}
