// La connexion : par Microsoft pour tout le monde, par mot de passe pour le
// seul compte « admin », qui sert au paramétrage — et d'abord à renseigner
// l'application Entra sans laquelle personne d'autre ne peut se connecter.
//
// Ce routeur est monté avant `requireAuth` pour ses routes publiques, et
// `/me` y est protégé à part : c'est la seule partie de l'API où la frontière
// passe à l'intérieur d'un routeur.

import { Router } from "express";
import type { Request } from "express";
import { randomBytes } from "node:crypto";
import { passwordIssues } from "@milo/shared";
import { env } from "../env.js";
import { createToken, fullName, hashPassword, verifyPassword } from "../lib/auth.js";
import {
  entraConfiguree,
  groupesEntra,
  profilEntra,
  terminerLaConnexion,
  urlDeConnexion,
} from "../lib/entra.js";
import { badRequest, conflict, requireText } from "../lib/http.js";
import { touch } from "../middleware/events.js";
import { rateLimit } from "../middleware/rate-limit.js";
import { requireAuth } from "../middleware/require-auth.js";
import {
  ADMIN_USERNAME,
  aAcces,
  publicUser,
  sessions,
  users,
  workspacesDu,
} from "../repositories/users.js";
import { workspaces } from "../repositories/workspaces.js";
import { now } from "../lib/time.js";
import { vueVisible } from "../repositories/views.js";

/** Ouvre une session et rend son jeton. */
const openSession = (userId: number | bigint): string => {
  const token = createToken();
  const maintenant = Date.now();
  sessions.open.run(
    token,
    userId,
    new Date(maintenant).toISOString(),
    new Date(maintenant).toISOString(),
    new Date(maintenant + env.sessionMaxIdleMs).toISOString(),
  );
  return token;
};

const verifierMotDePasse = (password: unknown): void => {
  const issues = passwordIssues(password);
  if (issues.length > 0) {
    badRequest(`Le mot de passe doit contenir : ${issues.join(", ")}`);
  }
};

/**
 * Les routes d'authentification sont les seules où un inconnu peut insister :
 * dix essais par quart d'heure et par adresse suffisent largement à un usage
 * normal, et coupent court à un forçage.
 */
const limiteTentatives = rateLimit({ max: 10, fenetreMs: 15 * 60 * 1000 });

export const publicAuthRoutes = Router();

// Première utilisation : tant que le compte « admin » n'existe pas, on
// autorise sa création sans être authentifié. `entra` dit si la connexion par
// Microsoft est possible : sans application renseignée, l'écran de connexion
// ne propose que le compte « admin ».
publicAuthRoutes.get("/setup", (_req, res) => {
  res.json({ needs_setup: !users.admin.get(), entra: entraConfiguree() });
});

// Le premier workspace existe déjà — la base en reçoit un (migrations.ts) :
// il prend le nom choisi. Ses accès se règlent ensuite, une fois Entra
// renseigné.
publicAuthRoutes.post("/setup", limiteTentatives, (req, res) => {
  if (users.admin.get()) conflict("Le compte admin existe déjà");

  const password = String(req.body.password ?? "");
  verifierMotDePasse(password);
  const workspace = requireText(req.body.workspace, "Le nom du workspace est requis");

  const premier = workspaces.first.get();
  if (premier) workspaces.rename.run(workspace, premier.id);
  else workspaces.create.run(workspace, 0, now());
  const { lastInsertRowid } = users.createAdmin.run(ADMIN_USERNAME, hashPassword(password), now());
  res.status(201).json({
    token: openSession(lastInsertRowid),
    user: publicUser(users.byId.get(lastInsertRowid)!),
  });
});

publicAuthRoutes.post("/login", limiteTentatives, (req, res) => {
  const username = String(req.body.username ?? "").trim().toLowerCase();
  const password = String(req.body.password ?? "");
  const admin = username === ADMIN_USERNAME ? users.admin.get() : undefined;

  // Même message dans les deux cas : on n'indique pas ce qui est faux.
  if (!admin?.password_hash || !password || !verifyPassword(password, admin.password_hash)) {
    res.status(401).json({ error: "Identifiant ou mot de passe incorrect" });
    return;
  }
  res.json({ token: openSession(admin.id), user: publicUser(admin) });
});

// --- Connexion par Microsoft -------------------------------------------------

/**
 * L'adresse de retour de Microsoft. Elle se déduit de celle par laquelle on
 * nous appelle : c'est elle qu'il faut inscrire dans Azure, et l'onglet Entra
 * la montre telle quelle.
 */
const adresseDeRetour = (req: Request): string =>
  `${req.protocol}://${req.get("host")}/api/auth/entra/callback`;

/**
 * Les connexions en cours. En mémoire, comme la limitation des tentatives : un
 * redémarrage les oublie, ce qui oblige au pire à recliquer.
 *
 * `state` lie le retour de Microsoft à la demande qui l'a ouvert : sans lui,
 * n'importe qui pourrait appeler l'adresse de retour avec un code à lui.
 */
const DUREE = 10 * 60 * 1000;
const demandes = new Map<string, { redirectUri: string; expire: number }>();

const oublierLesExpirees = (): void => {
  const maintenant = Date.now();
  for (const [cle, demande] of demandes) {
    if (demande.expire < maintenant) demandes.delete(cle);
  }
};

/**
 * Le retour à l'application, jeton ou erreur dans le fragment : il ne part
 * jamais vers un serveur, ni le nôtre ni celui d'un tiers, et le client
 * l'efface de la barre d'adresse dès qu'il l'a lu.
 */
const retour = (fragment: Record<string, string>): string =>
  `/#${new URLSearchParams(fragment).toString()}`;

/** Ouvre une connexion : le navigateur part vers Microsoft. */
publicAuthRoutes.get("/entra/start", limiteTentatives, (req, res) => {
  oublierLesExpirees();
  const state = randomBytes(32).toString("hex");
  const redirectUri = adresseDeRetour(req);
  try {
    const url = urlDeConnexion(redirectUri, state);
    demandes.set(state, { redirectUri, expire: Date.now() + DUREE });
    res.redirect(url);
  } catch (erreur) {
    res.redirect(
      retour({ auth_error: erreur instanceof Error ? erreur.message : "Connexion impossible" }),
    );
  }
});

/**
 * Le retour de Microsoft. La personne est retrouvée par son identifiant Entra,
 * ou par son e-mail pour un compte d'avant Entra, ou créée. Son identité et
 * ses groupes sont relus à chaque connexion ; elle n'entre que si elle est
 * administratrice ou a un rôle dans au moins une société.
 */
publicAuthRoutes.get("/entra/callback", touch("lookups"), (req, res, next) => {
  void (async () => {
    oublierLesExpirees();
    const state = String(req.query["state"] ?? "");
    const demande = demandes.get(state);
    demandes.delete(state);

    if (!demande) {
      res.redirect(retour({ auth_error: "Cette connexion a expiré. Recommencez." }));
      return;
    }
    const refus = String(req.query["error_description"] ?? req.query["error"] ?? "");
    if (refus) {
      res.redirect(retour({ auth_error: refus.split("\n")[0] ?? refus }));
      return;
    }

    try {
      const { oid, email: emailJeton } = await terminerLaConnexion(
        String(req.query["code"] ?? ""),
        demande.redirectUri,
      );
      const [profil, groupes] = await Promise.all([profilEntra(oid), groupesEntra(oid)]);

      const email = profil.mail || profil.userPrincipalName || emailJeton;
      const prenom = profil.givenName ?? "";
      const nom = profil.surname ?? "";
      const complet = fullName(prenom, nom) || profil.displayName || email;

      let user = users.byEntraId.get(oid) ?? (email ? users.byEmail.get(email) : undefined);
      if (!user) {
        const { lastInsertRowid } = users.createFromEntra.run(prenom, nom, complet, email, now(), oid);
        user = users.byId.get(lastInsertRowid)!;
      }
      users.syncEntra.run(prenom, nom, complet, email, oid, JSON.stringify(groupes), user.id);
      user = users.byId.get(user.id)!;

      if (!aAcces(user)) {
        res.redirect(
          retour({
            auth_error: "Votre compte n'a accès à aucun workspace. Demandez un accès à un administrateur.",
          }),
        );
        return;
      }
      res.redirect(retour({ token: openSession(user.id) }));
    } catch (erreur) {
      res.redirect(
        retour({ auth_error: erreur instanceof Error ? erreur.message : "Connexion impossible" }),
      );
    }
  })().catch(next);
});

// --- Ce qui suit exige une session -----------------------------------------

export const authRoutes = Router();
authRoutes.use(requireAuth);

authRoutes.get("/me", (req, res) => {
  res.json(publicUser(req.user));
});

// Ce que la personne règle elle-même : sa vue d'ouverture — une vue qu'elle
// voit, ou rien pour la première. Son identité vient d'Entra.
authRoutes.put("/me", (req, res) => {
  const recu = String(req.body.default_view ?? req.user.default_view ?? "");
  if (recu !== "" && !vueVisible(Number(recu), req.user)) badRequest("Vue introuvable");
  users.setDefaultView.run(recu, req.user.id);
  res.json(publicUser(users.byId.get(req.user.id)!));
});

// Passer dans un autre de ses workspaces : ses vues, ses tableaux et ses
// droits deviennent ceux de celui-là.
authRoutes.put("/me/workspace", touch("lookups"), (req, res) => {
  const id = Number(req.body.workspace);
  if (!workspacesDu(req.user).some((w) => w.id === id)) badRequest("Workspace introuvable");
  users.setWorkspace.run(id, req.user.id);
  res.json(publicUser(users.byId.get(req.user.id)!));
});

authRoutes.post("/logout", (req, res) => {
  sessions.close.run(req.token);
  res.status(204).end();
});
