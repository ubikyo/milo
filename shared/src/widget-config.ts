// La configuration d'un widget, ramenée à ses clés d'aujourd'hui.
//
// Les configurations rangées avant le passage du code en anglais portaient
// des clés françaises (« encadre », « liste », « libelle »…) et quelques
// valeurs françaises (« numerique », « pluie »…). La base est convertie une
// fois (server, db/migrations.ts) ; ce qui arrive encore d'avant — une
// disposition exportée, le presse-papiers du navigateur, un onglet resté
// ouvert sur l'ancienne version — passe par la même fonction.
//
// Elle est pure, et ne touche qu'à ce qu'elle reconnaît : appliquée à une
// configuration déjà convertie, elle la rend telle quelle. Quand l'ancienne
// et la nouvelle clé sont toutes deux là, la nouvelle l'emporte.

type Config = Record<string, unknown>;

const isObject = (value: unknown): value is Config =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** Les clés communes à tous les widgets : le cadre, les marges, le titre d'un indicateur. */
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
  // Rangées par une version qui les réglait ; plus rien ne les lit, mais
  // elles se gardent.
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

/** Les clés propres à chaque type de widget. */
const TYPE_KEYS: Record<string, Record<string, string>> = {
  category: TITLE_KEYS,
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

/** Les valeurs françaises d'un champ à choix, par type puis par clé (la nouvelle). */
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

/** Un objet aux clés renommées ; la nouvelle clé, si elle est déjà là, l'emporte. */
const renameKeys = (source: Config, keys: Record<string, string>): Config => {
  const result: Config = {};
  for (const [key, value] of Object.entries(source)) {
    const renamed = Object.hasOwn(keys, key) ? keys[key]! : key;
    if (renamed !== key && Object.hasOwn(source, renamed)) continue;
    result[renamed] = value;
  }
  return result;
};

/** Chaque objet d'une liste, ses clés renommées ; le reste tel quel. */
const renameInItems = (value: unknown, keys: Record<string, string>): unknown =>
  Array.isArray(value) ? value.map((v) => (isObject(v) ? renameKeys(v, keys) : v)) : value;

/** Une réception (boîte, tag) : son contexte s'appelait « contexte », puis « context ». */
const RECEPTION_KEYS = { contexte: "context_id", context: "context_id" };

/**
 * La configuration d'un widget de ce type, aux clés et aux valeurs
 * d'aujourd'hui. Ce qui n'est pas un objet devient un objet vide.
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
      // Un élément d'avant les lignes multiples : son numéro unique devient
      // la première ligne.
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

  // Les colonnes d'un widget de liste : la largeur de chacune.
  if (type.endsWith(".list") && result.columns !== undefined) {
    result.columns = renameInItems(result.columns, { largeur: "width" });
  }
  return result;
};
