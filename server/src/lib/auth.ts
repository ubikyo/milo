// Opaque token in the database, sent by the client in the Authorization
// header. scrypt is provided by Node: no extra native dependency.

import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;

export const hashPassword = (password: string): string => {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, KEY_LENGTH).toString("hex")}`;
};

export const verifyPassword = (password: string, stored: string): boolean => {
  const [salt, hash] = String(stored).split(":");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const candidate = scryptSync(password, salt, KEY_LENGTH);
  // Constant-time comparison.
  return expected.length === candidate.length && timingSafeEqual(expected, candidate);
};

export const createToken = (): string => randomBytes(32).toString("hex");

/**
 * Gravatar: SHA-256 hash of the normalized e-mail. `d=404` makes the request
 * fail when the person has no image, which lets the interface fall back to
 * initials.
 */
export const gravatarUrl = (email: string): string =>
  `https://www.gravatar.com/avatar/${createHash("sha256")
    .update(String(email).trim().toLowerCase())
    .digest("hex")}?d=404&s=128`;

export const fullName = (first: string, last: string): string =>
  [first, last]
    .map((p) => String(p || "").trim())
    .filter(Boolean)
    .join(" ");
