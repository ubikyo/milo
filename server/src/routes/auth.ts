// Sign-in: through Microsoft for everyone, by password for the "admin"
// account alone, which is used for settings — and first of all to fill in the
// Entra application without which nobody else can sign in.
//
// This router is mounted before `requireAuth` for its public routes, and
// `/me` is protected separately inside it: it is the only part of the API
// where the boundary runs inside a router.

import { Router } from "express";
import type { Request } from "express";
import { randomBytes } from "node:crypto";
import { passwordIssues } from "@milo/shared";
import { env } from "../env.js";
import { createToken, fullName, hashPassword, verifyPassword } from "../lib/auth.js";
import {
  entraConfigured,
  entraRegistered,
  entraGroups,
  entraProfile,
  completeLogin,
  loginUrl,
  sendingAddress,
} from "../lib/entra.js";
import { badRequest, conflict } from "../lib/http.js";
import { notificationSettings, validNotificationSettings } from "../lib/notification-settings.js";
import { touch } from "../middleware/events.js";
import { rateLimit } from "../middleware/rate-limit.js";
import { requireAuth } from "../middleware/require-auth.js";
import {
  ADMIN_USERNAME,
  hasAccess,
  publicUser,
  sessions,
  users,
  workspacesOf,
} from "../repositories/users.js";
import { now } from "../lib/time.js";
import { miloUrl } from "../lib/milo-url.js";
import { openingViews } from "./views.js";
import type { UpdateMeInput } from "@milo/shared";

/**
 * Opens a session and returns its token. The account starts in its opening
 * workspace, if it chose one and still has it.
 */
const openSession = (userId: number | bigint): string => {
  const user = users.byId.get(userId);
  const opening = user?.default_workspace_id;
  if (user && opening && opening !== user.workspace_id && workspacesOf(user).some((w) => w.id === opening)) {
    users.setWorkspace.run(opening, user.id);
  }
  const token = createToken();
  const currentTime = Date.now();
  sessions.open.run(
    token,
    userId,
    new Date(currentTime).toISOString(),
    new Date(currentTime).toISOString(),
    new Date(currentTime + env.sessionMaxIdleMs).toISOString(),
  );
  return token;
};

const verifyPasswordRules = (password: unknown): void => {
  const issues = passwordIssues(password);
  if (issues.length > 0) {
    badRequest(`Le mot de passe doit contenir : ${issues.join(", ")}`);
  }
};

/**
 * Authentication routes are the only ones where a stranger can insist: ten
 * attempts per quarter hour and per address are plenty for normal use, and
 * cut short any brute forcing.
 */
const attemptLimit = rateLimit({ max: 10, windowMs: 15 * 60 * 1000 });

export const publicAuthRoutes = Router();

// First use: as long as the "admin" account does not exist, its creation is
// allowed without being authenticated. `entra` says whether Microsoft
// sign-in is possible: with no application filled in, the sign-in screen
// only offers the "admin" account.
publicAuthRoutes.get("/setup", (_req, res) => {
  res.json({
    needs_setup: !users.admin.get(),
    entra: entraConfigured(),
    first_setup: !entraRegistered() || !sendingAddress(),
  });
});

// Only the "admin" account: a new database has no workspace, no
// administration and no access. Its administrators, once Entra is
// connected, create the rest.
publicAuthRoutes.post("/setup", attemptLimit, (req, res) => {
  if (users.admin.get()) conflict("Le compte admin existe déjà");

  const password = String(req.body.password ?? "");
  verifyPasswordRules(password);

  const { lastInsertRowid } = users.createAdmin.run(ADMIN_USERNAME, hashPassword(password), now());
  res.status(201).json({
    token: openSession(lastInsertRowid),
    user: publicUser(users.byId.get(lastInsertRowid)!),
  });
});

publicAuthRoutes.post("/login", attemptLimit, (req, res) => {
  const username = String(req.body.username ?? "").trim().toLowerCase();
  const password = String(req.body.password ?? "");
  const admin = username === ADMIN_USERNAME ? users.admin.get() : undefined;

  // Same message in both cases: we don't say which one is wrong.
  if (!admin?.password_hash || !password || !verifyPassword(password, admin.password_hash)) {
    res.status(401).json({ error: "Identifiant ou mot de passe incorrect" });
    return;
  }
  res.json({ token: openSession(admin.id), user: publicUser(admin) });
});

// --- Microsoft sign-in -------------------------------------------------------

/**
 * Microsoft's return address: Milo's address, or failing that the one we
 * are called through. It is the one to register in Azure, and the Entra tab
 * shows it as is.
 */
const returnAddress = (req: Request): string =>
  `${miloUrl() || `${req.protocol}://${req.get("host")}`}/api/auth/entra/callback`;

/**
 * Sign-ins in progress. In memory, like attempt limiting: a restart forgets
 * them, which at worst forces a re-click.
 *
 * `state` ties Microsoft's return to the request that opened it: without it,
 * anyone could call the return address with a code of their own.
 */
const DURATION = 10 * 60 * 1000;
const requests = new Map<string, { redirectUri: string; expiresAt: number }>();

const forgetExpired = (): void => {
  const currentTime = Date.now();
  for (const [key, request] of requests) {
    if (request.expiresAt < currentTime) requests.delete(key);
  }
};

/**
 * The return to the application, token or error in the fragment: it never
 * goes to a server, neither ours nor a third party's, and the client erases
 * it from the address bar as soon as it has read it.
 */
const returnUrl = (fragment: Record<string, string>): string =>
  `/#${new URLSearchParams(fragment).toString()}`;

/** Opens a sign-in: the browser heads off to Microsoft. */
publicAuthRoutes.get("/entra/start", attemptLimit, (req, res) => {
  forgetExpired();
  const state = randomBytes(32).toString("hex");
  const redirectUri = returnAddress(req);
  try {
    const url = loginUrl(redirectUri, state);
    requests.set(state, { redirectUri, expiresAt: Date.now() + DURATION });
    res.redirect(url);
  } catch (error) {
    res.redirect(
      returnUrl({ auth_error: error instanceof Error ? error.message : "Connexion impossible" }),
    );
  }
});

/**
 * Microsoft's return. The person is found by their Entra id, or by their
 * e-mail for a pre-Entra account, or created. Their identity and groups are
 * re-read at every sign-in; they only get in if they are an administrator or
 * have a role in at least one company.
 */
publicAuthRoutes.get("/entra/callback", touch("lookups"), (req, res, next) => {
  void (async () => {
    forgetExpired();
    const state = String(req.query["state"] ?? "");
    const request = requests.get(state);
    requests.delete(state);

    if (!request) {
      res.redirect(returnUrl({ auth_error: "Cette connexion a expiré. Recommencez." }));
      return;
    }
    const refusal = String(req.query["error_description"] ?? req.query["error"] ?? "");
    if (refusal) {
      res.redirect(returnUrl({ auth_error: refusal.split("\n")[0] ?? refusal }));
      return;
    }

    try {
      const { oid, email: tokenEmail } = await completeLogin(
        String(req.query["code"] ?? ""),
        request.redirectUri,
      );
      const [profile, groups] = await Promise.all([entraProfile(oid), entraGroups(oid)]);

      const email = profile.mail || profile.userPrincipalName || tokenEmail;
      const firstName = profile.givenName ?? "";
      const name = profile.surname ?? "";
      const full = fullName(firstName, name) || profile.displayName || email;

      let user = users.byEntraId.get(oid) ?? (email ? users.byEmail.get(email) : undefined);
      if (!user) {
        const { lastInsertRowid } = users.createFromEntra.run(firstName, name, full, email, now(), oid);
        user = users.byId.get(lastInsertRowid)!;
      }
      users.syncEntra.run(firstName, name, full, email, oid, JSON.stringify(groups), user.id);
      user = users.byId.get(user.id)!;

      if (!hasAccess(user)) {
        res.redirect(
          returnUrl({
            auth_error: "Votre compte n'a accès à aucun workspace. Demandez un accès à un administrateur.",
          }),
        );
        return;
      }
      res.redirect(returnUrl({ token: openSession(user.id) }));
    } catch (error) {
      res.redirect(
        returnUrl({ auth_error: error instanceof Error ? error.message : "Connexion impossible" }),
      );
    }
  })().catch(next);
});

// --- What follows requires a session ---------------------------------------

export const authRoutes = Router();
authRoutes.use(requireAuth);

authRoutes.get("/me", (req, res) => {
  res.json(publicUser(req.user));
});

// What the person sets themselves: their opening workspace — one of theirs,
// or none for the one they were working in —, and in it their opening view
// and board — ones they see, or none for the first —, and how they are
// notified. Their identity comes from Entra.
authRoutes.put("/me", (req, res) => {
  const body = (req.body ?? {}) as UpdateMeInput;
  const workspace =
    body.default_workspace === undefined
      ? req.user.default_workspace_id
      : body.default_workspace === null
        ? null
        : Number(body.default_workspace);
  if (workspace !== null && !workspacesOf(req.user).some((w) => w.id === workspace)) {
    badRequest("Workspace introuvable");
  }
  const view = String(body.default_view ?? req.user.default_view ?? "");
  const board = String(body.default_board ?? req.user.default_board ?? "");
  const views = openingViews(req.user, workspace ?? req.user.workspace_id ?? 0);
  // No view: the first one, whose boards the opening board is chosen from.
  const openingView = view === "" ? views[0] : views.find((v) => String(v.id) === view);
  if (!openingView && view !== "") badRequest("Vue introuvable");
  if (board !== "" && !openingView?.boards.some((b) => String(b.id) === board)) {
    badRequest("Tableau introuvable");
  }
  users.setOpening.run(workspace, view, board, req.user.id);
  // Their notifications: the fields given replace those in place.
  if (body.notification_settings !== undefined) {
    users.setNotificationSettings.run(
      JSON.stringify({
        ...notificationSettings(req.user),
        ...validNotificationSettings(body.notification_settings),
      }),
      req.user.id,
    );
  }
  res.json(publicUser(users.byId.get(req.user.id)!));
});

// The views and boards of one of their workspaces: what the profile offers
// for the opening view and board.
authRoutes.get("/me/workspaces/:id/views", (req, res) => {
  const id = Number(req.params.id);
  if (!workspacesOf(req.user).some((w) => w.id === id)) badRequest("Workspace introuvable");
  res.json(openingViews(req.user, id));
});

// Switching to another of their workspaces: their views, boards and rights
// become those of that one.
authRoutes.put("/me/workspace", touch("lookups"), (req, res) => {
  const id = Number(req.body.workspace);
  if (!workspacesOf(req.user).some((w) => w.id === id)) badRequest("Workspace introuvable");
  users.setWorkspace.run(id, req.user.id);
  res.json(publicUser(users.byId.get(req.user.id)!));
});

authRoutes.post("/logout", (req, res) => {
  sessions.close.run(req.token);
  res.status(204).end();
});
