// The proxies of "Paramétrage" > "Proxy": a service — Milo Proxy — running on
// a site's network, that reaches what Milo, served over the Internet, cannot:
// its printers to begin with. It connects to Milo, never the reverse: a
// WebSocket over HTTPS, opened with the token generated here, which carries
// Milo's requests and the proxy's answers both ways.
//
// What a proxy may reach is a list of devices Milo gives it, each with the
// services it offers; the proxy knows, in its own code, the protocol and the
// port of each service, and refuses anything else.

import type { Id } from "./domain.js";

/** What every proxy token starts with: it tells it apart from the others. */
export const PROXY_TOKEN_PREFIX = "mpx_";

/** The protocol spoken over the socket: a proxy announcing another is refused. */
export const PROXY_PROTOCOL = 1;

/** Where a proxy opens its socket. */
export const PROXY_SOCKET_PATH = "/api/proxy/socket";

/**
 * The services a device offers through a proxy. Each has its protocol and its
 * port set in the proxy's own code, not here:
 * - "raw-print": raw TCP printing, port 9100 — Zebra, and most network
 *   printers.
 */
export const PROXY_SERVICES = ["raw-print"] as const;

export type ProxyService = (typeof PROXY_SERVICES)[number];

export interface MiloProxy {
  id: Id;
  name: string;
  /** The last characters of its token, to recognize it: the token itself is not kept. */
  hint: string;
  created_at: string;
  /** Its last connection, or disconnection; empty if it never connected. */
  last_seen_at: string;
  /** Connected right now. */
  connected: boolean;
  /** What it said of itself at its last connection: empty if it never did. */
  version: string;
  hostname: string;
  /** The address it connected from, as Milo saw it. */
  address: string;
}

export type MiloProxyInput = Partial<Pick<MiloProxy, "name">>;

/** A proxy just created, or its token just regenerated: shown once. */
export interface CreatedMiloProxy {
  proxy: MiloProxy;
  token: string;
}
