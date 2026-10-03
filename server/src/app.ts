// L'assemblage : ce qui passe avant les routes, les routes, ce qui passe
// après. Chaque ressource a son fichier dans `routes/` ; celui-ci dit
// seulement où chacune est montée et ce qu'elle exige.

import cors from "cors";
import express from "express";
import { env } from "./env.js";
import { compterEcritures, flux, payload } from "./middleware/events.js";
import { errorHandler, notFoundHandler } from "./middleware/errors.js";
import {
  requireAuth,
  requireSettings,
  requireWorkspaces,
  requireSettingsToWrite,
  requireSettingsUpdate,
} from "./middleware/require-auth.js";
import { assetRoutes, inventoryRoutes } from "./routes/assets.js";
import {
  attachmentRoutes,
  cardMediaRoutes,
  mediaRoutes,
  ticketFileRoutes,
} from "./routes/attachments.js";
import { authRoutes, publicAuthRoutes } from "./routes/auth.js";
import { backupRoutes } from "./routes/backup.js";
import { boardRoutes } from "./routes/boards.js";
import {
  boardContentRoutes,
  boardSectionRoutes,
  boardWidgetRoutes,
  widgetImageRoutes,
} from "./routes/board-widgets.js";
import { viewRoutes } from "./routes/views.js";
import { cardChecklistRoutes, checklistItemRoutes, checklistRoutes } from "./routes/checklists.js";
import { commentRoutes, projectCommentRoutes } from "./routes/comments.js";
import { boardContextRoutes, contextRoutes } from "./routes/contexts.js";
import { searchRoutes } from "./routes/search.js";
import { notificationRoutes } from "./routes/notifications.js";
import { supportSettingsRoutes } from "./routes/support-settings.js";
import { supportContentRoutes } from "./routes/support-contents.js";
import { supportReplyRoutes } from "./routes/support-replies.js";
import { assetSettingsRoutes } from "./routes/asset-settings.js";
import { milestoneTypeRoutes } from "./routes/milestone-types.js";
import { followRoutes } from "./routes/follows.js";
import { labelRoutes, projectLabelRoutes } from "./routes/labels.js";
import { entraRoutes } from "./routes/entra.js";
import { administrationRoutes, assignmentRoutes } from "./routes/assignments.js";
import { workspaceRoutes } from "./routes/workspaces.js";
import { categoryRoutes } from "./routes/project-boards.js";
import { projectRoutes } from "./routes/projects.js";
import {
  supportCommentRoutes,
  supportLabelRoutes,
  supportRequestRoutes,
} from "./routes/support.js";
import { taskCardRoutes, cardCommentRoutes } from "./routes/task-cards.js";
import { taskListRoutes } from "./routes/task-lists.js";
import { userRoutes } from "./routes/users.js";
import { developerRoutes } from "./routes/developer.js";
import { supportMailRoutes } from "./routes/support-mail.js";
import { optinRoutes } from "./routes/optins.js";

export const createApp = (): express.Express => {
  const app = express();

  // L'API et le client sont servis par le même hôte en production : aucune
  // origine tierce n'a de raison d'appeler l'API depuis un navigateur, et la
  // liste reste vide. `cors()` sans argument, lui, répondait « oui » à
  // n'importe laquelle.
  if (env.corsOrigins.length > 0) {
    app.use(cors({ origin: env.corsOrigins, credentials: true }));
  }

  // Une adresse IP juste est nécessaire à la limitation des tentatives :
  // derrière nginx, c'est l'en-tête X-Forwarded-For qui la porte.
  app.set("trust proxy", true);

  // Un corps en JSON n'a aucune raison de dépasser cette taille : les
  // descriptions sont du texte. Les fichiers, eux, ne passent pas par là :
  // leurs routes prennent le corps brut, avec leur propre limite
  // (routes/attachments.ts).
  app.use(express.json({ limit: "1mb" }));

  // Les compteurs de version montent après chaque écriture réussie, et le flux
  // les pousse aux clients. Posé avant les routes : chacune déclare ce qu'elle
  // touche, ce middleware en tire les conséquences une fois la réponse partie.
  app.use("/api", compterEcritures);

  // --- Sans authentification ------------------------------------------------
  app.use("/api/auth", publicAuthRoutes);

  // Les fichiers se lisent sans jeton : une balise « img » n'en porte pas. Le
  // nom du fichier tient lieu de clé (routes/attachments.ts).
  app.use("/api/medias", mediaRoutes);
  app.use("/api/ticket-files", ticketFileRoutes);

  // Les agents d'inventaire déposent ici. Ils n'ont pas de session : ce sont
  // des services qui tournent sur les postes, et le protocole qu'ils parlent
  // (celui d'OCS) ne prévoit qu'une authentification HTTP basique, réglée s'il
  // le faut par le serveur qui nous précède (nginx).
  app.use("/api/inventory", inventoryRoutes);

  // Microsoft y prévient Milo de l'arrivée d'un e-mail dans une boîte de
  // support. Le secret de l'abonnement tient lieu d'authentification.
  app.use("/api/support-mail", supportMailRoutes);

  // --- Tout le reste exige une session --------------------------------------
  app.use("/api/auth", authRoutes);
  app.use("/api", requireAuth);

  app.get("/api/version", (_req, res) => res.json(payload()));
  app.get("/api/events", flux);

  app.use("/api/users", userRoutes);
  // Ce que règle le Paramétrage demande ses droits (Voir, Modifier). Les
  // sociétés et les types de jalons se lisent partout dans l'application :
  // seules leurs écritures les demandent.
  app.use("/api/milestone-types", requireSettingsToWrite, milestoneTypeRoutes);
  // Les accès d'un workspace, réglés par qui gère les workspaces ;
  // l'administration — Paramétrage, gestion des workspaces —, par le
  // Paramétrage (routes/assignments.ts).
  app.use("/api/assignments", assignmentRoutes);
  app.use("/api/administration", administrationRoutes);
  app.use("/api/workspaces", requireWorkspaces, workspaceRoutes);
  app.use("/api/entra", requireSettings, entraRoutes);
  app.use("/api/backup", requireSettingsUpdate, backupRoutes);
  app.use("/api/follows", followRoutes);
  app.use("/api/notifications", notificationRoutes);

  // Les vues et leurs tableaux : chacun les voit, sauf privés ; les organiser
  // demande de pouvoir modifier au moins un type de widget (lib/droits.ts).
  // Ce qu'un tableau porte suit les permissions de chaque type de widget.
  app.use("/api/views", viewRoutes);
  app.use("/api/boards/:id/contexts", boardContextRoutes);
  app.use("/api/contexts", contextRoutes);
  app.use("/api/boards/:id", boardContentRoutes);
  app.use("/api/boards", boardRoutes);
  app.use("/api/board-sections", boardSectionRoutes);
  app.use("/api/board-widgets", boardWidgetRoutes);
  app.use("/api/widget-images", widgetImageRoutes);

  app.use("/api/categories", categoryRoutes);
  app.use("/api/project-labels", projectLabelRoutes);
  app.use("/api/projects/:id/comments", projectCommentRoutes);
  app.use("/api/projects", projectRoutes);
  app.use("/api/comments", commentRoutes);

  app.use("/api/task-lists", taskListRoutes);
  app.use("/api/task-cards/:id/checklists", cardChecklistRoutes);
  app.use("/api/task-cards/:id", cardMediaRoutes);
  app.use("/api/attachments", attachmentRoutes);
  app.use("/api/task-cards", taskCardRoutes);
  app.use("/api/card-comments", cardCommentRoutes);
  app.use("/api/checklists", checklistRoutes);
  app.use("/api/checklist-items", checklistItemRoutes);
  app.use("/api/labels", labelRoutes);

  app.use("/api/assets", assetRoutes);
  // La table des modèles : lue partout, écrite depuis le Paramétrage.
  app.use("/api/asset-settings", requireSettingsToWrite, assetSettingsRoutes);

  app.use("/api/support-requests", supportRequestRoutes);
  app.use("/api/mailbox-optins", optinRoutes);
  app.use("/api/support-comments", supportCommentRoutes);
  app.use("/api/support-labels", supportLabelRoutes);
  // L'échéance par défaut : lue partout, écrite depuis le Paramétrage.
  app.use("/api/support-settings", requireSettingsToWrite, supportSettingsRoutes);
  app.use("/api/support-replies", requireSettingsToWrite, supportReplyRoutes);
  // Lus par la fiche d'une demande, qui les pose dans sa réponse.
  app.use("/api/support-contents", requireSettingsToWrite, supportContentRoutes);

  app.use("/api/search", searchRoutes);
  // Lus par tous — ils règlent l'interface de chacun —, écrits depuis le
  // Paramétrage seulement.
  app.use("/api/developer", requireSettingsToWrite, developerRoutes);

  app.use("/api", notFoundHandler);
  app.use(errorHandler);

  return app;
};
