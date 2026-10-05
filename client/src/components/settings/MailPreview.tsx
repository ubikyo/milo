import { Box, ScrollArea, useComputedColorScheme } from "@mantine/core";
import { useEffect, useRef, useState } from "react";

// What the template windows share — the MJML one (MailTemplateModal) and the
// support one (SupportReplyModal): their panes, side by side in a Splitter,
// and the preview of the e-mail, in the theme its switch chooses.

/**
 * The panes' widths on opening, the same in every template window: the
 * variables a fixed 200 px, the code and the preview sharing the rest.
 */
export const PANE_SIZES = { variables: "200px", editor: 55, preview: 45 } as const;

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
export const paneStyle = (side?: "left" | "right") => {
  const radius = "var(--mantine-radius-default)";
  return {
    overflow: "hidden",
    isolation: "isolate",
    ...(side === "left" && { borderTopLeftRadius: radius, borderBottomLeftRadius: radius }),
    ...(side === "right" && { borderTopRightRadius: radius, borderBottomRightRadius: radius }),
  } as const;
};

// The handles and the preview's frame: a neutral gray — Mantine's leans blue.
export const HANDLE_COLOR = "var(--milo-header-bg)";

/** The handles above the panes, which are isolated (paneStyle). */
export const SPLITTER_STYLES = { handle: { zIndex: 1 } };

// The preview sits on the background of the theme it shows, in a gray frame.
const PREVIEW_BG = { light: "var(--mantine-color-body)", dark: "var(--mantine-color-body)" };

/**
 * The e-mail, transparent over the preview's background. The dark preview
 * does what most mail clients do with a message that has no dark theme of
 * its own: it inverts its colors, hues kept — images excepted, turned back.
 * The document takes the interface's color scheme: a different one would
 * make the browser paint it opaque.
 */
const DARK_FILTER = "invert(1) hue-rotate(180deg)";

/**
 * The logo of the theme shown — the switch decides, not the browser's own
 * preference, which the template's dark-mode rule would otherwise follow.
 */
const logoFor = (dark: boolean): string =>
  `.logo-light{display:${dark ? "none" : "inline-block"}!important}` +
  `.logo-dark{display:${dark ? "inline-block" : "none"}!important}`;

/**
 * An image wider than the pane fits it: the preview scrolls only down, and a
 * pasted screenshot shows whole. Mail clients mostly do the same.
 */
const PREVIEW_IMAGES = "img{max-width:100%;height:auto}";

const previewed = (html: string, dark: boolean, scheme: "light" | "dark"): string =>
  html.replace(
    "</head>",
    `<style>:root{color-scheme:${scheme}}html,body{background:transparent}${PREVIEW_IMAGES}${
      dark ? `body>*{filter:${DARK_FILTER}}img{filter:${DARK_FILTER}}` : ""
    }${logoFor(dark)}</style></head>`,
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
        // No line on the left: the handle already separates it from the code.
        border: `1px solid ${HANDLE_COLOR}`,
        borderLeft: 0,
        background: dark ? PREVIEW_BG.dark : PREVIEW_BG.light,
      }}
    >
      <ScrollArea h="100%" type="auto" scrollbarSize={SCROLLBAR_SIZE}>
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
