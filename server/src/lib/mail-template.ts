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

import { LOGO_CID, LOGO_HAUTEUR, LOGO_LARGEUR, logoJoint } from "./mail-logo.js";

/** Les couleurs de Milo, figées : voir l'explication en tête de fichier. */
const FILET = "#dee2e6";
const TEXTE = "#212529";
const ATTENUE = "#868e96";
const VERT = "#099268";

/** Le retrait du message, le même sur les quatre côtés. */
const RETRAIT = "30px";

/** Tout ce qui vient des données passe par là avant d'entrer dans le HTML. */
const echapper = (texte: string): string =>
  texte.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Un fait rapporté, et le nombre de fois qu'il s'est répété d'affilée. */
export interface Ligne {
  texte: string;
  repetitions: number;
}

export interface Message {
  /** Ce qui s'affiche en gros sous le bandeau : le nom de l'élément. */
  titre: string;
  /** La phrase qui l'introduit. */
  intro: string;
  /** Ce qui s'est passé, une ligne par fait. Facultatif. */
  lignes?: Ligne[];
  /** Le bouton, s'il y a quelque chose à ouvrir. */
  action?: { url: string; libelle: string };
  /** La mention en petit, tout en bas. */
  pied: string;
}

const avecRepetitions = (ligne: Ligne): string =>
  ligne.repetitions > 1 ? `${ligne.texte} (${ligne.repetitions} fois)` : ligne.texte;

/**
 * La version texte. Elle n'est pas un pis-aller : c'est elle que lisent les
 * clients en mode texte et les lecteurs d'écran qui la préfèrent, et c'est
 * elle qui reste lisible quand le HTML est bloqué.
 */
const enTexte = (m: Message): string =>
  [
    m.intro,
    "",
    ...(m.lignes ?? []).map((ligne) => `  — ${avecRepetitions(ligne)}`),
    ...(m.lignes?.length ? [""] : []),
    ...(m.action ? [`${m.action.libelle} : ${m.action.url}`, ""] : []),
    m.pied,
    "",
  ].join("\n");

const enHtml = (m: Message): string => {
  const lignes = (m.lignes ?? [])
    .map(
      (ligne) => `
              <tr>
                <td style="padding:0 0 8px 0;font-size:14px;line-height:1.5;color:${TEXTE}">
                  <span style="color:${VERT};padding-right:8px">&#8212;</span>${echapper(
                    avecRepetitions(ligne),
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
              <td style="background-color:${VERT};border-radius:6px">
                <a href="${echapper(m.action.url)}"
                   style="display:inline-block;padding:12px 22px;font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none">
                  ${echapper(m.action.libelle)}
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
    <title>${echapper(m.titre)}</title>
  </head>
  <body style="margin:0;padding:0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="width:100%;font-family:Helvetica,Arial,sans-serif">
      <tr>
        <td style="padding:${RETRAIT}">
          <div style="font-size:17px;font-weight:600;color:${TEXTE};padding-bottom:4px">
            ${echapper(m.titre)}
          </div>
          <div style="font-size:14px;line-height:1.5;color:${ATTENUE};padding-bottom:${
            m.lignes?.length ? "16px" : "0"
          }">
            ${echapper(m.intro)}
          </div>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${lignes}
          </table>
          ${action}
        </td>
      </tr>
      <!-- Le pied : un trait, puis le logo et la mention sur la même ligne.
           C'est la seule signature du message — il n'y a plus d'entête. -->
      <tr>
        <td style="padding:0 ${RETRAIT} ${RETRAIT} ${RETRAIT}">
          <div style="border-top:1px solid ${FILET};padding-top:16px">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td valign="middle" width="${LOGO_LARGEUR}">
                  <img src="cid:${LOGO_CID}" alt="Milo"
                       width="${LOGO_LARGEUR}" height="${LOGO_HAUTEUR}"
                       style="display:block;border:0;width:${LOGO_LARGEUR}px;height:${LOGO_HAUTEUR}px">
                </td>
                <td valign="middle" style="padding-left:12px;font-size:12px;line-height:1.5;color:${ATTENUE}">
                  ${echapper(m.pied)}
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

/** Une pièce jointe, dans la forme qu'attend nodemailer. */
export interface PieceJointe {
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
export const gabarit = (
  m: Message,
): { text: string; html: string; attachments: PieceJointe[] } => ({
  text: enTexte(m),
  html: enHtml(m),
  attachments: [
    { filename: "milo.png", content: logoJoint(), contentType: "image/png", cid: LOGO_CID },
  ],
});
