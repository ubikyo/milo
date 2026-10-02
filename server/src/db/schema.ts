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
    -- Ancien emplacement des jalons, avant les types de jalons
    -- (milestone_types) : plus lu, gardé pour les bases qui le portent.
    milestones TEXT NOT NULL DEFAULT '[]',
    UNIQUE (board_id, name)
  );

  CREATE TABLE IF NOT EXISTS companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    -- Le support de la société : l'adresse à laquelle lui écrire, et celle de
    -- son site, toujours en https://. Vides tant qu'on ne les a pas saisies.
    support_email TEXT NOT NULL DEFAULT '',
    support_url TEXT NOT NULL DEFAULT ''
  );

  -- Les permissions d'un utilisateur ou d'un groupe Entra, pour toutes les
  -- sociétés : le Paramétrage ('' : aucun, 'view', 'update') et une
  -- permission par type de widget, en JSON — { "helpdesk": "update",
  -- "asset": "view", … } (shared, widget-kinds.ts). Sans ligne, aucun accès.
  -- Désignés par leur identifiant d'objet Entra, qui ne change pas quand on
  -- les renomme ; le nom et l'adresse sont gardés pour l'affichage. « modes »
  -- ne sert plus : les modes se déduisent des types.
  CREATE TABLE IF NOT EXISTS principal_permissions (
    principal_type TEXT NOT NULL CHECK (principal_type IN ('user', 'group')),
    principal_id TEXT NOT NULL,
    principal_name TEXT NOT NULL DEFAULT '',
    principal_email TEXT NOT NULL DEFAULT '',
    settings TEXT NOT NULL DEFAULT '' CHECK (settings IN ('', 'view', 'update')),
    modes TEXT NOT NULL DEFAULT '[]',
    widgets TEXT NOT NULL DEFAULT '{}',
    PRIMARY KEY (principal_type, principal_id)
  );

  -- Les types de jalons (Commande, Développement…), réglés une fois pour toute
  -- l'application : un projet en choisit un, qui pose les marques et les
  -- couleurs de son curseur d'avancement. Les jalons sont un tableau JSON de
  -- { value, label, color }.
  CREATE TABLE IF NOT EXISTS milestone_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    milestones TEXT NOT NULL DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    -- La référence (« HLP-12 ») : le compteur des demandes du support la
    -- donne aussi aux projets et aux cartes (repositories/references.ts).
    number INTEGER NOT NULL DEFAULT 0,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    board_id INTEGER NOT NULL REFERENCES project_boards(id) ON DELETE CASCADE,
    category_id INTEGER NOT NULL REFERENCES categories(id),
    company_id INTEGER REFERENCES companies(id),
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
    created_at TEXT NOT NULL,
    -- L'identifiant d'objet Entra (oid), posé à la première connexion par
    -- Microsoft. Vide pour le compte « admin » et pour les comptes d'avant
    -- Entra, qui s'y rattachent par leur e-mail.
    entra_id TEXT NOT NULL DEFAULT '',
    -- Les groupes Entra du compte (identifiants, en JSON), relus à chaque
    -- connexion : ses droits en dépendent.
    entra_groups TEXT NOT NULL DEFAULT '[]',
    -- Le compte « admin » local, qui ne sert qu'au paramétrage.
    system INTEGER NOT NULL DEFAULT 0
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
    -- Le poids : les plus lourdes passent devant, dans les grilles.
    weight INTEGER NOT NULL DEFAULT 0,
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
    -- Verrouillé : ses listes ne s'ajoutent, ne se déplacent ni ne se
    -- suppriment plus. Les cartes, elles, bougent toujours.
    is_locked INTEGER NOT NULL DEFAULT 0,
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
    -- Verrouillée : ses colonnes et ce qu'elles portent se lisent, mais rien
    -- ne s'y déplace ni ne s'y modifie.
    is_locked INTEGER NOT NULL DEFAULT 0,
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
    -- L'écart qui sépare la colonne de la suivante, en pixels : chaque
    -- section aère le sien (shared, ACCESS_GAP_DEFAUT). Celui de la dernière
    -- ne sert pas.
    gap INTEGER NOT NULL DEFAULT 20,
    position INTEGER NOT NULL DEFAULT 0,
    -- Nul : la structure publique de la catégorie, partagée par tous ceux qui
    -- l'héritent. Sinon, la structure propre à ce compte (personal_layouts).
    owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
  );

  -- Les demandes du mode Support. Chacune appartient à la société choisie dans
  -- la liste déroulante de l'entête : c'est le premier niveau du mode, comme
  -- un tableau l'est ailleurs, et les onglets y rangent les demandes par
  -- statut.
  CREATE TABLE IF NOT EXISTS support_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    -- Le numéro de ticket (« HLP-12 ») : il suit celui de la demande
    -- précédente, toutes sociétés confondues. Le dernier donné est gardé dans
    -- les réglages, pour qu'un numéro ne resserve pas après une suppression.
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

  -- Étiquettes du mode Support : jumelles de celles des cartes, mais communes
  -- à tout le support — toutes les sociétés partagent les mêmes.
  CREATE TABLE IF NOT EXISTS support_labels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    -- « teinte.nuance » de la palette Mantine, par exemple « red.6 ».
    color TEXT NOT NULL DEFAULT 'blue.6',
    -- Le poids : les plus lourdes passent devant, dans les grilles.
    weight INTEGER NOT NULL DEFAULT 0,
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

  -- Les sections des panneaux des statistiques — Support, Assets, Projet ou
  -- Tâche : leurs colonnes, comme celles d'une catégorie d'accès. « panel »
  -- dit à quel panneau la section appartient ; la largeur se lit comme celle
  -- d'une section d'accès.
  CREATE TABLE IF NOT EXISTS indicator_sections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    panel TEXT NOT NULL CHECK (panel IN ('support', 'assets', 'projects', 'tasks')),
    width_unit TEXT NOT NULL DEFAULT 'auto'
      CHECK (width_unit IN ('auto', 'percent', 'px')),
    width_value REAL,
    -- L'écart qui la sépare de la suivante, comme une section d'accès
    -- (shared, SECTIONS_GAP_DEFAUT).
    gap INTEGER NOT NULL DEFAULT 50,
    position INTEGER NOT NULL DEFAULT 0,
    -- Nul : la structure publique du panneau ; sinon celle de ce compte,
    -- comme une section d'accès.
    owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
  );

  -- Les structures qu'un compte n'hérite plus : « Hérité » décoché, il voit
  -- et modifie ses propres sections et éléments (owner_id) au lieu des
  -- publics. « scope » nomme le panneau — « support », « assets »,
  -- « projects », « tasks » — ou la catégorie d'accès, « access:<id> ».
  -- L'ordre des onglets, propre à chaque compte : chacun range les siens sans
  -- toucher ceux des autres. « scope » nomme la rangée — « modes » (le
  -- sélecteur du bas), « support », « assets », « project-boards »,
  -- « access-categories », ou « boards:<société> » pour les tableaux de
  -- tâches d'une société. « ids » est la liste rangée, en JSON (chaînes).
  -- Sans ligne, la rangée garde son ordre commun.
  CREATE TABLE IF NOT EXISTS user_tab_orders (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scope TEXT NOT NULL,
    ids TEXT NOT NULL DEFAULT '[]',
    PRIMARY KEY (user_id, scope)
  );

  CREATE TABLE IF NOT EXISTS personal_layouts (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scope TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, scope)
  );

  -- Les indicateurs du panneau des statistiques du mode Support, posés par
  -- les widgets du client (client/src/indicators). Communs à toutes les
  -- sociétés : ils se calculent sur les demandes de celle qu'on regarde. Le
  -- serveur range le JSON du widget sans le relire.
  CREATE TABLE IF NOT EXISTS support_indicators (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    section_id INTEGER REFERENCES indicator_sections(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    config TEXT NOT NULL DEFAULT '{}',
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  -- Ceux du panneau des statistiques du mode Assets, posés par les widgets
  -- de client/src/asset-indicators. Même forme que ceux du Support : ils se
  -- calculent sur les postes de la société regardée.
  CREATE TABLE IF NOT EXISTS asset_indicators (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    section_id INTEGER REFERENCES indicator_sections(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    config TEXT NOT NULL DEFAULT '{}',
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  -- Ceux des sections des modes Projet et Tâche, posés par les widgets de
  -- client/src/project-indicators et client/src/task-indicators. Communs à
  -- tous les tableaux : ils se calculent sur celui qu'on regarde.
  CREATE TABLE IF NOT EXISTS project_indicators (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    section_id INTEGER REFERENCES indicator_sections(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    config TEXT NOT NULL DEFAULT '{}',
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS task_indicators (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    section_id INTEGER REFERENCES indicator_sections(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    config TEXT NOT NULL DEFAULT '{}',
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  -- Ce qu'une section porte : les éléments posés par les widgets du client.
  -- Le serveur ne connaît pas leur configuration — il range le JSON que le
  -- widget lui donne et le rend tel quel. « type » désigne le widget.
  CREATE TABLE IF NOT EXISTS access_blocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    section_id INTEGER NOT NULL REFERENCES access_sections(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    config TEXT NOT NULL DEFAULT '{}',
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
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

  -- Les machines des widgets Uptime, telles que la dernière vérification les
  -- a laissées. Une machine se range par ce qui la vérifie (lib/uptime.ts) —
  -- le type, l'hôte, le port, l'OID — et non par élément : deux éléments qui
  -- surveillent la même chose n'en font qu'une vérification. « since » est le
  -- moment où l'état courant a commencé ; « detail » ce que la vérification
  -- a vu, la valeur lue ou la raison de l'échec.
  CREATE TABLE IF NOT EXISTS access_uptime (
    key TEXT PRIMARY KEY,
    state TEXT NOT NULL CHECK (state IN ('up', 'down')),
    since TEXT NOT NULL,
    checked_at TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT ''
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
    ON access_sections(category_id, owner_id, position, id);

  -- Les éléments se lisent par section, dans l'ordre où ils y sont posés.
  CREATE INDEX IF NOT EXISTS idx_access_blocks_section
    ON access_blocks(section_id, position, id);

  -- Les sections d'un panneau des statistiques, dans l'ordre des colonnes, et
  -- les indicateurs par section.
  CREATE INDEX IF NOT EXISTS idx_indicator_sections_panel
    ON indicator_sections(panel, owner_id, position, id);
  CREATE INDEX IF NOT EXISTS idx_support_indicators_section
    ON support_indicators(section_id, position, id);
  CREATE INDEX IF NOT EXISTS idx_asset_indicators_section
    ON asset_indicators(section_id, position, id);
  CREATE INDEX IF NOT EXISTS idx_project_indicators_section
    ON project_indicators(section_id, position, id);
  CREATE INDEX IF NOT EXISTS idx_task_indicators_section
    ON task_indicators(section_id, position, id);

  -- Les projets se lisent filtrés, et toujours rangés du plus récent au plus
  -- ancien : l'index porte donc le tri avec le filtre.
  CREATE INDEX IF NOT EXISTS idx_projects_board_updated ON projects(board_id, updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_projects_category ON projects(category_id);
  CREATE INDEX IF NOT EXISTS idx_projects_company ON projects(company_id);
  CREATE INDEX IF NOT EXISTS idx_projects_milestone_type ON projects(milestone_type_id);

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
  -- Les postes du mode Assets : ce qu'un agent d'inventaire (FusionInventory,
  -- GLPI Agent) remonte d'une machine.
  --
  -- L'inventaire entier est gardé tel quel, en JSON, plutôt que découpé en
  -- colonnes : on ne sait pas encore ce qu'on en garde, et une colonne par
  -- champ ferait une quarantaine de tables pour une décision qui n'est pas
  -- prise. Seul ce qui sert à ranger les postes en sort — le nom, la société,
  -- la date.
  CREATE TABLE IF NOT EXISTS assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    -- L'identifiant que l'agent se donne et répète à chaque envoi : c'est lui
    -- qui distingue un poste nouveau d'un poste déjà connu, et non le nom, qui
    -- change quand on renomme la machine.
    deviceid TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL DEFAULT '',
    -- Le « tag » passé à l'agent (option « tag »). C'est par lui que le poste
    -- se rattache à une société : l'agent ne connaît rien d'autre de Milo.
    tag TEXT NOT NULL DEFAULT '',
    -- Nulle tant que le tag ne désigne aucune société connue : le poste se
    -- montre alors sous « Toutes les sociétés » seulement. Une société
    -- supprimée laisse ses postes, elle ne les emporte pas.
    company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
    content TEXT NOT NULL DEFAULT '{}',
    -- La dernière personne connectée, sortie de l'inventaire à sa réception :
    -- la liste la montre, et relire le JSON de chaque poste pour l'afficher
    -- coûterait cent fois plus cher que de la garder ici.
    last_user TEXT NOT NULL DEFAULT '',
    last_inventory TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_support_requests_company
    ON support_requests(company_id, created_at DESC);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_support_requests_number
    ON support_requests(number) WHERE number > 0;
  -- Un e-mail ne s'importe qu'une fois dans une société.
  CREATE UNIQUE INDEX IF NOT EXISTS idx_support_requests_mail
    ON support_requests(company_id, mail_id) WHERE mail_id != '';

  CREATE INDEX IF NOT EXISTS idx_assets_company ON assets(company_id, name);
  CREATE INDEX IF NOT EXISTS idx_notifications_user
    ON notifications(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_support_request_actors_user
    ON support_request_actors(user_id);

  CREATE INDEX IF NOT EXISTS idx_support_labels_position
    ON support_labels(position, id);
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

  CREATE INDEX IF NOT EXISTS idx_users_entra ON users(entra_id);

  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
`;
