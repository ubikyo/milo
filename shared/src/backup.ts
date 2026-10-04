// La sauvegarde : une archive unique qui emporte la base et les fichiers
// déposés sur les cartes. Les deux vont ensemble — une base restaurée sans ses
// médias laisserait des pièces jointes qui ne s'ouvrent plus, et des
// descriptions aux images vides.

/** De quoi annoncer ce que la sauvegarde va peser, avant de la demander. */
export interface BackupInfo {
  /** Taille de la base, en octets. */
  database_size: number;
  media_count: number;
  /** Taille cumulée des fichiers déposés, en octets. */
  media_size: number;
  /** Date de la sauvegarde la plus récemment restaurée, vide s'il n'y en a pas. */
  last_restore: string;
}

/** Ce que la restauration a remis en place. */
export interface RestoreResult {
  tables: number;
  rows: number;
  media: number;
}

/** Le nom du fichier proposé au téléchargement, daté du jour. */
export const backupFileName = (date = new Date()): string =>
  `milo-${date.toISOString().slice(0, 10)}.milo.gz`;
