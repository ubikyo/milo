// Deux fabriques de requêtes préparées, typées sur la ligne qu'elles rendent.
//
// better-sqlite3 rend `unknown`, ce qui obligeait chaque appel à se conclure
// par un `as`. Le transtypage est fait ici, une fois, et le reste du serveur
// lit des lignes déjà nommées.
//
// Une requête préparée l'est au chargement du module et non à chaque appel :
// c'est là que se trouvait le gros du coût inutile, SQLite recompilant le même
// SQL à chaque requête HTTP.

import type { RunResult } from "better-sqlite3";
import db from "./index.js";

export interface Selection<Row> {
  get(...params: unknown[]): Row | undefined;
  all(...params: unknown[]): Row[];
}

export interface Mutation {
  run(...params: unknown[]): RunResult;
}

/** Une lecture : `SELECT`. */
export const selection = <Row>(sql: string): Selection<Row> =>
  db.prepare(sql) as unknown as Selection<Row>;

/** Une écriture : `INSERT`, `UPDATE`, `DELETE`. */
export const mutation = (sql: string): Mutation => db.prepare(sql) as unknown as Mutation;

/**
 * Un groupe d'écritures qui vont ensemble : elles passent toutes, ou aucune.
 *
 * Enveloppe `db.transaction` pour en rendre une fonction ordinaire : le type
 * de better-sqlite3 porte des variantes (`deferred`, `immediate`) dont on ne
 * se sert pas, et qui empêchent TypeScript de nommer le type à l'export.
 */
export const transaction = <Args extends unknown[], Result>(
  action: (...args: Args) => Result,
): ((...args: Args) => Result) => db.transaction(action) as (...args: Args) => Result;

/**
 * Une lecture dont on sait qu'elle rend exactement une ligne : un COUNT, un
 * MAX. Évite d'avoir à traiter un `undefined` qui ne viendra jamais.
 */
export const scalar = <Row>(sql: string) => {
  const requete = db.prepare(sql) as unknown as Selection<Row>;
  return (...params: unknown[]): Row => requete.get(...params) as Row;
};

export { default as db } from "./index.js";
