// Descriptions are entered in the editor and kept as HTML. This HTML is
// rewritten before being saved: it must contain only what the editor can
// produce, otherwise an account could slip script into it. Comments, for
// their part, are plain text and do not go through here.

import { DomUtils, parseDocument } from "htmlparser2";
import type { ChildNode, Element } from "domhandler";
import sanitizeHtml from "sanitize-html";
import { isMediaAddress } from "./media.js";

const RICH_TAGS = [
  "p", "br", "strong", "b", "em", "i", "u", "s", "del", "code", "pre",
  "blockquote", "ul", "ol", "li", "h1", "h2", "h3", "h4", "h5", "h6", "a", "hr",
  "img",
];

const sanitize = (html: unknown): string =>
  sanitizeHtml(String(html ?? ""), {
    allowedTags: RICH_TAGS,
    // A link keeps its address and opens elsewhere; nothing else gets
    // through, and above all no "on…" attribute.
    allowedAttributes: { a: ["href", "target", "rel"], img: ["src", "alt"] },
    allowedSchemes: ["http", "https", "mailto"],
    // A link without a known protocol loses its address rather than the page.
    allowProtocolRelative: false,
    // An image only comes from our own media: that is where pasted images are
    // stored. An image from elsewhere — including a "data:" one that would
    // make the row grow without end — is dropped along with its tag.
    exclusiveFilter: (frame) => frame.tag === "img" && !isMediaAddress(frame.attribs["src"]),
  });

/**
 * Plain text — an e-mail body, a message from before the editor — turned
 * into HTML: escaped, one paragraph per block, one line break per line.
 */
export const textToHtml = (text: string): string =>
  text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map(
      (block) =>
        `<p>${block
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/\n/g, "<br>")}</p>`,
    )
    .join("");

/**
 * An empty editor returns "<p></p>": that is not content. Serves equally to
 * flatten a description and to know whether a card carries one.
 *
 * An image counts: a description that shows only a photo is not an empty
 * description, and the card must carry its badge like any other.
 */
export const hasContent = (html: unknown): boolean => {
  const text = String(html ?? "");
  if (/<img\b/i.test(text)) return true;
  return text.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim() !== "";
};

/**
 * The description as it is kept. Without this flattening, a record without
 * text would still count as having a description.
 */
export const cleanDescription = (html: unknown): string => {
  const clean = sanitize(html);
  return hasContent(clean) ? clean : "";
};

/**
 * Two descriptions that say the same thing. The received description is
 * already flattened; the one in the database is not necessarily — records
 * from before this flattening keep the "<p></p>" of an empty editor, or a
 * non-breaking space still written "&nbsp;". So both are flattened before
 * comparing, otherwise opening one of these records to reread it would
 * change its date.
 *
 * There remains the case of records from before the editor: their text has
 * no tags, and the editor gives it back to them wrapped in a paragraph. The
 * editor put it there, not the user: the new form is saved, but the date does
 * not move for that.
 */
export const sameDescription = (received: string, existing: string): boolean => {
  const clean = cleanDescription(existing);
  return received === clean || (!/<[a-z/!]/i.test(clean) && received === `<p>${clean}</p>`);
};

// --- Received e-mails ---------------------------------------------------------
// A received e-mail is shown as its sender wrote it: its styles, tables,
// fonts, images. It therefore does not go through the editor's rule, which
// would keep almost nothing of it, but through its own: everything that lays
// out the page stays, everything that executes goes — scripts, "on…"
// attributes, forms, frames. The client also shows it in an isolated frame,
// without script (SupportMessages).

const EMAIL_TAGS = [
  ...RICH_TAGS,
  "html", "head", "body", "style", "div", "span", "font", "center", "small", "big",
  "sub", "sup", "table", "thead", "tbody", "tfoot", "tr", "td", "th", "caption",
  "colgroup", "col", "section", "article", "header", "footer", "main", "nav", "aside",
  "figure", "figcaption", "abbr", "address", "cite", "dl", "dt", "dd", "mark", "q",
  "tt", "wbr", "ins", "kbd", "samp", "var", "picture",
];

const EMAIL_ATTRIBUTES = [
  "style", "class", "id", "align", "valign", "width", "height", "bgcolor", "background",
  "color", "border", "cellpadding", "cellspacing", "dir", "lang", "face", "size",
  "colspan", "rowspan", "title", "role", "type", "start", "span",
];

/** Beyond this, the body is cut: a thread of replies does not grow without end. */
const EMAIL_LENGTH_MAX = 2 * 1024 * 1024;

/**
 * The body of an e-mail as it is kept. "images" gives, for each "cid:"
 * identifier of an embedded image, the address where it was stored. A
 * plain-text e-mail keeps its lines as they are.
 */
export const cleanEmail = (
  body: string,
  type: "html" | "text",
  images: Map<string, string>,
): string => {
  const raw = body.length > EMAIL_LENGTH_MAX ? body.slice(0, EMAIL_LENGTH_MAX) : body;
  if (type === "text") {
    const escaped = raw.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return `<pre style="white-space: pre-wrap; font-family: inherit; margin: 0">${escaped}</pre>`;
  }
  return sanitizeHtml(raw, {
    allowedTags: EMAIL_TAGS,
    // The e-mail's style sheets, which lay it out.
    allowVulnerableTags: true,
    allowedAttributes: {
      "*": EMAIL_ATTRIBUTES,
      a: [...EMAIL_ATTRIBUTES, "href", "name", "target", "rel"],
      img: [...EMAIL_ATTRIBUTES, "src", "alt"],
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesByTag: { img: ["http", "https", "data", "cid"] },
    allowProtocolRelative: false,
    transformTags: {
      // A link opens beside Milo, never in its place.
      a: (tagName, attribs) => ({
        tagName,
        attribs: { ...attribs, target: "_blank", rel: "noopener noreferrer" },
      }),
      // An embedded image points to the fetched file; an embedded image that
      // could not be fetched loses its source rather than showing an address
      // the browser cannot read.
      img: (tagName, attribs) => {
        const src = attribs["src"] ?? "";
        if (!/^cid:/i.test(src)) return { tagName, attribs };
        const key = src.slice(4).replace(/^<|>$/g, "");
        const url = images.get(key);
        const { src: _src, ...rest } = attribs;
        return { tagName, attribs: url ? { ...rest, src: url } : rest };
      },
    },
  });
};

/**
 * Where the history that a reply cites begins: the block Outlook — on
 * desktop, web or mobile — places before the message being answered, Apple
 * Mail's quote, Gmail's. Graph sometimes prefixes the identifiers with "x_".
 */
const HISTORY_START = /^(x_)?(appendonsend|divRplyFwdMsg|mail-editor-reference-message-container)$/;

const opensHistory = (e: Element): boolean =>
  HISTORY_START.test(e.attribs["id"] ?? "") ||
  (e.name === "blockquote" && (e.attribs["type"] ?? "").toLowerCase() === "cite") ||
  /(^|\s)gmail_quote(\s|$)/.test(e.attribs["class"] ?? "");

/**
 * The body of a reply without the history it cites: everything after the
 * first marker, itself included, is removed. A body where nothing would
 * remain is returned as is — better one history too many than an empty
 * message.
 */
export const withoutHistory = (html: string): string => {
  const document = parseDocument(html);
  const marker = DomUtils.findOne(opensHistory, document.children, true);
  if (!marker) return html;

  // Desktop Outlook draws a rule just before the "De :" header.
  const before = DomUtils.prevElementSibling(marker);
  if (before?.name === "hr") DomUtils.removeElement(before);

  // What follows the marker, at each level up to the root.
  let treeNode: ChildNode | null = marker;
  while (treeNode) {
    while (treeNode.next) DomUtils.removeElement(treeNode.next);
    treeNode = treeNode.parent && treeNode.parent !== document ? (treeNode.parent as ChildNode) : null;
  }
  DomUtils.removeElement(marker);

  const rest = DomUtils.getOuterHTML(document.children);
  return hasContent(rest) ? rest : html;
};
