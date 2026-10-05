// A widget's configuration, brought to today's keys.
//
// Configurations stored before the code moved to English carried
// French keys ("encadre", "liste", "libelle"…) and a few French
// values ("numerique", "pluie"…). The database is converted once
// (server, db/migrations.ts); what still arrives from before — an
// exported layout, the browser clipboard, a tab left
// open on the old version — goes through the same function.
//
// It is pure, and only touches what it recognizes: applied to an
// already converted configuration, it returns it as is. When both the old
// and the new key are present, the new one wins.

type Config = Record<string, unknown>;

const isObject = (value: unknown): value is Config =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** Keys common to all widgets: the frame, the margins, the title of an indicator. */
const COMMON_KEYS: Record<string, string> = {
  encadre: "framed",
  margeHaute: "marginTop",
  margeBasse: "marginBottom",
  nom: "name",
  fond: "background",
  taille_titre: "title_size",
  couleur_titre: "title_color",
  taille_valeur: "value_size",
  couleur_valeur: "value_color",
  // Stored by a version that set them; nothing reads them anymore, but
  // they are kept.
  alignement_titre: "title_align",
  alignement_valeur: "value_align",
  couleur_texte: "text_color",
};

const TITLE_KEYS = { titre: "title", couleur: "color", taille: "size" };

const LIST_KEYS = {
  liste: "list_key",
  liste_colonnes: "columns",
  colonnes: "column_visibility",
  ordre_colonnes: "column_order",
  largeurs_colonnes: "column_widths",
};

/** The keys specific to each widget type. */
const TYPE_KEYS: Record<string, Record<string, string>> = {
  category: TITLE_KEYS,
  // The subcategory no longer exists, but a database from before is
  // translated before its subcategories become titles (db/migrations.ts).
  subcategory: TITLE_KEYS,
  link: { libelle: "label", actif: "enabled", couleur: "color" },
  number: { lignes: "lines", libelle: "label", valeur: "value" },
  clock: { fuseau: "timezone", taille: "size", secondes: "seconds", chiffres: "numerals" },
  image: { intervalle: "interval", hauteur: "height", ajustement: "fit" },
  weather: { lieu: "place", taille: "size", afficherLieu: "showPlace", previsions: "forecast" },
  calendar: { rendezVous: "showEvents", liste: "showList" },
  mail: {
    quantite: "count",
    hauteur: "height",
    colonnes: "columns",
    nonLus: "unreadOnly",
    entete: "header",
  },
  todo: {
    elements: "items",
    masquerFaits: "hideDone",
    faitsEnBas: "doneAtBottom",
    progression: "progress",
  },
  rss: { regrouper: "group", quantite: "count", intervalle: "interval" },
  "project.list": LIST_KEYS,
  "task.list": { ...LIST_KEYS, numeros: "show_numbers" },
  "support.list": { ...LIST_KEYS, boites: "mailboxes", suppression: "delete_after_import" },
  "asset.list": LIST_KEYS,
  "support.trend": { jours: "days" },
  "support.senders": { quantite: "count" },
  "support.labels": { toutes: "include_all" },
  "project.labels": { tous: "include_all" },
  "project.categories": { tous: "include_all" },
  "project.actors": { tous: "include_all" },
  "asset.compliance": {
    chiffrement: "encryption",
    disque: "disk",
    inventaire: "inventory",
    systeme: "system",
  },
};

/** The French values of a choice field, by type then by key (the new one). */
const TYPE_VALUES: Record<string, Record<string, Record<string, string>>> = {
  clock: { mode: { numerique: "digital", analogique: "analog" } },
  weather: { forecast: { aucune: "none", pluie: "rain", semaine: "week" } },
};

const MAIL_COLUMNS: Record<string, string> = {
  expediteur: "sender",
  objet: "subject",
  apercu: "preview",
  pieces: "attachments",
};

/** An object with renamed keys; the new key, if already there, wins. */
const renameKeys = (source: Config, keys: Record<string, string>): Config => {
  const result: Config = {};
  for (const [key, value] of Object.entries(source)) {
    const renamed = Object.hasOwn(keys, key) ? keys[key]! : key;
    if (renamed !== key && Object.hasOwn(source, renamed)) continue;
    result[renamed] = value;
  }
  return result;
};

/** Each object of a list, its keys renamed; the rest as is. */
const renameInItems = (value: unknown, keys: Record<string, string>): unknown =>
  Array.isArray(value) ? value.map((v) => (isObject(v) ? renameKeys(v, keys) : v)) : value;

/** A reception (mailbox, tag): its context was called "contexte", then "context". */
const RECEPTION_KEYS = { contexte: "context_id", context: "context_id" };

/**
 * The configuration of a widget of this type, with today's keys and values.
 * What is not an object becomes an empty object.
 */
export const migrateWidgetConfig = (type: string, config: unknown): Config => {
  if (!isObject(config)) return {};
  const result = renameKeys(config, { ...COMMON_KEYS, ...TYPE_KEYS[type] });

  for (const [key, values] of Object.entries(TYPE_VALUES[type] ?? {})) {
    const value = result[key];
    if (typeof value === "string" && Object.hasOwn(values, value)) result[key] = values[value];
  }

  switch (type) {
    case "number": {
      result.lines = renameInItems(result.lines, { libelle: "label", numero: "number" });
      // An item from before multiple lines: its single number becomes
      // the first line.
      const label = typeof result.label === "string" ? result.label : "";
      const number = typeof result.value === "string" ? result.value : "";
      if (!Array.isArray(result.lines)) {
        if (label || number) result.lines = [{ label, number }];
        else delete result.lines;
      }
      delete result.label;
      delete result.value;
      break;
    }
    case "mail":
      if (Array.isArray(result.columns)) {
        result.columns = result.columns.map((c) =>
          typeof c === "string" && Object.hasOwn(MAIL_COLUMNS, c) ? MAIL_COLUMNS[c] : c,
        );
      }
      break;
    case "todo":
      result.items = renameInItems(result.items, { texte: "text", fait: "done" });
      if (result.items === undefined) delete result.items;
      break;
    case "support.list":
      if (result.mailboxes !== undefined) {
        result.mailboxes = renameInItems(result.mailboxes, RECEPTION_KEYS);
      }
      break;
    case "asset.list":
      if (result.tags !== undefined) result.tags = renameInItems(result.tags, RECEPTION_KEYS);
      break;
  }

  // The columns of a list widget: the width of each.
  if (type.endsWith(".list") && result.columns !== undefined) {
    result.columns = renameInItems(result.columns, { largeur: "width" });
  }
  return result;
};
