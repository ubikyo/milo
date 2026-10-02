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
  requireSettingsToWrite,
  requireSettingsUpdate,
} from "./middleware/require-auth.js";
import {
  accessBlockRoutes,
  accessCategoryRoutes,
  accessSectionRoutes,
} from "./routes/access.js";
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
import { cardChecklistRoutes, checklistItemRoutes, checklistRoutes } from "./routes/checklists.js";
import { commentRoutes, projectCommentRoutes } from "./routes/comments.js";
import { companyRoutes } from "./routes/companies.js";
import { searchRoutes } from "./routes/search.js";
import { notificationRoutes } from "./routes/notifications.js";
import { supportIndicatorRoutes } from "./routes/support-indicators.js";
import { assetIndicatorRoutes } from "./routes/asset-indicators.js";
import { projectIndicatorRoutes } from "./routes/project-indicators.js";
import { taskIndicatorRoutes } from "./routes/task-indicators.js";
import { supportSettingsRoutes } from "./routes/support-settings.js";
import { supportContentRoutes } from "./routes/support-contents.js";
import { supportReplyRoutes } from "./routes/support-replies.js";
import { assetSettingsRoutes } from "./routes/asset-settings.js";
import { milestoneTypeRoutes } from "./routes/milestone-types.js";
import { followRoutes } from "./routes/follows.js";
import { labelRoutes, projectLabelRoutes } from "./routes/labels.js";
import { entraRoutes } from "./routes/entra.js";
import { assignmentRoutes } from "./routes/assignments.js";
import { categoryRoutes, projectBoardRoutes } from "./routes/project-boards.js";
import { projectRoutes } from "./routes/projects.js";
import {
  supportCommentRoutes,
  supportLabelRoutes,
  supportRequestRoutes,
} from "./routes/support.js";
import { taskCardRoutes, cardCommentRoutes } from "./routes/task-cards.js";
import { taskListRoutes } from "./routes/task-lists.js";
import { userRoutes } from "./routes/users.js";
import { exigerParMethode, exigerVoir } from "./lib/droits.js";
import { tabOrderRoutes } from "./routes/tab-orders.js";
import { developerRoutes } from "./routes/developer.js";
import { supportMailRoutes } from "./routes/support-mail.js";

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
  app.use("/api/companies", requireSettingsToWrite, companyRoutes);
  app.use("/api/milestone-types", requireSettingsToWrite, milestoneTypeRoutes);
  app.use("/api/assignments", requireSettings, assignmentRoutes);
  app.use("/api/entra", requireSettings, entraRoutes);
  app.use("/api/backup", requireSettingsUpdate, backupRoutes);
  app.use("/api/follows", followRoutes);
  app.use("/api/notifications", notificationRoutes);

  // Le mode Accès n'appartient à aucune société : ses droits sont ceux de
  // toutes les sociétés du compte réunies. Les autres modes vérifient les
  // leurs route par route, société par société (lib/droits.ts).
  // Ranger ses onglets ne touche que son ordre à soi : le voir suffit.
  app.use(
    "/api/access-categories",
    exigerParMethode("access", (req) => req.method === "PUT" && req.path === "/reorder"),
    accessCategoryRoutes,
  );
  // Les sections et les éléments ne demandent ici que de voir le mode : leurs
  // écritures vérifient le droit route par route, une structure personnelle
  // (« Hérité » décoché) n'étant qu'à son compte.
  app.use("/api/access-sections", exigerVoir("access"), accessSectionRoutes);
  app.use("/api/access-blocks", exigerVoir("access"), accessBlockRoutes);

  app.use("/api/project-boards", projectBoardRoutes);
  app.use("/api/categories", categoryRoutes);
  app.use("/api/project-labels", projectLabelRoutes);
  app.use("/api/projects/:id/comments", projectCommentRoutes);
  app.use("/api/projects", projectRoutes);
  app.use("/api/comments", commentRoutes);
  app.use("/api/project-indicators", projectIndicatorRoutes);

  app.use("/api/boards", boardRoutes);
  app.use("/api/task-lists", taskListRoutes);
  app.use("/api/task-cards/:id/checklists", cardChecklistRoutes);
  app.use("/api/task-cards/:id", cardMediaRoutes);
  app.use("/api/attachments", attachmentRoutes);
  app.use("/api/task-cards", taskCardRoutes);
  app.use("/api/card-comments", cardCommentRoutes);
  app.use("/api/checklists", checklistRoutes);
  app.use("/api/checklist-items", checklistItemRoutes);
  app.use("/api/labels", labelRoutes);
  app.use("/api/task-indicators", taskIndicatorRoutes);

  app.use("/api/assets", assetRoutes);
  app.use("/api/asset-indicators", assetIndicatorRoutes);
  // La table des modèles : lue partout, écrite depuis le Paramétrage.
  app.use("/api/asset-settings", requireSettingsToWrite, assetSettingsRoutes);

  app.use("/api/support-requests", supportRequestRoutes);
  app.use("/api/support-comments", supportCommentRoutes);
  app.use("/api/support-labels", supportLabelRoutes);
  app.use("/api/support-indicators", supportIndicatorRoutes);
  // L'échéance par défaut : lue partout, écrite depuis le Paramétrage.
  app.use("/api/support-settings", requireSettingsToWrite, supportSettingsRoutes);
  app.use("/api/support-replies", requireSettingsToWrite, supportReplyRoutes);
  // Lus par la fiche d'une demande, qui les pose dans sa réponse.
  app.use("/api/support-contents", requireSettingsToWrite, supportContentRoutes);

  app.use("/api/search", searchRoutes);
  app.use("/api/tab-orders", tabOrderRoutes);
  // Lus par tous — ils règlent l'interface de chacun —, écrits depuis le
  // Paramétrage seulement.
  app.use("/api/developer", requireSettingsToWrite, developerRoutes);

  app.use("/api", notFoundHandler);
  app.use(errorHandler);

  return app;
};
