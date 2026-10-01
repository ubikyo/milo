// Le mode Accès : ses catégories. Elles ne pendent à rien — c'est le premier
// niveau du mode, comme un tableau l'est ailleurs — et chacune peut être
// fermée : privée, elle ne se montre qu'à son auteur.

import { Router } from "express";
import {
  ACCESS_BLOCK_CONVERSIONS,
  ACCESS_GAP_DEFAUT,
  ACCESS_GAP_MAX,
  isAccessBlockType,
} from "@milo/shared";
import type { AccessBlockType, Id } from "@milo/shared";
import { transaction } from "../db/query.js";
import type { AccessBlockRow, AccessSectionRow } from "../db/rows.js";
import { badRequest, forbidden, orNotFound, requireText, toIds } from "../lib/http.js";
import { fluxDe, reglagesFlux } from "../lib/feed.js";
import { etatsUptime, reglagesUptime } from "../lib/uptime.js";
import { rangDemande, uniteLargeur, valeurLargeur } from "../lib/sections.js";
import { now } from "../lib/time.js";
import { touch } from "../middleware/events.js";
import {
  accessBlocks,
  accessCategorieOuverte,
  accessCategories,
  accessSections,
  blocRendu,
} from "../repositories/access.js";
import { ordreRecu, rangerAccessCategories } from "../repositories/reorder.js";

/** Un réglage arrive en booléen ; la base le range en 0 ou 1. */
const drapeau = (valeur: unknown, defaut: 0 | 1): 0 | 1 =>
  valeur === undefined ? defaut : (Number(Boolean(valeur)) as 0 | 1);

/**
 * L'écart entre deux colonnes, tel que le tiroir l'envoie. Absent, celui d'avant
 * reste. Un nombre hors des bornes est refusé plutôt que ramené en silence :
 * ramené, le tiroir afficherait autre chose que ce qui vient d'être saisi.
 */
const ecartColonnes = (valeur: unknown, defaut: number): number => {
  if (valeur === undefined || valeur === null || valeur === "") return defaut;
  const nombre = Number(valeur);
  if (!Number.isFinite(nombre) || nombre < 0 || nombre > ACCESS_GAP_MAX) {
    badRequest(`L'écart des colonnes va de 0 à ${ACCESS_GAP_MAX} pixels`);
  }
  return Math.round(nombre);
};

const SECTION_INTROUVABLE = "Section introuvable";

export const accessCategoryRoutes = Router();

accessCategoryRoutes.use(touch("access-categories", "access-sections", "access-blocks"));

accessCategoryRoutes.get("/", (req, res) => {
  res.json(accessCategories.visibleTo.all(req.user.id));
});

accessCategoryRoutes.post("/", (req, res) => {
  const name = requireText(req.body.name, "Le nom de la catégorie est requis");
  // À la différence d'un tableau, le tiroir propose « Privé » dès la création :
  // une catégorie qu'on ouvre fermée ne passe jamais par un moment où tout le
  // monde la voit. Son auteur est retenu dans les deux cas.
  const { next } = accessCategories.nextPosition();
  const { lastInsertRowid } = accessCategories.create.run(
    name,
    next,
    drapeau(req.body.is_private, 0),
    drapeau(req.body.is_locked, 0),
    ecartColonnes(req.body.gap, ACCESS_GAP_DEFAUT),
    req.user.id,
    now(),
  );
  res.status(201).json(accessCategories.byId.get(lastInsertRowid));
});

// Ranger les onglets. Déclaré avant « /:id », sinon « reorder » serait pris
// pour un identifiant. L'ordre est celui de tout le monde : une catégorie
// privée qu'on ne voit pas garde sa place (repositories/reorder.ts).
accessCategoryRoutes.put("/reorder", (req, res) => {
  const visibles = accessCategories.visibleTo.all(req.user.id);
  const ordre = ordreRecu(
    req.body.ids,
    visibles,
    "La liste des identifiants ne correspond pas aux catégories",
  );

  rangerAccessCategories(ordre);
  res.json(accessCategories.visibleTo.all(req.user.id));
});

accessCategoryRoutes.put("/:id", (req, res) => {
  const existing = accessCategorieOuverte(req.params.id, req.user);
  const name = requireText(req.body.name ?? existing.name, "Le nom de la catégorie est requis");
  const isPrivate = drapeau(req.body.is_private, existing.is_private);

  // Fermer une catégorie, c'est se la réserver : son auteur seul en décide.
  // Celle dont l'auteur est parti n'en a plus — la première personne à la
  // fermer l'adopte.
  let owner = existing.owner_id;
  if (isPrivate !== existing.is_private) {
    if (owner === null) owner = req.user.id;
    else if (owner !== req.user.id) {
      forbidden("Seul l'auteur de la catégorie peut la rendre privée");
    }
  }

  accessCategories.update.run(
    name,
    isPrivate,
    drapeau(req.body.is_locked, existing.is_locked),
    ecartColonnes(req.body.gap, existing.gap),
    owner,
    existing.id,
  );
  res.json(accessCategories.byId.get(existing.id));
});

accessCategoryRoutes.delete("/:id", (req, res) => {
  const existing = accessCategorieOuverte(req.params.id, req.user);
  // Ses sections partent avec elle, par clé étrangère.
  accessCategories.remove.run(existing.id);
  res.status(204).end();
});

// --- Sections --------------------------------------------------------------
// Une section est une colonne d'une catégorie. Elle n'a pas de visibilité
// propre : elle suit celle de la catégorie qui la porte, et chaque route
// commence donc par l'ouvrir.

export const accessSectionRoutes = Router();

accessSectionRoutes.use(touch("access-sections", "access-blocks"));

/** La section demandée, et la catégorie ouverte qui la porte. */
const sectionOuverte = (id: unknown, user: Parameters<typeof accessCategorieOuverte>[1]) => {
  const section = orNotFound(accessSections.byId.get(id), SECTION_INTROUVABLE);
  accessCategorieOuverte(section.category_id, user);
  return section;
};

accessSectionRoutes.get("/", (req, res) => {
  const { category } = req.query;
  if (!category) badRequest("La catégorie est requise");
  const ouverte = accessCategorieOuverte(category, req.user);
  res.json(accessSections.byCategory.all(ouverte.id));
});

accessSectionRoutes.post("/", (req, res) => {
  const categoryId = req.body.category_id;
  if (!categoryId) badRequest("La catégorie est requise");
  const ouverte = accessCategorieOuverte(categoryId, req.user);

  const unite = uniteLargeur(req.body.width_unit, "auto");
  const valeur = valeurLargeur(unite, req.body.width_value);

  // Ajoutée à la suite des colonnes déjà posées dans cette catégorie, ou au
  // rang demandé : le « + » entre deux colonnes l'y glisse.
  const { next } = accessSections.nextPosition(ouverte.id);
  const { lastInsertRowid } = accessSections.create.run(ouverte.id, unite, valeur, next, now());
  const id = Number(lastInsertRowid);
  const rang = rangDemande(req.body.index);
  if (rang !== null) {
    const autres = accessSections.byCategory
      .all(ouverte.id)
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
  const ouverte = accessCategorieOuverte(categoryId, req.user);
  exigerDeverrouillee(ouverte);

  const ids = toIds(req.body.ids);
  const connues = accessSections.byCategory.all(ouverte.id).map((s) => s.id);
  if (ids.length !== connues.length || !connues.every((id) => ids.includes(id))) {
    badRequest("La liste des identifiants ne correspond pas à cette catégorie");
  }

  rangerSections(ids);
  res.json(accessSections.byCategory.all(ouverte.id));
});

accessSectionRoutes.put("/:id", (req, res) => {
  const existing = sectionOuverte(req.params.id, req.user);
  const unite = uniteLargeur(req.body.width_unit, existing.width_unit);
  // Changer d'unité sans redire la valeur garderait l'ancienne, qui ne veut
  // plus rien dire : « 30 % » ne devient pas « 30 px ».
  const valeur = valeurLargeur(
    unite,
    req.body.width_value ?? (unite === existing.width_unit ? existing.width_value : undefined),
  );

  accessSections.update.run(unite, valeur, existing.id);
  res.json(accessSections.byId.get(existing.id));
});

/**
 * Dupliquer une colonne : la copie, avec sa largeur et tout ce qu'elle porte,
 * se pose juste à sa droite. Ses éléments étant recopiés, la catégorie ne doit
 * pas être verrouillée.
 */
const dupliquerSection = transaction((original: AccessSectionRow): Id => {
  const timestamp = now();
  const { next } = accessSections.nextPosition(original.category_id);
  const id = Number(
    accessSections.create.run(
      original.category_id,
      original.width_unit,
      original.width_value,
      next,
      timestamp,
    ).lastInsertRowid,
  );
  accessBlocks.bySection.all(original.id).forEach((bloc, place) => {
    accessBlocks.create.run(id, bloc.type, bloc.config, place, timestamp);
  });

  const ordre = accessSections.byCategory
    .all(original.category_id)
    .map((s) => s.id)
    .filter((autre) => autre !== id);
  ordre.splice(ordre.indexOf(original.id) + 1, 0, id);
  rangerSections(ordre);
  return id;
});

accessSectionRoutes.post("/:id/duplicate", (req, res) => {
  const existing = sectionOuverte(req.params.id, req.user);
  exigerDeverrouillee(accessCategorieOuverte(existing.category_id, req.user));
  res.status(201).json(accessSections.byId.get(dupliquerSection(existing)));
});

accessSectionRoutes.delete("/:id", (req, res) => {
  const existing = sectionOuverte(req.params.id, req.user);
  // Ce qu'elle portait part avec elle, par clé étrangère.
  accessSections.remove.run(existing.id);
  res.status(204).end();
});

// --- Éléments --------------------------------------------------------------
// Ce qu'une section porte. Leur configuration appartient au widget du client
// (client/src/widgets) : le serveur la range en JSON sans la relire, il ne
// vérifie que le widget visé. Leur visibilité est celle de la catégorie, au
// bout de la chaîne section → catégorie.

const BLOC_INTROUVABLE = "Élément introuvable";
const CATEGORIE_VERROUILLEE = "Cette catégorie est verrouillée";

/**
 * Une catégorie verrouillée se lit, mais ce qu'elle porte ne bouge plus. Le
 * verrou se pose et se retire depuis le tiroir de la catégorie : il ne
 * s'oppose donc pas à lui-même. Il est tenu ici et pas seulement à l'écran —
 * un client resté sur une version d'avant le verrou déplacerait sinon des
 * éléments qu'on venait de figer.
 */
const exigerDeverrouillee = (categorie: { is_locked: number }): void => {
  if (categorie.is_locked) forbidden(CATEGORIE_VERROUILLEE);
};

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

/** L'élément demandé, et la catégorie ouverte au bout de sa chaîne. */
const blocOuvert = (id: unknown, user: Parameters<typeof accessCategorieOuverte>[1]) => {
  const bloc = orNotFound(accessBlocks.byId.get(id), BLOC_INTROUVABLE);
  const section = orNotFound(accessSections.byId.get(bloc.section_id), SECTION_INTROUVABLE);
  return { bloc, categorie: accessCategorieOuverte(section.category_id, user) };
};

accessBlockRoutes.get("/", (req, res) => {
  const { section, category } = req.query;

  // Par section, ou par catégorie entière : la page lit d'un coup tout ce que
  // ses colonnes portent, plutôt qu'une requête par colonne.
  if (section) {
    const ouverte = orNotFound(accessSections.byId.get(section), SECTION_INTROUVABLE);
    accessCategorieOuverte(ouverte.category_id, req.user);
    return void res.json(accessBlocks.bySection.all(ouverte.id).map(blocRendu));
  }
  if (!category) badRequest("La section ou la catégorie est requise");
  const ouverte = accessCategorieOuverte(category, req.user);
  res.json(accessBlocks.byCategory.all(ouverte.id).map(blocRendu));
});

/**
 * Ranger les éléments d'une section. Déclaré avant « /:id », sinon « reorder »
 * serait pris pour un identifiant.
 *
 * Le corps donne la section et, dans l'ordre, tout ce qu'elle porte désormais.
 * Un élément qui vient d'une autre colonne de la même catégorie y est admis :
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
  const section = orNotFound(accessSections.byId.get(sectionId), SECTION_INTROUVABLE);
  const categorie = accessCategorieOuverte(section.category_id, req.user);
  exigerDeverrouillee(categorie);

  const ids = toIds(req.body.ids);
  // Un élément ne saute pas d'une catégorie à l'autre : les colonnes qu'on
  // voit sont celles de la catégorie ouverte, le rangement s'y borne.
  const deLaCategorie = new Set(accessBlocks.byCategory.all(categorie.id).map((b) => b.id));
  if (ids.length !== new Set(ids).size || ids.some((id) => !deLaCategorie.has(id))) {
    badRequest("La liste des identifiants ne correspond pas à cette catégorie");
  }

  rangerBlocs(section.id, ids);
  res.json(accessBlocks.byCategory.all(categorie.id).map(blocRendu));
});

accessBlockRoutes.post("/", (req, res) => {
  const sectionId = req.body.section_id;
  if (!sectionId) badRequest("La section est requise");
  const section = orNotFound(accessSections.byId.get(sectionId), SECTION_INTROUVABLE);
  exigerDeverrouillee(accessCategorieOuverte(section.category_id, req.user));

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
  const { bloc, categorie } = blocOuvert(req.params.id, req.user);
  exigerDeverrouillee(categorie);
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
  const { bloc, categorie } = blocOuvert(req.params.id, req.user);
  exigerDeverrouillee(categorie);
  res.status(201).json(blocRendu(accessBlocks.byId.get(dupliquerBloc(bloc))!));
});

accessBlockRoutes.delete("/:id", (req, res) => {
  const { bloc, categorie } = blocOuvert(req.params.id, req.user);
  exigerDeverrouillee(categorie);
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
