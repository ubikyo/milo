// The template for Milo's e-mails.
//
// This is not ordinary HTML. Mail clients share neither CSS variables, nor
// external style sheets, nor flex or grid layout: we are back to tables and
// styles placed on every tag, as twenty years ago. Colors are therefore
// written in hard-coded form, whereas the app draws them from the theme —
// this is the only place in the code where this duplication is justified.
//
// The look is that of the app's windows: a very dark gray banner, the name in
// white and a thin weight, then the content on a light background. The logo
// is not there: it is an SVG, which half of the clients do not render, and a
// remote image is blocked by default in most of the others. The word "Milo"
// in the banner, for its part, depends on nothing.

import { LOGO_CID, LOGO_HEIGHT_PX, LOGO_WIDTH_PX, attachedLogo } from "./mail-logo.js";

/** Milo's colors, frozen: see the explanation at the top of the file. */
const RULE = "#dee2e6";
const TEXT = "#212529";
const DIMMED = "#868e96";
const GREEN = "#099268";

/** The message's inset, the same on all four sides. */
const INSET = "30px";

/** Everything coming from the data goes through here before entering the HTML. */
const escape = (text: string): string =>
  text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** A reported fact, and the number of times it repeated in a row. */
export interface Row {
  text: string;
  repetitions: number;
}

export interface Message {
  /** What is displayed large under the banner: the item's name. */
  title: string;
  /** The sentence that introduces it. */
  intro: string;
  /** What happened, one line per fact. Optional. */
  rows?: Row[];
  /** The button, if there is something to open. */
  action?: { url: string; label: string };
  /** The fine print, at the very bottom. */
  footer: string;
}

const withRepeats = (row: Row): string =>
  row.repetitions > 1 ? `${row.text} (${row.repetitions} fois)` : row.text;

/**
 * The text version. It is not a stopgap: it is what text-mode clients and
 * screen readers that prefer it read, and it is what stays readable when the
 * HTML is blocked.
 */
const toText = (m: Message): string =>
  [
    m.intro,
    "",
    ...(m.rows ?? []).map((row) => `  — ${withRepeats(row)}`),
    ...(m.rows?.length ? [""] : []),
    ...(m.action ? [`${m.action.label} : ${m.action.url}`, ""] : []),
    m.footer,
    "",
  ].join("\n");

const toHtml = (m: Message): string => {
  const rows = (m.rows ?? [])
    .map(
      (row) => `
              <tr>
                <td style="padding:0 0 8px 0;font-size:14px;line-height:1.5;color:${TEXT}">
                  <span style="color:${GREEN};padding-right:8px">&#8212;</span>${escape(
                    withRepeats(row),
                  )}
                </td>
              </tr>`,
    )
    .join("");

  // The button is a table and not a styled "a": it is the only form that
  // Outlook clients render correctly.
  const action = m.action
    ? `
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 0 0">
            <tr>
              <td style="background-color:${GREEN};border-radius:6px">
                <a href="${escape(m.action.url)}"
                   style="display:inline-block;padding:12px 22px;font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none">
                  ${escape(m.action.label)}
                </a>
              </td>
            </tr>
          </table>`
    : "";

  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${escape(m.title)}</title>
  </head>
  <body style="margin:0;padding:0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="width:100%;font-family:Helvetica,Arial,sans-serif">
      <tr>
        <td style="padding:${INSET}">
          <div style="font-size:17px;font-weight:600;color:${TEXT};padding-bottom:4px">
            ${escape(m.title)}
          </div>
          <div style="font-size:14px;line-height:1.5;color:${DIMMED};padding-bottom:${
            m.rows?.length ? "16px" : "0"
          }">
            ${escape(m.intro)}
          </div>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${rows}
          </table>
          ${action}
        </td>
      </tr>
      <!-- The footer: a rule, then the logo and the note on the same line.
           It is the message's only signature — there is no header any more. -->
      <tr>
        <td style="padding:0 ${INSET} ${INSET} ${INSET}">
          <div style="border-top:1px solid ${RULE};padding-top:16px">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td valign="middle" width="${LOGO_WIDTH_PX}">
                  <img src="cid:${LOGO_CID}" alt="Milo"
                       width="${LOGO_WIDTH_PX}" height="${LOGO_HEIGHT_PX}"
                       style="display:block;border:0;width:${LOGO_WIDTH_PX}px;height:${LOGO_HEIGHT_PX}px">
                </td>
                <td valign="middle" style="padding-left:12px;font-size:12px;line-height:1.5;color:${DIMMED}">
                  ${escape(m.footer)}
                </td>
              </tr>
            </table>
          </div>
        </td>
      </tr>
    </table>
  </body>
</html>`;
};

/** An attachment, inlined in the message (Graph, "fileAttachment"). */
export interface MailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
  /** Cited by the HTML as "cid:": the image displays without loading anything. */
  cid: string;
}

/**
 * The two versions of the same message — HTML and text —, and the logo that
 * goes with them. The caller has nothing to assemble: it passes the whole
 * thing to the send.
 */
export const template = (
  m: Message,
): { text: string; html: string; attachments: MailAttachment[] } => ({
  text: toText(m),
  html: toHtml(m),
  attachments: [
    { filename: "milo.png", content: attachedLogo(), contentType: "image/png", cid: LOGO_CID },
  ],
});
