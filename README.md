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
cible. Le pipeline Azure (`azure-pipelines.yml`) fait cela, puis dépose le
client statique et l'API sur la VM.

### Variables d'environnement du serveur

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `PORT` | `3001` | Port d'écoute |
| `MILO_DB_PATH` | `server/data.db` | Emplacement de la base |
| `MILO_MEDIA_PATH` | `medias/` (racine) | Dossier des fichiers déposés sur les cartes et des images collées dans une description |
| `MILO_SESSION_DAYS` | `30` | Fermeture d'une session inutilisée |
| `MILO_NOTIFY_WINDOW_MINUTES` | `5` | Fenêtre de regroupement des e-mails de suivi. Les modifications d'un même élément dans ce délai tiennent en un seul message ; la notification à l'écran reste immédiate. |
| `MILO_CORS_ORIGINS` | *(vide)* | Origines autorisées, séparées par des virgules. Vide = aucune, ce qui convient quand le client est servi par le même hôte. |

## API

Toutes les routes sont sous `/api` et exigent un jeton
(`Authorization: Bearer …`), sauf l'ouverture de session.

| Ressource | Routes |
| --- | --- |
| Session | `GET/POST /auth/setup`, `POST /auth/login`, `POST /auth/first-login`, `GET/PUT /auth/me`, `POST /auth/logout` |
| Comptes | `GET/POST /users`, `PUT/DELETE /users/:id` |
| Sociétés | `GET/POST /companies`, `PUT/DELETE /companies/:id` |
| Suivi | `GET /follows`, `PUT/DELETE /follows/:kind/:id` |
| Sauvegarde | `GET /backup`, `GET /backup/archive`, `POST /backup/restore` |
| Messagerie | `GET/PUT /mail`, `POST /mail/test`, `POST /mail/oauth/start`, `POST /mail/oauth/disconnect`, `GET /mail/oauth/callback` |
| Tableaux de projets | `GET/POST /project-boards`, `PUT/DELETE /project-boards/:id` |
| Catégories | `GET/POST /categories`, `PUT/DELETE /categories/:id` |
| Projets | `GET/POST /projects`, `GET/PUT/DELETE /projects/:id` |
| Commentaires | `POST /projects/:id/comments`, `PUT/DELETE /comments/:id` |
| Tableaux de tâches | `GET/POST /boards`, `PUT/DELETE /boards/:id` |
| Listes | `GET/POST /task-lists`, `PUT /task-lists/reorder`, `PUT/DELETE /task-lists/:id` |
| Cartes | `POST /task-cards`, `PUT /task-cards/reorder`, `GET/PUT /task-cards/:id`, `GET /task-cards/:id/emplacement`, `POST /task-cards/:id/comments`, `PUT/DELETE /card-comments/:id` |
| Checklists | `POST /task-cards/:id/checklists`, `PUT /task-cards/:id/checklists/reorder`, `PUT/DELETE /checklists/:id`, `POST /checklists/:id/items`, `PUT /checklists/:id/items/reorder`, `PUT/DELETE /checklist-items/:id` |
| Étiquettes | `GET/POST /labels`, `PUT/DELETE /labels/:id`, et les mêmes sous `/project-labels` |
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

### Messagerie

Les réglages du serveur SMTP vivent en base (table `settings`), et se règlent
dans Paramétrage → Messagerie : authentification par nom d'utilisateur ou par
OAuth Outlook, chiffrement de la connexion, serveur, port et nom d'utilisateur.

Trois chiffrements, tous sur le port de soumission — la connexion s'ouvre en
clair et monte en TLS par StartTLS :

| Chiffrement | Ce qu'il fait |
| --- | --- |
| Aucun | Rien n'est chiffré. Le défaut, pour un relais interne. |
| StartTLS, avec validation | TLS exigé, certificat du serveur vérifié. C'est le réglage normal dès qu'on sort du réseau local. |
| StartTLS, sans validation | TLS exigé, certificat accepté tel quel. Protège de l'écoute, pas de l'usurpation : pour un relais interne à certificat maison, et rien d'autre. |

Ces trois champs — chiffrement, serveur, port — ainsi que le nom d'utilisateur
ne concernent que l'authentification par mot de passe. **En OAuth Outlook, ils
disparaissent de l'onglet** : Office 365 les impose, et le serveur les applique
lui-même.

| Réglage | Valeur imposée par Microsoft |
| --- | --- |
| Serveur | `smtp.office365.com` — le nom documenté, jamais une adresse IP |
| Port | 587 |
| Chiffrement | StartTLS, avec validation (TLS 1.2 ou 1.3 exigé ; « Aucun » est refusé) |
| Expéditeur | Le compte qui a donné son consentement |

Le port 465 (TLS implicite) n'est proposé nulle part, et ne l'est pas non plus
par Microsoft, qui le documente comme le signe d'un client trop ancien.

Les secrets — mot de passe SMTP, secret d'application, jeton de rafraîchissement
— ne redescendent jamais au client : l'interface n'en connaît que la présence,
et un champ de secret laissé vide ne les efface pas.

#### Inscrire Milo dans Azure

L'authentification OAuth Outlook suppose une inscription d'application, à faire
une fois dans le portail Azure (Microsoft Entra ID → Inscriptions
d'applications → Nouvelle inscription) :

1. **Adresse de redirection** : de type « Web », et exactement
   `https://<hôte>/api/mail/oauth/callback` — où `<hôte>` est celui par lequel
   Milo est servi, le même que dans la barre d'adresse du navigateur.
   Microsoft refuse la connexion si elle diffère d'un caractère. Le serveur la
   construit de la même façon, depuis l'adresse par laquelle on l'appelle : il
   n'y a rien à régler de ce côté.
2. **Permission déléguée** `SMTP.Send` d'Office 365 Exchange Online, sous
   « API autorisées ». `offline_access` et `openid` sont demandées au vol par
   Milo : la première donne le jeton durable, sans lequel il faudrait redonner
   son consentement à chaque envoi, la seconde sert à connaître l'adresse du
   compte connecté.
3. **Secret client**, sous « Certificats et secrets ». Il a une date
   d'expiration : passée celle-ci, l'envoi s'arrête jusqu'à ce qu'un nouveau
   secret soit enregistré.

Les trois valeurs à reporter dans l'onglet portent les noms du portail :
l'**ID d'application (client)**, l'**ID de l'annuaire (locataire)** et le
**secret**. L'ID de l'annuaire peut rester vide : Milo s'adresse alors à
`common`, qui accepte tous les comptes Microsoft. Le renseigner — ou mettre
`organizations` — restreint la connexion aux comptes de l'organisation.
Changer l'identifiant ou le locataire annule le consentement obtenu avec le
précédent : le jeton de rafraîchissement ne vaut que pour l'inscription qui l'a
délivré.

Côté Exchange Online, l'authentification SMTP (`SmtpClientAuthenticationDisabled`)
doit être active sur la boîte utilisée : elle est coupée par défaut sur les
locataires récents.
