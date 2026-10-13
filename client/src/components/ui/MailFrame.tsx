import { useComputedColorScheme } from "@mantine/core";
import { createContext, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import classes from "../../assets/styles/MailFrame.module.css";

// The e-mail's template around the text being written: the reply editor
// shows the message as it will go — the template's logo, its texts, its
// layout —, and only the text written, where the template puts
// {{model.content}}, can be changed. The template comes as its preview does,
// laid out by the server around a marker written in place of the text
// (MAIL_SLOT_MARKER); the editor's area is moved where the marker was.
//
// The template is shown as the previews show it: in the light theme, as a
// light mail client — white, its colors as written —; in the dark theme, as
// "Aperçu sombre" (MailPreview), the text written with it.

/** What the editor's text is replaced with, to find where the template puts it. */
export const MAIL_SLOT_MARKER = "MILO-MAIL-CONTENT-SLOT";

/** The editor's area in the template: its font, no padding nor background of its own. */
export const mailFrameContentClass = classes.content ?? "";

/**
 * Inside a template, whether it is dark: the text's tables follow it, not the
 * interface's theme (VariableBlock). Null outside one.
 */
export const MailFramed = createContext<boolean | null>(null);

const SLOT_ATTRIBUTE = "data-milo-mail-slot";

/**
 * The template's body, the marker replaced by the slot — the paragraph that
 * holds it with it —, and the body's own style. Without the marker — a
 * template that does not show the text —, nothing: the editor stays as it is.
 */
const frameOf = (html: string): { body: string; style: string } | null => {
  if (!html) return null;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  let marker: Text | null = null;
  while (walker.nextNode()) {
    if (walker.currentNode.nodeValue?.includes(MAIL_SLOT_MARKER)) {
      marker = walker.currentNode as Text;
      break;
    }
  }
  if (!marker) return null;
  const slot = doc.createElement("div");
  slot.setAttribute(SLOT_ATTRIBUTE, "");
  const parent = marker.parentElement;
  const alone = parent && parent !== doc.body && parent.textContent?.trim() === MAIL_SLOT_MARKER;
  (alone ? parent : marker).replaceWith(slot);
  // The template's links lead nowhere from here: the text's own stay the editor's.
  doc.body.querySelectorAll("a[href]").forEach((a) => a.removeAttribute("href"));
  return { body: doc.body.innerHTML, style: doc.body.getAttribute("style") ?? "" };
};

/** The CSS of an inline "style" attribute, as React takes it. */
const styleOf = (css: string): Record<string, string> =>
  Object.fromEntries(
    css
      .split(";")
      .map((rule) => rule.split(":"))
      .filter((parts) => parts.length >= 2 && parts[0]!.trim())
      .map(([name, ...value]) => [
        name!.trim().replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase()),
        value.join(":").trim(),
      ]),
  );

interface MailFrameProps {
  /** The template's preview, the marker in the text's place; empty while it loads. */
  html: string;
  /** Shown as a dark mail client shows it: the interface's theme by default. */
  dark?: boolean;
  /**
   * The editor's area, moved into the template — told whether it is, to take
   * the template's look (mailFrameContentClass) or keep its own.
   */
  children: (framed: boolean) => ReactNode;
}

export default function MailFrame({ html, dark: asked, children }: MailFrameProps) {
  const frame = useMemo(() => frameOf(html), [html]);
  const host = useRef<HTMLDivElement>(null);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const scheme = useComputedColorScheme("light");
  const dark = asked ?? scheme === "dark";

  // The slot is in the template's HTML, written by React: found once it is.
  useLayoutEffect(() => {
    setSlot(host.current?.querySelector<HTMLElement>(`[${SLOT_ATTRIBUTE}]`) ?? null);
  }, [frame]);

  if (!frame) return <>{children(false)}</>;
  return (
    <MailFramed.Provider value={dark}>
      <div className={dark ? `${classes.frame} ${classes.dark}` : classes.frame}>
        <div
          ref={host}
          className={classes.body}
          style={styleOf(frame.style)}
          dangerouslySetInnerHTML={{ __html: frame.body }}
        />
      </div>
      {slot && createPortal(children(true), slot)}
    </MailFramed.Provider>
  );
}
