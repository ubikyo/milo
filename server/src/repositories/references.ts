// "HLP-12" references. A single counter gives them to support requests,
// projects and cards: a reference designates a single thing, whatever the
// mode, and can be cited without saying where it comes from.

import { scalar } from "../db/query.js";
import { readSetting, writeSetting } from "./settings.js";

/**
 * The last number given. The key predates the shared counter, when only
 * tickets carried them: it keeps counting them.
 */
export const REFERENCE_COUNTER = "support_ticket_counter";

const largestReference = scalar<{ max: number }>(
  `SELECT MAX(
     (SELECT COALESCE(MAX(number), 0) FROM support_requests),
     (SELECT COALESCE(MAX(number), 0) FROM projects),
     (SELECT COALESCE(MAX(number), 0) FROM task_cards)
   ) AS max`,
);

/**
 * The next reference, with the counter advanced accordingly. The largest in
 * the database counts too: a restored backup, or a lost counter, never causes
 * the same one to be given twice.
 *
 * To be called in the transaction that creates the item: if it fails, the
 * number is not consumed.
 */
export const nextReference = (): number => {
  const phoneNumber = Math.max(readSetting(REFERENCE_COUNTER, 0), largestReference().max) + 1;
  writeSetting(REFERENCE_COUNTER, phoneNumber);
  return phoneNumber;
};
