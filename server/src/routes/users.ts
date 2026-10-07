// People: those who have signed in at least once through
// Microsoft, and those from before Entra. They feed the lists of actors
// and members; the "admin" account is never part of them.
//
// A person is born from their first sign-in, or from being chosen as an actor
// in the Entra directory — even before they have signed in. Their identity
// always comes from Entra; their access is set elsewhere
// (routes/assignments.ts), and an account created here grants none.
//
// Everyone also has favorite actors: those that come first in the lists.

import { Router } from "express";
import { WIDGET_KINDS } from "@milo/shared";
import type { DirectoryUser, Id, WidgetKind } from "@milo/shared";
import { mutation, selection } from "../db/query.js";
import { fullName } from "../lib/auth.js";
import { searchInDirectory, entraProfile } from "../lib/entra.js";
import { badRequest, orNotFound, requireText } from "../lib/http.js";
import { now } from "../lib/time.js";
import { touch } from "../middleware/events.js";
import { workspacePeople } from "../lib/workspace-people.js";
import { currentWorkspace, publicUser, users } from "../repositories/users.js";

export const userRoutes = Router();

userRoutes.get("/", (_req, res) => {
  res.json(users.all.all().map(publicUser));
});

// --- Favorites -------------------------------------------------------------

const favoritesOf = selection<{ favorite_id: Id }>(
  `SELECT f.favorite_id FROM user_favorites f
   JOIN users u ON u.id = f.favorite_id
   WHERE f.user_id = ? AND u.system = 0`,
);
const addFavorite = mutation(
  `INSERT OR IGNORE INTO user_favorites (user_id, favorite_id)
   SELECT ?, id FROM users WHERE id = ? AND system = 0`,
);
const removeFavorite = mutation(
  "DELETE FROM user_favorites WHERE user_id = ? AND favorite_id = ?",
);

const myFavorites = (userId: Id): Id[] => favoritesOf.all(userId).map((f) => f.favorite_id);

/** The favorites of the signed-in person, as ids. */
userRoutes.get("/favorites", (req, res) => {
  res.json(myFavorites(req.user.id));
});

userRoutes.put("/favorites/:id", (req, res) => {
  addFavorite.run(req.user.id, Number(req.params.id));
  res.json(myFavorites(req.user.id));
});

userRoutes.delete("/favorites/:id", (req, res) => {
  removeFavorite.run(req.user.id, Number(req.params.id));
  res.json(myFavorites(req.user.id));
});

// --- Workspace -------------------------------------------------------------

/**
 * Who can be an actor in the workspace one works in: its users — their own
 * and its groups', listed individually — and its groups, among those who read
 * this widget type ("Utiliser" at least).
 */
userRoutes.get("/workspace", (req, res, next) => {
  const kind = String(req.query["kind"] ?? "");
  if (!WIDGET_KINDS.some((k) => k.value === kind)) badRequest("Type de widget inconnu");
  const workspace = currentWorkspace(req.user);
  if (workspace === null) {
    res.json({ users: [], groups: [] });
    return;
  }
  workspacePeople(workspace, kind as WidgetKind)
    .then((people) => res.json(people))
    .catch(next);
});

// --- Directory -------------------------------------------------------------

/**
 * The people of the Entra directory whose name or address starts with what
 * is typed — groups are not included: an actor is a person. Each one
 * says whether they already have a Milo account.
 */
userRoutes.get("/directory", (req, res, next) => {
  const q = String(req.query["q"] ?? "").trim();
  if (q.length < 2) {
    res.json([]);
    return;
  }
  searchInDirectory(q, "all")
    .then((matches) =>
      res.json(
        matches
          .filter((p) => p.type === "user")
          .map((p): DirectoryUser => {
            const account =
              users.byEntraId.get(p.id) ?? (p.email ? users.byEmail.get(p.email) : undefined);
            return {
              oid: p.id,
              name: p.name,
              email: p.email,
              user_id: account?.id ?? null,
              synced: p.synced,
            };
          }),
      ),
    )
    .catch(next);
});

/**
 * A person from the directory chosen as an actor: their account, created if
 * needed from their Entra profile — reread here, never taken as the client
 * sends it. They will find themselves in it at their first sign-in, by their id.
 */
userRoutes.post("/directory/:oid", touch("lookups"), (req, res, next) => {
  const oid = requireText(req.params.oid, "Identifiant requis");
  entraProfile(oid)
    .then((profile) => {
      const email = profile.mail || profile.userPrincipalName || "";
      if (!email) badRequest("Cette personne n'a pas d'adresse e-mail dans l'annuaire");
      let account = users.byEntraId.get(oid) ?? users.byEmail.get(email);
      if (!account) {
        const firstName = profile.givenName ?? "";
        const name = profile.surname ?? "";
        const full = fullName(firstName, name) || profile.displayName || email;
        const { lastInsertRowid } = users.createFromEntra.run(firstName, name, full, email, now(), oid);
        account = users.byId.get(lastInsertRowid);
      }
      res.status(201).json(publicUser(orNotFound(account, "Compte introuvable")));
    })
    .catch(next);
});
