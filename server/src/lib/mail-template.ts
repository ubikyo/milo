// Le gabarit des e-mails de Milo.
//
// Ce n'est pas du HTML ordinaire. Les clients de messagerie ne partagent ni
// les variables CSS, ni les feuilles de style externes, ni la mise en page en
// flex ou en grille : on en revient aux tableaux et aux styles posés sur
// chaque balise, comme on le faisait il y a vingt ans. Les couleurs sont donc
// écrites en dur, alors que l'application les tire du thème — c'est le seul
// endroit du code où ce doublon est justifié.
//
// L'allure est celle des fenêtres de l'application : un bandeau gris très
// foncé, le nom en blanc et en graisse fine, puis le contenu sur fond clair.
// Le logo n'y est pas : c'est un SVG, que la moitié des clients ne rendent
// pas, et une image distante est bloquée par défaut chez la plupart des
// autres. Le mot « Milo » dans le bandeau ne dépend, lui, de rien.

import { LOGO_CID, LOGO_HEIGHT_PX, LOGO_WIDTH_PX, attachedLogo } from "./mail-logo.js";

/** Les couleurs de Milo, figées : voir l'explication en tête de fichier. */
const RULE = "#dee2e6";
const TEXT = "#212529";
const DIMMED = "#868e96";
const GREEN = "#099268";

/** Le retrait du message, le même sur les quatre côtés. */
const INSET = "30px";

/** Tout ce qui vient des données passe par là avant d'entrer dans le HTML. */
const escape = (text: string): string =>
  text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Un fait rapporté, et le nombre de fois qu'il s'est répété d'affilée. */
export interface Row {
  text: string;
  repetitions: number;
}

export interface Message {
  /** Ce qui s'affiche en gros sous le bandeau : le nom de l'élément. */
  title: string;
  /** La phrase qui l'introduit. */
  intro: string;
  /** Ce qui s'est passé, une ligne par fait. Facultatif. */
  rows?: Row[];
  /** Le bouton, s'il y a quelque chose à ouvrir. */
  action?: { url: string; label: string };
  /** La mention en petit, tout en bas. */
  footer: string;
}

const withRepeats = (row: Row): string =>
  row.repetitions > 1 ? `${row.text} (${row.repetitions} fois)` : row.text;

/**
 * La version texte. Elle n'est pas un pis-aller : c'est elle que lisent les
 * clients en mode texte et les lecteurs d'écran qui la préfèrent, et c'est
 * elle qui reste lisible quand le HTML est bloqué.
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

  // Le bouton est un tableau et non un « a » stylé : c'est la seule forme que
  // rendent correctement les clients d'Outlook.
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
      <!-- Le pied : un trait, puis le logo et la mention sur la même ligne.
           C'est la seule signature du message — il n'y a plus d'entête. -->
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

/** Une pièce jointe, jointe en ligne au message (Graph, « fileAttachment »). */
export interface MailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
  /** Cité par le HTML en « cid: » : l'image s'affiche sans rien charger. */
  cid: string;
}

/**
 * Les deux versions d'un même message — HTML et texte —, et le logo qui les
 * accompagne. L'appelant n'a rien à assembler : il passe le tout à l'envoi.
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
