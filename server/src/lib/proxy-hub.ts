// The proxies' sockets (shared/proxies.ts). A proxy opens a WebSocket on
// PROXY_SOCKET_PATH — through nginx, over HTTPS —, its token in the
// "Authorization" header: never in the address, which the logs keep. Its
// connection replaces any earlier one of the same proxy.
//
// The protocol, version 1, is JSON, a message per frame:
//
//   proxy → Milo  hello     { protocol, version, hostname, capabilities }
//   Milo → proxy  welcome   { proxy: { id, name }, devices }
//   Milo → proxy  devices   { devices }                — whenever they change
//   Milo → proxy  request   { id, device, service, op, data, … }
//   proxy → Milo  response  { id, ok, data | error }
//   Milo → proxy  error     { message }                — before closing
//
// A device is { id, name, host, services }: a request names one by its id,
// never by its address, and one of its services; the proxy reaches only the
// devices it was given, each on the port its service has in the proxy's own
// code. Bytes travel in base64. WebSocket pings, every PING_INTERVAL, tell a
// connection lost: the proxy then shows as disconnected, in every open
// Settings, at once (the "proxies" resource).

import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import type { RawData } from "ws";
import { PROXY_PROTOCOL, PROXY_SERVICES, PROXY_SOCKET_PATH, PROXY_TOKEN_PREFIX } from "@milo/shared";
import type { Id, ProxyService } from "@milo/shared";
import type { ProxyRow } from "../db/rows.js";
import { signalWrite } from "../middleware/events.js";
import { hashProxyToken, proxies, proxyPrinters } from "../repositories/proxies.js";
import type { ExchangeOptions } from "./raw-link.js";
import { now } from "./time.js";

/** A frame's largest size, both ways: a print job, a label's image, in base64. */
const MAX_PAYLOAD = 8 * 1024 * 1024;

/** The largest answer a device may give through a proxy. */
const MAX_ANSWER = 4 * 1024 * 1024;

/** How often a connection is pinged; one that has not answered the last ping is closed. */
const PING_INTERVAL = 15_000;

/** How long a proxy has, once connected, to say who it is. */
const HELLO_TIMEOUT = 10_000;

/** Beyond a request's own time, what the round trip to the proxy may add. */
const ROUND_TRIP_MARGIN = 5_000;

/** Failed tokens tolerated per address, in a window. */
const MAX_FAILURES = 20;
const FAILURE_WINDOW = 10 * 60 * 1000;

/** Why a socket is closed: the proxy logs it, and stops retrying on a refused token. */
export const CLOSE = {
  protocolError: 4000,
  replaced: 4001,
  unsupportedProtocol: 4002,
  revoked: 4003,
  helloTimeout: 4004,
} as const;

interface Pending {
  resolve: (data: Buffer) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

interface Connection {
  socket: WebSocket;
  proxyId: Id;
  address: string;
  /** Once it has said who it is: until then, it is not connected. */
  ready: boolean;
  alive: boolean;
  pending: Map<string, Pending>;
}

const connections = new Map<Id, Connection>();
const failures = new Map<string, { count: number; start: number }>();
let nextRequest = 0;

const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD });

const log = (proxy: Pick<ProxyRow, "name"> | undefined, message: string) =>
  console.log(`[proxy${proxy ? ` « ${proxy.name} »` : ""}] ${message}`);

/** The address the proxy connects from: nginx gives it in X-Forwarded-For. */
const addressOf = (req: IncomingMessage): string => {
  const forwarded = req.headers["x-forwarded-for"];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim();
  return first || req.socket.remoteAddress || "";
};

/** Too many wrong tokens from this address: it is refused for a while. */
const blocked = (address: string): boolean => {
  const entry = failures.get(address);
  if (!entry || Date.now() - entry.start > FAILURE_WINDOW) return false;
  return entry.count >= MAX_FAILURES;
};

const failed = (address: string): void => {
  const entry = failures.get(address);
  if (!entry || Date.now() - entry.start > FAILURE_WINDOW) {
    failures.set(address, { count: 1, start: Date.now() });
  } else entry.count += 1;
};

/** An HTTP answer on the raw socket, before any WebSocket: the upgrade refused. */
const refuse = (socket: Duplex, status: number, text: string): void => {
  socket.end(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
};

const servicesOf = (type: string): ProxyService[] => (type === "zebra" ? ["raw-print"] : []);

/** What the proxy may reach: the printers set on it. */
const devicesOf = (proxyId: Id) =>
  proxyPrinters.all(proxyId).map((p) => ({
    id: `printer:${p.id}`,
    name: p.name,
    host: p.host,
    services: servicesOf(p.type),
  }));

const send = (connection: Connection, message: object): void => {
  if (connection.socket.readyState === WebSocket.OPEN) connection.socket.send(JSON.stringify(message));
};

const text = (value: unknown, max = 100): string =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

const onHello = (connection: Connection, message: Record<string, unknown>): void => {
  const proxy = proxies.byId.get(connection.proxyId);
  if (!proxy) return connection.socket.close(CLOSE.revoked, "Proxy supprimé");
  if (message.protocol !== PROXY_PROTOCOL) {
    send(connection, {
      type: "error",
      message: `Protocole ${String(message.protocol)} non pris en charge : Milo parle le protocole ${PROXY_PROTOCOL}`,
    });
    log(proxy, `refusé : protocole ${String(message.protocol)}`);
    return connection.socket.close(CLOSE.unsupportedProtocol, "Protocole non pris en charge");
  }
  const version = text(message.version);
  const hostname = text(message.hostname);
  proxies.connected.run(now(), version, hostname, connection.address, proxy.id);
  connection.ready = true;
  send(connection, { type: "welcome", proxy: { id: proxy.id, name: proxy.name }, devices: devicesOf(proxy.id) });
  log(proxy, `connecté depuis ${connection.address} (${hostname || "?"}, version ${version || "?"})`);
  signalWrite("proxies");
};

const onResponse = (connection: Connection, message: Record<string, unknown>): void => {
  const id = typeof message.id === "string" ? message.id : "";
  const pending = connection.pending.get(id);
  if (!pending) return;
  connection.pending.delete(id);
  clearTimeout(pending.timer);
  if (message.ok === true) {
    pending.resolve(Buffer.from(typeof message.data === "string" ? message.data : "", "base64"));
  } else {
    pending.reject(new Error(text(message.error, 500) || "erreur du proxy"));
  }
};

const onMessage = (connection: Connection, raw: RawData, binary: boolean): void => {
  let message: Record<string, unknown>;
  try {
    if (binary) throw new Error();
    message = JSON.parse(raw.toString()) as Record<string, unknown>;
    if (!message || typeof message !== "object") throw new Error();
  } catch {
    return connection.socket.close(CLOSE.protocolError, "Message illisible");
  }
  if (message.type === "hello" && !connection.ready) onHello(connection, message);
  else if (message.type === "response" && connection.ready) onResponse(connection, message);
  else log(proxies.byId.get(connection.proxyId), `message ignoré : ${String(message.type)}`);
};

const onConnection = (socket: WebSocket, proxy: ProxyRow, address: string): void => {
  // A proxy restarted before its old connection was found lost: the new one wins.
  const earlier = connections.get(proxy.id);
  if (earlier) earlier.socket.close(CLOSE.replaced, "Remplacée par une nouvelle connexion");

  const connection: Connection = {
    socket,
    proxyId: proxy.id,
    address,
    ready: false,
    alive: true,
    pending: new Map(),
  };
  connections.set(proxy.id, connection);

  const hello = setTimeout(() => {
    if (!connection.ready) socket.close(CLOSE.helloTimeout, "Présentation attendue");
  }, HELLO_TIMEOUT);

  socket.on("pong", () => (connection.alive = true));
  socket.on("message", (raw, binary) => onMessage(connection, raw, binary));
  socket.on("error", (e) => log(proxy, `erreur : ${e.message}`));
  socket.once("close", (code, reason) => {
    clearTimeout(hello);
    for (const pending of connection.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error("proxy déconnecté"));
    }
    connection.pending.clear();
    // Replaced, the proxy is still connected: through its new socket.
    if (connections.get(proxy.id) !== connection) return;
    connections.delete(proxy.id);
    if (!connection.ready) return;
    proxies.seen.run(now(), proxy.id);
    log(proxies.byId.get(proxy.id) ?? proxy, `déconnecté (${code}${reason.length ? ` ${reason.toString()}` : ""})`);
    signalWrite("proxies");
  });
};

const onUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer): void => {
  const path = (req.url ?? "").split("?")[0];
  if (path !== PROXY_SOCKET_PATH) return refuse(socket, 404, "Not Found");
  const address = addressOf(req);
  if (blocked(address)) return refuse(socket, 429, "Too Many Requests");
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const proxy = token.startsWith(PROXY_TOKEN_PREFIX) ? proxies.byHash.get(hashProxyToken(token)) : undefined;
  if (!proxy) {
    failed(address);
    log(undefined, `token refusé depuis ${address}`);
    return refuse(socket, 401, "Unauthorized");
  }
  wss.handleUpgrade(req, socket, head, (ws) => onConnection(ws, proxy, address));
};

/** Pings every connection; one that did not answer the last ping is lost. */
const heartbeat = setInterval(() => {
  for (const [address, entry] of failures) {
    if (Date.now() - entry.start > FAILURE_WINDOW) failures.delete(address);
  }
  for (const connection of connections.values()) {
    if (!connection.alive) {
      connection.socket.terminate();
      continue;
    }
    connection.alive = false;
    connection.socket.ping();
  }
}, PING_INTERVAL);
heartbeat.unref();

/** The proxies' sockets, on the HTTP server's upgrades. */
export const attachProxyHub = (server: Server): void => {
  server.on("upgrade", onUpgrade);
};

/** Every socket closed: the server stops. The proxies will reconnect. */
export const closeProxyHub = (): void => {
  clearInterval(heartbeat);
  for (const connection of connections.values()) connection.socket.close(1001, "Arrêt de Milo");
};

/** Is it connected, and has it said who it is? */
export const isProxyConnected = (proxyId: Id): boolean => connections.get(proxyId)?.ready ?? false;

/** Its token regenerated, or itself deleted: its connection closes now. */
export const disconnectProxy = (proxyId: Id, reason: string): void => {
  connections.get(proxyId)?.socket.close(CLOSE.revoked, reason);
};

/**
 * Each connected proxy is given its devices again: after a printer was added,
 * changed, moved from one proxy to another or deleted. Sent before any
 * request that follows, on the same socket.
 */
export const refreshProxyDevices = (): void => {
  for (const connection of connections.values()) {
    if (connection.ready) send(connection, { type: "devices", devices: devicesOf(connection.proxyId) });
  }
};

/** A request to a proxy: its answer's bytes, or its error. */
const request = (proxyId: Id, body: Record<string, unknown>, wait: number): Promise<Buffer> => {
  const connection = connections.get(proxyId);
  if (!connection?.ready) {
    const name = proxies.byId.get(proxyId)?.name;
    return Promise.reject(new Error(`le proxy${name ? ` « ${name} »` : ""} est hors connexion`));
  }
  const id = String(++nextRequest);
  return new Promise<Buffer>((resolve, reject) => {
    const timer = setTimeout(() => {
      connection.pending.delete(id);
      reject(new Error("le proxy n'a pas répondu à temps"));
    }, wait + ROUND_TRIP_MARGIN);
    connection.pending.set(id, { resolve, reject, timer });
    send(connection, { type: "request", id, ...body });
  });
};

const checkService = (service: ProxyService): void => {
  if (!PROXY_SERVICES.includes(service)) throw new Error(`service inconnu : ${service}`);
};

/** The bytes written to the device's service, the connection closed: a print job. */
export const proxySend = async (
  proxyId: Id,
  device: string,
  service: ProxyService,
  data: Buffer,
  timeout: number,
  connectTimeout: number,
): Promise<void> => {
  checkService(service);
  await request(
    proxyId,
    {
      device,
      service,
      op: "send",
      data: data.toString("base64"),
      timeout_ms: timeout,
      connect_timeout_ms: connectTimeout,
    },
    connectTimeout + timeout,
  );
};

/** The bytes written to the device's service, then its answer read. */
export const proxyExchange = (
  proxyId: Id,
  device: string,
  service: ProxyService,
  data: Buffer,
  options: ExchangeOptions,
): Promise<Buffer> => {
  checkService(service);
  return request(
    proxyId,
    {
      device,
      service,
      op: "exchange",
      data: data.toString("base64"),
      timeout_ms: options.timeout,
      connect_timeout_ms: options.connectTimeout,
      idle_ms: options.idle,
      ...(options.until ? { until: options.until.toString("base64") } : {}),
      max_bytes: MAX_ANSWER,
    },
    options.connectTimeout + options.timeout,
  );
};
