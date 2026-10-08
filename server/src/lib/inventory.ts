// What an inventory agent sends, and how to read it.
//
// The protocol is OCS's, which FusionInventory and GLPI Agent both speak: the
// agent sends XML by POST, the server answers with XML. The body often
// arrives compressed — the agent compresses it without being asked, and
// announces "application/x-compress".
//
// The XML is read here rather than by a library: an inventory's has no
// attributes, no namespaces, no exotic entities. One more dependency for
// three rules was not justified, as with uploaded files
// (routes/attachments.ts).

import { gunzipSync, inflateSync } from "node:zlib";
import type { ManagedDeviceAssetEntry, ManagedDeviceAssetSection } from "@milo/shared";

/** What an element carries: text, one element, or several of the same name. */
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

/** The received text's entities, brought back to the characters they stand for. */
const stripTags = (text: string): string =>
  text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, code: string) => {
    if (code.startsWith("#x") || code.startsWith("#X")) {
      return String.fromCodePoint(parseInt(code.slice(2), 16));
    }
    if (code.startsWith("#")) return String.fromCodePoint(parseInt(code.slice(1), 10));
    return ENTITIES[code] ?? match;
  });

/**
 * The request body, decompressed if needed. The agent alone chooses whether
 * to compress: compression is recognized by the first bytes rather than by
 * the announced header, which varies from one version to another.
 */
export const decompress = (body: Buffer): string => {
  if (body.length >= 2) {
    // 1f 8b: gzip. 78 xx: zlib ("deflate"), what the Perl agent sends.
    if (body[0] === 0x1f && body[1] === 0x8b) return gunzipSync(body).toString("utf8");
    if (body[0] === 0x78) return inflateSync(body).toString("utf8");
  }
  return body.toString("utf8");
};

/**
 * The received XML, as a tree. Elements of the same name under the same
 * parent become a list: that is how the twenty memory modules, the three
 * disks or the six hundred programs of a workstation are read.
 */
export const readXml = (xml: string): Tree => {
  // CDATA first: its content may carry "<" and ">", which would fool the
  // tag reading. It becomes escaped text like any other.
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

    // <TAG/>: an element with no content. It exists, and carries nothing.
    if (selfClosing) {
      setNode(current.children, name!, "");
      continue;
    }

    if (closing) {
      const closed = stack.pop()!;
      const parent = stack[stack.length - 1];
      // An element with no children is worth its text; otherwise its
      // children. Text lingering around elements (indentation, line breaks)
      // is lost, and that is just what we want.
      const value: TreeNode =
        Object.keys(closed.children).length > 0 ? closed.children : stripTags(closed.text).trim();
      if (parent) setNode(parent.children, name!, value);
      continue;
    }

    stack.push({ children: {}, text: "" });
  }

  return root;
};

/** A path in the tree, or an empty string: nothing is ever mandatory. */
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
 * An entry, flattened into fields. A sub-element becomes "PARENT.CHILD": the
 * display does not try to render depth, it shows pairs. Several values of the
 * same name are read one after another, separated by a comma.
 */
const flatten = (treeNode: TreeNode, prefix = "", into: ManagedDeviceAssetEntry = {}): ManagedDeviceAssetEntry => {
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
 * The content of an inventory, stored as displayable sections. A section that
 * describes only one thing has only one entry; a lone value (the agent's
 * version, for example) becomes a one-field entry, named like the section.
 *
 * Empty sections are discarded: they teach nothing, and an agent sends them
 * regularly.
 */
export const sectionsOf = (content: TreeNode | undefined): ManagedDeviceAssetSection[] => {
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
