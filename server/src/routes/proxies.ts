// The proxies of "Paramétrage" > "Proxy" (shared/proxies.ts). Reading them
// requires the "Voir" right on the Settings, adding, renaming, deleting one
// or regenerating its token the "Modifier" right (requireSettings, app.ts).
// A token is shown once, in the answer that generates it: regenerated, the
// old one is refused at once, and its connection closed.

import { Router } from "express";
import type { CreatedMiloProxy, MiloProxy } from "@milo/shared";
import { transaction } from "../db/query.js";
import type { ProxyRow } from "../db/rows.js";
import { conflict, orNotFound, requireText } from "../lib/http.js";
import { disconnectProxy, isProxyConnected, refreshProxyDevices } from "../lib/proxy-hub.js";
import { now } from "../lib/time.js";
import { touch } from "../middleware/events.js";
import { generateProxyToken, hashProxyToken, proxies } from "../repositories/proxies.js";

const PROXY_NOT_FOUND = "Proxy introuvable";
const PROXY_EXISTS = "Ce proxy existe déjà";

const toProxy = (row: ProxyRow): MiloProxy => ({
  id: row.id,
  name: row.name,
  hint: row.hint,
  created_at: row.created_at,
  last_seen_at: row.last_seen_at,
  connected: isProxyConnected(row.id),
  version: row.version,
  hostname: row.hostname,
  address: row.address,
});

const proxyOf = (id: unknown): ProxyRow => orNotFound(proxies.byId.get(Number(id)), PROXY_NOT_FOUND);

const validName = (value: unknown, id = 0): string => {
  const name = requireText(value, "Le nom est requis");
  if (proxies.byName.get(name, id)) conflict(PROXY_EXISTS);
  return name;
};

const createProxy = transaction((name: string): CreatedMiloProxy => {
  const token = generateProxyToken();
  const { lastInsertRowid } = proxies.create.run(name, hashProxyToken(token), token.slice(-4), now());
  return { proxy: toProxy(proxyOf(lastInsertRowid)), token };
});

export const proxyRoutes = Router();

proxyRoutes.use(touch("proxies"));

proxyRoutes.get("/", (_req, res) => {
  res.json(proxies.all.all().map(toProxy));
});

// Created with its token, in the answer and nowhere else afterwards.
proxyRoutes.post("/", (req, res) => {
  res.status(201).json(createProxy(validName(req.body?.name)));
});

proxyRoutes.put("/:id", (req, res) => {
  const row = proxyOf(req.params.id);
  if (req.body?.name !== undefined) proxies.rename.run(validName(req.body.name, row.id), row.id);
  res.json(toProxy(proxyOf(row.id)));
});

// A new token: the old one no longer opens anything, its connection closes.
proxyRoutes.post("/:id/token", (req, res) => {
  const row = proxyOf(req.params.id);
  const token = generateProxyToken();
  proxies.setToken.run(hashProxyToken(token), token.slice(-4), row.id);
  disconnectProxy(row.id, "Token régénéré");
  const created: CreatedMiloProxy = { proxy: toProxy(proxyOf(row.id)), token };
  res.json(created);
});

// Its printers are then reached directly.
proxyRoutes.delete("/:id", (req, res) => {
  const row = proxyOf(req.params.id);
  proxies.remove.run(row.id);
  disconnectProxy(row.id, "Proxy supprimé");
  refreshProxyDevices();
  res.status(204).end();
});
