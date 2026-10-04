// Throttling of attempts on authentication routes.
//
// Nothing slowed down password attempts: a known address could be brute-forced
// as fast as the server could respond. scrypt is costly enough that this is
// also a protection for the server itself.
//
// The count is kept in memory, per IP address. That is enough here: the
// application runs on a single process, and a restart that resets the counters
// opens only a window of a few attempts.

import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../lib/http.js";

interface Window {
  attempts: number;
  start: number;
}

export interface RateLimitOptions {
  /** Number of attempts tolerated per window. */
  max: number;
  /** Window duration, in milliseconds. */
  windowMs: number;
}

export const rateLimit = ({ max, windowMs }: RateLimitOptions) => {
  const byKey = new Map<string, Window>();

  // Periodic cleanup: without it, the table would keep one entry per address
  // seen since startup. `unref` lets the process exit.
  setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [key, window] of byKey) {
      if (window.start < cutoff) byKey.delete(key);
    }
  }, windowMs).unref();

  return (req: Request, _res: Response, next: NextFunction): void => {
    const key = req.ip ?? "inconnue";
    const currentTime = Date.now();
    const window = byKey.get(key);

    if (!window || currentTime - window.start > windowMs) {
      byKey.set(key, { attempts: 1, start: currentTime });
      return next();
    }

    window.attempts += 1;
    if (window.attempts > max) {
      throw new HttpError(429, "Trop de tentatives. Réessayez dans quelques minutes.");
    }
    next();
  };
};
