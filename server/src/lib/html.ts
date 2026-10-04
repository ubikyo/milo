// Les descriptions sont saisies dans l'éditeur et gardées en HTML. Ce HTML est
// réécrit avant d'être enregistré : il ne doit contenir que ce que l'éditeur
// sait produire, sans quoi un compte pourrait y glisser du script. Les
// commentaires, eux, sont du texte simple et ne passent pas par ici.

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
    // Un lien garde son adresse et s'ouvre ailleurs ; rien d'autre ne passe,
    // et surtout aucun attribut « on… ».
    allowedAttributes: { a: ["href", "target", "rel"], img: ["src", "alt"] },
    allowedSchemes: ["http", "https", "mailto"],
    // Un lien sans protocole connu perd son adresse plutôt que la page.
    allowProtocolRelative: false,
    // Une image ne vient que de nos propres médias : c'est là que les images
    // collées sont déposées. Une image d'ailleurs — y compris une « data: »
    // qui ferait grossir la ligne sans fin — est jetée avec sa balise.
    exclusiveFilter: (frame) => frame.tag === "img" && !isMediaAddress(frame.attribs["src"]),
  });

/**
 * Un texte brut — le corps d'un e-mail, un message d'avant l'éditeur — mis en
 * HTML : échappé, un paragraphe par bloc, un saut de ligne par ligne.
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
 * Un éditeur vide rend « <p></p> » : ce n'est pas du contenu. Sert aussi bien
 * à remettre une description à plat qu'à savoir si une carte en porte une.
 *
 * Une image en est : une description qui ne montre qu'une photo n'est pas une
 * description vide, et la carte doit porter sa pastille comme une autre.
 */
export const hasContent = (html: unknown): boolean => {
  const text = String(html ?? "");
  if (/<img\b/i.test(text)) return true;
  return text.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim() !== "";
};

/**
 * La description telle qu'on la garde. Sans cette remise à plat, une fiche
 * sans texte compterait tout de même comme ayant une description.
 */
export const cleanDescription = (html: unknown): string => {
  const clean = sanitize(html);
  return hasContent(clean) ? clean : "";
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
export const sameDescription = (received: string, existing: string): boolean => {
  const clean = cleanDescription(existing);
  return received === clean || (!/<[a-z/!]/i.test(clean) && received === `<p>${clean}</p>`);
};

// --- E-mails reçus ---------------------------------------------------------
// Un e-mail reçu se montre tel que son expéditeur l'a écrit : ses styles, ses
// tableaux, ses polices, ses images. Il ne passe donc pas par la règle de
// l'éditeur, qui n'en garderait presque rien, mais par la sienne : tout ce qui
// met en page reste, tout ce qui s'exécute part — scripts, attributs « on… »,
// formulaires, cadres. Le client le montre de plus dans un cadre isolé, sans
// script (SupportMessages).

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

/** Au-delà, le corps est coupé : un fil de réponses ne grossit pas sans fin. */
const EMAIL_LENGTH_MAX = 2 * 1024 * 1024;

/**
 * Le corps d'un e-mail tel qu'on le garde. « images » donne, pour chaque
 * identifiant « cid: » d'une image intégrée, l'adresse où elle a été rangée.
 * Un e-mail en texte brut garde ses lignes telles quelles.
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
    // Les feuilles de style de l'e-mail, qui le mettent en page.
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
        const key = src.slice(4).replace(/^<|>$/g, "");
        const url = images.get(key);
        const { src: _src, ...rest } = attribs;
        return { tagName, attribs: url ? { ...rest, src: url } : rest };
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
const HISTORY_START = /^(x_)?(appendonsend|divRplyFwdMsg|mail-editor-reference-message-container)$/;

const opensHistory = (e: Element): boolean =>
  HISTORY_START.test(e.attribs["id"] ?? "") ||
  (e.name === "blockquote" && (e.attribs["type"] ?? "").toLowerCase() === "cite") ||
  /(^|\s)gmail_quote(\s|$)/.test(e.attribs["class"] ?? "");

/**
 * Le corps d'une réponse sans l'historique qu'elle cite : tout ce qui suit le
 * premier repère, lui compris, est retiré. Un corps où rien ne resterait est
 * rendu tel quel — mieux vaut un historique en trop qu'un message vide.
 */
export const withoutHistory = (html: string): string => {
  const document = parseDocument(html);
  const marker = DomUtils.findOne(opensHistory, document.children, true);
  if (!marker) return html;

  // Outlook sur ordinateur trace un filet juste avant l'entête « De : ».
  const before = DomUtils.prevElementSibling(marker);
  if (before?.name === "hr") DomUtils.removeElement(before);

  // Ce qui suit le repère, à chaque niveau jusqu'à la racine.
  let treeNode: ChildNode | null = marker;
  while (treeNode) {
    while (treeNode.next) DomUtils.removeElement(treeNode.next);
    treeNode = treeNode.parent && treeNode.parent !== document ? (treeNode.parent as ChildNode) : null;
  }
  DomUtils.removeElement(marker);

  const rest = DomUtils.getOuterHTML(document.children);
  return hasContent(rest) ? rest : html;
};
