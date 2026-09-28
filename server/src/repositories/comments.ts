// Ce qu'un commentaire partage avec son jumeau : les deux fils (projets et
// cartes) ont la même forme et le même traitement de l'auteur.

import type { Actor } from "@milo/shared";
import type { WithAuthorColumns } from "../db/rows.js";
import { gravatarUrl } from "../lib/auth.js";

/**
 * L'auteur accompagne le commentaire, comme les acteurs accompagnent un
 * projet : une jointure plutôt qu'une requête par commentaire.
 *
 * Il est nul pour un commentaire d'avant cette colonne, ou dont le compte a
 * été supprimé : son texte reste, son auteur n'est plus connu.
 */
export const withAuthor = <T extends { user_id: number | null }>(
  row: WithAuthorColumns<T>,
): T & { author: Actor | null } => {
  const { author_name, author_email, ...comment } = row;
  return {
    ...(comment as unknown as T),
    author: comment.user_id
      ? {
          id: comment.user_id,
          name: author_name || author_email || "",
          email: author_email ?? "",
          gravatar_url: gravatarUrl(author_email ?? ""),
        }
      : null,
  };
};

/** Les mots que l'application écrit elle-même : ni retouchés, ni effacés. */
export const COMMENTAIRE_SYSTEME = "Ce commentaire est écrit par l'application";
