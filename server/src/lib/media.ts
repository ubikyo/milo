// Files: card attachments, and images pasted into a description. Everything
// lives flat in a single folder — "medias" at the root in development,
// MILO_MEDIA_PATH in production.
//
// Two design choices explain the rest of the file:
//
//   1. The original name is never used as a file name. It is kept in the
//      database for display, and the file itself is named with sixteen
//      randomly drawn bytes. Two files of the same name thus do not trample
//      each other, and nothing anyone writes becomes a path.
//
//   2. The returned type is deduced from the extension, never from what the
//      client announced. A file outside the list below goes out as a
//      download, without being interpreted: otherwise, an .html or .svg
//      dropped on a card would run on our own origin. That is also why SVG is
//      not part of it, image though it is.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { env } from "../env.js";

/** Beyond this, the upload is refused. Stated in bytes, and in plain words for the message. */
export const SIZE_MAX = 25 * 1024 * 1024;
export const SIZE_MAX_MB = SIZE_MAX / (1024 * 1024);

/**
 * The types the server returns as is, deduced from the extension. Everything
 * else goes out as an attachment, with no guessed type.
 */
const INLINE_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".pdf": "application/pdf",
};

/** The shape of one of our file names: sixteen random bytes, and an extension. */
const RANGE_NAME = /^[0-9a-f]{32}(\.[a-z0-9]{1,12})?$/;

/**
 * The media addresses cited in an HTML — the source of a description's
 * images. Used by the orphan cleanup: what is cited stays. The old address,
 * "/api/medias/", counts too: it is still in use (app.ts).
 */
export const citedMedia = (html: string): string[] =>
  [...html.matchAll(/\/api\/medias?\/([0-9a-f]{32}(?:\.[a-z0-9]{1,12})?)/g)].map((m) => m[1]!);

/**
 * True for the address of one of our media files, and only that — "/api/media/",
 * or the old "/api/medias/". It is by this yardstick that HTML cleaning keeps
 * or drops an image (lib/html.ts): an image from elsewhere would make the
 * description leave the app.
 */
export const isMediaAddress = (src: unknown): boolean =>
  /^\/api\/medias?\/[0-9a-f]{32}(\.[a-z0-9]{1,12})?$/.test(String(src ?? ""));

// The folder is created at load time, like the database's: a write must not
// have to wonder whether it exists.
fs.mkdirSync(env.mediaPath, { recursive: true });

/** The extension of a received name, in lowercase, or nothing if it does not look like one. */
const extensionOf = (name: string): string => {
  const found = /\.([A-Za-z0-9]{1,12})$/.exec(name.trim());
  return found ? `.${found[1]!.toLowerCase()}` : "";
};

/** The path of a media file, or nothing if the received name is not one of ours. */
export const mediaPath = (file: string): string | null =>
  RANGE_NAME.test(file) ? path.join(env.mediaPath, file) : null;

/** Writes the file and returns the name under which it is stored. */
export const writeMedia = (content: Buffer, originalName: string): string => {
  const file = `${crypto.randomBytes(16).toString("hex")}${extensionOf(originalName)}`;
  fs.writeFileSync(path.join(env.mediaPath, file), content);
  return file;
};

export const deleteMedia = (file: string): void => {
  const relativePath = mediaPath(file);
  if (relativePath) fs.rmSync(relativePath, { force: true });
};

/** The public address of a media file. A single spelling, read on both sides. */
export const mediaUrl = (file: string): string => `/api/media/${file}`;

/**
 * How to return this file: its type if it is one we display, and nothing
 * otherwise — the caller then makes it a download.
 */
export const inlineType = (file: string): string | null =>
  INLINE_TYPES[extensionOf(file)] ?? null;

/** True for images the app shows by itself (thumbnail, description). */
export const isImage = (file: string): boolean =>
  (inlineType(file) ?? "").startsWith("image/");

/**
 * The cleanup of files that nothing cites any more: an attachment deleted
 * with its card, an image pasted into a description and then removed.
 *
 * The grace period is not one more precaution: a pasted image is uploaded
 * right away, whereas the description that cites it is only sent to the
 * server when the drawer closes. Without it, the cleanup would erase the
 * image of a record left open.
 */
export const GRACE_PERIOD = 24 * 60 * 60 * 1000;

export const deleteOrphans = (cited: Set<string>): number => {
  const cutoff = Date.now() - GRACE_PERIOD;
  let deleted = 0;

  for (const file of fs.readdirSync(env.mediaPath)) {
    if (cited.has(file)) continue;
    const relativePath = mediaPath(file);
    // A file that does not have the shape of ours is not ours: we do not
    // touch it, whatever it is doing there.
    if (!relativePath) continue;
    if (fs.statSync(relativePath).mtimeMs > cutoff) continue;
    fs.rmSync(relativePath, { force: true });
    deleted += 1;
  }

  return deleted;
};
