// Settings coming from the environment, read once and named here. Hunting for
// them throughout the code means never knowing what is configurable.

import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

const days = (n: number) => n * 24 * 60 * 60 * 1000;

const integer = (value: string | undefined, defaultValue: number): number => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : defaultValue;
};

export const env = {
  port: integer(process.env["PORT"], 3001),

  // In production, the database must live outside the deployed folder: a
  // deployment replaces the code, it must not wipe the data.
  // For example MILO_DB_PATH=/var/lib/milo/data.db.
  dbPath: process.env["MILO_DB_PATH"] || path.join(here, "..", "data.db"),

  // Files dropped on cards, and images pasted into a description. Same rule
  // as the database: in production they live outside the deployed folder,
  // otherwise the next deployment would wipe them.
  // For example MILO_MEDIA_PATH=/var/lib/milo/medias.
  mediaPath: process.env["MILO_MEDIA_PATH"] || path.join(here, "..", "..", "medias"),

  /**
   * Origins allowed to call the API from a browser, separated by commas. In
   * production the app is served by the same host as the API: no third-party
   * origin has any reason to reach it, and the list stays empty. In
   * development, Vite serves the client on another port.
   */
  corsOrigins: (process.env["MILO_CORS_ORIGINS"] ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),

  /**
   * Changes to the same item by the same person within this window fit in a
   * single follow-up e-mail. Too short, and you get a burst; too long, and
   * you are told late. The on-screen notification is immediate whatever this
   * value.
   */
  notifyWindowMs: integer(process.env["MILO_NOTIFY_WINDOW_MINUTES"], 5) * 60 * 1000,

  /** A session left unused for this long closes by itself. */
  sessionMaxIdleMs: days(integer(process.env["MILO_SESSION_DAYS"], 30)),

  /**
   * Support-mode replies go to the sender, in response to their e-mail.
   * "simulate" simulates them, for debugging: the message is prepared and
   * logged, but nothing leaves Milo.
   */
  supportReplySend: process.env["MILO_SUPPORT_REPLY"] !== "simulate",

  // Images and attachments of e-mails received by support. Same rule as the
  // media: in production, outside the deployed folder.
  // For example MILO_TICKETS_PATH=/var/lib/milo/tickets.
  ticketsPath:
    process.env["MILO_TICKETS_PATH"] || path.join(here, "..", "..", "upload", "tickets"),

  /**
   * The public address of Milo, over https — "https://milo.example.fr".
   * Microsoft notifies Milo there when an e-mail arrives (Graph change
   * notifications). Without it, only periodic polling applies.
   */
  publicUrl: (process.env["MILO_PUBLIC_URL"] ?? "").replace(/\/+$/, ""),

  production: process.env["NODE_ENV"] === "production",
} as const;
