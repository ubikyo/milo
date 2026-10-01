// Les descriptions sont saisies dans l'éditeur et gardées en HTML. Ce HTML est
// réécrit avant d'être enregistré : il ne doit contenir que ce que l'éditeur
// sait produire, sans quoi un compte pourrait y glisser du script. Les
// commentaires, eux, sont du texte simple et ne passent pas par ici.

import { DomUtils, parseDocument } from "htmlparser2";
import type { ChildNode, Element } from "domhandler";
import sanitizeHtml from "sanitize-html";
import { estUneAdresseMedia } from "./medias.js";

const BALISES_RICHES = [
  "p", "br", "strong", "b", "em", "i", "u", "s", "del", "code", "pre",
  "blockquote", "ul", "ol", "li", "h1", "h2", "h3", "h4", "h5", "h6", "a", "hr",
  "img",
];

const assainir = (html: unknown): string =>
  sanitizeHtml(String(html ?? ""), {
    allowedTags: BALISES_RICHES,
    // Un lien garde son adresse et s'ouvre ailleurs ; rien d'autre ne passe,
    // et surtout aucun attribut « on… ».
    allowedAttributes: { a: ["href", "target", "rel"], img: ["src", "alt"] },
    allowedSchemes: ["http", "https", "mailto"],
    // Un lien sans protocole connu perd son adresse plutôt que la page.
    allowProtocolRelative: false,
    // Une image ne vient que de nos propres médias : c'est là que les images
    // collées sont déposées. Une image d'ailleurs — y compris une « data: »
    // qui ferait grossir la ligne sans fin — est jetée avec sa balise.
    exclusiveFilter: (frame) => frame.tag === "img" && !estUneAdresseMedia(frame.attribs["src"]),
  });

/**
 * Un texte brut — le corps d'un e-mail, un message d'avant l'éditeur — mis en
 * HTML : échappé, un paragraphe par bloc, un saut de ligne par ligne.
 */
export const texteEnHtml = (texte: string): string =>
  texte
    .split(/\n{2,}/)
    .map((bloc) => bloc.trim())
    .filter(Boolean)
    .map(
      (bloc) =>
        `<p>${bloc
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/\n/g, "<br>")}</p>`,
    )
    .join("");

/**
 * Un éditeur vide rend « <p></p> » : ce n'est pas du contenu. Sert aussi bien
 * à remettre une description à plat qu'à savoir si une carte en porte une.
 *
 * Une image en est : une description qui ne montre qu'une photo n'est pas une
 * description vide, et la carte doit porter sa pastille comme une autre.
 */
export const porteDuContenu = (html: unknown): boolean => {
  const texte = String(html ?? "");
  if (/<img\b/i.test(texte)) return true;
  return texte.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim() !== "";
};

/**
 * La description telle qu'on la garde. Sans cette remise à plat, une fiche
 * sans texte compterait tout de même comme ayant une description.
 */
export const descriptionPropre = (html: unknown): string => {
  const propre = assainir(html);
  return porteDuContenu(propre) ? propre : "";
};

/**
 * Deux descriptions qui disent la même chose. La description reçue est déjà
 * remise à plat ; celle en base ne l'est pas forcément — les fiches d'avant
 * cette remise à plat gardent le « <p></p> » d'un éditeur vide, ou un espace
 * insécable encore écrit « &nbsp; ». On compare donc les deux remises à plat,
 * sans quoi ouvrir une de ces fiches pour la relire la redaterait.
 *
 * Reste le cas des fiches d'avant l'éditeur : leur texte n'a aucune balise, et
 * l'éditeur le leur rend dans un paragraphe. C'est lui qui l'a mis là, pas
 * l'utilisateur : la nouvelle forme s'enregistre, mais la date ne bouge pas
 * pour autant.
 */
export const memeDescription = (recue: string, existante: string): boolean => {
  const propre = descriptionPropre(existante);
  return recue === propre || (!/<[a-z/!]/i.test(propre) && recue === `<p>${propre}</p>`);
};

// --- E-mails reçus ---------------------------------------------------------
// Un e-mail reçu se montre tel que son expéditeur l'a écrit : ses styles, ses
// tableaux, ses polices, ses images. Il ne passe donc pas par la règle de
// l'éditeur, qui n'en garderait presque rien, mais par la sienne : tout ce qui
// met en page reste, tout ce qui s'exécute part — scripts, attributs « on… »,
// formulaires, cadres. Le client le montre de plus dans un cadre isolé, sans
// script (SupportMessages).

const BALISES_EMAIL = [
  ...BALISES_RICHES,
  "html", "head", "body", "style", "div", "span", "font", "center", "small", "big",
  "sub", "sup", "table", "thead", "tbody", "tfoot", "tr", "td", "th", "caption",
  "colgroup", "col", "section", "article", "header", "footer", "main", "nav", "aside",
  "figure", "figcaption", "abbr", "address", "cite", "dl", "dt", "dd", "mark", "q",
  "tt", "wbr", "ins", "kbd", "samp", "var", "picture",
];

const ATTRIBUTS_EMAIL = [
  "style", "class", "id", "align", "valign", "width", "height", "bgcolor", "background",
  "color", "border", "cellpadding", "cellspacing", "dir", "lang", "face", "size",
  "colspan", "rowspan", "title", "role", "type", "start", "span",
];

/** Au-delà, le corps est coupé : un fil de réponses ne grossit pas sans fin. */
const LONGUEUR_MAX_EMAIL = 2 * 1024 * 1024;

/**
 * Le corps d'un e-mail tel qu'on le garde. « images » donne, pour chaque
 * identifiant « cid: » d'une image intégrée, l'adresse où elle a été rangée.
 * Un e-mail en texte brut garde ses lignes telles quelles.
 */
export const emailPropre = (
  corps: string,
  type: "html" | "text",
  images: Map<string, string>,
): string => {
  const brut = corps.length > LONGUEUR_MAX_EMAIL ? corps.slice(0, LONGUEUR_MAX_EMAIL) : corps;
  if (type === "text") {
    const echappe = brut.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return `<pre style="white-space: pre-wrap; font-family: inherit; margin: 0">${echappe}</pre>`;
  }
  return sanitizeHtml(brut, {
    allowedTags: BALISES_EMAIL,
    // Les feuilles de style de l'e-mail, qui le mettent en page.
    allowVulnerableTags: true,
    allowedAttributes: {
      "*": ATTRIBUTS_EMAIL,
      a: [...ATTRIBUTS_EMAIL, "href", "name", "target", "rel"],
      img: [...ATTRIBUTS_EMAIL, "src", "alt"],
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesByTag: { img: ["http", "https", "data", "cid"] },
    allowProtocolRelative: false,
    transformTags: {
      // Un lien s'ouvre à côté de Milo, jamais à sa place.
      a: (tagName, attribs) => ({
        tagName,
        attribs: { ...attribs, target: "_blank", rel: "noopener noreferrer" },
      }),
      // Une image intégrée pointe vers le fichier rapatrié ; une image
      // intégrée qu'on n'a pas pu rapatrier perd sa source plutôt que de
      // montrer une adresse que le navigateur ne sait pas lire.
      img: (tagName, attribs) => {
        const src = attribs["src"] ?? "";
        if (!/^cid:/i.test(src)) return { tagName, attribs };
        const cle = src.slice(4).replace(/^<|>$/g, "");
        const url = images.get(cle);
        const { src: _src, ...reste } = attribs;
        return { tagName, attribs: url ? { ...reste, src: url } : reste };
      },
    },
  });
};

/**
 * Où commence l'historique qu'une réponse cite : le bloc qu'Outlook — sur
 * ordinateur, sur le web ou sur mobile — pose avant le message auquel on
 * répond, la citation de Mail d'Apple, celle de Gmail. Graph préfixe parfois
 * les identifiants d'un « x_ ».
 */
const DEBUT_HISTORIQUE = /^(x_)?(appendonsend|divRplyFwdMsg|mail-editor-reference-message-container)$/;

const ouvreLHistorique = (e: Element): boolean =>
  DEBUT_HISTORIQUE.test(e.attribs["id"] ?? "") ||
  (e.name === "blockquote" && (e.attribs["type"] ?? "").toLowerCase() === "cite") ||
  /(^|\s)gmail_quote(\s|$)/.test(e.attribs["class"] ?? "");

/**
 * Le corps d'une réponse sans l'historique qu'elle cite : tout ce qui suit le
 * premier repère, lui compris, est retiré. Un corps où rien ne resterait est
 * rendu tel quel — mieux vaut un historique en trop qu'un message vide.
 */
export const sansHistorique = (html: string): string => {
  const document = parseDocument(html);
  const repere = DomUtils.findOne(ouvreLHistorique, document.children, true);
  if (!repere) return html;

  // Outlook sur ordinateur trace un filet juste avant l'entête « De : ».
  const avant = DomUtils.prevElementSibling(repere);
  if (avant?.name === "hr") DomUtils.removeElement(avant);

  // Ce qui suit le repère, à chaque niveau jusqu'à la racine.
  let noeud: ChildNode | null = repere;
  while (noeud) {
    while (noeud.next) DomUtils.removeElement(noeud.next);
    noeud = noeud.parent && noeud.parent !== document ? (noeud.parent as ChildNode) : null;
  }
  DomUtils.removeElement(repere);

  const reste = DomUtils.getOuterHTML(document.children);
  return porteDuContenu(reste) ? reste : html;
};
