// The only place that writes an error response.

import type { NextFunction, Request, Response } from "express";
import { env } from "../env.js";
import { HttpError } from "../lib/http.js";
import { SIZE_MAX_MB } from "../lib/media.js";

export const notFoundHandler = (req: Request, res: Response): void => {
  res.status(404).json({ error: `Route inconnue : ${req.method} ${req.path}` });
};

export const errorHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void => {
  // Response already started (the event stream, for example): Express knows
  // by itself what to do.
  if (res.headersSent) return next(err);

  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }

  // A file that is too large is stopped by the body parser, before even
  // reaching the route: only it can say so, and it says it in English. The
  // limit is the one the route set — 25 MB for an attachment, much more for a
  // backup — and the parser carries it.
  if (typeof err === "object" && err !== null && "type" in err) {
    const body = err as { type?: string; limit?: number };
    if (body.type === "entity.too.large") {
      const mo = body.limit ? Math.round(body.limit / (1024 * 1024)) : SIZE_MAX_MB;
      res.status(413).json({ error: `Fichier trop volumineux (${mo} Mo au maximum)` });
      return;
    }
  }

  // Everything else is an application defect: we log it in full, and say
  // nothing to the client — an internal error message informs the attacker as
  // much as the user.
  console.error("Unhandled error:", err);
  res.status(500).json({
    error: env.production ? "Erreur interne" : String(err instanceof Error ? err.stack : err),
  });
};
