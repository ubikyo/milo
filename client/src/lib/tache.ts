// « Créer une tâche » : ce que chaque mode donne à la fenêtre qui la crée
// (components/board/CardDrawer.tsx, components/board/TaskDestination.tsx) — le nom de l'élément, et de quoi y
// revenir.

import { projectReference, supportTicketRef } from "@milo/shared";
import type { AccessBlockType, Asset, BoardWidget, Id, Project, SupportRequest } from "@milo/shared";
import type { TacheSource } from "../components/board/TaskDestination";
import { widgetDe } from "../widgets";

const texte = (valeur: unknown): string => (typeof valeur === "string" ? valeur.trim() : "");

export const sourceProjet = (projet: Project, boardName?: string): TacheSource => ({
  kind: "project",
  id: projet.id,
  title: [projet.number > 0 ? projectReference(projet.number) : "", projet.name]
    .filter(Boolean)
    .join(" — "),
  boardName,
});

export const sourceDemande = (demande: SupportRequest): TacheSource => ({
  kind: "support",
  id: demande.id,
  title: [demande.number > 0 ? supportTicketRef(demande.number) : "", demande.subject]
    .filter(Boolean)
    .join(" — "),
});

export const sourcePoste = (poste: Asset): TacheSource => ({
  kind: "asset",
  id: poste.id,
  title: poste.name,
});

/**
 * Un widget commun : son titre, son libellé ou sa première ligne, à défaut
 * le nom de son widget. Le lien ramène à son tableau ; un lien garde en plus
 * son adresse.
 */
export const sourceAcces = (bloc: BoardWidget, boardId: Id, boardName?: string): TacheSource => {
  const config = bloc.config ?? {};
  const lignes = Array.isArray(config.lignes) ? (config.lignes as Record<string, unknown>[]) : [];
  const title =
    texte(config.titre) ||
    texte(config.libelle) ||
    texte(lignes[0]?.libelle) ||
    texte(config.url) ||
    widgetDe(bloc.type as AccessBlockType)?.label ||
    "Accès";
  const url = bloc.type === "link" ? texte(config.url) : "";
  return { kind: "access", id: boardId, title, url: url || undefined, boardName };
};
