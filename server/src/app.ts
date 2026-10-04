// The assembly: what runs before the routes, the routes, what runs after.
// Each resource has its file in `routes/`; this one only says where each is
// mounted and what it requires.

import cors from "cors";
import express from "express";
import { env } from "./env.js";
import { countWrites, feed, payload } from "./middleware/events.js";
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
  coverRoutes,
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
import { cardLinkRoutes, linkRoutes } from "./routes/links.js";
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
import { notificationSettingsRoutes } from "./routes/notification-settings.js";
import { supportMailRoutes } from "./routes/support-mail.js";
import { optinRoutes } from "./routes/optins.js";

export const createApp = (): express.Express => {
  const app = express();

  // The API and the client are served by the same host in production: no
  // third-party origin has any reason to call the API from a browser, and the
  // list stays empty. `cors()` with no argument, on the other hand, answered
  // "yes" to any of them.
  if (env.corsOrigins.length > 0) {
    app.use(cors({ origin: env.corsOrigins, credentials: true }));
  }

  // A correct IP address is needed to rate-limit attempts: behind nginx, it
  // is carried by the X-Forwarded-For header.
  app.set("trust proxy", true);

  // A JSON body has no reason to exceed this size: descriptions are text.
  // Files do not go through here: their routes take the raw body, with their
  // own limit (routes/attachments.ts).
  app.use(express.json({ limit: "1mb" }));

  // The version counters go up after every successful write, and the stream
  // pushes them to the clients. Placed before the routes: each declares what
  // it touches, and this middleware draws the consequences once the response
  // has gone out.
  app.use("/api", countWrites);

  // --- Without authentication -----------------------------------------------
  app.use("/api/auth", publicAuthRoutes);

  // Files are read without a token: an "img" tag does not carry one. The
  // file name serves as the key (routes/attachments.ts). The old address,
  // "/api/medias", is still served: emails already sent cite it.
  app.use("/api/media", mediaRoutes);
  app.use("/api/medias", mediaRoutes);
  app.use("/api/ticket-files", ticketFileRoutes);

  // Inventory agents drop their data here. They have no session: they are
  // services running on workstations, and the protocol they speak (OCS's)
  // provides only for basic HTTP authentication, set if needed by the server
  // in front of us (nginx).
  app.use("/api/inventory", inventoryRoutes);

  // Microsoft notifies Milo here of an email arriving in a support mailbox.
  // The subscription's secret serves as authentication.
  app.use("/api/support-mail", supportMailRoutes);

  // --- Everything else requires a session -----------------------------------
  app.use("/api/auth", authRoutes);
  app.use("/api", requireAuth);

  app.get("/api/version", (_req, res) => res.json(payload()));
  app.get("/api/events", feed);

  app.use("/api/users", userRoutes);
  // What Settings controls requires its rights (View, Edit). Companies and
  // milestone types are read everywhere in the application: only writing them
  // requires them.
  app.use("/api/milestone-types", requireSettingsToWrite, milestoneTypeRoutes);
  // A workspace's access, set by whoever manages the workspaces;
  // administration — Settings, workspace management — by Settings
  // (routes/assignments.ts).
  app.use("/api/assignments", assignmentRoutes);
  app.use("/api/administration", administrationRoutes);
  app.use("/api/workspaces", requireWorkspaces, workspaceRoutes);
  app.use("/api/entra", requireSettings, entraRoutes);
  app.use("/api/backup", requireSettingsUpdate, backupRoutes);
  app.use("/api/follows", followRoutes);
  app.use("/api/notifications", notificationRoutes);

  // Views and their boards: their owner sees them, and those they are shared
  // with (repositories/shares.ts); organizing
  // them requires being able to edit at least one widget type (lib/rights.ts).
  // What a board carries follows the permissions of each widget type.
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
  app.use("/api/task-cards/:id/links", cardLinkRoutes);
  app.use("/api/task-cards/:id", cardMediaRoutes);
  app.use("/api/attachments", attachmentRoutes);
  app.use("/api/covers", coverRoutes);
  app.use("/api/task-cards", taskCardRoutes);
  app.use("/api/card-comments", cardCommentRoutes);
  app.use("/api/checklists", checklistRoutes);
  app.use("/api/checklist-items", checklistItemRoutes);
  app.use("/api/card-links", linkRoutes);
  app.use("/api/labels", labelRoutes);

  app.use("/api/assets", assetRoutes);
  // The templates table: read everywhere, written from Settings.
  app.use("/api/asset-settings", requireSettingsToWrite, assetSettingsRoutes);

  app.use("/api/support-requests", supportRequestRoutes);
  app.use("/api/mailbox-optins", optinRoutes);
  app.use("/api/support-comments", supportCommentRoutes);
  app.use("/api/support-labels", supportLabelRoutes);
  // The default due date: read everywhere, written from Settings.
  app.use("/api/support-settings", requireSettingsToWrite, supportSettingsRoutes);
  app.use("/api/support-replies", requireSettingsToWrite, supportReplyRoutes);
  // Read by a request's page, which puts them in its reply.
  app.use("/api/support-contents", requireSettingsToWrite, supportContentRoutes);

  app.use("/api/search", searchRoutes);
  // Read by everyone — they set everyone's interface —, written from
  // Settings only.
  app.use("/api/notification-settings", requireSettingsToWrite, notificationSettingsRoutes);

  app.use("/api", notFoundHandler);
  app.use(errorHandler);

  return app;
};
