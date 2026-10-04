// Two prepared-statement factories, typed on the row they return.
//
// better-sqlite3 returns `unknown`, which forced every call site to finish
// with an `as`. The cast is done here, once, and the rest of the server
// reads rows that are already named.
//
// A statement is prepared when the module loads, not on every call: that is
// where most of the needless cost lay, SQLite recompiling the same SQL on
// every HTTP request.

import type { RunResult } from "better-sqlite3";
import db from "./index.js";

export interface Selection<Row> {
  get(...params: unknown[]): Row | undefined;
  all(...params: unknown[]): Row[];
}

export interface Mutation {
  run(...params: unknown[]): RunResult;
}

/** A read: `SELECT`. */
export const selection = <Row>(sql: string): Selection<Row> =>
  db.prepare(sql) as unknown as Selection<Row>;

/** A write: `INSERT`, `UPDATE`, `DELETE`. */
export const mutation = (sql: string): Mutation => db.prepare(sql) as unknown as Mutation;

/**
 * A group of writes that belong together: they all go through, or none do.
 *
 * Wraps `db.transaction` to turn it into an ordinary function: the
 * better-sqlite3 type carries variants (`deferred`, `immediate`) that we do
 * not use, and that stop TypeScript from naming the type on export.
 */
export const transaction = <Args extends unknown[], Result>(
  action: (...args: Args) => Result,
): ((...args: Args) => Result) => db.transaction(action) as (...args: Args) => Result;

/**
 * A read known to return exactly one row: a COUNT, a MAX. Saves having to
 * handle an `undefined` that will never come.
 */
export const scalar = <Row>(sql: string) => {
  const query = db.prepare(sql) as unknown as Selection<Row>;
  return (...params: unknown[]): Row => query.get(...params) as Row;
};

export { default as db } from "./index.js";
