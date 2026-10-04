// Application settings: whatever belongs to no particular account — the
// outgoing mail setup, the trace of the last restore.
//
// A key / value table, the value as JSON. Settings are few, read once per
// request that needs them, and their shape changes with whatever gets added:
// a column per field would need a migration every time.

import { mutation, selection } from "../db/query.js";
import type { SettingRow } from "../db/rows.js";

const read = selection<SettingRow>("SELECT * FROM settings WHERE key = ?");
const write = mutation(
  `INSERT INTO settings (key, value) VALUES (?, ?)
   ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
);

/**
 * The setting, or the given value if it was never written. Corrupted JSON —
 * a hand-edited database, a restore from an older version — is treated as
 * absent: the application falls back to the default rather than refusing to
 * start.
 */
export const readSetting = <T>(key: string, defaultValue: T): T => {
  const row = read.get(key);
  if (!row) return defaultValue;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return defaultValue;
  }
};

export const writeSetting = (key: string, value: unknown): void => {
  write.run(key, JSON.stringify(value));
};
