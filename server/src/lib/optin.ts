// La confirmation des boîtes de support. Une adresse posée dans une liste de
// demandes ne se relève pas tant que sa boîte n'a pas prouvé qu'elle est à
// qui la pose : Milo lui envoie un code à quatre chiffres, qu'on saisit dans
// Milo (Actions → Confirmer une adresse). Jusque-là, aucun e-mail n'en est
// importé ; après, seuls ceux arrivés depuis la confirmation le sont
// (repositories/receptions.ts).
//
// Le code est tiré au hasard ; une relance en tire un neuf, et l'ancien ne
// vaut plus. Il n'y a pas de lien : rien ne s'ouvre hors de Milo.

import { randomInt } from "node:crypto";
import { optins, paire } from "../repositories/optins.js";
import { boitesDesListes } from "../repositories/receptions.js";
import { adresseDEnvoi, entraConfiguree } from "./entra.js";
import { fail } from "./http.js";
import { envoyerCourrier } from "./mail.js";
import { gabarit } from "./mail-template.js";

/**
 * L'objet de l'e-mail du code. La relève le reconnaît, parti de l'adresse
 * d'envoi, et ne l'importe jamais (lib/support-mail.ts).
 */
export const SUJET_CONFIRMATION = "Milo — Confirmez la réception des demandes de support";

const codeNeuf = (): string => String(randomInt(0, 10_000)).padStart(4, "0");

/** Au-delà, le code ne vaut plus : quatre chiffres se devineraient. */
const ESSAIS_MAX = 5;

/**
 * Ce qui manque pour envoyer le code, dit à qui relance ; vide quand tout y
 * est.
 */
const manque = (): string => {
  if (!entraConfiguree()) return "La messagerie n'est pas configurée (Paramétrage → Entra)";
  if (!adresseDEnvoi()) return "Renseignez l'adresse d'envoi dans Paramétrage → Entra";
  return "";
};

/**
 * Envoie un code neuf à la boîte, pour la liste « liste » ;
 * « usage » dit où ses demandes iront. Lève ce qui a empêché l'envoi.
 */
const envoyer = async (liste: string, email: string, usage = ""): Promise<void> => {
  const raison = manque();
  if (raison) throw new Error(raison);
  const code = codeNeuf();
  await envoyerCourrier({
    from: adresseDEnvoi(),
    to: email,
    subject: SUJET_CONFIRMATION,
    ...gabarit({
      titre: "Confirmez cette boîte de support",
      intro: `Milo doit relever les e-mails de ${email} pour en faire des demandes de support${usage ? ` (${usage})` : ""}. Pour confirmer que cette boîte vous appartient, saisissez ce code dans Milo : Actions → Confirmer une adresse. Rien n'en sera importé avant.`,
      lignes: [{ texte: `Code de confirmation : ${code}`, repetitions: 1 }],
      pied: "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.",
    }),
  });
  // Rangé une fois parti : un envoi manqué ne remplace pas le code précédent.
  optins.envoye(liste, email, code);
};

/**
 * Les adresses que les listes de demandes viennent de recevoir : chacune
 * attend désormais sa confirmation, et sa boîte reçoit le code. Un envoi
 * manqué se rattrape par la relance.
 */
export const demanderLesConfirmations = (): void => {
  // Chaque liste confirme ses adresses, même celles qu'une autre a déjà
  // confirmées. Une adresse qu'une liste ne dit plus y est oubliée :
  // rajoutée, elle se confirme de nouveau.
  const boites = boitesDesListes().filter((b) => b.liste);
  optins.oublierSauf(new Set(boites.map((b) => paire(b.liste, b.valeur))));
  for (const boite of boites) {
    if (!optins.creer(boite.liste, boite.valeur)) continue;
    envoyer(boite.liste, boite.valeur, boite.usage).catch((erreur: unknown) =>
      console.error(`Confirmation de ${boite.valeur} :`, erreur),
    );
  }
};

/**
 * Renvoie un code neuf aux adresses dites qui attendent encore. Rend le nombre
 * d'e-mails partis ; lève quand aucun n'a pu partir.
 */
export const relancer = async (liste: string, emails: string[]): Promise<number> => {
  const enAttente = [...new Set(emails.map((e) => e.trim().toLowerCase()))].filter(
    (e) => optins.de(liste, e)?.confirmed_at === "",
  );
  const usages = new Map(
    boitesDesListes()
      .filter((b) => b.liste === liste)
      .map((b) => [b.valeur.toLowerCase(), b.usage]),
  );
  const raison = manque();
  if (raison && enAttente.length) fail(400, raison);
  let partis = 0;
  let derniere = "";
  for (const email of enAttente) {
    try {
      await envoyer(liste, email, usages.get(email));
      partis += 1;
    } catch (erreur) {
      derniere = erreur instanceof Error ? erreur.message : String(erreur);
      console.error(`Relance de ${email} :`, erreur);
    }
  }
  if (enAttente.length && !partis) fail(400, derniere || "L'envoi a échoué");
  return partis;
};

/**
 * Confirme une boîte par le code de son e-mail. Lève quand le code est faux ;
 * au bout de ESSAIS_MAX essais, il ne vaut plus et il faut relancer.
 */
export const confirmerParCode = (liste: string, email: string, code: string): void => {
  const ligne = optins.de(liste, email);
  if (!ligne) fail(404, "Adresse inconnue : enregistrez d'abord le widget");
  if (ligne!.confirmed_at) return;
  if (!ligne!.code) fail(400, "Aucun code en cours : relancez la confirmation");
  if (code.trim() !== ligne!.code) {
    optins.essai(liste, email);
    if (ligne!.attempts + 1 >= ESSAIS_MAX) {
      optins.oublierCode(liste, email);
      fail(400, "Code incorrect. Trop d'essais : relancez la confirmation pour en recevoir un neuf");
    }
    fail(400, "Code incorrect");
  }
  optins.confirmer(liste, email);
};
