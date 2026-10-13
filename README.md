# Milo

Suivi de projets et de tâches : liste de projets filtrable avec fiche en volet
latéral, tableaux de cartes à la Kanban, commentaires, étiquettes et checklists.

## Stack

- **Langage** : TypeScript, en mode `strict`, du client au serveur
- **Frontend** : React + Vite + [Mantine](https://mantine.dev/) v9
- **Backend** : Node.js + Express + SQLite ([better-sqlite3](https://github.com/WiseLibs/better-sqlite3))
- **Environnement** : Dev Container (VS Code / Codespaces)

## Structure

Le dépôt est un espace de travail npm de trois paquets :

```
shared/   Le vocabulaire commun : types du domaine, contrat de l'API,
          règles de mot de passe, palette d'étiquettes, modes.
          Client et serveur le lisent tous deux — c'est lui qui garantit
          qu'ils ne divergent pas.
server/   API REST Express, découpée par ressource :
            src/routes/         une ressource par fichier
            src/repositories/   les requêtes SQL préparées
            src/middleware/     session, erreurs, flux d'événements
            src/db/             schéma, migrations, index
client/   Application React (Mantine)
scripts/  Empaquetage de l'API pour le déploiement
deploy/   Unité systemd, configuration nginx
```

La base vit dans `server/data.db` en développement, et hors du dossier déployé
en production (`MILO_DB_PATH`). Les fichiers déposés sur les cartes suivent la
même règle : `medias/` à la racine en développement, `MILO_MEDIA_PATH` ailleurs.

## Démarrer

Prérequis : Node.js 20+. Avec le Dev Container, tout est déjà installé.

```bash
npm install          # une fois, à la racine : les trois paquets
npm run dev          # API (3001) + frontend (5273)
```

Ou séparément :

```bash
npm run dev -w @milo/server
npm run dev -w @milo/client
```

Frontend sur http://localhost:5273, API sur http://localhost:3001.

## Contrôles

```bash
npm run typecheck    # tsc sur les trois paquets
npm run lint         # eslint
npm run check        # les deux
npm run build        # build de production
```

Les deux premiers tournent en CI et bloquent la livraison.

## Déploiement

`npm run package-api <dossier>` regroupe le serveur en un seul fichier
(`server.mjs`) accompagné d'un manifeste aux versions exactes. `better-sqlite3`
est un module natif : il reste hors du fichier et se compile sur la machine
cible. Le workflow GitHub Actions (`.github/workflows/ci-cd.yml`) fait cela,
puis dépose le client statique et l'API sur la VM par un runner auto-hébergé.
Chaque push sur `dev` et chaque tag `v*` déploient, après approbation manuelle
(environnement `production`).

### Variables d'environnement du serveur

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `PORT` | `3001` | Port d'écoute |
| `MILO_DB_PATH` | `server/data.db` | Emplacement de la base |
| `MILO_MEDIA_PATH` | `medias/` (racine) | Dossier des fichiers déposés sur les cartes et des images collées dans une description |
| `MILO_TICKETS_PATH` | `upload/tickets/` (racine) | Dossier des images et pièces jointes des e-mails reçus au support |
| `MILO_SESSION_DAYS` | `30` | Fermeture d'une session inutilisée |
| `MILO_NOTIFY_WINDOW_MINUTES` | `5` | Fenêtre de regroupement des e-mails de suivi. Les modifications d'un même élément dans ce délai tiennent en un seul message ; la notification à l'écran reste immédiate. |
| `MILO_CORS_ORIGINS` | *(vide)* | Origines autorisées, séparées par des virgules. Vide = aucune, ce qui convient quand le client est servi par le même hôte. |
| `MILO_SUPPORT_REPLY` | *(vide)* | Les réponses du mode Support partent par e-mail à l'expéditeur. `simulate` les **simule**, pour la mise au point : préparées et consignées dans le journal, rien ne quitte Milo. |
| `MILO_PUBLIC_URL` | *(vide)* | Adresse publique de Milo, en https (`https://milo.exemple.fr`, sans `/` final). Active les notifications de changement de Graph : un e-mail reçu devient une demande en quelques secondes. Vide = seule la relève périodique (5 min). |

### À vérifier au déploiement

Le mode Support ne reçoit pas de notifications de Graph tant que
`MILO_PUBLIC_URL` n'est pas posée. Au passage en production :

1. **`MILO_PUBLIC_URL`** — la régler sur l'adresse publique en https. Milo
   s'abonne alors aux boîtes de support au démarrage ; la route
   `/api/support-mail/notifications` doit être joignable depuis Internet
   (nginx ne doit ni la protéger par mot de passe ni la bloquer). Le journal
   du serveur dit si les abonnements sont refusés.
2. **Réponses** — elles partent par défaut. `MILO_SUPPORT_REPLY=simulate`
   les retient, le temps d'une vérification : le journal montre alors
   `[Simulation] Réponse de … à …`.
3. **Permissions Entra** — `Mail.ReadWrite` (relève, delta, abonnements) et
   `Mail.Send` (réponses) avec consentement d'administrateur ; voir
   [Inscrire Milo dans Azure](#inscrire-milo-dans-azure).
4. **Première relève** — sur une base neuve, chaque boîte n'importe que ses
   15 derniers messages (`PREMIERE_RELEVE`, `server/src/lib/support-mail.ts`),
   réglage de mise au point à revoir avant la mise en service.

### Milo Proxy

Hébergé sur Internet, Milo ne joint pas les imprimantes d'un site : un
service Milo Proxy, installé sur ce site (dépôt `milo-proxy`), s'y connecte
en WebSocket sur HTTPS et relaie l'impression. Le protocole est décrit dans
`ressources/proxy/PROTOCOL.md`. Côté nginx, le bloc
`ressources/deploy/nginx-proxy-socket.conf` est à ajouter au serveur HTTPS.

## API

Toutes les routes sont sous `/api` et exigent un jeton
(`Authorization: Bearer …`), sauf l'ouverture de session.

| Ressource | Routes |
| --- | --- |
| Session | `GET/POST /auth/setup`, `POST /auth/login` (compte admin), `GET /auth/entra/start`, `GET /auth/entra/callback`, `GET/PUT /auth/me`, `POST /auth/logout` |
| Personnes | `GET /users` |
| Accès | `GET /assignments`, `GET /assignments/search`, `PUT/DELETE /assignments/:type/:id` |
| Sociétés | `GET/POST /companies`, `PUT/DELETE /companies/:id` |
| Rôles | `GET/POST /roles`, `PUT/DELETE /roles/:id` |
| Suivi | `GET /follows`, `PUT/DELETE /follows/:kind/:id` |
| Sauvegarde | `GET /backup`, `GET /backup/archive`, `POST /backup/restore` |
| Proxys | `GET/POST /proxies`, `PUT/DELETE /proxies/:id`, `POST /proxies/:id/token` ; WebSocket des proxys sur `/api/proxy/socket` (token de proxy, pas de session) |
| Entra | `GET/PUT /entra`, `POST /entra/test`, `GET /entra/mailboxes` |
| Tableaux de projets | `GET/POST /project-boards`, `PUT/DELETE /project-boards/:id` |
| Catégories | `GET/POST /categories`, `PUT/DELETE /categories/:id` |
| Projets | `GET/POST /projects`, `GET/PUT/DELETE /projects/:id` |
| Commentaires | `POST /projects/:id/comments`, `PUT/DELETE /comments/:id` |
| Tableaux de tâches | `GET/POST /boards`, `PUT/DELETE /boards/:id` |
| Listes | `GET/POST /task-lists`, `PUT /task-lists/reorder`, `PUT/DELETE /task-lists/:id` |
| Cartes | `POST /task-cards`, `PUT /task-cards/reorder`, `GET/PUT /task-cards/:id`, `GET /task-cards/:id/emplacement`, `POST /task-cards/:id/comments`, `PUT/DELETE /card-comments/:id` |
| Checklists | `POST /task-cards/:id/checklists`, `PUT /task-cards/:id/checklists/reorder`, `PUT/DELETE /checklists/:id`, `POST /checklists/:id/items`, `PUT /checklists/:id/items/reorder`, `PUT/DELETE /checklist-items/:id` |
| Étiquettes | `GET/POST /labels`, `PUT/DELETE /labels/:id`, et les mêmes sous `/project-labels` |
| Support | `GET/POST /support-requests`, `GET/PUT/DELETE /support-requests/:id`, `POST /support-requests/:id/comments`, `PUT/DELETE /support-comments/:id`, `POST /support-requests/sync` (relève), `POST /support-requests/merge`, `/close`, `/delete`, `/assign` (demandes cochées) |
| Étiquettes du support | `GET/POST /support-labels`, `PUT/DELETE /support-labels/:id` — communes à toutes les sociétés |
| Notifications Graph | `POST /support-mail/notifications` — **sans jeton** : appelée par Microsoft, authentifiée par le secret de l'abonnement |
| Temps réel | `GET /version`, `GET /events` (SSE) |

### Temps réel

Après chaque écriture, le serveur pousse sur `/api/events` un compteur par
ressource (`projects`, `task-lists`, `labels`…). Le client compare ces
compteurs aux siens et ne relit que ce qui a bougé.

Le même flux porte les notifications de suivi. Les deux messages se
distinguent par leur forme : `{ version, versions }` pour les compteurs, qui
s'adressent à tout le monde, `{ notification }` pour un avis, qui n'est envoyé
qu'au compte concerné.

### Suivi et notifications

Une case « Suivre » dans le menu d'une liste et dans le menu « Actions » des
tiroirs de projet et de carte. Suivre un projet ou une carte, c'est être
prévenu de ce qui lui arrive ; suivre une liste, c'est l'être pour **ses
cartes** — on ne modifie pas une liste, on modifie ce qu'elle contient.

Ce qui déclenche une notification : les modifications de fond (fiche, membres,
étiquettes, échéance, checklists), la création d'une carte dans une liste
suivie, les commentaires, et **le passage d'une carte d'une liste à une
autre** — passer de « À faire » à « Terminé » est un fait, pas une mise en
ordre. Glisser une carte à l'intérieur de sa propre liste, en revanche, ne
notifie personne : rien n'a changé de ce qu'elle dit.

Un déplacement prévient trois cercles à la fois : ceux qui suivent la carte,
ceux qui suivent la liste d'accueil, et ceux qui suivaient la liste de départ —
une carte qui s'en va est une modification de son contenu au même titre qu'une
carte qui arrive. Une personne présente dans plusieurs de ces cercles n'est
prévenue qu'une fois.

**On n'est jamais notifié de ses propres gestes** : l'auteur est écarté à la
source, dans la requête SQL qui cherche les suiveurs.

Deux canaux, à deux cadences :

| Canal | Cadence |
| --- | --- |
| Notification à l'écran (en bas à droite) | Immédiate, poussée sur le flux `/api/events` au seul compte concerné. |
| E-mail | Regroupé : les modifications d'un même élément dans la fenêtre `MILO_NOTIFY_WINDOW_MINUTES` tiennent en un seul message, les faits identiques répétés y étant comptés (« a modifié la fiche (3 fois) »). |

Les deux portent un lien vers l'élément. L'application n'a pas de routeur, mais
elle lit et écrit l'adresse : `/?projet=12` et `/?carte=34` ouvrent directement
la fiche, et l'adresse suit ce qui est ouvert — un rechargement le retrouve, et
le lien se partage. Pour une carte, le serveur dit d'abord où elle vit
(`GET /api/task-cards/:id/emplacement`), le client se place sur la société et
le tableau, puis le tableau l'ouvre.

Les e-mails suivent le gabarit de `server/src/lib/mail-template.ts` : bandeau
sombre et nom en graisse fine, comme les fenêtres de l'application. Les
couleurs y sont écrites en dur — c'est le seul endroit du code où le thème est
doublé, les clients de messagerie ne connaissant ni les variables CSS ni les
feuilles externes. Chaque message part en deux versions, HTML et texte.

### Sauvegarde

`GET /api/backup/archive` rend une archive `.milo.gz` — un tar compressé, qui
s'ouvre avec n'importe quel outil d'archivage — contenant la base (écrite par
SQLite lui-même, `VACUUM INTO`, donc cohérente même pendant une écriture) et le
dossier des médias.

La restauration ne remplace pas le fichier de la base : le serveur garde sa
connexion et ses requêtes préparées, et les données sont recopiées table par
table dans le schéma d'aujourd'hui. Une sauvegarde plus ancienne se restaure
donc sans rien de particulier. Tout est remplacé, sessions comprises : les
personnes connectées devront sans doute se reconnecter.

### Comptes et Entra

Les comptes reposent sur Entra ID. Chacun se connecte par Microsoft ; son
identité et ses groupes sont relus à chaque connexion. Un compte d'avant Entra
se rattache à la personne par son e-mail, à sa première connexion, et garde
son historique.

Un seul compte a un mot de passe : **`admin`**. Il est créé à la toute
première ouverture, sert au paramétrage — d'abord à renseigner l'application
Entra, sans laquelle personne d'autre ne peut se connecter — et ne voit que le
Paramétrage. Il ne se montre dans aucune liste et n'est l'acteur de rien. Sur
l'écran de connexion, il s'ouvre par le lien « Compte d'administration ».

Une base neuve n'a que ce compte : aucun workspace, aucune administration,
aucun accès. Une fois Entra connecté, `admin` attribue dans Paramétrage →
Administration les droits d'administration à des utilisateurs ou groupes
Entra (appartenances indirectes comprises), section par section :

- **Gestion du paramétrage** — « Autorisée » : le menu Paramétrage du profil
  (et l'onglet Affichage) ; sans lui, le Paramétrage n'est pas accessible.
- **Gestion des workspaces** — « Voir » (l'onglet Workspaces et les accès de
  chacun), « Créer » (en créer, les renommer, régler leurs accès),
  « Supprimer ». Chaque droit suppose les précédents.
- **Gestion des droits d'administration** — mêmes droits, pour l'onglet
  Administration.
- **Gestion des modèles d'email** et **Gestion des thèmes** — « Autorisée » :
  les onglets Modèles et Thèmes.

Un droit ne s'accorde ou ne se retire que par qui le détient. Sans
workspace, la personne connectée ne voit qu'un écran vide qui mène, si elle
le peut, à l'onglet Workspaces du Paramétrage. Sans aucun accès ni droit
d'administration, la connexion est refusée ; un accès retiré ferme la
session à la requête suivante.

Les droits des modes sont enregistrés mais pas encore appliqués à leurs
écrans et à leurs routes.

Les réglages vivent en base (table `settings`, clé `entra`). Le secret ne
redescend jamais au client : l'interface n'en connaît que la présence, et un
champ de secret auquel on ne touche pas ne l'efface pas.

#### Messagerie

Le courrier passe par Microsoft Graph, au nom de l'application, et part
toujours de la **boîte de support d'une société** (Paramétrage → Sociétés) :
une notification de suivi part de celle de la société de l'élément — le
projet, ou le tableau de la liste ou de la carte. Sans société ou sans e-mail
de support, la notification reste à l'écran. Milo peut aussi lire ces boîtes. « Vérifier les boîtes de support » (menu Actions de l'onglet) dit,
société par société, si l'accès est accordé.

#### Support par e-mail

Chaque e-mail reçu dans la boîte de support d'une société devient une demande
du mode Support : numéro de ticket `LMA-n`, statut « Ouvert », étiquette
« Urgent », l'expéditeur pour acteur et le message pour premier échange. Les
boîtes ne sont jamais modifiées : rien n'y est supprimé, déplacé ni marqué
comme lu.

- **Relève** — par la *delta query* de Graph : chaque boîte garde le lien que
  Graph lui a rendu (réglage `support_mail_delta`) et n'apprend que ce qui est
  arrivé depuis. Elle a lieu au démarrage, toutes les 5 minutes, à l'ouverture
  du mode Support, et à chaque notification de Graph.
- **Notifications de changement** — avec `MILO_PUBLIC_URL`, Milo s'abonne à
  la boîte de réception de chaque boîte de support. Un abonnement vit au plus
  sept jours : ils sont vérifiés toutes les 6 heures, prolongés ou recréés.
- **Réponses** — un message écrit dans le fil d'une demande reçue par e-mail
  part à l'expéditeur, depuis la boîte de support, en réponse à son e-mail.
  Elle porte le numéro du ticket dans son objet (`RE: [LMA-12] …`) et dans
  l'en-tête `X-Milo-Ticket`. Simulée si `MILO_SUPPORT_REPLY` vaut
  `simulate`.
- **Fil** — un e-mail qui répond à une demande rejoint son fil au lieu
  d'ouvrir un ticket : il cite l'un de ses messages dans `In-Reply-To` ou
  `References`, porte son numéro dans l'objet, ou arrive dans sa conversation
  Graph. Il rouvre la demande si elle était résolue ou fermée.
- **E-mails tels quels** — le corps est gardé en HTML et montré dans un cadre
  isolé ; ses images intégrées et ses pièces jointes sont rangées dans
  `MILO_TICKETS_PATH`, et font partie de la sauvegarde.

#### Inscrire Milo dans Azure

Une seule inscription d'application sert à tout, à faire une fois dans le
portail Azure (Microsoft Entra ID → Inscriptions d'applications → Nouvelle
inscription, comptes de cet annuaire uniquement) :

1. **Adresse de redirection** : de type « Web », et exactement
   `https://<hôte>/api/auth/entra/callback` — où `https://<hôte>` est
   l'adresse de redirection saisie dans l'onglet Entra (à défaut, celle par
   laquelle Milo est servi). L'onglet la montre, prête à copier. Microsoft
   refuse la connexion si elle diffère d'un caractère.
2. **Permissions**, sous « API autorisées » → Microsoft Graph :
   - déléguées : `openid`, `profile`, `email` (la connexion) ;
   - d'application : `User.Read.All`, `Group.Read.All`,
     `GroupMember.Read.All` (l'annuaire), `Mail.ReadWrite` et `Mail.Send`
     (les boîtes de support et l'expédition), et `Calendars.Read` (les
     rendez-vous que le widget Calendrier marque pour chacun). L'onglet
     Entra les vérifie une par une à la connexion.

   Puis **« Accorder un consentement d'administrateur »** : les permissions
   d'application ne valent qu'avec lui.
3. **Secret client**, sous « Certificats et secrets ». Il a une date
   d'expiration : passée celle-ci, plus personne ne peut se connecter par
   Microsoft ni recevoir de courrier jusqu'à ce qu'un nouveau secret soit
   enregistré — le compte `admin` reste là pour le faire.

Les trois valeurs à reporter dans l'onglet portent les noms du portail :
l'**ID d'application (client)**, l'**ID de l'annuaire (locataire)**, requis,
et le **secret**.

`Mail.ReadWrite` et `Mail.Send` ouvrent par défaut toutes les boîtes du locataire.
Pour les restreindre aux boîtes de support, une
stratégie d'accès d'application Exchange Online (`New-ApplicationAccessPolicy`)
limite l'application à un groupe de sécurité à extension messagerie qui les
contient.
Le widget Mail lit la boîte de réception de chacun avec cette même
permission : une telle stratégie le restreint aux boîtes du groupe.
