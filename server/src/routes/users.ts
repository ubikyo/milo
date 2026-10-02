// Les personnes : celles qui se sont connectées au moins une fois par
// Microsoft, et celles d'avant Entra. Elles alimentent les listes d'acteurs
// et de membres ; le compte « admin » n'en fait jamais partie.
//
// Une personne naît de sa première connexion, ou de son choix comme acteur
// dans l'annuaire Entra — avant même qu'elle se soit connectée. Son identité
// vient toujours d'Entra ; ses accès se règlent ailleurs
// (routes/assignments.ts), et un compte créé ici n'en donne aucun.
//
// Chacun a aussi ses acteurs favoris : ceux qui passent en tête des listes.

import { Router } from "express";
import type { DirectoryUser, EntraPrincipal, Id } from "@milo/shared";
import { mutation, selection } from "../db/query.js";
import { fullName } from "../lib/auth.js";
import { chercherDansLAnnuaire, profilEntra } from "../lib/entra.js";
import { badRequest, orNotFound, requireText } from "../lib/http.js";
import { now } from "../lib/time.js";
import { touch } from "../middleware/events.js";
import { publicUser, users } from "../repositories/users.js";

export const userRoutes = Router();

userRoutes.get("/", (_req, res) => {
  res.json(users.all.all().map(publicUser));
});

// --- Favoris ---------------------------------------------------------------

const favorisDe = selection<{ favorite_id: Id }>(
  `SELECT f.favorite_id FROM user_favorites f
   JOIN users u ON u.id = f.favorite_id
   WHERE f.user_id = ? AND u.system = 0`,
);
const ajouterFavori = mutation(
  `INSERT OR IGNORE INTO user_favorites (user_id, favorite_id)
   SELECT ?, id FROM users WHERE id = ? AND system = 0`,
);
const retirerFavori = mutation(
  "DELETE FROM user_favorites WHERE user_id = ? AND favorite_id = ?",
);

const mesFavoris = (userId: Id): Id[] => favorisDe.all(userId).map((f) => f.favorite_id);

/** Les favoris de la personne connectée, en identifiants. */
userRoutes.get("/favorites", (req, res) => {
  res.json(mesFavoris(req.user.id));
});

userRoutes.put("/favorites/:id", (req, res) => {
  ajouterFavori.run(req.user.id, Number(req.params.id));
  res.json(mesFavoris(req.user.id));
});

userRoutes.delete("/favorites/:id", (req, res) => {
  retirerFavori.run(req.user.id, Number(req.params.id));
  res.json(mesFavoris(req.user.id));
});

// --- Annuaire --------------------------------------------------------------

/**
 * Les personnes de l'annuaire Entra dont le nom ou l'adresse commence par ce
 * qu'on tape — les groupes n'en sont pas : un acteur est une personne. Chacune
 * dit si elle a déjà un compte dans Milo.
 */
userRoutes.get("/directory", (req, res, next) => {
  const q = String(req.query["q"] ?? "").trim();
  if (q.length < 2) {
    res.json([]);
    return;
  }
  chercherDansLAnnuaire(q, "all")
    .then((trouves) =>
      res.json(
        trouves
          .filter((p) => p.type === "user")
          .map((p): DirectoryUser => {
            const compte =
              users.byEntraId.get(p.id) ?? (p.email ? users.byEmail.get(p.email) : undefined);
            return {
              oid: p.id,
              name: p.name,
              email: p.email,
              user_id: compte?.id ?? null,
              synced: p.synced,
            };
          }),
      ),
    )
    .catch(next);
});

/**
 * Les groupes de l'annuaire Entra dont le nom commence par ce qu'on tape. Un
 * groupe est un acteur là où l'on prévient sans assigner — les machines d'un
 * élément Uptime : ce sont ses membres qui reçoivent la notification.
 */
userRoutes.get("/directory/groups", (req, res, next) => {
  const q = String(req.query["q"] ?? "").trim();
  if (q.length < 2) {
    res.json([]);
    return;
  }
  chercherDansLAnnuaire(q, "groups")
    .then((trouves) => res.json(trouves.filter((p): p is EntraPrincipal => p.type === "group")))
    .catch(next);
});

/**
 * Une personne de l'annuaire choisie comme acteur : son compte, créé s'il le
 * faut à partir de son profil Entra — relu ici, jamais pris tel que le client
 * l'envoie. Elle s'y retrouvera à sa première connexion, par son identifiant.
 */
userRoutes.post("/directory/:oid", touch("lookups"), (req, res, next) => {
  const oid = requireText(req.params.oid, "Identifiant requis");
  profilEntra(oid)
    .then((profil) => {
      const email = profil.mail || profil.userPrincipalName || "";
      if (!email) badRequest("Cette personne n'a pas d'adresse e-mail dans l'annuaire");
      let compte = users.byEntraId.get(oid) ?? users.byEmail.get(email);
      if (!compte) {
        const prenom = profil.givenName ?? "";
        const nom = profil.surname ?? "";
        const complet = fullName(prenom, nom) || profil.displayName || email;
        const { lastInsertRowid } = users.createFromEntra.run(prenom, nom, complet, email, now(), oid);
        compte = users.byId.get(lastInsertRowid);
      }
      res.status(201).json(publicUser(orNotFound(compte, "Compte introuvable")));
    })
    .catch(next);
});
