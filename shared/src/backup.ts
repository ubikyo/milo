// The backup: a single archive that carries the database and the files
// uploaded to cards. The two go together — a database restored without its
// media would leave attachments that no longer open, and descriptions with
// empty images.

/** Enough to announce how big the backup will be, before requesting it. */
export interface BackupInfo {
  /** Size of the database, in bytes. */
  database_size: number;
  media_count: number;
  /** Cumulative size of the uploaded files, in bytes. */
  media_size: number;
  /** Date of the most recently restored backup, empty if there is none. */
  last_restore: string;
}

/** What the restore put back in place. */
export interface RestoreResult {
  tables: number;
  rows: number;
  media: number;
}

/** The file name offered for download, dated with the current day. */
export const backupFileName = (date = new Date()): string =>
  `milo-${date.toISOString().slice(0, 10)}.milo.gz`;
