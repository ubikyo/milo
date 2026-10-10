// The assembly: what runs before the routes, the routes, what runs after.
// Each resource has its file in `routes/`; this one only says where each is
// mounted and what it requires.

import cors from "cors";
import express from "express";
import { CONTACT_ROUTES, DECLARED_ASSET_KINDS, PRODUCT_ROUTES, DECLARED_ASSET_ROUTES, DECLARED_ASSET_WORDS } from "@milo/shared";
import { env } from "./env.js";
import { countWrites, feed, payload } from "./middleware/events.js";
import { errorHandler, notFoundHandler } from "./middleware/errors.js";
import {
  requireAuth,
  requireSettings,
  requireWorkspaces,
  requireSettingsToWrite,
  requireSettingsUpdate,
  requireTemplatesToWrite,
  requireThemesToWrite,
} from "./middleware/require-auth.js";
import { managedDeviceAssetRoutes, inventoryRoutes } from "./routes/managed-device-assets.js";
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
import { boardContextRoutes } from "./routes/contexts.js";
import { searchRoutes } from "./routes/search.js";
import { notificationRoutes } from "./routes/notifications.js";
import { supportSettingsRoutes } from "./routes/support-settings.js";
import { supportContentRoutes } from "./routes/support-contents.js";
import { supportReplyRoutes } from "./routes/support-replies.js";
import { managedDeviceAssetSettingsRoutes } from "./routes/managed-device-asset-settings.js";
import { declaredAssetSettingsRoutes } from "./routes/declared-asset-settings.js";
import { declaredAssetRoutes } from "./routes/declared-assets.js";
import { contactRoutes, contactSettingsRoutes } from "./routes/contacts.js";
import { productRoutes, productSettingsRoutes } from "./routes/products.js";
import { milestoneTypeRoutes } from "./routes/milestone-types.js";
import { followRoutes } from "./routes/follows.js";
import {
  managedDeviceAssetLabelRoutes,
  declaredAssetLabelRoutes,
  contactLabelRoutes,
  productLabelRoutes,
  labelRoutes,
  projectLabelRoutes,
  supportLabelRoutes,
} from "./routes/labels.js";
import { cardLinkRoutes, linkRoutes } from "./routes/links.js";
import { entraRoutes } from "./routes/entra.js";
import { administrationRoutes, assignmentRoutes } from "./routes/assignments.js";
import { workspaceRoutes } from "./routes/workspaces.js";
import { categoryRoutes } from "./routes/project-boards.js";
import { projectRoutes } from "./routes/projects.js";
import {
  supportCommentRoutes,
  supportRequestRoutes,
} from "./routes/support.js";
import { taskCardRoutes, cardCommentRoutes } from "./routes/task-cards.js";
import { taskListRoutes } from "./routes/task-lists.js";
import { userRoutes } from "./routes/users.js";
import { mailTemplateRoutes } from "./routes/mail-templates.js";
import { displaySettingsRoutes } from "./routes/display-settings.js";
import { miloSettingsRoutes } from "./routes/milo-settings.js";
import { themeColorRoutes } from "./routes/theme-colors.js";
import { titleStyleRoutes } from "./routes/title-styles.js";
import { settingsNotice } from "./middleware/settings-notice.js";
import { supportMailRoutes } from "./routes/support-mail.js";
import { m365WebhookRoutes } from "./routes/m365-webhooks.js";
import { optinRoutes } from "./routes/optins.js";
import { calendarOptinRoutes, mailOptinRoutes } from "./routes/widget-optins.js";
import { undoRoutes } from "./routes/undo.js";
import { printerRoutes } from "./routes/printers.js";
import { paperFormatRoutes } from "./routes/paper-formats.js";
import { labelTemplateRoutes } from "./routes/label-templates.js";
import { assetNumberTemplateRoutes } from "./routes/asset-number-templates.js";
import { apiTokenRoutes } from "./routes/api-tokens.js";
import { proxyRoutes } from "./routes/proxies.js";

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
  // And here of what changes in what a Mail or Calendar widget reads.
  app.use("/api/m365", m365WebhookRoutes);

  // --- Everything else requires a session -----------------------------------
  app.use("/api/auth", authRoutes);
  app.use("/api", requireAuth);

  app.get("/api/version", (_req, res) => res.json(payload()));
  app.get("/api/events", feed);

  app.use("/api/users", settingsNotice("les comptes", /^\/favorites\//), userRoutes);
  // What Settings controls requires its rights (View, Edit). Companies and
  // milestone types are read everywhere in the application: only writing them
  // requires them.
  app.use("/api/milestone-types", requireSettingsToWrite, settingsNotice("les types de jalons"), milestoneTypeRoutes);
  // A workspace's access, set by whoever manages the workspaces;
  // administration — Settings, workspace management — by Settings
  // (routes/assignments.ts).
  app.use("/api/assignments", settingsNotice("les accès d'un workspace"), assignmentRoutes);
  app.use("/api/administration", settingsNotice("l'administration"), administrationRoutes);
  app.use("/api/workspaces", requireWorkspaces, settingsNotice("les workspaces"), workspaceRoutes);
  app.use("/api/entra", requireSettings, settingsNotice("la connexion Entra", /^\/(test|sender\/code)$/), entraRoutes);
  // The API tokens: an outside client's access to some workspaces.
  app.use("/api/api-tokens", requireSettings, settingsNotice("les jetons d'API"), apiTokenRoutes);
  app.use("/api/backup", requireSettingsUpdate, settingsNotice("la sauvegarde (restauration)"), backupRoutes);
  app.use("/api/follows", followRoutes);
  app.use("/api/notifications", notificationRoutes);

  // Views and their boards: their owner sees them, and those they are shared
  // with (repositories/shares.ts); organizing
  // them requires being able to edit at least one widget type (lib/rights.ts).
  // What a board carries follows the permissions of each widget type.
  app.use("/api/views", viewRoutes);
  app.use("/api/boards/:id/contexts", boardContextRoutes);
  app.use("/api/boards/:id", boardContentRoutes);
  app.use("/api/boards", boardRoutes);
  app.use("/api/board-sections", boardSectionRoutes);
  app.use("/api/board-widgets", boardWidgetRoutes);
  app.use("/api/undo", undoRoutes);
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

  app.use("/api/managed-device-asset-labels", managedDeviceAssetLabelRoutes);
  app.use("/api/managed-device-assets", managedDeviceAssetRoutes);
  // The templates table: read everywhere, written from Settings.
  app.use(
    "/api/managed-device-asset-settings",
    settingsNotice("les réglages des postes"),
    managedDeviceAssetSettingsRoutes,
  );
  // The declared assets, kind by kind — equipment, applications —: the
  // assets, their labels, their board's lists.
  // The label templates of the asset widgets, kind by kind: previewing or
  // printing one changes nothing.
  app.use(
    "/api/label-templates",
    settingsNotice("les modèles d'étiquette", /\/(preview|print)$/),
    labelTemplateRoutes,
  );
  // The asset number templates of the declared asset widgets, kind by kind.
  app.use(
    "/api/asset-number-templates",
    settingsNotice("les modèles de format d'asset"),
    assetNumberTemplateRoutes,
  );
  for (const kind of DECLARED_ASSET_KINDS) {
    const routes = DECLARED_ASSET_ROUTES[kind];
    app.use(`/api${routes.assets}`, declaredAssetRoutes(kind));
    app.use(`/api${routes.labels}`, declaredAssetLabelRoutes(kind));
    app.use(
      `/api${routes.settings}`,
      settingsNotice(`les réglages des ${DECLARED_ASSET_WORDS[kind].label.toLowerCase()}`),
      declaredAssetSettingsRoutes(kind),
    );
  }
  // The contacts of the "Contact" widgets (Logistique): the contacts, their
  // labels, their board's lists.
  app.use(`/api${CONTACT_ROUTES.contacts}`, contactRoutes);
  app.use(`/api${CONTACT_ROUTES.labels}`, contactLabelRoutes);
  app.use(
    `/api${CONTACT_ROUTES.settings}`,
    settingsNotice("les réglages des contacts"),
    contactSettingsRoutes,
  );
  // The products of the "Produits" widgets (Logistique), their labels, their
  // board's lists.
  app.use(`/api${PRODUCT_ROUTES.products}`, productRoutes);
  app.use(`/api${PRODUCT_ROUTES.labels}`, productLabelRoutes);
  app.use(
    `/api${PRODUCT_ROUTES.settings}`,
    settingsNotice("les réglages des produits"),
    productSettingsRoutes,
  );


  app.use("/api/support-requests", supportRequestRoutes);
  app.use("/api/mailbox-optins", optinRoutes);
  app.use("/api/calendar-optins", calendarOptinRoutes);
  app.use("/api/mail-optins", mailOptinRoutes);
  app.use("/api/support-comments", supportCommentRoutes);
  app.use("/api/support-labels", supportLabelRoutes);
  // The default due date: read everywhere, written from Settings.
  app.use("/api/support-settings", requireSettingsToWrite, settingsNotice("les réglages du Support"), supportSettingsRoutes);
  app.use("/api/support-replies", requireSettingsToWrite, settingsNotice("les réponses du Support"), supportReplyRoutes);
  // Read by a request's page, which puts them in its reply.
  app.use("/api/support-contents", requireSettingsToWrite, settingsNotice("les contenus du Support"), supportContentRoutes);

  app.use("/api/search", searchRoutes);
  // Read by everyone — they set everyone's interface —, written from
  // Settings only.
  app.use("/api/mail-templates", requireTemplatesToWrite, settingsNotice("les modèles d'e-mail", /preview$/), mailTemplateRoutes);
  app.use("/api/display-settings", requireSettingsToWrite, settingsNotice("l'affichage"), displaySettingsRoutes);
  app.use("/api/milo-settings", requireSettingsToWrite, settingsNotice("les réglages de Milo"), miloSettingsRoutes);
  // Read by everyone — whoever prints picks one —, set from Settings
  // (routes/printers.ts). Printing changes nothing.
  app.use("/api/printers", settingsNotice("les imprimantes", /\/print$/), printerRoutes);
  // The proxies the printers may be reached through; their own socket is not
  // a route, but an upgrade of the HTTP server (lib/proxy-hub.ts).
  app.use("/api/proxies", requireSettings, settingsNotice("les proxys"), proxyRoutes);
  app.use("/api/paper-formats", requireSettingsToWrite, settingsNotice("les formats de papier"), paperFormatRoutes);
  app.use("/api/theme-colors", requireThemesToWrite, settingsNotice("les couleurs des thèmes"), themeColorRoutes);
  app.use("/api/title-styles", settingsNotice("les styles de titres"), titleStyleRoutes);

  app.use("/api", notFoundHandler);
  app.use(errorHandler);

  return app;
};
