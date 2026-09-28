// Les descriptions sont saisies dans l'éditeur et gardées en HTML. Ce HTML est
// réécrit avant d'être enregistré : il ne doit contenir que ce que l'éditeur
// sait produire, sans quoi un compte pourrait y glisser du script. Les
// commentaires, eux, sont du texte simple et ne passent pas par ici.

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
