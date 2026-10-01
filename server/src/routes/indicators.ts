// Les routes d'un panneau des statistiques — Support, Assets, Projet ou
// Tâche. Le serveur ne vérifie que le widget visé et la forme de la
// configuration — un objet —, sans la relire : c'est le widget du client qui
// sait ce qu'elle veut dire.

import { Router } from "express";
import type { Resource } from "@milo/shared";
import { badRequest, forbidden, orNotFound, toIds } from "../lib/http.js";
import { rangDemande, uniteLargeur, valeurLargeur } from "../lib/sections.js";
import { now } from "../lib/time.js";
import { touch } from "../middleware/events.js";
import { indicateurRendu, type PanneauIndicateurs } from "../repositories/indicators.js";

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
  resource: Resource,
  panneau: PanneauIndicateurs<Type>,
  estDuType: (valeur: unknown) => valeur is Type,
) => {
  /**
   * Verrouillé, le panneau ne reçoit plus d'indicateur et ne se réordonne
   * plus. Tenu ici et pas seulement à l'écran : un client resté sur une
   * version d'avant le verrou ajouterait sinon ce qu'on vient de figer.
   */
  const exigerDeverrouille = (): void => {
    if (panneau.verrouille()) forbidden("Le panneau des indicateurs est verrouillé");
  };

  const typeDIndicateur = (valeur: unknown): Type => {
    if (!estDuType(valeur)) badRequest("Indicateur inconnu");
    return valeur as Type;
  };

  const tous = () => panneau.all.all().map(indicateurRendu);

  const routes = Router();

  routes.use(touch(resource));

  routes.get("/", (_req, res) => {
    res.json(tous());
  });

  // Le verrou et le rangement sont déclarés avant « /:id », sinon « lock » et
  // « reorder » seraient pris pour des identifiants.
  routes.get("/lock", (_req, res) => {
    res.json({ locked: panneau.verrouille() });
  });

  routes.put("/lock", (req, res) => {
    panneau.verrouiller(Boolean(req.body.locked));
    res.json({ locked: panneau.verrouille() });
  });

  // --- Sections -------------------------------------------------------------
  // Les colonnes du panneau, comme celles d'une catégorie d'accès : une
  // largeur, un rang, et ce qu'elles portent.

  const sectionOuverte = (id: unknown) =>
    orNotFound(panneau.sections.byId(id), SECTION_INTROUVABLE);

  routes.get("/sections", (_req, res) => {
    res.json(panneau.sections.all());
  });

  routes.post("/sections", (req, res) => {
    exigerDeverrouille();
    const unite = uniteLargeur(req.body.width_unit, "auto");
    const valeur = valeurLargeur(unite, req.body.width_value);
    const id = panneau.sections.create(unite, valeur, rangDemande(req.body.index));
    res.status(201).json(panneau.sections.byId(id));
  });

  // Déclaré avant « /sections/:id », sinon « reorder » serait pris pour un
  // identifiant.
  routes.put("/sections/reorder", (req, res) => {
    exigerDeverrouille();
    const ids = toIds(req.body.ids);
    const connues = panneau.sections.all().map((s) => s.id);
    if (
      ids.length !== connues.length ||
      new Set(ids).size !== ids.length ||
      !connues.every((id) => ids.includes(id))
    ) {
      badRequest("La liste des identifiants ne correspond pas aux sections");
    }
    panneau.sections.ranger(ids);
    res.json(panneau.sections.all());
  });

  routes.put("/sections/:id", (req, res) => {
    exigerDeverrouille();
    const existing = sectionOuverte(req.params.id);
    const unite = uniteLargeur(req.body.width_unit, existing.width_unit);
    // Changer d'unité sans redire la valeur garderait l'ancienne, qui ne veut
    // plus rien dire : « 30 % » ne devient pas « 30 px ».
    const valeur = valeurLargeur(
      unite,
      req.body.width_value ?? (unite === existing.width_unit ? existing.width_value : undefined),
    );
    panneau.sections.update.run(unite, valeur, existing.id);
    res.json(panneau.sections.byId(existing.id));
  });

  routes.post("/sections/:id/duplicate", (req, res) => {
    exigerDeverrouille();
    const existing = sectionOuverte(req.params.id);
    res.status(201).json(panneau.sections.byId(panneau.sections.duplicate(existing)));
  });

  routes.delete("/sections/:id", (req, res) => {
    exigerDeverrouille();
    const existing = sectionOuverte(req.params.id);
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
    exigerDeverrouille();
    const section = sectionOuverte(req.body.section_id);
    const ids = toIds(req.body.ids);
    const connus = new Set(panneau.all.all().map((i) => i.id));
    if (ids.length !== new Set(ids).size || ids.some((id) => !connus.has(id))) {
      badRequest("La liste des identifiants ne correspond pas aux indicateurs");
    }
    panneau.ranger(section.id, ids);
    res.json(tous());
  });

  routes.post("/", (req, res) => {
    exigerDeverrouille();
    const section = sectionOuverte(req.body.section_id);
    const type = typeDIndicateur(req.body.type);
    const config = configuration(req.body.config, "{}");
    const { next } = panneau.nextPosition(section.id);
    const { lastInsertRowid } = panneau.create.run(section.id, type, config, next, now());
    res.status(201).json(indicateurRendu(panneau.byId.get(lastInsertRowid)!));
  });

  // Le type ne se change pas : ce serait un autre widget, donc un autre indicateur.
  routes.put("/:id", (req, res) => {
    const existing = orNotFound(panneau.byId.get(req.params.id), INDICATEUR_INTROUVABLE);
    panneau.update.run(configuration(req.body.config, existing.config), existing.id);
    res.json(indicateurRendu(panneau.byId.get(existing.id)!));
  });

  routes.delete("/:id", (req, res) => {
    const existing = orNotFound(panneau.byId.get(req.params.id), INDICATEUR_INTROUVABLE);
    panneau.remove.run(existing.id);
    res.status(204).end();
  });

  return routes;
};
