// Le schéma. Il se crée à vide et ne se modifie jamais ici : une base
// existante passe par les migrations (migrations.ts).

export const SCHEMA = `
  -- Tableaux du mode Projet. Ils ne dépendent d'aucune société : un tableau
  -- rassemble des projets de plusieurs sociétés. Chacun porte ses catégories.
  CREATE TABLE IF NOT EXISTS project_boards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    -- L'auteur du tableau : celui qui l'a créé. Le compte supprimé laisse le
    -- tableau sans auteur, et donc ouvert à tous.
    owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    -- Privé : le tableau, ses catégories, ses étiquettes et ses projets ne se
    -- montrent qu'à son auteur.
    is_private INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  -- Les catégories sont propres à un tableau : deux tableaux peuvent nommer
  -- une catégorie de la même façon.
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id INTEGER NOT NULL REFERENCES project_boards(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    UNIQUE (board_id, name)
  );

  CREATE TABLE IF NOT EXISTS companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    board_id INTEGER NOT NULL REFERENCES project_boards(id) ON DELETE CASCADE,
    category_id INTEGER NOT NULL REFERENCES categories(id),
    company_id INTEGER REFERENCES companies(id),
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
    -- Vide tant que la première connexion n'a pas défini le mot de passe.
    password_hash TEXT NOT NULL DEFAULT '',
    -- Mode ouvert à la connexion : chacun choisit le sien.
    default_mode TEXT NOT NULL DEFAULT 'projects',
    created_at TEXT NOT NULL
  );

  -- Les réglages de l'application, par opposition à ceux d'un compte : la
  -- messagerie sortante, la dernière restauration. Une ligne par réglage, sa
  -- valeur en JSON — ils sont peu nombreux et n'ont aucune forme commune, et
  -- une colonne par champ ferait une migration à chaque réglage ajouté.
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT ''
  );

  -- Ce que chacun suit : les éléments dont il veut être prévenu quand ils
  -- changent. « kind » vaut « project », « card » ou « list ».
  --
  -- « target_id » ne porte pas de clé étrangère : elle désigne trois tables
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

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    -- Dernier usage du jeton, et date au-delà de laquelle il ne vaut plus
    -- rien. Une session oubliée finit par se fermer d'elle-même.
    last_seen_at TEXT NOT NULL DEFAULT '',
    expires_at TEXT NOT NULL DEFAULT ''
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
  CREATE TABLE IF NOT EXISTS project_labels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id INTEGER NOT NULL REFERENCES project_boards(id) ON DELETE CASCADE,
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

  -- Tableaux du mode Tâche. Une société en compte autant qu'elle veut ;
  -- chacun porte ses propres listes.
  CREATE TABLE IF NOT EXISTS boards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    -- Le numéro des cartes se montre par défaut ; chaque tableau peut le taire.
    show_card_numbers INTEGER NOT NULL DEFAULT 1,
    -- L'auteur du tableau : celui qui l'a créé. Le compte supprimé laisse le
    -- tableau sans auteur, et donc ouvert à tous.
    owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    -- Privé : le tableau ne se montre qu'à son auteur.
    is_private INTEGER NOT NULL DEFAULT 0,
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
    created_at TEXT NOT NULL
  );

  -- Cartes d'une liste du mode Tâche. Elles disparaissent avec leur liste
  -- (ON DELETE CASCADE) ; « position » porte leur ordre dans la liste.
  CREATE TABLE IF NOT EXISTS task_cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    list_id INTEGER NOT NULL REFERENCES task_lists(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    -- Numéro affiché sur la carte. Attribué à la création et compté par
    -- tableau (donc par société), pas sur l'identifiant global. Un séparateur
    -- n'en porte pas : il reste à zéro.
    number INTEGER NOT NULL DEFAULT 0,
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
  CREATE TABLE IF NOT EXISTS labels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    -- « teinte.nuance » de la palette Mantine, par exemple « red.6 ».
    color TEXT NOT NULL DEFAULT 'blue.6',
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
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
  -- vit dans le dossier des médias (lib/medias.ts) ; la ligne n'en garde que
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
    created_at TEXT NOT NULL
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

  -- Les catégories du mode Accès. Elles ne pendent à rien : c'est le premier
  -- niveau du mode, comme un tableau l'est ailleurs. Deux personnes peuvent
  -- nommer une catégorie de la même façon — l'une d'elles peut l'avoir fermée,
  -- et l'autre n'a pas à en deviner l'existence : le nom n'est donc pas unique.
  CREATE TABLE IF NOT EXISTS access_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    -- L'auteur de la catégorie : celui qui l'a créée. Le compte supprimé
    -- laisse la catégorie sans auteur, et donc ouverte à tous.
    owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    -- Privée : la catégorie ne se montre qu'à son auteur.
    is_private INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  -- Les sections d'une catégorie d'accès : ses colonnes. Une section n'a pas
  -- de nom — sa largeur la définit entièrement : « auto » la laisse à la
  -- rangée, « percent » et « px » la fixent avec « width_value », qui reste
  -- nul dans le premier cas.
  CREATE TABLE IF NOT EXISTS access_sections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL REFERENCES access_categories(id) ON DELETE CASCADE,
    width_unit TEXT NOT NULL DEFAULT 'auto'
      CHECK (width_unit IN ('auto', 'percent', 'px')),
    width_value REAL,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  -- Les demandes du mode Support. Chacune appartient à la société choisie dans
  -- la liste déroulante de l'entête : c'est le premier niveau du mode, comme
  -- un tableau l'est ailleurs, et les onglets y rangent les demandes par
  -- statut.
  CREATE TABLE IF NOT EXISTS support_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    -- Les quatre onglets du mode, moins « Tous » qui ne filtre rien
    -- (shared/domain.ts).
    status TEXT NOT NULL DEFAULT 'unresolved'
      CHECK (status IN ('unresolved', 'pending', 'resolved', 'closed')),
    -- Échéance, en ISO 8601 avec l'heure, comme celle d'une carte. Vide
    -- plutôt que NULL : une échéance absente se lit de la même façon partout.
    due_date TEXT NOT NULL DEFAULT '',
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

  -- Étiquettes du mode Support : jumelles de celles des cartes, mais
  -- rattachées à une société plutôt qu'à un tableau — c'est le niveau
  -- au-dessus d'une demande.
  CREATE TABLE IF NOT EXISTS support_labels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    -- « teinte.nuance » de la palette Mantine, par exemple « red.6 ».
    color TEXT NOT NULL DEFAULT 'blue.6',
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
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
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- Ce qu'une section porte : les éléments posés par les greffons du client.
  -- Le serveur ne connaît pas leur configuration — il range le JSON que le
  -- greffon lui donne et le rend tel quel. « type » désigne le greffon.
  CREATE TABLE IF NOT EXISTS access_blocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    section_id INTEGER NOT NULL REFERENCES access_sections(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    config TEXT NOT NULL DEFAULT '{}',
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
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
`;

// Index. La base n'en avait aucun : chaque lecture par clé étrangère — les
// cartes d'une liste, les listes d'un tableau, les commentaires d'un projet,
// la session qui porte un jeton — parcourait la table entière. SQLite n'indexe
// d'office que les clés primaires et les colonnes UNIQUE.
//
// Ils se créent après les migrations : une table reconstruite emporterait les
// siens.
export const INDEXES = `
  CREATE INDEX IF NOT EXISTS idx_categories_board ON categories(board_id);

  -- Les catégories du mode Accès se lisent toutes, dans l'ordre des onglets.
  CREATE INDEX IF NOT EXISTS idx_access_categories_position
    ON access_categories(position, id);

  -- Les sections se lisent par catégorie, dans l'ordre des colonnes.
  CREATE INDEX IF NOT EXISTS idx_access_sections_category
    ON access_sections(category_id, position, id);

  -- Les éléments se lisent par section, dans l'ordre où ils y sont posés.
  CREATE INDEX IF NOT EXISTS idx_access_blocks_section
    ON access_blocks(section_id, position, id);

  -- Les projets se lisent filtrés, et toujours rangés du plus récent au plus
  -- ancien : l'index porte donc le tri avec le filtre.
  CREATE INDEX IF NOT EXISTS idx_projects_board_updated ON projects(board_id, updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_projects_category ON projects(category_id);
  CREATE INDEX IF NOT EXISTS idx_projects_company ON projects(company_id);

  CREATE INDEX IF NOT EXISTS idx_project_actors_user ON project_actors(user_id);
  CREATE INDEX IF NOT EXISTS idx_project_labels_board ON project_labels(board_id, position, id);
  CREATE INDEX IF NOT EXISTS idx_project_label_links_label ON project_label_links(label_id);

  CREATE INDEX IF NOT EXISTS idx_boards_company ON boards(company_id, position, id);
  CREATE INDEX IF NOT EXISTS idx_task_lists_board ON task_lists(board_id, position, id);
  CREATE INDEX IF NOT EXISTS idx_task_cards_list ON task_cards(list_id, position, id);

  CREATE INDEX IF NOT EXISTS idx_card_members_user ON card_members(user_id);
  CREATE INDEX IF NOT EXISTS idx_labels_board ON labels(board_id, position, id);
  CREATE INDEX IF NOT EXISTS idx_card_labels_label ON card_labels(label_id);

  CREATE INDEX IF NOT EXISTS idx_card_checklists_card ON card_checklists(card_id, position, id);
  CREATE INDEX IF NOT EXISTS idx_checklist_items_checklist ON checklist_items(checklist_id, position, id);
  CREATE INDEX IF NOT EXISTS idx_checklist_item_members_user ON checklist_item_members(user_id);

  CREATE INDEX IF NOT EXISTS idx_card_attachments_card ON card_attachments(card_id, id);
  CREATE INDEX IF NOT EXISTS idx_card_attachments_file ON card_attachments(file);

  -- Les demandes se lisent par société, de la plus récente à la plus ancienne ;
  -- les onglets filtrent ensuite sur le statut.
  CREATE INDEX IF NOT EXISTS idx_support_requests_company
    ON support_requests(company_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_support_request_actors_user
    ON support_request_actors(user_id);

  CREATE INDEX IF NOT EXISTS idx_support_labels_company
    ON support_labels(company_id, position, id);
  CREATE INDEX IF NOT EXISTS idx_support_request_labels_label
    ON support_request_labels(label_id);

  -- Les fils se lisent du plus ancien au plus récent : l'index porte ce tri.
  CREATE INDEX IF NOT EXISTS idx_card_comments_card ON card_comments(card_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_comments_project ON comments(project_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_support_comments_request
    ON support_comments(request_id, created_at);

  -- « token » est déjà la clé primaire ; c'est la fermeture des autres
  -- sessions d'un compte, et le ménage des sessions expirées, qui balayaient.
  -- Qui suit cet élément ? C'est la question posée après chaque écriture ;
  -- sans index, elle balaierait toute la table.
  CREATE INDEX IF NOT EXISTS idx_follows_cible ON follows(kind, target_id);

  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
`;
