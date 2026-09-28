// Jeton opaque en base, envoyé par le client dans l'en-tête Authorization.
// scrypt est fourni par Node : pas de dépendance native supplémentaire.

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
  // Comparaison à temps constant.
  return expected.length === candidate.length && timingSafeEqual(expected, candidate);
};

export const createToken = (): string => randomBytes(32).toString("hex");

/**
 * Gravatar : hachage SHA-256 de l'e-mail normalisé. `d=404` fait échouer la
 * requête quand la personne n'a pas d'image, ce qui laisse l'interface
 * retomber sur les initiales.
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
