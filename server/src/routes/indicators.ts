// Les routes d'un panneau des statistiques — Support, Assets, Projet ou
// Tâche. Le serveur ne vérifie que le widget visé et la forme de la
// configuration — un objet —, sans la relire : c'est le widget du client qui
// sait ce qu'elle veut dire.

import { Router } from "express";
import type { Request } from "express";
import { SECTIONS_GAP_DEFAUT } from "@milo/shared";
import type { Area, Id, LayoutState, Resource, Right } from "@milo/shared";
import { accesAuWidget, exiger, exigerWidget } from "../lib/droits.js";
import { badRequest, orNotFound, toIds } from "../lib/http.js";
import { ecartColonnes, rangDemande, uniteLargeur, valeurLargeur } from "../lib/sections.js";
import { now } from "../lib/time.js";
import { touch } from "../middleware/events.js";
import { indicateurRendu, type PanneauIndicateurs } from "../repositories/indicators.js";
import { personalLayouts } from "../repositories/layouts.js";

const INDICATEUR_INTROUVABLE = "Indicateur introuvable";
const SECTION_INTROUVABLE = "Section introuvable";

/** La configuration reçue, prête à ranger : un objet, rien d'autre. */
const configuration = (valeur: unknown, defaut: string): string => {
  if (valeur === undefined) return defaut;
  if (!valeur || typeof valeur !== "object" || Array.isArray(valeur)) {
    badRequest("Configuration invalide");
  }
  return JSON.stringify(valeur);
};

export const indicatorRoutes = <Type extends string>(
  area: Area,
  resource: Resource,
  panneau: PanneauIndicateurs<Type>,
  estDuType: (valeur: unknown) => valeur is Type,
) => {
  // Le panneau porte le nom de sa zone : c'est aussi la portée de « Hérité ».
  const scope = area;

  /** La structure que ce compte voit et modifie : la publique, ou la sienne. */
  const proprietaire = (req: Request): Id | null =>
    personalLayouts.proprietaire(req.user.id, scope);

  const typeDIndicateur = (valeur: unknown): Type => {
    if (!estDuType(valeur)) badRequest("Indicateur inconnu");
    return valeur as Type;
  };

  // Les widgets dont le compte ne lit pas le type ne lui sont pas rendus.
  const tous = (req: Request) =>
    panneau
      .all(proprietaire(req))
      .filter((i) => accesAuWidget(req, area, i.type) !== "")
      .map(indicateurRendu);

  const routes = Router();

  routes.use(touch(resource));

  // Le panneau est commun à toutes les sociétés : le lire demande de voir le
  // mode dans au moins une, le régler d'y modifier. Les assets ne proposent
  // que « Voir » : qui les voit règle leur panneau. Sa propre structure, on
  // la règle dès qu'on voit le mode : elle n'est qu'à soi.
  /** Le droit de modifier la structure publique. */
  const droitPublic = (): Right => (area === "assets" ? "view" : "update");
  routes.use((req, _res, next) => {
    exiger(
      req,
      area,
      // « Hérité » se règle pour soi : le voir suffit.
      req.method === "GET" || req.path === "/layout" || proprietaire(req) !== null
        ? "view"
        : droitPublic(),
    );
    next();
  });

  routes.get("/", (req, res) => {
    res.json(tous(req));
  });

  // « Hérité » : la structure publique, ou sa propre copie. Le décocher part
  // d'une copie de la publique ; le recocher efface la sienne. Déclaré avant
  // « /:id », sinon « layout » serait pris pour un identifiant.
  routes.get("/layout", (req, res) => {
    res.json({ inherited: proprietaire(req) === null } satisfies LayoutState);
  });

  routes.put("/layout", (req, res) => {
    const userId = req.user.id;
    const herite = Boolean(req.body.inherited);
    if (herite) {
      panneau.heriter(userId);
      personalLayouts.retirer(userId, scope);
    } else if (!personalLayouts.personnel(userId, scope)) {
      panneau.personnaliser(userId);
      personalLayouts.poser(userId, scope);
    }
    res.json({ inherited: proprietaire(req) === null } satisfies LayoutState);
  });

  // --- Sections -------------------------------------------------------------
  // Les colonnes du panneau, comme celles d'une catégorie d'accès : une
  // largeur, un rang, et ce qu'elles portent.

  /** Une section de la structure que ce compte voit : une autre est introuvable. */
  const sectionOuverte = (id: unknown, req: Request) =>
    orNotFound(panneau.sections.byId(id, proprietaire(req)), SECTION_INTROUVABLE);

  routes.get("/sections", (req, res) => {
    res.json(panneau.sections.all(proprietaire(req)));
  });

  routes.post("/sections", (req, res) => {
    const unite = uniteLargeur(req.body.width_unit, "auto");
    const valeur = valeurLargeur(unite, req.body.width_value);
    const owner = proprietaire(req);
    const id = panneau.sections.create(
      owner,
      unite,
      valeur,
      ecartColonnes(req.body.gap, SECTIONS_GAP_DEFAUT),
      rangDemande(req.body.index),
    );
    res.status(201).json(panneau.sections.byId(id, owner));
  });

  // Déclaré avant « /sections/:id », sinon « reorder » serait pris pour un
  // identifiant.
  routes.put("/sections/reorder", (req, res) => {
    const owner = proprietaire(req);
    const ids = toIds(req.body.ids);
    const connues = panneau.sections.all(owner).map((s) => s.id);
    if (
      ids.length !== connues.length ||
      new Set(ids).size !== ids.length ||
      !connues.every((id) => ids.includes(id))
    ) {
      badRequest("La liste des identifiants ne correspond pas aux sections");
    }
    panneau.sections.ranger(ids);
    res.json(panneau.sections.all(owner));
  });

  routes.put("/sections/:id", (req, res) => {
    const existing = sectionOuverte(req.params.id, req);
    const unite = uniteLargeur(req.body.width_unit, existing.width_unit);
    // Changer d'unité sans redire la valeur garderait l'ancienne, qui ne veut
    // plus rien dire : « 30 % » ne devient pas « 30 px ».
    const valeur = valeurLargeur(
      unite,
      req.body.width_value ?? (unite === existing.width_unit ? existing.width_value : undefined),
    );
    panneau.sections.update.run(
      unite,
      valeur,
      ecartColonnes(req.body.gap, existing.gap),
      existing.id,
    );
    res.json(panneau.sections.byId(existing.id, existing.owner_id));
  });

  routes.post("/sections/:id/duplicate", (req, res) => {
    const existing = sectionOuverte(req.params.id, req);
    res
      .status(201)
      .json(panneau.sections.byId(panneau.sections.duplicate(existing), existing.owner_id));
  });

  routes.delete("/sections/:id", (req, res) => {
    const existing = sectionOuverte(req.params.id, req);
    panneau.sections.remove.run(existing.id);
    res.status(204).end();
  });

  // --- Indicateurs ---------------------------------------------------------

  /**
   * Ranger les indicateurs d'une section. Le corps donne la section et, dans
   * l'ordre, tout ce qu'elle porte désormais : un indicateur venu d'une autre
   * section du panneau y est admis, c'est ainsi qu'on le déplace.
   */
  routes.put("/reorder", (req, res) => {
    const section = sectionOuverte(req.body.section_id, req);
    const ids = toIds(req.body.ids);
    // Seuls se rangent les widgets que le compte voit.
    const connus = new Set(
      panneau
        .all(section.owner_id)
        .filter((i) => accesAuWidget(req, area, i.type) !== "")
        .map((i) => i.id),
    );
    if (ids.length !== new Set(ids).size || ids.some((id) => !connus.has(id))) {
      badRequest("La liste des identifiants ne correspond pas aux indicateurs");
    }
    panneau.ranger(section.id, ids);
    res.json(tous(req));
  });

  routes.post("/", (req, res) => {
    const section = sectionOuverte(req.body.section_id, req);
    const type = typeDIndicateur(req.body.type);
    exigerWidget(req, area, type, "update");
    const config = configuration(req.body.config, "{}");
    const { next } = panneau.nextPosition(section.id);
    const { lastInsertRowid } = panneau.create.run(section.id, type, config, next, now());
    res.status(201).json(indicateurRendu(panneau.byId.get(lastInsertRowid)!));
  });

  /** Un indicateur de la structure que ce compte voit : un autre est introuvable. */
  /** Modifier ou supprimer un indicateur demande « Modifier » sur son type. */
  const indicateurOuvert = (id: unknown, req: Request) => {
    const existing = orNotFound(panneau.byId.get(id), INDICATEUR_INTROUVABLE);
    orNotFound(panneau.sections.byId(existing.section_id, proprietaire(req)), INDICATEUR_INTROUVABLE);
    exigerWidget(req, area, existing.type, "update");
    return existing;
  };

  // Le type ne se change pas : ce serait un autre widget, donc un autre indicateur.
  routes.put("/:id", (req, res) => {
    const existing = indicateurOuvert(req.params.id, req);
    panneau.update.run(configuration(req.body.config, existing.config), existing.id);
    res.json(indicateurRendu(panneau.byId.get(existing.id)!));
  });

  routes.delete("/:id", (req, res) => {
    const existing = indicateurOuvert(req.params.id, req);
    panneau.remove.run(existing.id);
    res.status(204).end();
  });

  return routes;
};
