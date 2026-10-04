// An archive: several files in one, compressed.
//
// The format is tar's (ustar), written and read back here in about a hundred
// lines rather than with one more dependency. It is a simple format — 512-byte
// headers followed by the content, padded to the next block — and it has the
// advantage of being openable elsewhere: `tar tzf sauvegarde.milo.gz` shows
// what a backup contains, without Milo.
//
// Compression is gzip's (node:zlib). A SQLite database compresses very well;
// already-compressed images do not, but they cost nothing to run through.

import { gunzipSync, gzipSync } from "node:zlib";

const BLOCK = 512;

export interface Entry {
  /** The path in the archive, with forward slashes: "media/abc.png". */
  name: string;
  content: Buffer;
}

/** A number in octal, left-padded with zeros and followed by a null byte. */
const octal = (value: number, width: number): string =>
  `${value.toString(8).padStart(width - 1, "0")}\0`;

const header = (entry: Entry, mtime: number): Buffer => {
  const block = Buffer.alloc(BLOCK);

  // A name over 100 bytes would need the "prefix" field; ours — "milo.db",
  // "media/" and thirty-two characters — come nowhere near it, and we would
  // rather refuse than produce a silently wrong archive.
  const name = Buffer.from(entry.name, "utf8");
  if (name.length > 100) throw new Error(`Nom trop long pour l'archive : ${entry.name}`);
  name.copy(block, 0);

  block.write(octal(0o644, 8), 100); // mode
  block.write(octal(0, 8), 108); // uid
  block.write(octal(0, 8), 116); // gid
  block.write(octal(entry.content.length, 12), 124);
  block.write(octal(Math.floor(mtime / 1000), 12), 136);
  block.write("        ", 148); // checksum: spaces while it is computed
  block.write("0", 156); // regular file
  block.write("ustar\0", 257);
  block.write("00", 263);

  // The checksum is computed over the whole header, its own field counted as
  // eight spaces: hence the order above. Six octal digits, a null byte, a
  // space — the form readers expect.
  let sum = 0;
  for (const byte of block) sum += byte;
  block.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148);

  return block;
};

/** What a content lacks to finish the last block it started. */
const rest = (length: number): number => (BLOCK - (length % BLOCK)) % BLOCK;

/** The entries, as a compressed archive. */
export const pack = (entries: Entry[]): Buffer => {
  const currentTime = Date.now();
  const chunks: Buffer[] = [];

  for (const entry of entries) {
    chunks.push(header(entry, currentTime), entry.content);
    chunks.push(Buffer.alloc(rest(entry.content.length)));
  }
  // Two null blocks close a tar archive.
  chunks.push(Buffer.alloc(BLOCK * 2));

  return gzipSync(Buffer.concat(chunks));
};

const text = (block: Buffer, start: number, length: number): string => {
  const raw = block.subarray(start, start + length);
  const end = raw.indexOf(0);
  return raw.subarray(0, end === -1 ? raw.length : end).toString("utf8").trim();
};

const octalNumber = (block: Buffer, start: number, length: number): number => {
  const value = parseInt(text(block, start, length) || "0", 8);
  return Number.isFinite(value) && value >= 0 ? value : -1;
};

/**
 * The archive read back, by file name. Throws if it is not one of ours: this
 * is the first screening of a restore, before even looking at what it
 * contains.
 */
export const unpack = (archive: Buffer): Map<string, Buffer> => {
  let tar: Buffer;
  try {
    tar = gunzipSync(archive);
  } catch {
    throw new Error("Ce fichier n'est pas une sauvegarde Milo");
  }

  const files = new Map<string, Buffer>();
  let position = 0;

  while (position + BLOCK <= tar.length) {
    const block = tar.subarray(position, position + BLOCK);
    position += BLOCK;

    const name = text(block, 0, 100);
    // Null block: end of the archive.
    if (!name) break;

    if (text(block, 257, 6) !== "ustar") {
      throw new Error("Ce fichier n'est pas une sauvegarde Milo");
    }

    const size = octalNumber(block, 124, 12);
    if (size < 0 || position + size > tar.length) {
      throw new Error("Sauvegarde incomplète ou abîmée");
    }

    // Only regular files interest us: a backup contains no others, and we do
    // not want to follow a link that would leave the media folder.
    const type = text(block, 156, 1);
    if (type === "" || type === "0") {
      files.set(name, Buffer.from(tar.subarray(position, position + size)));
    }

    position += size + rest(size);
  }

  return files;
};
