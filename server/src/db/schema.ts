// The schema. It is created empty and is never modified here: an existing
// database goes through the migrations (migrations.ts).

import { CONTACT_SETTINGS_DEFAULTS, WAREHOUSE_SETTINGS_DEFAULTS } from "@milo/shared";
import { DECLARED_ASSET_INDEXES, DECLARED_ASSET_SCHEMA } from "./declared-asset-tables.js";

/** A default list, as a column's SQL default. */
const jsonDefault = (value: unknown): string => `'${JSON.stringify(value).replace(/'/g, "''")}'`;

export const SCHEMA = `
  -- Les workspaces : une équipe chacun. Ses vues, et tout ce qu'elles
  -- portent, ne se voient que depuis lui ; ses accès sont les siens
  -- (principal_permissions). Il en existe toujours au moins un.
  CREATE TABLE IF NOT EXISTS workspaces (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  -- Les vues : ce que le sélecteur du bas propose. Chacune porte ses
  -- tableaux. Elle appartient à celui qui l'a créée ; les autres la voient
  -- dès qu'un de ses tableaux leur est partagé (board_shares). Elle
  -- appartient à un workspace — nul le temps que les rattrapages la lui
  -- donnent (migrations.ts, workspaces). « is_private » ne sert plus.
  CREATE TABLE IF NOT EXISTS views (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    is_private INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );


  -- Les catégories sont propres à un tableau : deux tableaux peuvent nommer
  -- une catégorie de la même façon. Elles forment un arbre — « Interne >
  -- Informatique > Réseau » — : deux catégories d'un même parent ne portent
  -- pas le même nom, ce que vérifie le serveur (routes/project-boards.ts).
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    list_key TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    -- Ancien emplacement des jalons, avant les types de jalons
    -- (milestone_types) : plus lu, gardé pour les bases qui le portent.
    milestones TEXT NOT NULL DEFAULT '[]',
    -- Leur ordre dans le tableau, glissé dans le tiroir du widget « Projets » :
    -- un parent avant ses enfants.
    position INTEGER NOT NULL DEFAULT 0,
    -- Sa catégorie parente, aucune à la racine.
    parent_id INTEGER REFERENCES categories(id)
  );

  -- Les accès d'un utilisateur ou d'un groupe Entra à un workspace : une
  -- permission par type de widget, en JSON — { "helpdesk": "update",
  -- "managed_device_asset": "view", … } (shared, widget-kinds.ts). Sans ligne, aucun accès
  -- au workspace. Désignés par leur identifiant d'objet Entra, qui ne change
  -- pas quand on les renomme ; le nom et l'adresse sont gardés pour
  -- l'affichage. Les notifications reçues dans le workspace, en JSON —
  -- ["screen", "email"], et ce qu'on peut faire de son interface — la
  -- modifier, en importer ou exporter la disposition : ["interface",
  -- "layout"] —, et ses droits sur les vues, tableaux et contextes :
  -- { "views": ["view", "create"], … } (shared, workspace-access.ts). Une
  -- ligne peut
  -- n'accorder rien : elle attend qu'on lui donne des droits. « modes » ne
  -- sert plus : les modes se déduisent des types ; « settings » et
  -- « workspaces » non plus : l'administration vaut pour toute l'application
  -- (principal_admin).
  CREATE TABLE IF NOT EXISTS principal_permissions (
    principal_type TEXT NOT NULL CHECK (principal_type IN ('user', 'group')),
    principal_id TEXT NOT NULL,
    principal_name TEXT NOT NULL DEFAULT '',
    principal_email TEXT NOT NULL DEFAULT '',
    settings TEXT NOT NULL DEFAULT '' CHECK (settings IN ('', 'view', 'update')),
    modes TEXT NOT NULL DEFAULT '[]',
    widgets TEXT NOT NULL DEFAULT '{}',
    workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    workspaces TEXT NOT NULL DEFAULT '' CHECK (workspaces IN ('', 'update')),
    notifications TEXT NOT NULL DEFAULT '[]',
    application TEXT NOT NULL DEFAULT '[]',
    structure TEXT NOT NULL DEFAULT '{}',
    PRIMARY KEY (workspace_id, principal_type, principal_id)
  );

  -- L'administration d'un utilisateur ou d'un groupe Entra, pour toute
  -- l'application : ses droits par section, en JSON — { "settings":
  -- ["access"], "workspaces": ["view", "create"] } (shared, roles.ts). Une
  -- ligne peut n'en porter aucun : elle attend qu'on lui en donne. Sans
  -- ligne, aucun droit. « settings » et « workspaces » ne servent plus : ils
  -- portaient l'administration d'avant ses droits par section.
  CREATE TABLE IF NOT EXISTS principal_admin (
    principal_type TEXT NOT NULL CHECK (principal_type IN ('user', 'group')),
    principal_id TEXT NOT NULL,
    principal_name TEXT NOT NULL DEFAULT '',
    principal_email TEXT NOT NULL DEFAULT '',
    settings TEXT NOT NULL DEFAULT '' CHECK (settings IN ('', 'view', 'update')),
    workspaces TEXT NOT NULL DEFAULT '' CHECK (workspaces IN ('', 'update')),
    rights TEXT NOT NULL DEFAULT '{}',
    PRIMARY KEY (principal_type, principal_id)
  );

  -- Les types de jalons (Commande, Développement…), propres à chaque widget
  -- « Projets » (son tableau et sa clé de liste) : un projet en choisit un des
  -- siens, qui pose les marques et les couleurs de son curseur d'avancement. Les jalons sont un tableau JSON de
  -- { value, label, color }.
  CREATE TABLE IF NOT EXISTS milestone_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    list_key TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL COLLATE NOCASE,
    milestones TEXT NOT NULL DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    -- The reference ("PRJ-12"), counted per "Projets" widget
    -- (repositories/references.ts).
    number INTEGER NOT NULL DEFAULT 0,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    category_id INTEGER NOT NULL REFERENCES categories(id),
    -- No longer used: contexts are labels now (shared, contexts.ts).
    context_id INTEGER REFERENCES contexts(id) ON DELETE CASCADE,
    -- Le widget « Projets » qui le montre : la clé de liste de sa
    -- configuration. Il part avec le dernier widget qui la tient.
    list_key TEXT NOT NULL DEFAULT '',
    -- Facultatif : sans type de jalons, le curseur reste nu.
    milestone_type_id INTEGER REFERENCES milestone_types(id) ON DELETE SET NULL,
    status INTEGER NOT NULL DEFAULT 0 CHECK (status >= 0 AND status <= 100),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL DEFAULT '',
    first_name TEXT NOT NULL DEFAULT '',
    last_name TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL UNIQUE,
    -- Seul le compte « admin » (system) en a un : les autres se connectent
    -- par Microsoft.
    password_hash TEXT NOT NULL DEFAULT '',
    -- Mode ouvert à la connexion : chacun choisit le sien.
    default_mode TEXT NOT NULL DEFAULT 'projects',
    -- La vue d'ouverture : son identifiant, ou vide pour la première. Le
    -- mode d'avant les vues (« default_mode ») ne sert plus.
    default_view TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    -- L'identifiant d'objet Entra (oid), posé à la première connexion par
    -- Microsoft. Vide pour le compte « admin » et pour les comptes d'avant
    -- Entra, qui s'y rattachent par leur e-mail.
    entra_id TEXT NOT NULL DEFAULT '',
    -- Les groupes Entra du compte (identifiants, en JSON), relus à chaque
    -- connexion : ses droits en dépendent.
    entra_groups TEXT NOT NULL DEFAULT '[]',
    -- Le compte « admin » local, qui ne sert qu'au paramétrage.
    system INTEGER NOT NULL DEFAULT 0,
    -- Le workspace où il travaille, choisi dans le sélecteur. Nul, ou un
    -- workspace qu'il n'a plus : le premier des siens.
    workspace_id INTEGER REFERENCES workspaces(id) ON DELETE SET NULL,
    -- The workspace opened at sign-in, chosen in the profile. Null, or one
    -- it no longer has: the one it was working in.
    default_workspace_id INTEGER REFERENCES workspaces(id) ON DELETE SET NULL,
    -- The opening board, in the opening view: its id, or empty for the first.
    default_board TEXT NOT NULL DEFAULT '',
    -- Their notification settings (JSON), chosen in the preferences. Empty,
    -- or a field missing: the application's defaults.
    notification_settings TEXT NOT NULL DEFAULT '',
    -- How an e-mail being written first shows: "content", its text alone;
    -- "layout", in its template.
    reply_editor TEXT NOT NULL DEFAULT 'layout',
    -- The search (Spotlight): whether it forgives typing mistakes, and how
    -- far it strays from what is typed (Fuse.js's threshold, 0 to 1).
    fuzzy_search INTEGER NOT NULL DEFAULT 1,
    search_threshold REAL NOT NULL DEFAULT 0.45,
    -- The kinds of content the search leaves out (JSON list); empty, none.
    search_excluded TEXT NOT NULL DEFAULT ''
  );

  -- Les acteurs favoris de chaque personne : ils passent en tête des listes
  -- où l'on choisit des acteurs, partout dans l'application.
  CREATE TABLE IF NOT EXISTS user_favorites (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    favorite_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, favorite_id)
  );

  -- Les réglages de l'application, par opposition à ceux d'un compte : la
  -- messagerie sortante, la dernière restauration. Une ligne par réglage, sa
  -- valeur en JSON — ils sont peu nombreux et n'ont aucune forme commune, et
  -- une colonne par champ ferait une migration à chaque réglage ajouté.
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT ''
  );

  -- The proxies of "Paramétrage" > "Proxy" (shared/proxies.ts): only their
  -- token's SHA-256 is kept, shown once at its generation. What a connected
  -- proxy says of itself is kept for when it is not.
  CREATE TABLE IF NOT EXISTS proxies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    token_hash TEXT NOT NULL UNIQUE,
    hint TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL DEFAULT '',
    version TEXT NOT NULL DEFAULT '',
    hostname TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT ''
  );

  -- The printers of "Paramétrage" > "Impression": their kind (Zebra only, for
  -- now), their name, their address — reached on port 9100 (lib/zebra.ts),
  -- directly or through a proxy. A proxy deleted leaves them reached directly.
  CREATE TABLE IF NOT EXISTS printers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL DEFAULT 'zebra',
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    host TEXT NOT NULL DEFAULT '',
    proxy_id INTEGER REFERENCES proxies(id) ON DELETE SET NULL
  );

  -- The paper formats printed on (shared/printers.ts): their size in
  -- millimeters, required. A printer deleted leaves its formats without one.
  CREATE TABLE IF NOT EXISTS paper_formats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    printer_id INTEGER REFERENCES printers(id) ON DELETE SET NULL,
    width REAL NOT NULL,
    height REAL NOT NULL
  );

  -- The label templates of a board's asset widgets, kind by kind
  -- (routes/label-templates.ts), as JSON: name, paper format, ZPL.
  CREATE TABLE IF NOT EXISTS board_label_templates (
    board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    list_key TEXT NOT NULL DEFAULT '',
    kind TEXT NOT NULL,
    templates TEXT NOT NULL DEFAULT '[]',
    PRIMARY KEY (board_id, list_key, kind)
  );

  -- The asset number templates of a board's declared asset widgets, kind by
  -- kind (routes/asset-number-templates.ts), as JSON: name, TypeScript — run
  -- by the browser.
  CREATE TABLE IF NOT EXISTS board_asset_number_templates (
    board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    list_key TEXT NOT NULL DEFAULT '',
    kind TEXT NOT NULL,
    templates TEXT NOT NULL DEFAULT '[]',
    PRIMARY KEY (board_id, list_key, kind)
  );

  -- The last reference given in each list widget (repositories/references.ts):
  -- each one numbers its items from 1, and a deleted item's number is not
  -- given again.
  CREATE TABLE IF NOT EXISTS reference_counters (
    scope TEXT PRIMARY KEY,
    last INTEGER NOT NULL DEFAULT 0
  );

  -- Ce que chacun suit : les éléments dont il veut être prévenu quand ils
  -- changent. « kind » vaut « project », « card », « list » ou « support ».
  --
  -- « target_id » ne porte pas de clé étrangère : elle désigne quatre tables
  -- différentes selon « kind ». Une ligne dont la cible a disparu ne gêne
  -- personne — la notification cherche l'élément, ne le trouve pas, et se
  -- tait ; et les identifiants ne se réemploient jamais (AUTOINCREMENT).
  CREATE TABLE IF NOT EXISTS follows (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    target_id INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, kind, target_id)
  );

  -- Les notifications reçues, gardées pour le tiroir « Notifications » : à
  -- l'écran, elles passent et s'effacent ; ici, elles restent jusqu'à ce que
  -- la personne les supprime. Seules les plus récentes sont gardées
  -- (repositories/notifications.ts). « id » est celui que le serveur tire au
  -- sort en l'émettant, le même que celui de la notification à l'écran.
  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    target_id INTEGER NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    message TEXT NOT NULL DEFAULT '',
    author TEXT NOT NULL DEFAULT '',
    -- 1 quand la notification annonce la suppression de l'élément : il n'y a
    -- alors plus rien à ouvrir.
    deleted INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    -- Dernier usage du jeton, et date au-delà de laquelle il ne vaut plus
    -- rien. Une session oubliée finit par se fermer d'elle-même.
    last_seen_at TEXT NOT NULL DEFAULT '',
    expires_at TEXT NOT NULL DEFAULT ''
  );

  -- The API tokens of "Paramétrage" > "API" (shared/api-tokens.ts). Each
  -- one acts as its own service account ("user_id", users.system = 2), kept
  -- when the token is revoked: what it wrote keeps its author. Only the
  -- token's SHA-256 is stored.
  CREATE TABLE IF NOT EXISTS api_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    hint TEXT NOT NULL DEFAULT '',
    access TEXT NOT NULL DEFAULT 'read',
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL,
    last_used_at TEXT NOT NULL DEFAULT '',
    expires_at TEXT NOT NULL DEFAULT ''
  );

  -- The workspaces an API token reaches.
  CREATE TABLE IF NOT EXISTS api_token_workspaces (
    token_id INTEGER NOT NULL REFERENCES api_tokens(id) ON DELETE CASCADE,
    workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    PRIMARY KEY (token_id, workspace_id)
  );

  -- Acteurs d'un projet : association vers les utilisateurs.
  CREATE TABLE IF NOT EXISTS project_actors (
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (project_id, user_id)
  );

  -- Étiquettes d'un tableau de projets : un nom et une couleur, posés sur ses
  -- projets. Jumelles de celles des cartes (« labels »), mais rattachées à un
  -- tableau de projets : les deux modes ne partagent pas leurs étiquettes.
  -- Groups of a projects board's labels: every label belongs to one, and
  -- the groups are ordered among themselves.
  CREATE TABLE IF NOT EXISTS project_label_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    list_key TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS project_labels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    list_key TEXT NOT NULL DEFAULT '',
    -- Its group, on the same board. "position" orders the whole board,
    -- group after group (repositories/label-groups.ts).
    group_id INTEGER REFERENCES project_label_groups(id),
    name TEXT NOT NULL,
    -- « teinte.nuance » de la palette Mantine, par exemple « red.6 ».
    color TEXT NOT NULL DEFAULT 'blue.6',
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS project_label_links (
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    label_id INTEGER NOT NULL REFERENCES project_labels(id) ON DELETE CASCADE,
    PRIMARY KEY (project_id, label_id)
  );

  -- Les tableaux d'une vue : ses onglets. Un tableau contient ses projets et
  -- ses listes de tâches, et ses sections de widgets. Il appartient à celui
  -- qui l'a créé, et se montre à ceux à qui il est partagé (board_shares).
  -- « all_contexts_label » : le libellé, renommable, de l'entrée qui montre
  -- tous ses contextes. « is_private » ne sert plus.
  CREATE TABLE IF NOT EXISTS boards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    view_id INTEGER NOT NULL REFERENCES views(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    all_contexts_label TEXT NOT NULL DEFAULT 'Tous les contextes',
    -- The label group that gives the board its contexts, by its name — the
    -- same name in each kind of labels its lists use; empty: none.
    context_group TEXT NOT NULL DEFAULT '',
    position INTEGER NOT NULL DEFAULT 0,
    show_card_numbers INTEGER NOT NULL DEFAULT 1,
    owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    is_private INTEGER NOT NULL DEFAULT 0,
    is_locked INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  -- Les partages d'un tableau, faits depuis « Partager » sur sa vue : à un
  -- utilisateur ou un groupe Entra, désigné par son identifiant d'objet ; le
  -- nom et l'adresse sont gardés pour l'affichage. « read » : lecture seule,
  -- sa disposition ne se modifie pas ; « full » : contrôle total, tout sauf
  -- le supprimer et le partager.
  CREATE TABLE IF NOT EXISTS board_shares (
    board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    principal_type TEXT NOT NULL CHECK (principal_type IN ('user', 'group')),
    principal_id TEXT NOT NULL,
    principal_name TEXT NOT NULL DEFAULT '',
    principal_email TEXT NOT NULL DEFAULT '',
    level TEXT NOT NULL CHECK (level IN ('read', 'full')),
    PRIMARY KEY (board_id, principal_type, principal_id)
  );

  -- No longer used: a board's contexts are the labels of the groups its
  -- lists choose (shared, contexts.ts). Emptied once its contexts became
  -- labels (migrations.ts, labelContexts).
  CREATE TABLE IF NOT EXISTS contexts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  -- The context each person chose in a board: a label name. Without a row,
  -- or empty: all contexts. "context_id" is no longer used.
  CREATE TABLE IF NOT EXISTS user_board_contexts (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    context_id INTEGER REFERENCES contexts(id) ON DELETE SET NULL,
    context_name TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (user_id, board_id)
  );

  -- Les sections d'un tableau : ses colonnes. « owner_id » ne sert plus :
  -- il désignait la structure propre à un compte, du temps de « Hérité ».
  CREATE TABLE IF NOT EXISTS board_sections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    width_unit TEXT NOT NULL DEFAULT 'auto'
      CHECK (width_unit IN ('auto', 'percent', 'px')),
    width_value REAL,
    gap INTEGER NOT NULL DEFAULT 50,
    position INTEGER NOT NULL DEFAULT 0,
    owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
  );

  -- Ce qu'une section porte : les widgets du client. Le serveur ne connaît
  -- pas leur configuration — il range le JSON que le widget lui donne et le
  -- rend tel quel. « type » désigne le widget (shared, BOARD_WIDGET_TYPES).
  CREATE TABLE IF NOT EXISTS board_widgets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    section_id INTEGER NOT NULL REFERENCES board_sections(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    config TEXT NOT NULL DEFAULT '{}',
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );


  -- Listes d'un tableau (ses colonnes).
  CREATE TABLE IF NOT EXISTS task_lists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    -- Couleur d'arrière-plan choisie dans le menu de la liste ; vide = aucune.
    color TEXT NOT NULL DEFAULT '',
    -- Le widget « Tâches » qui la montre, comme pour un projet.
    list_key TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );

  -- Cartes d'une liste du mode Tâche. Elles disparaissent avec leur liste
  -- (ON DELETE CASCADE) ; « position » porte leur ordre dans la liste.
  CREATE TABLE IF NOT EXISTS task_cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    list_id INTEGER NOT NULL REFERENCES task_lists(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    -- The reference ("TSK-12"), counted per "Tâches" widget
    -- (repositories/references.ts). A separator carries none: it stays at
    -- zero.
    number INTEGER NOT NULL DEFAULT 0,
    -- No longer used: contexts are labels now.
    context_id INTEGER REFERENCES contexts(id) ON DELETE CASCADE,
    -- « card » pour une carte, « separator » pour un séparateur : un simple
    -- intitulé posé entre deux cartes, qui se déplace comme elles.
    kind TEXT NOT NULL DEFAULT 'card',
    -- Description longue, saisie en texte enrichi et conservée en HTML. Vide
    -- pour un séparateur, qui n'a pas de fiche.
    description TEXT NOT NULL DEFAULT '',
    -- Échéance de la carte, en ISO 8601 avec l'heure (« 2026-10-05T17:00:00.000Z »)
    -- et non en « AAAA-MM-JJ » comme celle d'un élément de checklist : une
    -- carte se rend pour une heure dite. Vide plutôt que NULL, comme partout
    -- ailleurs : une échéance absente se lit de la même façon.
    due_date TEXT NOT NULL DEFAULT '',
    -- Le début de la période (« AAAA-MM-JJ »), quand l'échéance va « du … au
    -- … » ; vide quand elle ne dit que « jusqu'à ».
    start_date TEXT NOT NULL DEFAULT '',
    -- La forme de l'échéance : « date » seule, ou « period » (début et fin).
    due_form TEXT NOT NULL DEFAULT 'date',
    -- La récurrence et le rappel de l'échéance (shared/echeance.ts) ; vides
    -- pour « Jamais » et « Aucun ».
    recurrence TEXT NOT NULL DEFAULT '',
    reminder TEXT NOT NULL DEFAULT '',
    -- L'échéance dont le rappel est parti : il ne repart pas, sauf si
    -- l'échéance ou le rappel changent.
    reminded_for TEXT NOT NULL DEFAULT '',
    -- L'échéance dont le dépassement a été signalé, sur le même principe.
    overdue_for TEXT NOT NULL DEFAULT '',
    -- Les secondes entre deux images de couverture sur le tableau ; zéro, la
    -- première reste en place.
    cover_interval INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  -- Membres d'une carte : les mêmes utilisateurs que les acteurs d'un projet.
  CREATE TABLE IF NOT EXISTS card_members (
    card_id INTEGER NOT NULL REFERENCES task_cards(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (card_id, user_id)
  );

  -- Étiquettes d'un tableau : un nom et une couleur, posés sur ses cartes.
  -- Elles appartiennent au tableau, comme les catégories d'un tableau de
  -- projets : deux tableaux peuvent nommer la même étiquette.
  -- Groups of a board's labels: every label belongs to one, and the groups
  -- are ordered among themselves.
  CREATE TABLE IF NOT EXISTS label_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    list_key TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS labels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    list_key TEXT NOT NULL DEFAULT '',
    -- Its group, on the same board. "position" orders the whole board,
    -- group after group (repositories/label-groups.ts).
    group_id INTEGER REFERENCES label_groups(id),
    name TEXT NOT NULL,
    -- « teinte.nuance » de la palette Mantine, par exemple « red.6 ».
    color TEXT NOT NULL DEFAULT 'blue.6',
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  -- Labels of a board's assets, in their groups, like those of projects. They
  -- are set on no machine: a machine carries the label named as its GLPI
  -- agent tag, case aside (repositories/assets.ts).
  CREATE TABLE IF NOT EXISTS managed_device_asset_label_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    list_key TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS managed_device_asset_labels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    list_key TEXT NOT NULL DEFAULT '',
    group_id INTEGER REFERENCES managed_device_asset_label_groups(id),
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT 'blue.6',
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  -- The declared assets — equipment, applications —, kind by kind
  -- (declared-asset-tables.ts).
${DECLARED_ASSET_SCHEMA}
  -- The contacts of a board's "Contact" widgets (shared, contacts.ts): their
  -- e-mails, phones, addresses and websites as JSON lists, in their order; a
  -- company's payment terms and currency, names from its board's lists.
  CREATE TABLE IF NOT EXISTS contact_label_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    list_key TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS contact_labels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    list_key TEXT NOT NULL DEFAULT '',
    group_id INTEGER REFERENCES contact_label_groups(id),
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT 'blue.6',
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    list_key TEXT NOT NULL DEFAULT '',
    first_name TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'person',
    job_title TEXT NOT NULL DEFAULT '',
    emails TEXT NOT NULL DEFAULT '[]',
    phones TEXT NOT NULL DEFAULT '[]',
    addresses TEXT NOT NULL DEFAULT '[]',
    websites TEXT NOT NULL DEFAULT '[]',
    payment_term TEXT NOT NULL DEFAULT '',
    currency TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS contact_label_links (
    contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    label_id INTEGER NOT NULL REFERENCES contact_labels(id) ON DELETE CASCADE,
    PRIMARY KEY (contact_id, label_id)
  );

  -- A company's people: contacts of its board, in their order.
  CREATE TABLE IF NOT EXISTS contact_members (
    company_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    member_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    position INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (company_id, member_id)
  );

  -- A contact's thread, as a card's: Milo notes its creation and its edits
  -- there (lib/history.ts).
  CREATE TABLE IF NOT EXISTS contact_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    text TEXT NOT NULL,
    system INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- A board's contact lists, as JSON: its defaults until it records its own.
  CREATE TABLE IF NOT EXISTS board_contact_settings (
    board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    list_key TEXT NOT NULL DEFAULT '',
    payment_terms TEXT NOT NULL DEFAULT ${jsonDefault(CONTACT_SETTINGS_DEFAULTS.payment_terms)},
    currencies TEXT NOT NULL DEFAULT ${jsonDefault(CONTACT_SETTINGS_DEFAULTS.currencies)},
    countries TEXT NOT NULL DEFAULT ${jsonDefault(CONTACT_SETTINGS_DEFAULTS.countries)},
    PRIMARY KEY (board_id, list_key)
  );
  -- The warehouses of a board's "Entrepôts" widgets (shared, warehouses.ts):
  -- their name and their address, as a contact's.
  CREATE TABLE IF NOT EXISTS warehouse_label_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    list_key TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS warehouse_labels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    list_key TEXT NOT NULL DEFAULT '',
    group_id INTEGER REFERENCES warehouse_label_groups(id),
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT 'blue.6',
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS warehouses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    list_key TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    line1 TEXT NOT NULL DEFAULT '',
    line2 TEXT NOT NULL DEFAULT '',
    postal_code TEXT NOT NULL DEFAULT '',
    city TEXT NOT NULL DEFAULT '',
    country TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS warehouse_label_links (
    warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
    label_id INTEGER NOT NULL REFERENCES warehouse_labels(id) ON DELETE CASCADE,
    PRIMARY KEY (warehouse_id, label_id)
  );

  -- A widget's warehouse lists, as JSON: its defaults until it records its own.
  CREATE TABLE IF NOT EXISTS board_warehouse_settings (
    board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    list_key TEXT NOT NULL DEFAULT '',
    countries TEXT NOT NULL DEFAULT ${jsonDefault(WAREHOUSE_SETTINGS_DEFAULTS.countries)},
    PRIMARY KEY (board_id, list_key)
  );

  -- The locations of a board's "Emplacements" widgets (shared, locations.ts):
  -- their name, their warehouse, and their places — a tree, as JSON, each
  -- place with its name, its type and its code.
  CREATE TABLE IF NOT EXISTS location_label_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    list_key TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS location_labels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    list_key TEXT NOT NULL DEFAULT '',
    group_id INTEGER REFERENCES location_label_groups(id),
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT 'blue.6',
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    list_key TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    warehouse_id INTEGER REFERENCES warehouses(id) ON DELETE SET NULL,
    places TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS location_label_links (
    location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    label_id INTEGER NOT NULL REFERENCES location_labels(id) ON DELETE CASCADE,
    PRIMARY KEY (location_id, label_id)
  );

  -- The products of a board's "Produits" widgets (shared, products.ts): their
  -- variants — its own attributes and their colored values — as a JSON list,
  -- in their order; their photos, documents and comments as a declared
  -- asset's and a card's.
  CREATE TABLE IF NOT EXISTS product_label_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    list_key TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS product_labels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    list_key TEXT NOT NULL DEFAULT '',
    group_id INTEGER REFERENCES product_label_groups(id),
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT 'blue.6',
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    list_key TEXT NOT NULL DEFAULT '',
    sku TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0,
    favorite INTEGER NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '',
    tracking TEXT NOT NULL DEFAULT 'none',
    category TEXT NOT NULL DEFAULT '',
    variants TEXT NOT NULL DEFAULT '[]',
    suppliers TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS product_label_links (
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    label_id INTEGER NOT NULL REFERENCES product_labels(id) ON DELETE CASCADE,
    PRIMARY KEY (product_id, label_id)
  );

  -- A board's product lists, as JSON: its categories tree, stored flat.
  CREATE TABLE IF NOT EXISTS board_product_settings (
    board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    list_key TEXT NOT NULL DEFAULT '',
    categories TEXT NOT NULL DEFAULT '[]',
    taxes TEXT NOT NULL DEFAULT '[{"rate":20},{"rate":0}]',
    PRIMARY KEY (board_id, list_key)
  );

  CREATE TABLE IF NOT EXISTS product_photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    file TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    size INTEGER NOT NULL DEFAULT 0,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS product_attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    file TEXT NOT NULL,
    name TEXT NOT NULL,
    mime TEXT NOT NULL DEFAULT '',
    size INTEGER NOT NULL DEFAULT 0,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS product_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    text TEXT NOT NULL,
    system INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  -- The orders of a board's "Commandes" widgets (shared, orders.ts): their
  -- supplier — a company of a Contact widget — and its currency frozen at
  -- each save, their lines as a JSON list, in their order; their actors,
  -- labels and comments as a product's.
  CREATE TABLE IF NOT EXISTS order_label_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    list_key TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS order_labels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    list_key TEXT NOT NULL DEFAULT '',
    group_id INTEGER REFERENCES order_label_groups(id),
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT 'blue.6',
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    list_key TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'quote',
    supplier_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
    supplier_name TEXT NOT NULL DEFAULT '',
    currency TEXT NOT NULL DEFAULT '',
    due_date TEXT NOT NULL DEFAULT '',
    warehouse_id INTEGER REFERENCES warehouses(id) ON DELETE SET NULL,
    lines TEXT NOT NULL DEFAULT '[]',
    ordered_at TEXT NOT NULL DEFAULT '',
    -- Its numbers, each with the index of its format's count it was drawn with.
    quote_number TEXT NOT NULL DEFAULT '',
    quote_index INTEGER NOT NULL DEFAULT 0,
    order_number TEXT NOT NULL DEFAULT '',
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- An order's documents — a supplier's quote —, as a product's.
  CREATE TABLE IF NOT EXISTS order_attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    -- "document", or "invoice": the order's invoice, once it is one.
    kind TEXT NOT NULL DEFAULT 'document',
    file TEXT NOT NULL,
    name TEXT NOT NULL,
    mime TEXT NOT NULL DEFAULT '',
    size INTEGER NOT NULL DEFAULT 0,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  -- A "Commandes" widget's numbering formats, by format, as JSON (routes/orders.ts).
  CREATE TABLE IF NOT EXISTS board_order_settings (
    board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    list_key TEXT NOT NULL DEFAULT '',
    number_templates TEXT NOT NULL DEFAULT '{}',
    PRIMARY KEY (board_id, list_key)
  );

  CREATE TABLE IF NOT EXISTS order_label_links (
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    label_id INTEGER NOT NULL REFERENCES order_labels(id) ON DELETE CASCADE,
    PRIMARY KEY (order_id, label_id)
  );

  CREATE TABLE IF NOT EXISTS order_actors (
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (order_id, user_id)
  );

  -- An order's actors among its supplier's contacts: the company, its people.
  CREATE TABLE IF NOT EXISTS order_contact_actors (
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    PRIMARY KEY (order_id, contact_id)
  );

  -- An order's exchanges: the e-mails sent from Milo to its supplier contacts.
  CREATE TABLE IF NOT EXISTS order_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    kind TEXT NOT NULL DEFAULT '',
    -- The order's status when it was sent: "quote", "order", "cancelled".
    order_status TEXT NOT NULL DEFAULT '',
    text TEXT NOT NULL DEFAULT '',
    mail_status TEXT NOT NULL DEFAULT '',
    mail_to TEXT NOT NULL DEFAULT '',
    mail_cc TEXT NOT NULL DEFAULT '',
    mail_bcc TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS order_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    text TEXT NOT NULL,
    system INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  -- The tables of a board's managed device asset widgets
  -- (lib/managed-device-asset-models.ts, lib/managed-device-asset-vlans.ts), as JSON. models NULL: the starting table of Apple
  -- models; vlans: none until the board records some.
  CREATE TABLE IF NOT EXISTS board_managed_device_asset_settings (
    board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    list_key TEXT NOT NULL DEFAULT '',
    models TEXT,
    vlans TEXT NOT NULL DEFAULT '[]',
    PRIMARY KEY (board_id, list_key)
  );

  CREATE TABLE IF NOT EXISTS card_labels (
    card_id INTEGER NOT NULL REFERENCES task_cards(id) ON DELETE CASCADE,
    label_id INTEGER NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
    PRIMARY KEY (card_id, label_id)
  );

  -- Checklists d'une carte : une carte en porte autant qu'elle veut, chacune
  -- avec son titre et ses éléments. « position » range les checklists entre
  -- elles, sous la fiche de la carte.
  CREATE TABLE IF NOT EXISTS card_checklists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id INTEGER NOT NULL REFERENCES task_cards(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'Checklist',
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  -- Éléments d'une checklist : un libellé, une case cochée ou non, une date
  -- d'échéance facultative (« AAAA-MM-JJ », comme les sélecteurs de Mantine)
  -- et des membres. Ils se glissent pour être réordonnés : « position » porte
  -- cet ordre.
  CREATE TABLE IF NOT EXISTS checklist_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    checklist_id INTEGER NOT NULL REFERENCES card_checklists(id) ON DELETE CASCADE,
    text TEXT NOT NULL DEFAULT '',
    done INTEGER NOT NULL DEFAULT 0,
    -- Vide plutôt que NULL : une date absente se lit de la même façon partout.
    due_date TEXT NOT NULL DEFAULT '',
    -- La date dont le dépassement a été signalé : il ne l'est qu'une fois.
    overdue_for TEXT NOT NULL DEFAULT '',
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  -- Membres d'un élément de checklist : les mêmes utilisateurs que les membres
  -- d'une carte, choisis élément par élément.
  CREATE TABLE IF NOT EXISTS checklist_item_members (
    item_id INTEGER NOT NULL REFERENCES checklist_items(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (item_id, user_id)
  );

  -- Pièces jointes d'une carte : les fichiers déposés dessus. Le fichier, lui,
  -- vit dans le dossier des médias (lib/media.ts) ; la ligne n'en garde que
  -- le nom de rangement et de quoi l'afficher.
  CREATE TABLE IF NOT EXISTS card_attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id INTEGER NOT NULL REFERENCES task_cards(id) ON DELETE CASCADE,
    -- Nom du fichier dans le dossier des médias : seize octets tirés au sort
    -- et une extension. Jamais unique par construction — la copie d'une liste
    -- reprend le même fichier pour la carte copiée, qui le partage alors.
    file TEXT NOT NULL,
    -- Le nom d'origine, celui qui s'affiche.
    name TEXT NOT NULL,
    mime TEXT NOT NULL DEFAULT '',
    -- En octets.
    size INTEGER NOT NULL DEFAULT 0,
    -- Qui l'a déposé. Le compte supprimé laisse la pièce jointe en place.
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    -- L'ordre dans la fiche ; une pièce déposée se range en tête.
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  -- Images de couverture d'une carte : des fichiers du dossier des médias,
  -- rangés entre eux. La première est celle que montre la carte sur le
  -- tableau.
  CREATE TABLE IF NOT EXISTS card_covers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id INTEGER NOT NULL REFERENCES task_cards(id) ON DELETE CASCADE,
    file TEXT NOT NULL,
    -- Le nom d'origine et la taille en octets, comme une pièce jointe.
    name TEXT NOT NULL DEFAULT '',
    size INTEGER NOT NULL DEFAULT 0,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  -- Dépendances entre cartes : « bloque », « est le parent de », « est lié
  -- à », « est un doublon de ». Une liaison s'écrit une fois, de sa source vers
  -- sa cible ; la cible la lit à l'envers (shared, dependances.ts). Elle part
  -- avec l'une ou l'autre carte.
  CREATE TABLE IF NOT EXISTS card_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id INTEGER NOT NULL REFERENCES task_cards(id) ON DELETE CASCADE,
    target_id INTEGER NOT NULL REFERENCES task_cards(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (source_id, target_id, kind)
  );

  -- Commentaires d'une carte. Table à part de ceux des projets : les deux
  -- fils ne se mélangent pas, et « comments » garde son projet obligatoire.
  CREATE TABLE IF NOT EXISTS card_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id INTEGER NOT NULL REFERENCES task_cards(id) ON DELETE CASCADE,
    -- Le commentaire perd son auteur, mais pas son texte, si le compte est
    -- supprimé.
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    text TEXT NOT NULL,
    -- Voir « comments.system ».
    system INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );





  -- Les tickets. The inbox they arrived in may give them a label: the one its
  -- request list associates with it.
  CREATE TABLE IF NOT EXISTS support_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    -- The board that shows it. "context_id" is no longer used: contexts are
    -- labels now.
    board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    context_id INTEGER REFERENCES contexts(id) ON DELETE CASCADE,
    -- La boîte où elle est arrivée, d'où partent les réponses ; vide pour une
    -- demande saisie.
    mailbox TEXT NOT NULL DEFAULT '',
    -- Le widget « Tickets » qui la montre, comme pour un projet.
    list_key TEXT NOT NULL DEFAULT '',
    -- The ticket number ("HLP-12"), counted per "Tickets" widget
    -- (repositories/references.ts).
    number INTEGER NOT NULL DEFAULT 0,
    -- L'objet de l'e-mail reçu, ou celui qu'on a saisi.
    subject TEXT NOT NULL DEFAULT '',
    -- Les onglets du mode, moins « Tous » qui ne filtre rien
    -- (shared/domain.ts).
    status TEXT NOT NULL DEFAULT 'new'
      CHECK (status IN ('new', 'open', 'pending', 'resolved', 'closed')),
    -- Échéance, en ISO 8601 avec l'heure, comme celle d'une carte. Vide
    -- plutôt que NULL : une échéance absente se lit de la même façon partout.
    due_date TEXT NOT NULL DEFAULT '',
    -- Qui a écrit à la boîte de support ; vides pour une demande saisie.
    sender_name TEXT NOT NULL DEFAULT '',
    sender_email TEXT NOT NULL DEFAULT '',
    -- L'identifiant Internet (Message-ID) de l'e-mail d'origine : c'est lui
    -- qui empêche d'importer deux fois le même message. Vide pour une demande
    -- saisie.
    mail_id TEXT NOT NULL DEFAULT '',
    -- La conversation de Graph où l'e-mail est arrivé : une réponse de
    -- l'expéditeur y arrive aussi, et rejoint la demande.
    conversation_id TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- Acteurs d'une demande : ceux qui s'en occupent, comme les membres d'une
  -- carte. Une demande en porte autant qu'il faut.
  CREATE TABLE IF NOT EXISTS support_request_actors (
    request_id INTEGER NOT NULL REFERENCES support_requests(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (request_id, user_id)
  );

  -- Support labels: twins of the cards', bounded like them by their board.
  -- Groups of the Support labels: every label belongs to one, and the
  -- groups are ordered among themselves.
  CREATE TABLE IF NOT EXISTS support_label_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id INTEGER REFERENCES boards(id) ON DELETE CASCADE,
    list_key TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS support_labels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    -- Its board: null only for a database from before (migrations.ts,
    -- supportLabelsByBoard).
    board_id INTEGER REFERENCES boards(id) ON DELETE CASCADE,
    list_key TEXT NOT NULL DEFAULT '',
    -- Its group, on the same board. "position" orders the whole board,
    -- group after group (repositories/label-groups.ts).
    group_id INTEGER REFERENCES support_label_groups(id),
    name TEXT NOT NULL,
    -- « teinte.nuance » de la palette Mantine, par exemple « red.6 ».
    color TEXT NOT NULL DEFAULT 'blue.6',
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  -- Les réponses par défaut du Support, réglées au Paramétrage : un intitulé,
  -- et son modèle HTML (l'éditeur). « text », la version texte d'autrefois,
  -- ne sert plus.
  CREATE TABLE IF NOT EXISTS support_replies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    html TEXT NOT NULL DEFAULT '',
    text TEXT NOT NULL DEFAULT '',
    -- L'évènement qui l'envoie d'office à l'expéditeur : « new », « closed »…
    -- Vide : aucun. Un évènement n'appartient qu'à une réponse.
    event TEXT NOT NULL DEFAULT ''
  );

  -- Les contenus par défaut du Support : ce qui se pose d'office dans
  -- l'éditeur d'une réponse de l'équipe — une signature… L'évènement dit
  -- quand (« all », « new »…) ; vide : jamais. Un évènement n'appartient
  -- qu'à un contenu.
  CREATE TABLE IF NOT EXISTS support_contents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    html TEXT NOT NULL DEFAULT '',
    event TEXT NOT NULL DEFAULT ''
  );

  -- Les contenus par défaut des commandes, comme ceux du Support : posés
  -- dans l'éditeur d'un e-mail au fournisseur. L'évènement dit lequel
  -- (« all », « quote_request »…) ; vide : jamais.
  CREATE TABLE IF NOT EXISTS order_contents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    html TEXT NOT NULL DEFAULT '',
    event TEXT NOT NULL DEFAULT '',
    position INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS support_request_labels (
    request_id INTEGER NOT NULL REFERENCES support_requests(id) ON DELETE CASCADE,
    label_id INTEGER NOT NULL REFERENCES support_labels(id) ON DELETE CASCADE,
    PRIMARY KEY (request_id, label_id)
  );

  -- Le fil d'une demande, table à part comme celui des cartes : les fils ne se
  -- mélangent pas.
  CREATE TABLE IF NOT EXISTS support_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id INTEGER NOT NULL REFERENCES support_requests(id) ON DELETE CASCADE,
    -- Le commentaire perd son auteur, mais pas son texte, si le compte est
    -- supprimé.
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    text TEXT NOT NULL,
    -- Voir « comments.system ».
    system INTEGER NOT NULL DEFAULT 0,
    -- L'expéditeur d'un e-mail reçu, quand aucun compte ne lui correspond :
    -- le message garde ainsi son auteur.
    sender_name TEXT NOT NULL DEFAULT '',
    sender_email TEXT NOT NULL DEFAULT '',
    -- Une réponse de l'équipe à un e-mail : partie (« sent »), simulée
    -- (« simulated »), refusée (« failed »), ou vide si elle n'avait pas à
    -- partir. « mail_to » dit à qui.
    mail_status TEXT NOT NULL DEFAULT '',
    mail_to TEXT NOT NULL DEFAULT '',
    -- Les adresses en copie et en copie cachée d'une réponse, séparées par
    -- des virgules.
    mail_cc TEXT NOT NULL DEFAULT '',
    mail_bcc TEXT NOT NULL DEFAULT '',
    -- Un commentaire interne à l'équipe (onglet « Commentaires ») : du texte
    -- simple, qui ne part jamais par e-mail. 0 : un échange avec l'expéditeur.
    internal INTEGER NOT NULL DEFAULT 0,
    -- L'identifiant Internet (Message-ID) de l'e-mail que porte le message :
    -- reçu, ou parti de Milo. Une réponse qui le cite rejoint la demande.
    mail_id TEXT NOT NULL DEFAULT '',
    -- « email » : le HTML d'un e-mail reçu, montré tel quel dans un cadre
    -- isolé. Vide : le HTML de l'éditeur.
    format TEXT NOT NULL DEFAULT '',
    -- Les fichiers de l'e-mail — images intégrées et pièces jointes —, en
    -- JSON. Rangés dans le dossier des tickets (lib/ticket-files.ts).
    attachments TEXT NOT NULL DEFAULT '[]',
    -- Une réponse par défaut partie d'office, signée Milo : l'évènement qui
    -- l'a envoyée (« new », « closed »…). Vide : un message écrit.
    auto_event TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- L'ordre des onglets, propre à chaque compte : chacun range les siens sans
  -- toucher ceux des autres. « scope » nomme la rangée — « views » (le
  -- sélecteur du bas), ou « boards:<vue> » pour les tableaux d'une vue.
  -- « ids » est la liste rangée, en JSON (chaînes). Sans ligne, la rangée
  -- garde son ordre commun.
  CREATE TABLE IF NOT EXISTS user_tab_orders (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scope TEXT NOT NULL,
    ids TEXT NOT NULL DEFAULT '[]',
    PRIMARY KEY (user_id, scope)
  );

  -- Ne sert plus : les structures qu'un compte n'héritait plus, du temps de
  -- « Hérité ». Gardée pour les rattrapages qui la lisent.
  CREATE TABLE IF NOT EXISTS personal_layouts (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scope TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, scope)
  );

  -- La confirmation des boîtes de support : une adresse posée dans une liste
  -- de demandes ne se relève qu'une fois confirmée par le code que sa boîte
  -- a reçu (lib/optin.ts). Une ligne par liste et par adresse, en minuscules :
  -- chaque liste demande la sienne, même pour une adresse qu'une autre a
  -- déjà confirmée. « list_key » est la clé de liste du widget (CLE_DE_LISTE),
  -- que sa copie personnelle garde. « code » est le code à quatre chiffres
  -- du dernier e-mail envoyé, à saisir dans Milo ; « attempts » compte les
  -- codes faux. « confirmed_at », vide tant qu'elle attend, borne aussi la
  -- relève : rien de ce qui est arrivé avant n'est importé.
  CREATE TABLE IF NOT EXISTS list_mailbox_optins (
    list_key TEXT NOT NULL,
    email TEXT NOT NULL,
    code TEXT NOT NULL DEFAULT '',
    attempts INTEGER NOT NULL DEFAULT 0,
    sent_at TEXT NOT NULL DEFAULT '',
    confirmed_at TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    PRIMARY KEY (list_key, email)
  );

  -- The consent of the people whose Outlook calendar a Calendar widget shows
  -- (lib/calendar-optin.ts): an address set in the widget is only read once
  -- its owner has passed on the code their inbox received. One row per widget
  -- — its key (CALENDAR_KEY), which its personal copy keeps — and per
  -- address, in lowercase. The columns are those of list_mailbox_optins.
  CREATE TABLE IF NOT EXISTS calendar_optins (
    calendar_key TEXT NOT NULL,
    email TEXT NOT NULL,
    code TEXT NOT NULL DEFAULT '',
    attempts INTEGER NOT NULL DEFAULT 0,
    sent_at TEXT NOT NULL DEFAULT '',
    confirmed_at TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    PRIMARY KEY (calendar_key, email)
  );

  -- The same, for the people whose mailbox a Mail widget reads
  -- (lib/mail-optin.ts), by its key (MAIL_KEY).
  CREATE TABLE IF NOT EXISTS mail_optins (
    mail_key TEXT NOT NULL,
    email TEXT NOT NULL,
    code TEXT NOT NULL DEFAULT '',
    attempts INTEGER NOT NULL DEFAULT 0,
    sent_at TEXT NOT NULL DEFAULT '',
    confirmed_at TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    PRIMARY KEY (mail_key, email)
  );

  -- Les flux des widgets RSS, tels que la dernière relève les a laissés. Un
  -- flux se range par son adresse, pas par élément : deux éléments qui suivent
  -- la même source n'en font qu'une relève. « articles » est la liste déjà
  -- lue, en JSON, à hauteur de la plus grande quantité demandée (« quantity »).
  -- « fetched_at » est la dernière relève réussie ; « tried_at » la dernière
  -- tentative, et « error » ce qui l'a fait échouer — les articles d'avant
  -- restent servis en attendant.
  CREATE TABLE IF NOT EXISTS access_feeds (
    url TEXT PRIMARY KEY,
    articles TEXT NOT NULL DEFAULT '[]',
    quantity INTEGER NOT NULL DEFAULT 0,
    fetched_at TEXT,
    tried_at TEXT NOT NULL,
    error TEXT NOT NULL DEFAULT ''
  );

  -- « system » marque les mots que l'application écrit elle-même, comme celui
  -- qui note la création : ils content un fait, ils ne se modifient ni ne se
  -- suppriment.
  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    -- Auteur du commentaire. Il perd son auteur, mais pas son texte, si le
    -- compte a été supprimé ; il est vide pour les commentaires d'avant.
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    text TEXT NOT NULL,
    system INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- Les documents d'un projet, comme les pièces jointes d'une carte : un
  -- fichier de « medias », cité ici sous son nom d'origine.
  CREATE TABLE IF NOT EXISTS project_attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    file TEXT NOT NULL,
    name TEXT NOT NULL,
    mime TEXT NOT NULL DEFAULT '',
    size INTEGER NOT NULL DEFAULT 0,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  -- Les postes du mode Assets : ce qu'un agent d'inventaire (FusionInventory,
  -- GLPI Agent) remonte d'une machine.
  --
  -- L'inventaire entier est gardé tel quel, en JSON, plutôt que découpé en
  -- colonnes : on ne sait pas encore ce qu'on en garde, et une colonne par
  -- champ ferait une quarantaine de tables pour une décision qui n'est pas
  -- prise. Seul ce qui sert à ranger les postes en sort — le nom, le contexte,
  -- la date.
  CREATE TABLE IF NOT EXISTS managed_device_assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    -- L'identifiant que l'agent se donne et répète à chaque envoi : c'est lui
    -- qui distingue un poste nouveau d'un poste déjà connu, et non le nom, qui
    -- change quand on renomme la machine.
    deviceid TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL DEFAULT '',
    -- The "tag" given to the agent (its "tag" option). Through it the
    -- machine joins a board: the one whose list has a collector of that tag.
    tag TEXT NOT NULL DEFAULT '',
    -- The board whose list collects its tag. Null as long as none does:
    -- it then shows nowhere. "context_id" is no longer used.
    board_id INTEGER REFERENCES boards(id) ON DELETE CASCADE,
    context_id INTEGER REFERENCES contexts(id) ON DELETE CASCADE,
    -- Le widget « Assets » qui reçoit son tag ; vide s'il n'y en a aucun.
    list_key TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '{}',
    -- La dernière personne connectée, sortie de l'inventaire à sa réception :
    -- la liste la montre, et relire le JSON de chaque poste pour l'afficher
    -- coûterait cent fois plus cher que de la garder ici.
    last_user TEXT NOT NULL DEFAULT '',
    last_inventory TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`;

// Indexes. The database had none: every foreign-key read — a list's cards, a
// board's lists, a project's comments, the session carrying a token — scanned
// the whole table. SQLite only indexes primary keys and UNIQUE columns on its
// own.
//
// They are created after the migrations: a rebuilt table would take its own
// indexes with it.
export const INDEXES = `
  CREATE INDEX IF NOT EXISTS idx_views_workspace ON views(workspace_id);
  CREATE INDEX IF NOT EXISTS idx_categories_board ON categories(board_id);
  CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);

  -- Ce qu'un widget de liste possède — ses étiquettes, ses catégories, ses
  -- types de jalons — se lit par son tableau et sa clé de liste.
  CREATE INDEX IF NOT EXISTS idx_categories_list ON categories(board_id, list_key, position);
  CREATE INDEX IF NOT EXISTS idx_milestone_types_list ON milestone_types(board_id, list_key);
  CREATE INDEX IF NOT EXISTS idx_project_labels_list ON project_labels(board_id, list_key, position, id);
  CREATE INDEX IF NOT EXISTS idx_project_label_groups_list ON project_label_groups(board_id, list_key, position, id);
  CREATE INDEX IF NOT EXISTS idx_labels_list ON labels(board_id, list_key, position, id);
  CREATE INDEX IF NOT EXISTS idx_label_groups_list ON label_groups(board_id, list_key, position, id);
  CREATE INDEX IF NOT EXISTS idx_managed_device_asset_labels_list ON managed_device_asset_labels(board_id, list_key, position, id);
  CREATE INDEX IF NOT EXISTS idx_managed_device_asset_label_groups_list ON managed_device_asset_label_groups(board_id, list_key, position, id);
  CREATE INDEX IF NOT EXISTS idx_contact_labels_list ON contact_labels(board_id, list_key, position, id);
  CREATE INDEX IF NOT EXISTS idx_contact_label_groups_list ON contact_label_groups(board_id, list_key, position, id);
  CREATE INDEX IF NOT EXISTS idx_product_labels_list ON product_labels(board_id, list_key, position, id);
  CREATE INDEX IF NOT EXISTS idx_product_label_groups_list ON product_label_groups(board_id, list_key, position, id);
  CREATE INDEX IF NOT EXISTS idx_warehouse_labels_list ON warehouse_labels(board_id, list_key, position, id);
  CREATE INDEX IF NOT EXISTS idx_warehouse_label_groups_list ON warehouse_label_groups(board_id, list_key, position, id);
  CREATE INDEX IF NOT EXISTS idx_location_labels_list ON location_labels(board_id, list_key, position, id);
  CREATE INDEX IF NOT EXISTS idx_location_label_groups_list ON location_label_groups(board_id, list_key, position, id);
  CREATE INDEX IF NOT EXISTS idx_support_labels_list ON support_labels(board_id, list_key, position, id);
  CREATE INDEX IF NOT EXISTS idx_support_label_groups_list ON support_label_groups(board_id, list_key, position, id);


  -- Les projets se lisent filtrés, et toujours rangés du plus récent au plus
  -- ancien : l'index porte donc le tri avec le filtre.
  CREATE INDEX IF NOT EXISTS idx_projects_board_updated ON projects(board_id, updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_projects_category ON projects(category_id);
  CREATE INDEX IF NOT EXISTS idx_projects_context ON projects(context_id);
  CREATE INDEX IF NOT EXISTS idx_projects_milestone_type ON projects(milestone_type_id);

  CREATE INDEX IF NOT EXISTS idx_project_actors_user ON project_actors(user_id);
  CREATE INDEX IF NOT EXISTS idx_project_labels_board ON project_labels(board_id, position, id);
  CREATE INDEX IF NOT EXISTS idx_project_labels_group ON project_labels(group_id);
  CREATE INDEX IF NOT EXISTS idx_project_label_groups_board
    ON project_label_groups(board_id, position, id);
  CREATE INDEX IF NOT EXISTS idx_project_label_links_label ON project_label_links(label_id);

  CREATE INDEX IF NOT EXISTS idx_boards_view ON boards(view_id, position, id);
  CREATE INDEX IF NOT EXISTS idx_contexts_board ON contexts(board_id, position, id);
  CREATE INDEX IF NOT EXISTS idx_board_sections_board
    ON board_sections(board_id, owner_id, position, id);
  CREATE INDEX IF NOT EXISTS idx_board_widgets_section
    ON board_widgets(section_id, position, id);
  CREATE INDEX IF NOT EXISTS idx_task_lists_board ON task_lists(board_id, position, id);
  CREATE INDEX IF NOT EXISTS idx_task_cards_list ON task_cards(list_id, position, id);
  CREATE INDEX IF NOT EXISTS idx_task_cards_context ON task_cards(context_id);

  CREATE INDEX IF NOT EXISTS idx_card_members_user ON card_members(user_id);
  CREATE INDEX IF NOT EXISTS idx_labels_board ON labels(board_id, position, id);
  CREATE INDEX IF NOT EXISTS idx_managed_device_asset_labels_board ON managed_device_asset_labels(board_id, position, id);
  CREATE INDEX IF NOT EXISTS idx_managed_device_asset_labels_group ON managed_device_asset_labels(group_id);
${DECLARED_ASSET_INDEXES}
  CREATE INDEX IF NOT EXISTS idx_contact_labels_board ON contact_labels(board_id, position, id);
  CREATE INDEX IF NOT EXISTS idx_contact_labels_group ON contact_labels(group_id);
  CREATE INDEX IF NOT EXISTS idx_contacts_board ON contacts(board_id, list_key);
  CREATE INDEX IF NOT EXISTS idx_contact_label_links_label ON contact_label_links(label_id);
  CREATE INDEX IF NOT EXISTS idx_contact_members_member ON contact_members(member_id);
  CREATE INDEX IF NOT EXISTS idx_contact_comments_contact ON contact_comments(contact_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_product_labels_board ON product_labels(board_id, position, id);
  CREATE INDEX IF NOT EXISTS idx_product_labels_group ON product_labels(group_id);
  CREATE INDEX IF NOT EXISTS idx_products_board ON products(board_id, list_key);
  CREATE INDEX IF NOT EXISTS idx_product_label_links_label ON product_label_links(label_id);
  CREATE INDEX IF NOT EXISTS idx_product_photos_product ON product_photos(product_id, position, id);
  CREATE INDEX IF NOT EXISTS idx_product_attachments_product ON product_attachments(product_id, position, id);
  CREATE INDEX IF NOT EXISTS idx_product_comments_product ON product_comments(product_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_warehouse_labels_group ON warehouse_labels(group_id);
  CREATE INDEX IF NOT EXISTS idx_warehouses_board ON warehouses(board_id, list_key);
  CREATE INDEX IF NOT EXISTS idx_warehouse_label_links_label ON warehouse_label_links(label_id);
  CREATE INDEX IF NOT EXISTS idx_location_labels_group ON location_labels(group_id);
  CREATE INDEX IF NOT EXISTS idx_locations_board ON locations(board_id, list_key);
  CREATE INDEX IF NOT EXISTS idx_locations_warehouse ON locations(warehouse_id);
  CREATE INDEX IF NOT EXISTS idx_location_label_links_label ON location_label_links(label_id);
  CREATE INDEX IF NOT EXISTS idx_order_labels_list ON order_labels(board_id, list_key, position, id);
  CREATE INDEX IF NOT EXISTS idx_order_label_groups_list ON order_label_groups(board_id, list_key, position, id);
  CREATE INDEX IF NOT EXISTS idx_order_labels_group ON order_labels(group_id);
  CREATE INDEX IF NOT EXISTS idx_orders_board ON orders(board_id, list_key);
  CREATE INDEX IF NOT EXISTS idx_orders_supplier ON orders(supplier_id);
  CREATE INDEX IF NOT EXISTS idx_order_attachments_order ON order_attachments(order_id, position, id);
  CREATE INDEX IF NOT EXISTS idx_order_label_links_label ON order_label_links(label_id);
  CREATE INDEX IF NOT EXISTS idx_order_actors_user ON order_actors(user_id);
  CREATE INDEX IF NOT EXISTS idx_order_comments_order ON order_comments(order_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_labels_group ON labels(group_id);
  CREATE INDEX IF NOT EXISTS idx_label_groups_board ON label_groups(board_id, position, id);
  CREATE INDEX IF NOT EXISTS idx_card_labels_label ON card_labels(label_id);

  CREATE INDEX IF NOT EXISTS idx_card_checklists_card ON card_checklists(card_id, position, id);
  CREATE INDEX IF NOT EXISTS idx_checklist_items_checklist ON checklist_items(checklist_id, position, id);
  CREATE INDEX IF NOT EXISTS idx_checklist_item_members_user ON checklist_item_members(user_id);

  CREATE INDEX IF NOT EXISTS idx_card_attachments_card ON card_attachments(card_id, id);
  CREATE INDEX IF NOT EXISTS idx_card_attachments_file ON card_attachments(file);
  CREATE INDEX IF NOT EXISTS idx_card_covers_card ON card_covers(card_id, position, id);
  CREATE INDEX IF NOT EXISTS idx_card_links_target ON card_links(target_id);

  -- Les demandes se lisent par contexte, de la plus récente à la plus ancienne.
  CREATE INDEX IF NOT EXISTS idx_support_requests_board
    ON support_requests(board_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_support_requests_context
    ON support_requests(context_id, created_at DESC);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_support_requests_list_number
    ON support_requests(board_id, list_key, number) WHERE number > 0;
  -- Un e-mail ne s'importe qu'une fois d'une boîte dans une liste : une boîte
  -- reçue par plusieurs listes y fait une demande par liste.
  CREATE UNIQUE INDEX IF NOT EXISTS idx_support_requests_mailbox_list
    ON support_requests(mailbox, list_key, mail_id) WHERE mail_id != '';

  CREATE INDEX IF NOT EXISTS idx_managed_device_assets_context ON managed_device_assets(context_id, name);
  CREATE INDEX IF NOT EXISTS idx_managed_device_assets_board ON managed_device_assets(board_id, name);
  CREATE INDEX IF NOT EXISTS idx_notifications_user
    ON notifications(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_support_request_actors_user
    ON support_request_actors(user_id);

  CREATE INDEX IF NOT EXISTS idx_support_labels_position
    ON support_labels(position, id);
  CREATE INDEX IF NOT EXISTS idx_support_labels_board ON support_labels(board_id, position, id);
  CREATE INDEX IF NOT EXISTS idx_support_label_groups_board
    ON support_label_groups(board_id, position, id);
  CREATE INDEX IF NOT EXISTS idx_support_labels_group ON support_labels(group_id);
  CREATE INDEX IF NOT EXISTS idx_support_request_labels_label
    ON support_request_labels(label_id);

  -- Les fils se lisent du plus ancien au plus récent : l'index porte ce tri.
  CREATE INDEX IF NOT EXISTS idx_card_comments_card ON card_comments(card_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_comments_project ON comments(project_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_project_attachments_project ON project_attachments(project_id, position, id);
  CREATE INDEX IF NOT EXISTS idx_support_comments_request
    ON support_comments(request_id, created_at);

  -- « token » est déjà la clé primaire ; c'est la fermeture des autres
  -- sessions d'un compte, et le ménage des sessions expirées, qui balayaient.
  -- Qui suit cet élément ? C'est la question posée après chaque écriture ;
  -- sans index, elle balaierait toute la table.
  CREATE INDEX IF NOT EXISTS idx_follows_target ON follows(kind, target_id);

  CREATE INDEX IF NOT EXISTS idx_users_entra ON users(entra_id);

  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
`;
