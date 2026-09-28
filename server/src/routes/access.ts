// Le mode Accès : ses catégories. Elles ne pendent à rien — c'est le premier
// niveau du mode, comme un tableau l'est ailleurs — et chacune peut être
// fermée : privée, elle ne se montre qu'à son auteur.

import { Router } from "express";
import { isAccessBlockType, isSectionWidthUnit } from "@milo/shared";
import type { AccessBlockType, SectionWidthUnit } from "@milo/shared";
import { badRequest, forbidden, orNotFound, requireText } from "../lib/http.js";
import { now } from "../lib/time.js";
import { touch } from "../middleware/events.js";
import {
  accessBlocks,
  accessCategorieOuverte,
  accessCategories,
  accessSections,
  blocRendu,
} from "../repositories/access.js";

/** Un réglage arrive en booléen ; la base le range en 0 ou 1. */
const drapeau = (valeur: unknown, defaut: 0 | 1): 0 | 1 =>
  valeur === undefined ? defaut : (Number(Boolean(valeur)) as 0 | 1);

const SECTION_INTROUVABLE = "Section introuvable";

/**
 * L'unité de largeur reçue du client. Une valeur inconnue n'est pas corrigée
 * en silence : elle serait rangée telle quelle et la colonne n'aurait plus de
 * largeur lisible.
 */
const uniteLargeur = (valeur: unknown, defaut: SectionWidthUnit): SectionWidthUnit => {
  if (valeur === undefined) return defaut;
  if (!isSectionWidthUnit(valeur)) badRequest("Largeur inconnue");
  return valeur as SectionWidthUnit;
};

/**
 * La valeur qui accompagne l'unité : nulle pour une largeur automatique, un
 * nombre positif sinon. Les pour-cent s'arrêtent à 100 — au-delà, la colonne
 * déborderait de la rangée.
 */
const valeurLargeur = (unite: SectionWidthUnit, valeur: unknown): number | null => {
  if (unite === "auto") return null;
  const nombre = Number(valeur);
  if (!Number.isFinite(nombre) || nombre <= 0) badRequest("La largeur est requise");
  if (unite === "percent" && nombre > 100) badRequest("Une largeur en % ne dépasse pas 100");
  return nombre;
};

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
    req.user.id,
    now(),
  );
  res.status(201).json(accessCategories.byId.get(lastInsertRowid));
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

  accessCategories.update.run(name, isPrivate, owner, existing.id);
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

  // Ajoutée à la suite des colonnes déjà posées dans cette catégorie.
  const { next } = accessSections.nextPosition(ouverte.id);
  const { lastInsertRowid } = accessSections.create.run(ouverte.id, unite, valeur, next, now());
  res.status(201).json(accessSections.byId.get(lastInsertRowid));
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

accessSectionRoutes.delete("/:id", (req, res) => {
  const existing = sectionOuverte(req.params.id, req.user);
  // Ce qu'elle portait part avec elle, par clé étrangère.
  accessSections.remove.run(existing.id);
  res.status(204).end();
});

// --- Éléments --------------------------------------------------------------
// Ce qu'une section porte. Leur configuration appartient au greffon du client
// (client/src/plugins) : le serveur la range en JSON sans la relire, il ne
// vérifie que le greffon visé. Leur visibilité est celle de la catégorie, au
// bout de la chaîne section → catégorie.

const BLOC_INTROUVABLE = "Élément introuvable";

const typeDeBloc = (valeur: unknown): AccessBlockType => {
  if (!isAccessBlockType(valeur)) badRequest("Élément inconnu");
  return valeur as AccessBlockType;
};

/**
 * La configuration reçue, prête à ranger. Sa forme est celle du greffon : on
 * n'exige qu'un objet, pas une liste ni une valeur nue — le greffon ne saurait
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
  accessCategorieOuverte(section.category_id, user);
  return bloc;
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

accessBlockRoutes.post("/", (req, res) => {
  const sectionId = req.body.section_id;
  if (!sectionId) badRequest("La section est requise");
  const section = orNotFound(accessSections.byId.get(sectionId), SECTION_INTROUVABLE);
  accessCategorieOuverte(section.category_id, req.user);

  const type = typeDeBloc(req.body.type);
  const config = configuration(req.body.config, "{}");

  const { next } = accessBlocks.nextPosition(section.id);
  const { lastInsertRowid } = accessBlocks.create.run(section.id, type, config, next, now());
  res.status(201).json(blocRendu(accessBlocks.byId.get(lastInsertRowid)!));
});

// Le type d'un élément ne se change pas : ce serait un autre greffon, donc un
// autre élément. Seule sa configuration bouge.
accessBlockRoutes.put("/:id", (req, res) => {
  const existing = blocOuvert(req.params.id, req.user);
  accessBlocks.update.run(configuration(req.body.config, existing.config), existing.id);
  res.json(blocRendu(accessBlocks.byId.get(existing.id)!));
});

accessBlockRoutes.delete("/:id", (req, res) => {
  const existing = blocOuvert(req.params.id, req.user);
  accessBlocks.remove.run(existing.id);
  res.status(204).end();
});
