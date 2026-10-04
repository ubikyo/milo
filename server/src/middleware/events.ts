// What the server pushes to clients after each write.
//
// Previously, a single counter: any write made all connected clients reload
// all eight data sets. Renaming a label re-read projects, companies, accounts
// and boards — eight requests per client, for one color.
//
// Each route now names what it touches, and the client re-reads only that.
// Counters stay in memory: a restart resets them to zero, which at worst
// causes a full reload on connected clients.

import type { NextFunction, Request, Response } from "express";
import type { Id, Notification, Resource, ResourceVersions, VersionPayload } from "@milo/shared";
import { emptyVersions } from "@milo/shared";

const versions: ResourceVersions = emptyVersions();

/** Sum of the counters: a write, wherever it is, makes it go up. */
const total = (): number => Object.values(versions).reduce((a, b) => a + b, 0);

export const payload = (): VersionPayload => ({ version: total(), versions: { ...versions } });

/**
 * Connected clients, and the account each belongs to. It used to be a simple
 * set of responses: version counters address everyone. Follow notifications,
 * however, address a person, so we must know who is at the end of each stream.
 */
const clients = new Map<Response, Id>();

const write = (res: Response, data: string): void => {
  try {
    res.write(data);
  } catch {
    clients.delete(res);
  }
};

const broadcast = (): void => {
  const data = `data: ${JSON.stringify(payload())}\n\n`;
  for (const client of clients.keys()) write(client, data);
};

/**
 * A notification pushed to a person, on all their open tabs. If they have
 * none, they will see nothing: what is lost here is covered by the e-mail,
 * which reaches them anyway.
 */
export const pushNotification = (userId: Id, notification: Notification): void => {
  const data = `data: ${JSON.stringify({ notification })}\n\n`;
  for (const [client, id] of clients) {
    if (id === userId) write(client, data);
  }
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Locals {
      touched?: Set<Resource>;
    }
  }
}

/**
 * Declares what this write modifies. Called by a router to set what it
 * usually touches, and by a route to add what it alone carries — deleting a
 * company, for example, also carries away its boards and their projects.
 */
export const touch =
  (...resources: Resource[]) =>
  (_req: Request, res: Response, next: NextFunction): void => {
    const already = res.locals.touched ?? new Set<Resource>();
    for (const resource of resources) already.add(resource);
    res.locals.touched = already;
    next();
  };

/** The same thing, from inside a route's body. */
export const touchNow = (res: Response, ...resources: Resource[]): void => {
  const already = res.locals.touched ?? new Set<Resource>();
  for (const resource of resources) already.add(resource);
  res.locals.touched = already;
};

/**
 * Increments the counters of the touched resources, once the response has
 * been sent and only if it succeeded. A read touches nothing.
 */
export const countWrites = (req: Request, res: Response, next: NextFunction): void => {
  if (req.method === "GET") return next();
  res.on("finish", () => {
    const touched = res.locals.touched;
    if (res.statusCode >= 400 || !touched?.size) return;
    for (const resource of touched) versions[resource] += 1;
    broadcast();
  });
  next();
};

/**
 * A write made outside a request — the polling of support inboxes, for
 * example: the counters go up and clients re-read, as after a route.
 */
export const signalWrite = (...resources: Resource[]): void => {
  if (!resources.length) return;
  for (const resource of resources) versions[resource] += 1;
  broadcast();
};

/**
 * The event stream (SSE). The client consumes it with `fetch` and not
 * `EventSource`, which does not accept an authentication header.
 */
export const feed = (req: Request, res: Response): void => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    // Ask nginx not to buffer the response.
    "X-Accel-Buffering": "no",
  });
  res.write(`data: ${JSON.stringify(payload())}\n\n`);
  clients.set(res, req.user.id);

  // Periodic comment: keeps the connection open through proxies.
  const heartbeat = setInterval(() => write(res, ": ping\n\n"), 25_000);

  req.on("close", () => {
    clearInterval(heartbeat);
    clients.delete(res);
  });
};
