// Ce que Milo note dans le fil d'un élément quand on le modifie : qui, quand,
// et ce qui a bougé, champ par champ. La création a déjà son mot
// (repositories/comments.ts, `motDeCreation`) ; celui-ci le prolonge.
//
// Le mot tient en un entête — « Projet modifié le … par … » — suivi d'une
// ligne par champ. Le fil le montre plié, entête seul : c'est le client qui
// déplie le détail.
//
// Pour ne pas saturer le fil, les retouches d'une même personne qui se
// suivent de près s'ajoutent au dernier mot au lieu d'en écrire un autre : la
// carte créée puis aussitôt complétée par son tiroir n'en porte qu'un, et un
// nom corrigé deux fois de suite dit « A → C », pas « A → B » puis « B → C ».

import type { Id } from "@milo/shared";
import { mutation, selection } from "../db/query.js";
import { memeDescription } from "./html.js";
import { horodatage, now } from "./time.js";

/** Qui modifie : de quoi le nommer dans l'entête. */
export interface Modificateur {
  name: string;
  email: string;
}

/** Un champ tel qu'on le lit, avant et après l'écriture. */
export interface Champ {
  libelle: string;
  /** Sa valeur affichée, déjà mise en forme (voir `cite`, `liste`, `date`). */
  valeur: string;
  /**
   * Une description : trop longue pour être recopiée, on dit seulement
   * qu'elle a changé. Elle se compare comme le fait la fiche, sans égard aux
   * retouches de forme de l'éditeur.
   */
  opaque?: boolean;
}

/** Une ligne du mot, et le champ qu'elle concerne. */
export interface Ecart {
  libelle: string;
  ligne: string;
}

// --- Mise en forme des valeurs ----------------------------------------------

const VIDE = "—";

/** Un texte libre, entre guillemets. */
export const cite = (texte: string | null | undefined): string =>
  texte ? `« ${texte} »` : VIDE;

/** Des noms — acteurs, étiquettes —, dans l'ordre alphabétique. */
export const liste = (noms: string[]): string =>
  noms.length ? [...noms].sort((a, b) => a.localeCompare(b, "fr")).join(", ") : VIDE;

/** Une échéance. */
export const date = (iso: string | null | undefined): string => (iso ? horodatage(iso) : VIDE);

// --- Ce qui a changé --------------------------------------------------------

const FLECHE = " → ";
const puce = (libelle: string, reste: string): string => `• ${libelle} : ${reste}`;

/**
 * Une ligne qui ne compare pas deux valeurs mais dit ce qui s'est passé :
 * « • Fusion : HLP-2, HLP-3 fusionnées ici ».
 */
export const fait = (libelle: string, texte: string): Ecart => ({
  libelle,
  ligne: puce(libelle, texte),
});

/** Les champs qui ont bougé entre deux lectures, dans l'ordre de la fiche. */
export const ecarts = (avant: Champ[], apres: Champ[]): Ecart[] => {
  const precedents = new Map(avant.map((c) => [c.libelle, c]));
  const lignes: Ecart[] = [];
  for (const champ of apres) {
    const ancien = precedents.get(champ.libelle);
    if (!ancien) continue;
    if (champ.opaque) {
      if (!memeDescription(champ.valeur, ancien.valeur)) {
        lignes.push({ libelle: champ.libelle, ligne: puce(champ.libelle, "modifiée") });
      }
    } else if (champ.valeur !== ancien.valeur) {
      lignes.push({
        libelle: champ.libelle,
        ligne: puce(champ.libelle, `${ancien.valeur}${FLECHE}${champ.valeur}`),
      });
    }
  }
  return lignes;
};

/** « a modifié la fiche (nom, échéance) » : ce que disent les notifications. */
export const messageModification = (lignes: Ecart[]): string =>
  `a modifié la fiche (${lignes.map((l) => l.libelle.toLocaleLowerCase("fr")).join(", ")})`;

/**
 * Ajoute de nouvelles lignes à celles d'un mot déjà écrit. Un champ déjà
 * noté garde sa valeur de départ et prend la nouvelle valeur d'arrivée ; s'il
 * revient à son point de départ, sa ligne disparaît.
 */
const fusionner = (anciennes: string[], nouvelles: Ecart[]): string[] => {
  const lignes = [...anciennes];
  for (const { libelle, ligne } of nouvelles) {
    const prefixe = `• ${libelle} : `;
    const i = lignes.findIndex((l) => l.startsWith(prefixe));
    if (i < 0) {
      lignes.push(ligne);
      continue;
    }
    const ancienne = lignes[i]!.slice(prefixe.length);
    const nouvelle = ligne.slice(prefixe.length);
    const fin = ancienne.indexOf(FLECHE);
    const debut = nouvelle.indexOf(FLECHE);
    // Une ligne sans flèche — une description modifiée, une fusion — ne se
    // combine pas : identique, elle n'est pas répétée ; nouvelle, elle
    // s'ajoute à la suite.
    if (fin < 0 || debut < 0) {
      if (!lignes.includes(ligne)) lignes.push(ligne);
      continue;
    }
    const depart = ancienne.slice(0, fin);
    const arrivee = nouvelle.slice(debut + FLECHE.length);
    if (depart === arrivee) lignes.splice(i, 1);
    else lignes[i] = puce(libelle, `${depart}${FLECHE}${arrivee}`);
  }
  return lignes;
};

// --- Le fil de chaque élément -----------------------------------------------

/** Les éléments dont le fil reçoit ces mots. */
export type Historise = "project" | "card" | "support";

interface DernierMot {
  id: Id;
  text: string;
  system: number;
  user_id: Id | null;
  updated_at: string;
}

/**
 * Le fil de chaque élément. Celui d'un ticket a deux onglets :
 * les échanges avec l'expéditeur, et les commentaires de l'équipe. Ces mots
 * vont dans le second — ils ne regardent pas l'expéditeur.
 */
const fil = (table: string, colonne: string, interne: boolean) => ({
  dernier: selection<DernierMot>(
    `SELECT id, text, system, user_id, updated_at FROM ${table}
      WHERE ${colonne} = ?${interne ? " AND internal = 1" : ""}
      ORDER BY created_at DESC, id DESC LIMIT 1`,
  ),
  ecrire: mutation(
    `INSERT INTO ${table} (${colonne}, user_id, text, system${interne ? ", internal" : ""}, created_at, updated_at)
     VALUES (?, NULL, ?, 1${interne ? ", 1" : ""}, ?, ?)`,
  ),
  completer: mutation(`UPDATE ${table} SET text = ?, updated_at = ? WHERE id = ?`),
});

const FILS: Record<Historise, ReturnType<typeof fil> & { modifie: string; cree: string }> = {
  project: { ...fil("comments", "project_id", false), modifie: "Projet modifié", cree: "Projet créé" },
  card: { ...fil("card_comments", "card_id", false), modifie: "Carte modifiée", cree: "Carte créée" },
  support: {
    ...fil("support_comments", "request_id", true),
    modifie: "Demande modifiée",
    cree: "Demande créée",
  },
};

/** Le temps pendant lequel les retouches d'une personne rejoignent le même mot. */
const REGROUPEMENT = 10 * 60 * 1000;

/**
 * Note dans le fil de l'élément ce qui vient d'y changer. Rien n'est écrit
 * quand rien n'a bougé : enregistrer une fiche sans y toucher ne laisse pas
 * de trace.
 */
export const consigner = (
  kind: Historise,
  elementId: Id,
  auteur: Modificateur,
  lignes: Ecart[],
): void => {
  if (lignes.length === 0) return;
  const { dernier, ecrire, completer, modifie, cree } = FILS[kind];
  const quand = now();
  const nom = auteur.name || auteur.email;

  // Le dernier mot du fil, s'il est de Milo, sur un geste de la même
  // personne, et récent : on le complète.
  const mot = dernier.get(elementId);
  if (mot && mot.system && mot.user_id === null && nom) {
    const [entete = "", ...anciennes] = mot.text.split("\n");
    const deLaMeme =
      (entete.startsWith(`${modifie} le `) || entete.startsWith(`${cree} le `)) &&
      entete.endsWith(` par ${nom}`);
    if (deLaMeme && Date.parse(quand) - Date.parse(mot.updated_at) < REGROUPEMENT) {
      const restantes = fusionner(anciennes, lignes);
      completer.run([entete, ...restantes].join("\n"), quand, mot.id);
      return;
    }
  }

  const entete = `${modifie} le ${horodatage(quand)}${nom ? ` par ${nom}` : ""}`;
  ecrire.run(elementId, [entete, ...lignes.map((l) => l.ligne)].join("\n"), quand, quand);
};
