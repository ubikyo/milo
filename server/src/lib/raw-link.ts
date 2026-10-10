// How Milo reaches a device's raw TCP port — a printer's 9100: directly, on
// its own network, or through the proxy the device is set on
// (lib/proxy-hub.ts). Both ways do the same two things, so what talks to the
// device (lib/zebra.ts) does not know which it goes through:
// - "send": the bytes written, the connection closed — a print job;
// - "exchange": the bytes written, then the device's answer read — until a
//   given end, a silence, or the time is up.

import net from "node:net";
import type { Printer } from "@milo/shared";
import { proxies } from "../repositories/proxies.js";
import { proxyExchange, proxySend } from "./proxy-hub.js";

export interface ExchangeOptions {
  /** How long the connection has to open. */
  connectTimeout: number;
  /** How long the whole exchange may last: what was read by then is the answer. */
  timeout: number;
  /** Once the device has started answering, this much silence ends its answer. */
  idle: number;
  /** The bytes that end the answer, as soon as they arrive. */
  until?: Buffer;
  /**
   * Directly only — a proxy cannot run it —: true once the answer is whole,
   * read as it arrives.
   */
  complete?: (answer: Buffer) => boolean;
}

export interface RawLink {
  /** "10.11.54.21:9100", or "10.11.54.21:9100 via « Site A »": in the messages. */
  where: string;
  /** Rejects when the device cannot be reached, with the reason. */
  send(data: Buffer, timeout: number, connectTimeout: number): Promise<void>;
  /**
   * Rejects when the device cannot be reached; reached, resolves with what it
   * answered — possibly nothing.
   */
  exchange(data: Buffer, options: ExchangeOptions): Promise<Buffer>;
}

/**
 * The bytes written on the port, the connection closed; resolves once the
 * device has them all. Destroyed right after writing, the connection could be
 * reset before the device had read the job.
 */
const tcpSend = (host: string, port: number, data: Buffer, timeout: number, connectTimeout: number) =>
  new Promise<void>((resolve, reject) => {
    const socket = net.connect({ host, port });
    let sent = false;
    const connecting = setTimeout(() => {
      socket.destroy();
      reject(new Error("délai de connexion dépassé"));
    }, connectTimeout);
    socket.setTimeout(timeout, () => {
      socket.destroy();
      // Written, the job is the device's: one that keeps the connection open
      // has it all the same.
      if (sent) resolve();
      else reject(new Error("délai dépassé"));
    });
    socket.once("error", (e) => {
      clearTimeout(connecting);
      reject(e);
    });
    socket.once("connect", () => {
      clearTimeout(connecting);
      socket.end(data, () => (sent = true));
    });
    // Whatever the device answers is read, so the connection closes cleanly.
    socket.on("data", () => undefined);
    socket.once("close", (failed) => {
      if (!failed) resolve();
    });
  });

const tcpExchange = (host: string, port: number, data: Buffer, options: ExchangeOptions) =>
  new Promise<Buffer>((resolve, reject) => {
    const socket = net.connect({ host, port });
    const chunks: Buffer[] = [];
    let idle: NodeJS.Timeout | undefined;
    let settled = false;
    const finish = (error: Error | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(idle);
      clearTimeout(connecting);
      clearTimeout(overall);
      socket.destroy();
      if (error) reject(error);
      else resolve(Buffer.concat(chunks));
    };
    const connecting = setTimeout(() => finish(new Error("délai de connexion dépassé")), options.connectTimeout);
    const overall = setTimeout(() => finish(null), options.timeout);
    socket.once("error", (e) => finish(chunks.length ? null : e));
    socket.once("connect", () => {
      clearTimeout(connecting);
      socket.write(data);
    });
    socket.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
      clearTimeout(idle);
      idle = setTimeout(() => finish(null), options.idle);
      const answer = Buffer.concat(chunks);
      if (options.until && answer.includes(options.until)) finish(null);
      else if (options.complete?.(answer)) finish(null);
    });
    socket.once("end", () => finish(null));
  });

/** A device's raw port, reached by Milo itself. */
export const directLink = (host: string, port: number): RawLink => ({
  where: `${host}:${port}`,
  send: (data, timeout, connectTimeout) => tcpSend(host, port, data, timeout, connectTimeout),
  exchange: (data, options) => tcpExchange(host, port, data, options),
});

/** A printer's raw port — 9100 —, directly or through its proxy. */
export const printerLink = (printer: Printer, port: number): RawLink => {
  if (printer.proxy_id === null) return directLink(printer.host, port);
  const device = `printer:${printer.id}`;
  const proxyId = printer.proxy_id;
  return {
    where: `${printer.host}:${port} via « ${proxies.byId.get(proxyId)?.name ?? "?"} »`,
    send: (data, timeout, connectTimeout) =>
      proxySend(proxyId, device, "raw-print", data, timeout, connectTimeout),
    exchange: (data, options) => proxyExchange(proxyId, device, "raw-print", data, options),
  };
};
