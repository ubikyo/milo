import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

// scrypt est fourni par Node : pas de dépendance native supplémentaire.
const KEY_LENGTH = 64;

export const hashPassword = (password) => {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, KEY_LENGTH).toString("hex")}`;
};

export const verifyPassword = (password, stored) => {
  const [salt, hash] = String(stored).split(":");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const candidate = scryptSync(password, salt, KEY_LENGTH);
  // Comparaison à temps constant.
  return expected.length === candidate.length && timingSafeEqual(expected, candidate);
};

export const createToken = () => randomBytes(32).toString("hex");
