// The proxies (shared/proxies.ts). A token is handed out once, at its
// generation: only its SHA-256 is kept — a slow hash would be wasted on 32
// random bytes —, looked up when a proxy opens its socket.

import { createHash, randomBytes } from "node:crypto";
import { PROXY_TOKEN_PREFIX } from "@milo/shared";
import { mutation, selection } from "../db/query.js";
import type { PrinterRow, ProxyRow } from "../db/rows.js";

export const proxies = {
  all: selection<ProxyRow>("SELECT * FROM proxies ORDER BY name COLLATE NOCASE, id"),
  byId: selection<ProxyRow>("SELECT * FROM proxies WHERE id = ?"),
  byHash: selection<ProxyRow>("SELECT * FROM proxies WHERE token_hash = ?"),
  byName: selection<ProxyRow>("SELECT * FROM proxies WHERE name = ? COLLATE NOCASE AND id != ?"),
  create: mutation("INSERT INTO proxies (name, token_hash, hint, created_at) VALUES (?, ?, ?, ?)"),
  rename: mutation("UPDATE proxies SET name = ? WHERE id = ?"),
  setToken: mutation("UPDATE proxies SET token_hash = ?, hint = ? WHERE id = ?"),
  /** What it said of itself on connecting. */
  connected: mutation(
    "UPDATE proxies SET last_seen_at = ?, version = ?, hostname = ?, address = ? WHERE id = ?",
  ),
  seen: mutation("UPDATE proxies SET last_seen_at = ? WHERE id = ?"),
  remove: mutation("DELETE FROM proxies WHERE id = ?"),
};

/** The printers reached through a proxy: the devices it is given. */
export const proxyPrinters = selection<PrinterRow>(
  "SELECT * FROM printers WHERE proxy_id = ? ORDER BY id",
);

export const hashProxyToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

/** A new token: 256 random bits, the prefix telling it apart. */
export const generateProxyToken = (): string =>
  `${PROXY_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
