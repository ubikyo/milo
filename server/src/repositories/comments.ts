// What a comment shares with its twin: the two threads (projects and cards)
// have the same shape and the same author handling.

import type { Actor, Id, SqliteBool } from "@milo/shared";
import { MILO_ACTOR } from "@milo/shared";
import type { WithAuthorColumns } from "../db/rows.js";
import { gravatarUrl } from "../lib/auth.js";
import { timestamp } from "../lib/time.js";
import { users } from "./users.js";

/**
 * The author accompanies the comment, as actors accompany a project: a join
 * rather than a query per comment.
 *
 * It is null for a comment predating this column, or whose account was
 * deleted: its text stays, its author is no longer known. A note from the
 * application with no account behind it — the opening of a thread — is signed
 * Milo.
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

/** Notes the application writes itself: neither edited nor erased. */
export const SYSTEM_COMMENT = "Ce commentaire est écrit par l'application";

/**
 * The note that opens a thread, signed Milo: what was created, when, and by
 * whom. The creator is not its author — Milo says it —, so their name is in
 * the text. An account without a name is recognized by its address.
 */
export const creationNote = (created: string, whenLabel: string, by: Id): string => {
  const creator = users.byId.get(by);
  const name = creator?.name || creator?.email;
  return `${created} le ${timestamp(whenLabel)}${name ? ` par ${name}` : ""}`;
};
