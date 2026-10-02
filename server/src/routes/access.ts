// Le mode Accès : ses catégories. Elles ne pendent à rien — c'est le premier
// niveau du mode, comme un tableau l'est ailleurs — et chacune peut être
// fermée : privée, elle ne se montre qu'à son auteur.

import { Router } from "express";
import type { Request } from "express";
import {
  ACCESS_BLOCK_CONVERSIONS,
  ACCESS_GAP_DEFAUT,
  isAccessBlockType,
} from "@milo/shared";
import type { AccessBlockType, AccessCategory, Id, LayoutState } from "@milo/shared";
import { transaction } from "../db/query.js";
import type { AccessBlockRow, AccessCategoryRow, AccessSectionRow } from "../db/rows.js";
import { droitDeLaMethode, exiger } from "../lib/droits.js";
import { badRequest, notFound, orNotFound, requireText, toIds } from "../lib/http.js";
import { fluxDe, reglagesFlux } from "../lib/feed.js";
import { etatsUptime, reglagesUptime } from "../lib/uptime.js";
import { ecartColonnes, rangDemande, uniteLargeur, valeurLargeur } from "../lib/sections.js";
import { now } from "../lib/time.js";
import { touch } from "../middleware/events.js";
import {
  accessBlocks,
  accessCategorieOuverte,
  accessCategories,
  accessSections,
  blocRendu,
} from "../repositories/access.js";
import { personalLayouts, scopeAcces } from "../repositories/layouts.js";
import { ordreRecu } from "../repositories/reorder.js";
import { dansLOrdreDe, userTabOrders } from "../repositories/tab-orders.js";

const SCOPE_CATEGORIES = "access-categories";

/** Un réglage arrive en booléen ; la base le range en 0 ou 1. */
const drapeau = (valeur: unknown, defaut: 0 | 1): 0 | 1 =>
  valeur === undefined ? defaut : (Number(Boolean(valeur)) as 0 | 1);

const SECTION_INTROUVABLE = "Section introuvable";

export const accessCategoryRoutes = Router();

accessCategoryRoutes.use(touch("access-categories", "access-sections", "access-blocks"));

/**
 * Une catégorie telle que ce compte la voit : son « Hérité » est le sien
 * (repositories/layouts.ts). Le menu de chaque onglet le montre, pas
 * seulement celui de la catégorie ouverte.
 */
const pourCompte = (categorie: AccessCategoryRow, userId: Id): AccessCategory => ({
  ...categorie,
  // Privée, elle n'a que sa structure publique (voir « proprietaire »).
  inherited:
    Boolean(categorie.is_private) || !personalLayouts.personnel(userId, scopeAcces(categorie.id)),
});

/** Les catégories que ce compte voit, dans son ordre à lui (repositories/tab-orders.ts). */
const categoriesVisibles = (userId: Id): AccessCategory[] =>
  dansLOrdreDe(userId, SCOPE_CATEGORIES, accessCategories.visibleTo.all(userId)).map((categorie) =>
    pourCompte(categorie, userId),
  );

accessCategoryRoutes.get("/", (req, res) => {
  res.json(categoriesVisibles(req.user.id));
});

accessCategoryRoutes.post("/", (req, res) => {
  const name = requireText(req.body.name, "Le nom de la catégorie est requis");
  // « Privé » peut venir dès la création : une catégorie qu'on ouvre fermée ne
  // passe jamais par un moment où tout le monde la voit.
  const { next } = accessCategories.nextPosition();
  const { lastInsertRowid } = accessCategories.create.run(
    name,
    next,
    drapeau(req.body.is_private, 0),
    drapeau(req.body.is_locked, 0),
    // Le propriétaire n'existe que pour une catégorie privée.
    drapeau(req.body.is_private, 0) ? req.user.id : null,
    now(),
  );
  res.status(201).json(pourCompte(accessCategories.byId.get(lastInsertRowid)!, req.user.id));
});

// Ranger les onglets. Déclaré avant « /:id », sinon « reorder » serait pris
// pour un identifiant. L'ordre est celui de ce compte seulement : le voir
// suffit pour le ranger (app.ts).
accessCategoryRoutes.put("/reorder", (req, res) => {
  const visibles = accessCategories.visibleTo.all(req.user.id);
  const ordre = ordreRecu(
    req.body.ids,
    visibles,
    "La liste des identifiants ne correspond pas aux catégories",
  );

  userTabOrders.ranger(req.user.id, SCOPE_CATEGORIES, ordre);
  res.json(categoriesVisibles(req.user.id));
});

accessCategoryRoutes.put("/:id", (req, res) => {
  const existing = accessCategorieOuverte(req.params.id, req.user);
  const name = requireText(req.body.name ?? existing.name, "Le nom de la catégorie est requis");
  const isPrivate = drapeau(req.body.is_private, existing.is_private);

  // Une catégorie n'a de propriétaire que privée : la fermer, c'est se la
  // réserver ; la rouvrir la rend à tous, sans propriétaire. Seul celui qui
  // l'a fermée la voit encore, et peut donc la rouvrir.
  const owner = isPrivate ? (existing.is_private ? existing.owner_id : req.user.id) : null;

  accessCategories.update.run(
    name,
    isPrivate,
    drapeau(req.body.is_locked, existing.is_locked),
    owner,
    existing.id,
  );
  res.json(pourCompte(accessCategories.byId.get(existing.id)!, req.user.id));
});

accessCategoryRoutes.delete("/:id", (req, res) => {
  const existing = accessCategorieOuverte(req.params.id, req.user);
  // Ses sections partent avec elle, par clé étrangère ; les choix « Hérité »
  // qui la nommaient n'ont plus d'objet.
  accessCategories.remove.run(existing.id);
  personalLayouts.oublierScope.run(scopeAcces(existing.id));
  res.status(204).end();
});

// --- Sections --------------------------------------------------------------
// Une section est une colonne d'une catégorie. Elle n'a pas de visibilité
// propre : elle suit celle de la catégorie qui la porte, et chaque route
// commence donc par l'ouvrir.
//
// Une catégorie a sa structure publique, et celle de chaque compte qui ne
// l'hérite plus (« Hérité » décoché, repositories/layouts.ts). Chacun ne voit
// et ne touche que celle qu'il regarde : une section d'une autre structure est
// introuvable.

export const accessSectionRoutes = Router();

accessSectionRoutes.use(touch("access-sections", "access-blocks"));

type Compte = Request["user"];

/**
 * La structure que ce compte regarde dans cette catégorie : la publique (nul),
 * ou la sienne. Une catégorie privée n'est qu'à son auteur : elle n'a que sa
 * structure publique, et les copies d'avant sa fermeture dorment jusqu'à ce
 * qu'elle se rouvre.
 */
const proprietaire = (categorie: AccessCategoryRow, user: Compte): Id | null =>
  categorie.is_private ? null : personalLayouts.proprietaire(user.id, scopeAcces(categorie.id));

/**
 * Les routeurs des sections et des éléments n'exigent que de voir le mode
 * (app.ts). Écrire dans la structure publique demande en plus le droit que
 * dit la méthode ; sa propre structure n'appartient qu'à soi. « Verrouillé »
 * ne vit que dans la fenêtre qui le pose (client) : le serveur l'ignore.
 */
const exigerEcriture = (req: Request, owner: Id | null): void => {
  if (owner === null) exiger(req, "access", droitDeLaMethode(req));
};

/** La catégorie ouverte, et la structure que ce compte y regarde. */
const structureOuverte = (categoryId: unknown, user: Compte) => {
  const categorie = accessCategorieOuverte(categoryId, user);
  return { categorie, owner: proprietaire(categorie, user) };
};

/** La section demandée, si elle est de la structure regardée ; et sa catégorie. */
const sectionOuverte = (id: unknown, user: Compte) => {
  const section = orNotFound(accessSections.byId.get(id), SECTION_INTROUVABLE);
  const { categorie, owner } = structureOuverte(section.category_id, user);
  if (section.owner_id !== owner) notFound(SECTION_INTROUVABLE);
  return { section, categorie, owner };
};

accessSectionRoutes.get("/", (req, res) => {
  const { category } = req.query;
  if (!category) badRequest("La catégorie est requise");
  const { categorie, owner } = structureOuverte(category, req.user);
  res.json(accessSections.byCategory.all(categorie.id, owner));
});

/**
 * « Hérité » d'une catégorie : sa structure publique, ou sa propre copie. Le
 * décocher part d'une copie de la publique — sections et éléments — ; le
 * recocher efface la sienne. Le voir suffit : on ne règle que pour soi.
 * Déclaré avant « /:id », sinon « layout » serait pris pour un identifiant.
 */
accessSectionRoutes.get("/layout", (req, res) => {
  const { category } = req.query;
  if (!category) badRequest("La catégorie est requise");
  const { owner } = structureOuverte(category, req.user);
  res.json({ inherited: owner === null } satisfies LayoutState);
});

const personnaliser = transaction((categorieId: Id, userId: Id): void => {
  accessSections.removeOwned.run(categorieId, userId);
  const timestamp = now();
  accessSections.byCategory.all(categorieId, null).forEach((section, place) => {
    copierSection(section, userId, place, timestamp);
  });
  personalLayouts.poser(userId, scopeAcces(categorieId));
});

const heriter = transaction((categorieId: Id, userId: Id): void => {
  accessSections.removeOwned.run(categorieId, userId);
  personalLayouts.retirer(userId, scopeAcces(categorieId));
});

accessSectionRoutes.put("/layout", (req, res) => {
  const { categorie, owner } = structureOuverte(req.body.category_id, req.user);
  if (categorie.is_private) badRequest("Une catégorie privée n'a pas de structure partagée");
  if (req.body.inherited) heriter(categorie.id, req.user.id);
  else if (owner === null) personnaliser(categorie.id, req.user.id);
  res.json({
    inherited: proprietaire(categorie, req.user) === null,
  } satisfies LayoutState);
});

accessSectionRoutes.post("/", (req, res) => {
  const categoryId = req.body.category_id;
  if (!categoryId) badRequest("La catégorie est requise");
  const { categorie, owner } = structureOuverte(categoryId, req.user);
  // Le verrou ne s'opposait pas à l'ajout d'une colonne : il ne s'y oppose
  // toujours pas.
  exigerEcriture(req, owner);

  const unite = uniteLargeur(req.body.width_unit, "auto");
  const valeur = valeurLargeur(unite, req.body.width_value);

  // Ajoutée à la suite des colonnes déjà posées dans cette structure, ou au
  // rang demandé : le « + » entre deux colonnes l'y glisse.
  const { next } = accessSections.nextPosition(categorie.id, owner);
  const { lastInsertRowid } = accessSections.create.run(
    categorie.id,
    unite,
    valeur,
    ecartColonnes(req.body.gap, ACCESS_GAP_DEFAUT),
    next,
    owner,
    now(),
  );
  const id = Number(lastInsertRowid);
  const rang = rangDemande(req.body.index);
  if (rang !== null) {
    const autres = accessSections.byCategory
      .all(categorie.id, owner)
      .map((s) => s.id)
      .filter((autre) => autre !== id);
    rangerSections([...autres.slice(0, rang), id, ...autres.slice(rang)]);
  }
  res.status(201).json(accessSections.byId.get(id));
});

/** Les colonnes d'une catégorie, dans l'ordre donné. */
const rangerSections = transaction((ids: Id[]) => {
  ids.forEach((id, place) => accessSections.placer.run(place, id));
});

// Ranger les colonnes, par la poignée en haut de chacune. Déclaré avant
// « /:id », sinon « reorder » serait pris pour un identifiant.
accessSectionRoutes.put("/reorder", (req, res) => {
  const categoryId = req.body.category_id;
  if (!categoryId) badRequest("La catégorie est requise");
  const { categorie, owner } = structureOuverte(categoryId, req.user);
  exigerEcriture(req, owner);

  const ids = toIds(req.body.ids);
  const connues = accessSections.byCategory.all(categorie.id, owner).map((s) => s.id);
  if (ids.length !== connues.length || !connues.every((id) => ids.includes(id))) {
    badRequest("La liste des identifiants ne correspond pas à cette catégorie");
  }

  rangerSections(ids);
  res.json(accessSections.byCategory.all(categorie.id, owner));
});

accessSectionRoutes.put("/:id", (req, res) => {
  const { section: existing, owner } = sectionOuverte(req.params.id, req.user);
  exigerEcriture(req, owner);
  const unite = uniteLargeur(req.body.width_unit, existing.width_unit);
  // Changer d'unité sans redire la valeur garderait l'ancienne, qui ne veut
  // plus rien dire : « 30 % » ne devient pas « 30 px ».
  const valeur = valeurLargeur(
    unite,
    req.body.width_value ?? (unite === existing.width_unit ? existing.width_value : undefined),
  );

  accessSections.update.run(unite, valeur, ecartColonnes(req.body.gap, existing.gap), existing.id);
  res.json(accessSections.byId.get(existing.id));
});

/** Une colonne et ce qu'elle porte, recopiées dans la structure de « owner ». */
const copierSection = (
  original: AccessSectionRow,
  owner: Id | null,
  position: number,
  timestamp: string,
): Id => {
  const id = Number(
    accessSections.create.run(
      original.category_id,
      original.width_unit,
      original.width_value,
      original.gap,
      position,
      owner,
      timestamp,
    ).lastInsertRowid,
  );
  accessBlocks.bySection.all(original.id).forEach((bloc, place) => {
    accessBlocks.create.run(id, bloc.type, bloc.config, place, timestamp);
  });
  return id;
};

/**
 * Dupliquer une colonne : la copie, avec sa largeur et tout ce qu'elle porte,
 * se pose juste à sa droite, dans la même structure.
 */
const dupliquerSection = transaction((original: AccessSectionRow): Id => {
  const { next } = accessSections.nextPosition(original.category_id, original.owner_id);
  const id = copierSection(original, original.owner_id, next, now());

  const ordre = accessSections.byCategory
    .all(original.category_id, original.owner_id)
    .map((s) => s.id)
    .filter((autre) => autre !== id);
  ordre.splice(ordre.indexOf(original.id) + 1, 0, id);
  rangerSections(ordre);
  return id;
});

accessSectionRoutes.post("/:id/duplicate", (req, res) => {
  const { section: existing, owner } = sectionOuverte(req.params.id, req.user);
  exigerEcriture(req, owner);
  res.status(201).json(accessSections.byId.get(dupliquerSection(existing)));
});

accessSectionRoutes.delete("/:id", (req, res) => {
  const { section: existing, owner } = sectionOuverte(req.params.id, req.user);
  exigerEcriture(req, owner);
  // Ce qu'elle portait part avec elle, par clé étrangère.
  accessSections.remove.run(existing.id);
  res.status(204).end();
});

// --- Éléments --------------------------------------------------------------
// Ce qu'une section porte. Leur configuration appartient au widget du client
// (client/src/widgets) : le serveur la range en JSON sans la relire, il ne
// vérifie que le widget visé. Leur visibilité est celle de la catégorie, au
// bout de la chaîne section → catégorie, et de la structure regardée.

const BLOC_INTROUVABLE = "Élément introuvable";

const typeDeBloc = (valeur: unknown): AccessBlockType => {
  if (!isAccessBlockType(valeur)) badRequest("Élément inconnu");
  return valeur as AccessBlockType;
};

/**
 * La configuration reçue, prête à ranger. Sa forme est celle du widget : on
 * n'exige qu'un objet, pas une liste ni une valeur nue — le widget ne saurait
 * pas quoi en faire.
 */
const configuration = (valeur: unknown, defaut: string): string => {
  if (valeur === undefined) return defaut;
  if (!valeur || typeof valeur !== "object" || Array.isArray(valeur)) {
    badRequest("Configuration invalide");
  }
  return JSON.stringify(valeur);
};

export const accessBlockRoutes = Router();

accessBlockRoutes.use(touch("access-blocks"));

/** L'élément demandé, et la section ouverte qui le porte. */
const blocOuvert = (id: unknown, user: Compte) => {
  const bloc = orNotFound(accessBlocks.byId.get(id), BLOC_INTROUVABLE);
  return { bloc, ...sectionOuverte(bloc.section_id, user) };
};

accessBlockRoutes.get("/", (req, res) => {
  const { section, category } = req.query;

  // Par section, ou par catégorie entière : la page lit d'un coup tout ce que
  // ses colonnes portent, plutôt qu'une requête par colonne.
  if (section) {
    const ouverte = sectionOuverte(section, req.user).section;
    return void res.json(accessBlocks.bySection.all(ouverte.id).map(blocRendu));
  }
  if (!category) badRequest("La section ou la catégorie est requise");
  const { categorie, owner } = structureOuverte(category, req.user);
  res.json(accessBlocks.byCategory.all(categorie.id, owner).map(blocRendu));
});

/**
 * Ranger les éléments d'une section. Déclaré avant « /:id », sinon « reorder »
 * serait pris pour un identifiant.
 *
 * Le corps donne la section et, dans l'ordre, tout ce qu'elle porte désormais.
 * Un élément qui vient d'une autre colonne de la même structure y est admis :
 * c'est ainsi qu'on le déplace. Ce qui reste dans la colonne d'origine garde
 * ses places — elles peuvent devenir clairsemées, la lecture se fait sur
 * l'ordre, pas sur les valeurs.
 */
const rangerBlocs = transaction((sectionId: Id, ids: Id[]) => {
  ids.forEach((id, place) => accessBlocks.placer.run(sectionId, place, id));
});

accessBlockRoutes.put("/reorder", (req, res) => {
  const sectionId = req.body.section_id;
  if (!sectionId) badRequest("La section est requise");
  const { section, categorie, owner } = sectionOuverte(sectionId, req.user);
  exigerEcriture(req, owner);

  const ids = toIds(req.body.ids);
  // Un élément ne saute pas d'une structure à l'autre : les colonnes qu'on
  // voit sont celles de la structure ouverte, le rangement s'y borne.
  const deLaStructure = new Set(
    accessBlocks.byCategory.all(categorie.id, owner).map((b) => b.id),
  );
  if (ids.length !== new Set(ids).size || ids.some((id) => !deLaStructure.has(id))) {
    badRequest("La liste des identifiants ne correspond pas à cette catégorie");
  }

  rangerBlocs(section.id, ids);
  res.json(accessBlocks.byCategory.all(categorie.id, owner).map(blocRendu));
});

accessBlockRoutes.post("/", (req, res) => {
  const sectionId = req.body.section_id;
  if (!sectionId) badRequest("La section est requise");
  const { section, owner } = sectionOuverte(sectionId, req.user);
  exigerEcriture(req, owner);

  const type = typeDeBloc(req.body.type);
  const config = configuration(req.body.config, "{}");

  const { next } = accessBlocks.nextPosition(section.id);
  const { lastInsertRowid } = accessBlocks.create.run(section.id, type, config, next, now());
  res.status(201).json(blocRendu(accessBlocks.byId.get(lastInsertRowid)!));
});

// Le type d'un élément ne se change pas : ce serait un autre widget, donc un
// autre élément. Seule sa configuration bouge — sauf entre deux widgets qui
// partagent la leur, la catégorie et la sous-catégorie
// (ACCESS_BLOCK_CONVERSIONS).
accessBlockRoutes.put("/:id", (req, res) => {
  const { bloc, owner } = blocOuvert(req.params.id, req.user);
  exigerEcriture(req, owner);
  if (req.body.type !== undefined && req.body.type !== bloc.type) {
    if (ACCESS_BLOCK_CONVERSIONS[bloc.type] !== req.body.type) {
      badRequest("Cet élément ne se convertit pas en ce type");
    }
    accessBlocks.convertir.run(req.body.type, bloc.id);
  }
  accessBlocks.update.run(configuration(req.body.config, bloc.config), bloc.id);
  res.json(blocRendu(accessBlocks.byId.get(bloc.id)!));
});

/**
 * Dupliquer un élément : la copie, de même widget et de même configuration,
 * se pose juste sous l'original, dans la même colonne.
 */
const dupliquerBloc = transaction((bloc: AccessBlockRow): Id => {
  const { next } = accessBlocks.nextPosition(bloc.section_id);
  const id = Number(
    accessBlocks.create.run(bloc.section_id, bloc.type, bloc.config, next, now()).lastInsertRowid,
  );
  const ordre = accessBlocks.bySection
    .all(bloc.section_id)
    .map((b) => b.id)
    .filter((autre) => autre !== id);
  ordre.splice(ordre.indexOf(bloc.id) + 1, 0, id);
  rangerBlocs(bloc.section_id, ordre);
  return id;
});

accessBlockRoutes.post("/:id/duplicate", (req, res) => {
  const { bloc, owner } = blocOuvert(req.params.id, req.user);
  exigerEcriture(req, owner);
  res.status(201).json(blocRendu(accessBlocks.byId.get(dupliquerBloc(bloc))!));
});

accessBlockRoutes.delete("/:id", (req, res) => {
  const { bloc, owner } = blocOuvert(req.params.id, req.user);
  exigerEcriture(req, owner);
  accessBlocks.remove.run(bloc.id);
  res.status(204).end();
});

/**
 * Le flux d'un élément RSS, tel que la base le garde (lib/feed.ts). La source
 * est relevée par le serveur, à l'intervalle que l'élément règle : la page ne
 * l'attend pas, sauf quand la base n'a encore rien à montrer.
 *
 * Express 4 ne rattrape pas le rejet d'une fonction asynchrone : il passe par
 * « next ».
 */
accessBlockRoutes.get("/:id/feed", (req, res, next) => {
  const { bloc } = blocOuvert(req.params.id, req.user);
  if (bloc.type !== "rss") badRequest("Cet élément n'est pas un flux RSS");
  fluxDe(reglagesFlux(blocRendu(bloc).config))
    .then((flux) => res.json(flux))
    .catch(next);
});

/**
 * L'état des machines d'un élément Uptime, tel que la base le garde
 * (lib/uptime.ts). C'est le serveur qui les vérifie, à l'intervalle que
 * l'élément règle : la page ne fait que relire.
 */
accessBlockRoutes.get("/:id/uptime", (req, res) => {
  const { bloc } = blocOuvert(req.params.id, req.user);
  if (bloc.type !== "uptime") badRequest("Cet élément n'est pas un élément Uptime");
  res.json(etatsUptime(reglagesUptime(blocRendu(bloc).config)));
});
