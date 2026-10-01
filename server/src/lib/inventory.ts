// Ce qu'un agent d'inventaire envoie, et comment le lire.
//
// Le protocole est celui d'OCS, que FusionInventory et GLPI Agent parlent tous
// les deux : l'agent envoie du XML en POST, le serveur répond du XML. Le corps
// arrive souvent compressé — l'agent le comprime sans rien demander, et
// annonce « application/x-compress ».
//
// Le XML est lu ici plutôt que par une bibliothèque : celui d'un inventaire
// n'a ni attribut, ni espace de noms, ni entité exotique. Une dépendance de
// plus pour trois règles ne se justifiait pas, comme pour les fichiers déposés
// (routes/attachments.ts).

import { gunzipSync, inflateSync } from "node:zlib";
import type { AssetEntry, AssetSection } from "@milo/shared";

/** Ce qu'un élément porte : du texte, un élément, ou plusieurs du même nom. */
type Noeud = string | Arbre | Noeud[];
export interface Arbre {
  [nom: string]: Noeud;
}

const ENTITES: Record<string, string> = {
  lt: "<",
  gt: ">",
  amp: "&",
  quot: '"',
  apos: "'",
};

/** Les entités du texte reçu, ramenées aux caractères qu'elles désignent. */
const detexter = (texte: string): string =>
  texte.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (tout, code: string) => {
    if (code.startsWith("#x") || code.startsWith("#X")) {
      return String.fromCodePoint(parseInt(code.slice(2), 16));
    }
    if (code.startsWith("#")) return String.fromCodePoint(parseInt(code.slice(1), 10));
    return ENTITES[code] ?? tout;
  });

/**
 * Le corps de la requête, décompressé si besoin. L'agent choisit seul s'il
 * comprime : on reconnaît la compression à ses premiers octets plutôt qu'à
 * l'en-tête annoncé, qui varie d'une version à l'autre.
 */
export const decompresser = (corps: Buffer): string => {
  if (corps.length >= 2) {
    // 1f 8b : gzip. 78 xx : zlib (« deflate »), ce qu'envoie l'agent Perl.
    if (corps[0] === 0x1f && corps[1] === 0x8b) return gunzipSync(corps).toString("utf8");
    if (corps[0] === 0x78) return inflateSync(corps).toString("utf8");
  }
  return corps.toString("utf8");
};

/**
 * Le XML reçu, en arbre. Les éléments de même nom sous un même parent
 * deviennent une liste : c'est ainsi que se lisent les vingt barrettes, les
 * trois disques ou les six cents logiciels d'un poste.
 */
export const lireXml = (xml: string): Arbre => {
  // CDATA d'abord : son contenu peut porter « < » et « > », qui tromperaient
  // la lecture des balises. Il devient du texte échappé comme un autre.
  const texteBrut = xml
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_tout, contenu: string) =>
      contenu.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"),
    )
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\?[\s\S]*?\?>/g, "")
    .replace(/<!DOCTYPE[^>]*>/gi, "");

  const racine: Arbre = {};
  const pile: { enfants: Arbre; texte: string }[] = [{ enfants: racine, texte: "" }];

  const balises = /<\s*(\/?)\s*([^\s/>]+)([^>]*?)(\/?)\s*>/g;
  let position = 0;
  let balise: RegExpExecArray | null;

  const poser = (parent: Arbre, nom: string, valeur: Noeud) => {
    const deja = parent[nom];
    if (deja === undefined) parent[nom] = valeur;
    else if (Array.isArray(deja)) deja.push(valeur);
    else parent[nom] = [deja, valeur];
  };

  while ((balise = balises.exec(texteBrut)) !== null) {
    const courant = pile[pile.length - 1]!;
    courant.texte += texteBrut.slice(position, balise.index);
    position = balises.lastIndex;

    const [, fermante, nom, , videe] = balise;

    // <TAG/> : un élément sans contenu. Il existe, et ne porte rien.
    if (videe) {
      poser(courant.enfants, nom!, "");
      continue;
    }

    if (fermante) {
      const ferme = pile.pop()!;
      const parent = pile[pile.length - 1];
      // Un élément qui n'a pas d'enfant vaut son texte ; sinon ses enfants.
      // Le texte qui traîne autour d'éléments (indentation, sauts de ligne) se
      // perd, et c'est bien ce qu'on veut.
      const valeur: Noeud =
        Object.keys(ferme.enfants).length > 0 ? ferme.enfants : detexter(ferme.texte).trim();
      if (parent) poser(parent.enfants, nom!, valeur);
      continue;
    }

    pile.push({ enfants: {}, texte: "" });
  }

  return racine;
};

/** Un chemin dans l'arbre, ou une chaîne vide : rien n'est jamais obligatoire. */
export const texteDe = (arbre: Noeud | undefined, ...chemin: string[]): string => {
  let courant: Noeud | undefined = arbre;
  for (const pas of chemin) {
    if (courant === undefined || typeof courant === "string" || Array.isArray(courant)) return "";
    courant = courant[pas];
  }
  if (typeof courant === "string") return courant;
  if (Array.isArray(courant)) return typeof courant[0] === "string" ? courant[0] : "";
  return "";
};

/**
 * Une entrée, aplatie en champs. Un sous-élément devient « PARENT.ENFANT » :
 * l'affichage ne cherche pas à rendre la profondeur, il montre des couples.
 * Plusieurs valeurs de même nom se lisent à la suite, séparées par une virgule.
 */
const aplatir = (noeud: Noeud, prefixe = "", dans: AssetEntry = {}): AssetEntry => {
  if (typeof noeud === "string") {
    if (noeud) dans[prefixe || "VALEUR"] = noeud;
    return dans;
  }
  if (Array.isArray(noeud)) {
    const valeurs = noeud.filter((v): v is string => typeof v === "string" && v !== "");
    if (valeurs.length) dans[prefixe || "VALEUR"] = valeurs.join(", ");
    return dans;
  }
  for (const [nom, valeur] of Object.entries(noeud)) {
    aplatir(valeur, prefixe ? `${prefixe}.${nom}` : nom, dans);
  }
  return dans;
};

/**
 * Le contenu d'un inventaire, rangé en sections affichables. Une section qui
 * ne décrit qu'une chose n'a qu'une entrée ; une valeur seule (la version de
 * l'agent, par exemple) devient une entrée d'un champ, nommé comme la section.
 *
 * Les sections vides sont écartées : elles n'apprennent rien, et un agent en
 * envoie régulièrement.
 */
export const sectionsDe = (contenu: Noeud | undefined): AssetSection[] => {
  if (!contenu || typeof contenu === "string" || Array.isArray(contenu)) return [];

  return Object.entries(contenu)
    .map(([nom, valeur]) => {
      const brutes = Array.isArray(valeur) ? valeur : [valeur];
      const entries = brutes
        .map((entree) => (typeof entree === "string" ? { [nom]: entree } : aplatir(entree)))
        .filter((entree) => Object.keys(entree).length > 0);
      return { name: nom, entries };
    })
    .filter((section) => section.entries.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
};
