// A notification for each change of the settings (Paramétrage): mounted in
// front of their routes, it announces every write that succeeded — the author
// only, if they asked to be notified of their own actions (lib/notify.ts).

import type { NextFunction, Request, Response } from "express";
import { notifySettings, root } from "../lib/notify.js";

/** What the verb did. */
const VERBS: Record<string, string> = {
  POST: "a ajouté un élément dans",
  PUT: "a modifié",
  PATCH: "a modifié",
  DELETE: "a supprimé un élément dans",
};

/**
 * Announces the writes of a part of the settings: "a modifié les types de
 * jalons". `skip` names the writes that change nothing — a preview, a test.
 */
export const settingsNotice =
  (what: string, skip: RegExp | null = null) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const verb = VERBS[req.method];
    if (!verb || (skip && skip.test(req.path))) return next();
    res.on("finish", () => {
      if (res.statusCode >= 400 || !req.user) return;
      notifySettings({ message: `${verb} ${what}`, author: req.user, base: root(req) });
    });
    next();
  };
