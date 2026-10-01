// Ce qu'un commentaire partage avec son jumeau : les deux fils (projets et
// cartes) ont la même forme et le même traitement de l'auteur.

import type { Actor, Id, SqliteBool } from "@milo/shared";
import { MILO_ACTOR } from "@milo/shared";
import type { WithAuthorColumns } from "../db/rows.js";
import { gravatarUrl } from "../lib/auth.js";
import { horodatage } from "../lib/time.js";
import { users } from "./users.js";

/**
 * L'auteur accompagne le commentaire, comme les acteurs accompagnent un
 * projet : une jointure plutôt qu'une requête par commentaire.
 *
 * Il est nul pour un commentaire d'avant cette colonne, ou dont le compte a
 * été supprimé : son texte reste, son auteur n'est plus connu. Un mot de
 * l'application sans compte derrière — l'ouverture d'un fil — est signé Milo.
 */
export const withAuthor = <T extends { user_id: number | null; system: SqliteBool }>(
  row: WithAuthorColumns<T>,
): T & { author: Actor | null } => {
  const { author_name, author_email, ...comment } = row;
  return {
    ...(comment as unknown as T),
    author: !comment.user_id
      ? comment.system
        ? MILO_ACTOR
        : null
      : {
          id: comment.user_id,
          name: author_name || author_email || "",
          email: author_email ?? "",
          gravatar_url: gravatarUrl(author_email ?? ""),
        },
  };
};

/** Les mots que l'application écrit elle-même : ni retouchés, ni effacés. */
export const COMMENTAIRE_SYSTEME = "Ce commentaire est écrit par l'application";

/**
 * Le mot qui ouvre un fil, signé Milo : ce qui a été créé, quand, et par qui.
 * Le créateur n'en est pas l'auteur — c'est Milo qui le dit —, son nom tient
 * donc dans le texte. Un compte sans nom se reconnaît à son adresse.
 */
export const motDeCreation = (cree: string, quand: string, par: Id): string => {
  const createur = users.byId.get(par);
  const nom = createur?.name || createur?.email;
  return `${cree} le ${horodatage(quand)}${nom ? ` par ${nom}` : ""}`;
};
