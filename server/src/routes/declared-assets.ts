// The declared assets of a board, kind by kind (shared, declared-assets.ts):
// entered by hand in its widgets of the kind, each in its own (LIST_KEY), with
// their actors, labels, photos and documents. They follow the permission on
// their widget type, like their labels and lists.
//
// As on a card, the photos and documents go out on upload, without waiting
// for "Sauvegarder"; the rest of the record goes with it.

import express, { Router } from "express";
import type { Request } from "express";
import {
  DECLARED_ASSET_DESCRIPTION_MAX,
  DECLARED_ASSET_EXTRAS,
  DECLARED_ASSET_NAME_MAX,
  DECLARED_ASSET_PRICE_MAX,
  DECLARED_ASSET_QUANTITY_MAX,
  DECLARED_ASSET_RESOURCES,
  DECLARED_ASSET_TYPED_VALUES_MAX,
  DECLARED_ASSET_TYPED_VALUE_MAX,
  DECLARED_ASSET_VERSION_MAX,
  DECLARED_ASSET_WEBSITE_MAX,
  accessIncludes,
  declaredAssetListType,
} from "@milo/shared";
import type {
  Actor,
  DeclaredAsset,
  DeclaredAssetAttachment,
  DeclaredAssetExtraField,
  DeclaredAssetFiles,
  DeclaredAssetKind,
  DeclaredAssetPhoto,
  DeclaredAssetTypedValue,
  Id,
  Label,
  WidgetAccess,
} from "@milo/shared";
import { JSON_EXTRAS, declaredAssetTables } from "../db/declared-asset-tables.js";
import { mutation, scalar, selection, transaction } from "../db/query.js";
import type { NextRow } from "../db/rows.js";
import { HttpError, badRequest, orNotFound, requireText, toIds } from "../lib/http.js";
import { SIZE_MAX, deleteMedia, inlineType, isImage, mediaUrl, writeMedia } from "../lib/media.js";
import { now } from "../lib/time.js";
import { touch } from "../middleware/events.js";
import { attachments as cardAttachments } from "../repositories/attachments.js";
import { openBoard } from "../repositories/boards.js";
import { keyInBoard } from "../repositories/lists.js";
import { actorOf, widgetRights } from "../repositories/users.js";

const NOT_FOUND = "Asset introuvable";

type DeclaredAssetRow = Omit<DeclaredAsset, "actors" | "labels">;

interface FileRow {
  id: Id;
  asset_id: Id;
  file: string;
  name: string;
  mime?: string;
  size: number;
  position: number;
  created_at: string;
}

/** A short text, trimmed and checked for length. */
const text = (value: unknown, max: number, what: string): string => {
  const read = String(value ?? "").trim();
  if (read.length > max) badRequest(`${what} tient en ${max} caractères`);
  return read;
};

/** The quantity: a whole number, 1 when not given. */
const quantityOf = (value: unknown): number => {
  if (value === undefined || value === null || value === "") return 1;
  const quantity = Number(value);
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > DECLARED_ASSET_QUANTITY_MAX) {
    badRequest(`La quantité est un nombre entier de 0 à ${DECLARED_ASSET_QUANTITY_MAX}`);
  }
  return quantity;
};

/** The price: a positive amount, to the cent; null when not given. */
const priceOf = (value: unknown): number | null => {
  if (value === undefined || value === null || value === "") return null;
  const price = Number(value);
  if (!Number.isFinite(price) || price < 0 || price > DECLARED_ASSET_PRICE_MAX) {
    badRequest("Le prix est un montant positif");
  }
  return Math.round(price * 100) / 100;
};

/**
 * A website's address: "https://" in front when none is given — what is
 * typed is "editeur.fr" more often than not —; only http(s).
 */
const websiteOf = (value: unknown): string => {
  const typed = text(value, DECLARED_ASSET_WEBSITE_MAX, "Une adresse");
  if (!typed) return "";
  const address = /^[a-z][a-z0-9+.-]*:/i.test(typed) ? typed : `https://${typed}`;
  try {
    const url = new URL(address);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error();
  } catch {
    badRequest(`« ${typed} » n'est pas l'adresse d'un site web`);
  }
  return address;
};

/**
 * Typed values — identifications, license information —, in their order, as
 * stored: a JSON list. Rows without a value are left out; "what" names them
 * in the messages.
 */
const typedValuesOf =
  (what: string) =>
  (value: unknown): string => {
    if (value === undefined || value === null) return "[]";
    if (!Array.isArray(value)) badRequest(`${what} sont une liste`);
    const list: DeclaredAssetTypedValue[] = [];
    for (const entry of value as unknown[]) {
      const row = (entry ?? {}) as Record<string, unknown>;
      const typed = text(row.value, DECLARED_ASSET_TYPED_VALUE_MAX, "Une valeur");
      if (!typed) continue;
      const type = text(row.type, DECLARED_ASSET_NAME_MAX, "Un type");
      if (!type) badRequest(`« ${typed} » n'a pas de type`);
      list.push({ type, value: typed });
    }
    if (list.length > DECLARED_ASSET_TYPED_VALUES_MAX) {
      badRequest(`${what} tiennent en ${DECLARED_ASSET_TYPED_VALUES_MAX} lignes`);
    }
    return JSON.stringify(list);
  };

/** A place's id, as the client draws it. */
const LOCATION_ID_MAX = 64;

/** Each extra field, read from the request, as stored. */
const EXTRA_READERS: Record<DeclaredAssetExtraField, (value: unknown) => string> = {
  identifications: typedValuesOf("Les identifications"),
  // A place of the board's locations tree, by its id: one no longer in it shows none.
  location: (value) => text(value, LOCATION_ID_MAX, "Un emplacement"),
  version: (value) => text(value, DECLARED_ASSET_VERSION_MAX, "Une version"),
  website: websiteOf,
  license_infos: typedValuesOf("Les informations de licence"),
};

/** A row's typed values, stored as JSON: the list; unreadable, none. */
const storedTypedValues = (stored: unknown): DeclaredAssetTypedValue[] => {
  try {
    const list = JSON.parse(String(stored ?? "[]")) as unknown;
    return Array.isArray(list)
      ? list.filter(
          (v): v is DeclaredAssetTypedValue =>
            !!v && typeof v.type === "string" && typeof v.value === "string",
        )
      : [];
  } catch {
    return [];
  }
};

/** The fields an asset is written with, read from the request. */
const fieldsOf = (kind: DeclaredAssetKind, body: Record<string, unknown>) => ({
  ...Object.fromEntries(DECLARED_ASSET_EXTRAS[kind].map((f) => [f, EXTRA_READERS[f](body[f])])),
  name: text(
    requireText(body.name, "Le champ « Asset » est requis"),
    DECLARED_ASSET_NAME_MAX,
    "Un nom",
  ),
  category: text(body.category, DECLARED_ASSET_NAME_MAX, "Un nom"),
  supplier: text(body.supplier, DECLARED_ASSET_NAME_MAX, "Un nom"),
  maker: text(body.maker, DECLARED_ASSET_NAME_MAX, "Un nom"),
  product: text(body.product, DECLARED_ASSET_NAME_MAX, "Un nom"),
  quantity: quantityOf(body.quantity),
  price: priceOf(body.price),
  description: text(body.description, DECLARED_ASSET_DESCRIPTION_MAX, "Une description"),
  notes: text(body.notes, DECLARED_ASSET_DESCRIPTION_MAX, "Des notes"),
});

const photoOf = ({ mime: _mime, ...row }: FileRow): DeclaredAssetPhoto => ({
  ...row,
  url: mediaUrl(row.file),
});
const attachmentOf = (row: FileRow): DeclaredAssetAttachment => ({
  ...row,
  mime: row.mime ?? "",
  url: mediaUrl(row.file),
  is_image: isImage(row.file),
});

/** The file goes when the last row citing it does. */
const dropFile = (file: string): void => {
  if (cardAttachments.countOfFile({ file }).count === 0) deleteMedia(file);
};

/** The body is a file: we take it as is, whatever its declared type. */
const fileBody = express.raw({ type: () => true, limit: SIZE_MAX });

/** The uploaded file: its content, its name — never a path —, its declared type. */
const receivedFile = (req: Request) => {
  const content: unknown = req.body;
  if (!Buffer.isBuffer(content) || content.length === 0) badRequest("Fichier vide");
  const name =
    String(req.query["name"] ?? "")
      .split(/[/\\]/)
      .pop()!
      .trim()
      .slice(0, 255) || "fichier";
  const declared = String(req.query["type"] ?? "").trim().slice(0, 100);
  const mime = /^[\w.+-]+\/[\w.+-]+$/.test(declared) ? declared : "application/octet-stream";
  return { content: content as Buffer, name, mime };
};

/** One kind's routes: "/api/<assets>". */
export const declaredAssetRoutes = (kind: DeclaredAssetKind): Router => {
  const t = declaredAssetTables(kind);
  // The kind's extra columns, in the writes: their names come from
  // DECLARED_ASSET_EXTRAS, never from a request.
  const extras = DECLARED_ASSET_EXTRAS[kind];
  const extraColumns = extras.map((f) => `, ${f}`).join("");
  const extraValues = extras.map((f) => `, @${f}`).join("");
  const extraSets = extras.map((f) => `, ${f} = @${f}`).join("");

  // --- Reading -------------------------------------------------------------

  const ofBoard = selection<DeclaredAssetRow>(
    `SELECT * FROM ${t.assets} WHERE board_id = ? ORDER BY name COLLATE NOCASE, id`,
  );
  const byId = selection<DeclaredAssetRow>(`SELECT * FROM ${t.assets} WHERE id = ?`);

  const actorsOfBoard = selection<{ asset_id: Id; id: Id; name: string; email: string }>(
    `SELECT a.asset_id, u.id, u.name, u.email FROM ${t.actors} a
     JOIN users u ON u.id = a.user_id
     JOIN ${t.assets} x ON x.id = a.asset_id
     WHERE x.board_id = ? ORDER BY u.name`,
  );
  const labelsOfBoard = selection<Label & { asset_id: Id }>(
    `SELECT k.asset_id, l.* FROM ${t.labelLinks} k
     JOIN ${t.labels} l ON l.id = k.label_id
     JOIN ${t.assets} x ON x.id = k.asset_id
     WHERE x.board_id = ? ORDER BY l.position, l.id`,
  );

  /** A board's assets, each with its actors and labels. */
  const assetsOf = (boardId: Id): DeclaredAsset[] => {
    const actors = new Map<Id, Actor[]>();
    for (const { asset_id, ...row } of actorsOfBoard.all(boardId)) {
      actors.set(asset_id, [...(actors.get(asset_id) ?? []), actorOf(row)]);
    }
    const labels = new Map<Id, Label[]>();
    for (const { asset_id, ...label } of labelsOfBoard.all(boardId)) {
      labels.set(asset_id, [...(labels.get(asset_id) ?? []), label]);
    }
    return ofBoard.all(boardId).map((row) => ({
      ...row,
      // The typed values are stored as JSON: they come back as lists.
      ...Object.fromEntries(
        JSON_EXTRAS.filter((f) => extras.includes(f)).map((f) => [
          f,
          storedTypedValues((row as Record<string, unknown>)[f]),
        ]),
      ),
      actors: actors.get(row.id) ?? [],
      labels: labels.get(row.id) ?? [],
    }));
  };

  const oneAsset = (row: DeclaredAssetRow): DeclaredAsset =>
    assetsOf(row.board_id).find((a) => a.id === row.id)!;

  // --- Writing -------------------------------------------------------------

  const insert = mutation(
    `INSERT INTO ${t.assets} (board_id, list_key, name, category, supplier, maker, product,
       quantity, price, description, notes${extraColumns}, created_at, updated_at)
     VALUES (@board_id, @list_key, @name, @category, @supplier, @maker, @product,
       @quantity, @price, @description, @notes${extraValues}, @at, @at)`,
  );
  const update = mutation(
    `UPDATE ${t.assets} SET name = @name, category = @category, supplier = @supplier,
       maker = @maker, product = @product, quantity = @quantity, price = @price,
       description = @description, notes = @notes${extraSets}, updated_at = @at
     WHERE id = @id`,
  );
  const remove = mutation(`DELETE FROM ${t.assets} WHERE id = ?`);

  const clearActors = mutation(`DELETE FROM ${t.actors} WHERE asset_id = ?`);
  const addActor = mutation(
    `INSERT OR IGNORE INTO ${t.actors} (asset_id, user_id)
     SELECT ?, id FROM users WHERE id = ?`,
  );
  const clearLabels = mutation(`DELETE FROM ${t.labelLinks} WHERE asset_id = ?`);
  // Only a label of the asset's board.
  const addLabel = mutation(
    `INSERT OR IGNORE INTO ${t.labelLinks} (asset_id, label_id)
     SELECT ?, id FROM ${t.labels} WHERE id = ? AND board_id = ?`,
  );

  /** The record, its actors and labels, written together. */
  const write = transaction(
    (
      assetId: Id,
      boardId: Id,
      fields: Record<string, unknown>,
      actorIds: Id[],
      labelIds: Id[],
    ) => {
      update.run({ id: assetId, ...fields, at: now() });
      clearActors.run(assetId);
      for (const id of actorIds) addActor.run(assetId, id);
      clearLabels.run(assetId);
      for (const id of labelIds) addLabel.run(assetId, id, boardId);
    },
  );

  const create = transaction(
    (
      boardId: Id,
      listKey: string,
      fields: Record<string, unknown>,
      actorIds: Id[],
      labelIds: Id[],
    ): Id => {
      const at = now();
      const { lastInsertRowid } = insert.run({ board_id: boardId, list_key: listKey, ...fields, at });
      const id = Number(lastInsertRowid);
      write(id, boardId, fields, actorIds, labelIds);
      return id;
    },
  );

  /** The board, if this person sees it and holds this permission on the widget type. */
  const verifyBoard = (req: Request, boardId: unknown, access: WidgetAccess): Id => {
    if (!accessIncludes(widgetRights(req.user)[kind], access)) {
      throw access === "view"
        ? new HttpError(404, "Introuvable")
        : new HttpError(403, "Vous n'avez pas le droit de modifier ici");
    }
    return openBoard(boardId, req.user).id;
  };

  /** The asset, if this person may act on it this way. */
  const openAsset = (req: Request, id: unknown, access: WidgetAccess): DeclaredAssetRow => {
    const asset = orNotFound(byId.get(id), NOT_FOUND);
    verifyBoard(req, asset.board_id, access);
    return asset;
  };

  // --- Files ---------------------------------------------------------------

  const photos = {
    byId: selection<FileRow>(`SELECT * FROM ${t.photos} WHERE id = ?`),
    ofAsset: selection<FileRow>(
      `SELECT * FROM ${t.photos} WHERE asset_id = ? ORDER BY position, id`,
    ),
    nextPosition: scalar<NextRow>(
      `SELECT COALESCE(MAX(position), -1) + 1 AS next FROM ${t.photos} WHERE asset_id = ?`,
    ),
    create: mutation(
      `INSERT INTO ${t.photos} (asset_id, file, name, size, position, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ),
    remove: mutation(`DELETE FROM ${t.photos} WHERE id = ?`),
    place: mutation(`UPDATE ${t.photos} SET position = ? WHERE id = ? AND asset_id = ?`),
  };

  const files = {
    byId: selection<FileRow>(`SELECT * FROM ${t.attachments} WHERE id = ?`),
    ofAsset: selection<FileRow>(
      `SELECT * FROM ${t.attachments} WHERE asset_id = ? ORDER BY position, id DESC`,
    ),
    // A dropped attachment is placed first, as on a card.
    create: mutation(
      `INSERT INTO ${t.attachments} (asset_id, file, name, mime, size, user_id, created_at, position)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7,
         (SELECT COALESCE(MIN(position), 1) - 1 FROM ${t.attachments} WHERE asset_id = ?1))`,
    ),
    remove: mutation(`DELETE FROM ${t.attachments} WHERE id = ?`),
    place: mutation(
      `UPDATE ${t.attachments} SET position = ? WHERE id = ? AND asset_id = ?`,
    ),
  };

  const filesOf = (assetId: Id): DeclaredAssetFiles => ({
    photos: photos.ofAsset.all(assetId).map(photoOf),
    attachments: files.ofAsset.all(assetId).map(attachmentOf),
  });

  // --- Routes --------------------------------------------------------------

  const routes = Router();

  routes.use(touch(DECLARED_ASSET_RESOURCES[kind]));

  routes.get("/", (req, res) => {
    const { board } = req.query;
    if (!board) badRequest("Le paramètre board est requis");
    res.json(assetsOf(verifyBoard(req, board, "view")));
  });

  routes.post("/", (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (!body.board_id) badRequest("Le tableau est requis");
    const boardId = verifyBoard(req, body.board_id, "update");
    const id = create(
      boardId,
      // The widget named, if it is one of this board's; otherwise its first.
      keyInBoard(boardId, declaredAssetListType(kind), body.list_key),
      fieldsOf(kind, body),
      toIds(body.actor_ids),
      toIds(body.label_ids),
    );
    res.status(201).json(oneAsset(byId.get(id)!));
  });

  routes.put("/:id", (req, res) => {
    const existing = openAsset(req, req.params.id, "update");
    const body = (req.body ?? {}) as Record<string, unknown>;
    write(
      existing.id,
      existing.board_id,
      fieldsOf(kind, body),
      toIds(body.actor_ids),
      toIds(body.label_ids),
    );
    res.json(oneAsset(byId.get(existing.id)!));
  });

  routes.delete("/:id", (req, res) => {
    const existing = openAsset(req, req.params.id, "delete");
    const cited = [...photos.ofAsset.all(existing.id), ...files.ofAsset.all(existing.id)];
    remove.run(existing.id);
    for (const { file } of cited) dropFile(file);
    res.status(204).end();
  });

  // An asset's photos and documents, read when its drawer opens.
  routes.get("/:id/files", (req, res) => {
    const asset = openAsset(req, req.params.id, "view");
    res.json(filesOf(asset.id));
  });

  // A photo: only images the server returns as is, since it is shown.
  routes.post("/:id/photos", fileBody, (req, res) => {
    const asset = openAsset(req, req.params.id, "update");
    const { content, name } = receivedFile(req);
    if (!(inlineType(name) ?? "").startsWith("image/")) {
      badRequest("Ce format d'image ne peut pas servir de photo");
    }
    const { lastInsertRowid } = photos.create.run(
      asset.id,
      writeMedia(content, name),
      name,
      content.length,
      photos.nextPosition(asset.id).next,
      now(),
    );
    res.status(201).json(photoOf(photos.byId.get(lastInsertRowid)!));
  });

  routes.put("/:id/photos/order", (req, res) => {
    const asset = openAsset(req, req.params.id, "update");
    transaction(() => toIds(req.body.ids).forEach((id, rank) => photos.place.run(rank, id, asset.id)))();
    res.json(filesOf(asset.id).photos);
  });

  routes.delete("/photos/:photo", (req, res) => {
    const photo = orNotFound(photos.byId.get(req.params.photo), "Photo introuvable");
    openAsset(req, photo.asset_id, "update");
    photos.remove.run(photo.id);
    dropFile(photo.file);
    res.status(204).end();
  });

  routes.post("/:id/attachments", fileBody, (req, res) => {
    const asset = openAsset(req, req.params.id, "update");
    const { content, name, mime } = receivedFile(req);
    const { lastInsertRowid } = files.create.run(
      asset.id,
      writeMedia(content, name),
      name,
      mime,
      content.length,
      req.user.id,
      now(),
    );
    res.status(201).json(attachmentOf(files.byId.get(lastInsertRowid)!));
  });

  routes.put("/:id/attachments/order", (req, res) => {
    const asset = openAsset(req, req.params.id, "update");
    transaction(() => toIds(req.body.ids).forEach((id, rank) => files.place.run(rank, id, asset.id)))();
    res.json(filesOf(asset.id).attachments);
  });

  routes.delete("/attachments/:attachment", (req, res) => {
    const attachment = orNotFound(
      files.byId.get(req.params.attachment),
      "Pièce jointe introuvable",
    );
    openAsset(req, attachment.asset_id, "update");
    files.remove.run(attachment.id);
    dropFile(attachment.file);
    res.status(204).end();
  });

  return routes;
};
