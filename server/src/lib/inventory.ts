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
type TreeNode = string | Tree | TreeNode[];
export interface Tree {
  [name: string]: TreeNode;
}

const ENTITIES: Record<string, string> = {
  lt: "<",
  gt: ">",
  amp: "&",
  quot: '"',
  apos: "'",
};

/** Les entités du texte reçu, ramenées aux caractères qu'elles désignent. */
const stripTags = (text: string): string =>
  text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, code: string) => {
    if (code.startsWith("#x") || code.startsWith("#X")) {
      return String.fromCodePoint(parseInt(code.slice(2), 16));
    }
    if (code.startsWith("#")) return String.fromCodePoint(parseInt(code.slice(1), 10));
    return ENTITIES[code] ?? match;
  });

/**
 * Le corps de la requête, décompressé si besoin. L'agent choisit seul s'il
 * comprime : on reconnaît la compression à ses premiers octets plutôt qu'à
 * l'en-tête annoncé, qui varie d'une version à l'autre.
 */
export const decompress = (body: Buffer): string => {
  if (body.length >= 2) {
    // 1f 8b : gzip. 78 xx : zlib (« deflate »), ce qu'envoie l'agent Perl.
    if (body[0] === 0x1f && body[1] === 0x8b) return gunzipSync(body).toString("utf8");
    if (body[0] === 0x78) return inflateSync(body).toString("utf8");
  }
  return body.toString("utf8");
};

/**
 * Le XML reçu, en arbre. Les éléments de même nom sous un même parent
 * deviennent une liste : c'est ainsi que se lisent les vingt barrettes, les
 * trois disques ou les six cents logiciels d'un poste.
 */
export const readXml = (xml: string): Tree => {
  // CDATA d'abord : son contenu peut porter « < » et « > », qui tromperaient
  // la lecture des balises. Il devient du texte échappé comme un autre.
  const plainText = xml
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_whole, content: string) =>
      content.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"),
    )
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\?[\s\S]*?\?>/g, "")
    .replace(/<!DOCTYPE[^>]*>/gi, "");

  const root: Tree = {};
  const stack: { children: Tree; text: string }[] = [{ children: root, text: "" }];

  const tagPattern = /<\s*(\/?)\s*([^\s/>]+)([^>]*?)(\/?)\s*>/g;
  let position = 0;
  let tag: RegExpExecArray | null;

  const setNode = (parent: Tree, name: string, value: TreeNode) => {
    const already = parent[name];
    if (already === undefined) parent[name] = value;
    else if (Array.isArray(already)) already.push(value);
    else parent[name] = [already, value];
  };

  while ((tag = tagPattern.exec(plainText)) !== null) {
    const current = stack[stack.length - 1]!;
    current.text += plainText.slice(position, tag.index);
    position = tagPattern.lastIndex;

    const [, closing, name, , selfClosing] = tag;

    // <TAG/> : un élément sans contenu. Il existe, et ne porte rien.
    if (selfClosing) {
      setNode(current.children, name!, "");
      continue;
    }

    if (closing) {
      const closed = stack.pop()!;
      const parent = stack[stack.length - 1];
      // Un élément qui n'a pas d'enfant vaut son texte ; sinon ses enfants.
      // Le texte qui traîne autour d'éléments (indentation, sauts de ligne) se
      // perd, et c'est bien ce qu'on veut.
      const value: TreeNode =
        Object.keys(closed.children).length > 0 ? closed.children : stripTags(closed.text).trim();
      if (parent) setNode(parent.children, name!, value);
      continue;
    }

    stack.push({ children: {}, text: "" });
  }

  return root;
};

/** Un chemin dans l'arbre, ou une chaîne vide : rien n'est jamais obligatoire. */
export const textOf = (tree: TreeNode | undefined, ...path: string[]): string => {
  let current: TreeNode | undefined = tree;
  for (const pas of path) {
    if (current === undefined || typeof current === "string" || Array.isArray(current)) return "";
    current = current[pas];
  }
  if (typeof current === "string") return current;
  if (Array.isArray(current)) return typeof current[0] === "string" ? current[0] : "";
  return "";
};

/**
 * Une entrée, aplatie en champs. Un sous-élément devient « PARENT.ENFANT » :
 * l'affichage ne cherche pas à rendre la profondeur, il montre des couples.
 * Plusieurs valeurs de même nom se lisent à la suite, séparées par une virgule.
 */
const flatten = (treeNode: TreeNode, prefix = "", into: AssetEntry = {}): AssetEntry => {
  if (typeof treeNode === "string") {
    if (treeNode) into[prefix || "VALEUR"] = treeNode;
    return into;
  }
  if (Array.isArray(treeNode)) {
    const values = treeNode.filter((v): v is string => typeof v === "string" && v !== "");
    if (values.length) into[prefix || "VALEUR"] = values.join(", ");
    return into;
  }
  for (const [name, value] of Object.entries(treeNode)) {
    flatten(value, prefix ? `${prefix}.${name}` : name, into);
  }
  return into;
};

/**
 * Le contenu d'un inventaire, rangé en sections affichables. Une section qui
 * ne décrit qu'une chose n'a qu'une entrée ; une valeur seule (la version de
 * l'agent, par exemple) devient une entrée d'un champ, nommé comme la section.
 *
 * Les sections vides sont écartées : elles n'apprennent rien, et un agent en
 * envoie régulièrement.
 */
export const sectionsOf = (content: TreeNode | undefined): AssetSection[] => {
  if (!content || typeof content === "string" || Array.isArray(content)) return [];

  return Object.entries(content)
    .map(([name, value]) => {
      const raw = Array.isArray(value) ? value : [value];
      const entries = raw
        .map((entry) => (typeof entry === "string" ? { [name]: entry } : flatten(entry)))
        .filter((entry) => Object.keys(entry).length > 0);
      return { name: name, entries };
    })
    .filter((section) => section.entries.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
};
