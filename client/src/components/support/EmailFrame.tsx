import { useComputedColorScheme } from "@mantine/core";
import { useEffect, useRef, useState } from "react";
import { BLUE } from "../../themes/colors";

// A received e-mail, shown as its sender wrote it: its styles, its
// tables, its images. It lives in a separate frame, so that its stylesheets
// do not spill over onto Milo, nor Milo's onto it.
//
// The frame executes nothing: "sandbox" without "allow-scripts", and a
// security policy that allows no script, form or frame. The
// server has already removed all that (lib/html.ts); the frame guarantees it a
// second time. "allow-same-origin" is only used to measure its height: with no
// script inside, it opens nothing.
//
// The background is transparent: the e-mail sits on its message's. In
// dark theme, its colors are adjusted the way a mail client does in dark
// mode: its backgrounds fade out and its text lightens,
// otherwise black text written for white would be unreadable. Links
// keep a link color.

const POLICY =
  "default-src 'none'; img-src 'self' data: https: http:; style-src 'unsafe-inline' https:; font-src https: data:";

/** The colors forced onto the e-mail in dark theme (those of Mantine's text). */
const DARK = `
  html, body { color: #c9c9c9 !important; }
  body * {
    background-color: transparent !important;
    background-image: none !important;
    color: inherit !important;
    border-color: #424242 !important;
  }
  a, a * { color: ${BLUE} !important; }
`;

const documentOf = (html: string, dark: boolean): string => `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${POLICY}">
<base target="_blank">
<style>
  :root { color-scheme: ${dark ? "dark" : "light"}; }
  html, body { margin: 0; padding: 0; background: transparent !important; color: #222; }
  /* The frame never scrolls: it takes the height of what it holds. */
  html, body { overflow: hidden !important; height: auto !important; min-height: 0 !important; }
  /* The margins of the first and last block stay in the body, otherwise
     the measurement would miss them; those of the edges are of no use. */
  body { display: flow-root; }
  body > :first-child { margin-top: 0 !important; }
  body > :last-child { margin-bottom: 0 !important; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; font-size: 14px; overflow-wrap: anywhere; }
  img { max-width: 100%; height: auto; }
  ${dark ? DARK : ""}
</style>
</head>
<body>${html}</body>
</html>`;

/**
 * What trimming leaves in place, and where it does not descend: layout
 * tables — removing an empty cell would shift their columns — and
 * stylesheets, which are not visible.
 */
const INTACT = new Set(["STYLE", "TABLE", "THEAD", "TBODY", "TFOOT", "TR", "TD", "TH"]);

/** A block that shows nothing: no text, no image, no table. */
const isEmpty = (element: Element): boolean =>
  (element.textContent ?? "").replace(/\u00a0/g, " ").trim() === "" &&
  !element.querySelector("img, table, hr, video, iframe");

/**
 * Removes the empty blocks at the start and end of the e-mail — the "<p>&nbsp;</p>" and
 * "<div><br></div>" that Outlook readily leaves around the text —, by
 * descending into wrappers that hold only one block: the message
 * stops at its content.
 */
const clip = (root: Element): void => {
  for (const edgeChild of ["firstElementChild", "lastElementChild"] as const) {
    let parent: Element | null = root;
    while (parent) {
      let child: Element | null = parent[edgeChild];
      while (child && !INTACT.has(child.tagName) && isEmpty(child)) {
        const next: Element | null =
          edgeChild === "firstElementChild" ? child.nextElementSibling : child.previousElementSibling;
        child.remove();
        child = next;
      }
      // Stylesheets do not count: they are not visible.
      while (child && child.tagName === "STYLE") {
        child =
          edgeChild === "firstElementChild" ? child.nextElementSibling : child.previousElementSibling;
      }
      parent = child && !INTACT.has(child.tagName) && child.children.length > 0 ? child : null;
    }
  }
};

export default function EmailFrame({ html }: { html: string }) {
  const frame = useRef<HTMLIFrameElement | null>(null);
  const dark = useComputedColorScheme("light") === "dark";
  const [height, setHeight] = useState(0);

  // The frame takes the height of what it holds, and takes it again when an
  // image finishes loading: it never scrolls itself, it is the thread that
  // scrolls.
  useEffect(() => {
    const iframe = frame.current;
    if (!iframe) return undefined;
    let observer: ResizeObserver | null = null;
    // The body's height, not the page's: the latter never goes
    // below the frame's height, so it could only grow.
    const measure = () => {
      const body = iframe.contentDocument?.body;
      if (!body) return;
      setHeight(Math.ceil(body.getBoundingClientRect().height));
    };
    const loaded = () => {
      const body = iframe.contentDocument?.body;
      if (!body) return;
      clip(body);
      measure();
      observer?.disconnect();
      observer = new ResizeObserver(measure);
      observer.observe(body);
      body.querySelectorAll("img").forEach((img) => img.addEventListener("load", measure));
    };
    iframe.addEventListener("load", loaded);
    return () => {
      iframe.removeEventListener("load", loaded);
      observer?.disconnect();
    };
  }, [html, dark]);

  return (
    <iframe
      ref={frame}
      aria-label="E-mail reçu"
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      srcDoc={documentOf(html, dark)}
      scrolling="no"
      style={{
        display: "block",
        width: "100%",
        height: height,
        border: 0,
        background: "transparent",
        // The frame is only transparent if its document and it share the
        // same color scheme; otherwise the browser paints a background there.
        colorScheme: dark ? "dark" : "light",
      }}
    />
  );
}
