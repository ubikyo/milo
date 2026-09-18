# Milo

Suivi de projets : liste filtrable par catégorie et statut, fiche projet en volet latéral avec progression et fil de commentaires.

## Stack

- **Frontend** : React + Vite + [Mantine](https://mantine.dev/) v7
- **Backend** : Node.js + Express + SQLite ([better-sqlite3](https://github.com/WiseLibs/better-sqlite3))
- **Environnement** : Dev Container (VS Code / Codespaces)

## Démarrer avec le Dev Container

1. Ouvrir le dossier dans VS Code avec l'extension **Dev Containers**.
2. Palette de commandes → `Dev Containers: Reopen in Container`.
3. Les dépendances sont installées automatiquement (`postCreateCommand`).
4. Lancer l'API et le frontend dans deux terminaux :

   ```bash
   npm run dev --prefix server
   npm run dev --prefix client
   ```

5. Frontend disponible sur http://localhost:5273, API sur http://localhost:3001.

## Démarrer sans Dev Container

Prérequis : Node.js 20+.

```bash
npm install --prefix server
npm install --prefix client
npm run dev --prefix server   # terminal 1
npm run dev --prefix client   # terminal 2
```

## Structure

```
server/   API Express + base SQLite (fichier data.db généré au démarrage)
client/   Application React (Mantine)
.devcontainer/   Configuration du Dev Container
```

## API

| Méthode | Route | Description |
| --- | --- | --- |
| GET | `/api/categories` | Liste des catégories |
| GET | `/api/projects` | Liste des projets (`?category=&status=`) |
| POST | `/api/projects` | Créer un projet |
| PUT | `/api/projects/:id` | Modifier un projet |
| DELETE | `/api/projects/:id` | Supprimer un projet |
| POST | `/api/projects/:id/comments` | Ajouter un commentaire |
| PUT | `/api/comments/:id` | Modifier un commentaire |
| DELETE | `/api/comments/:id` | Supprimer un commentaire |
