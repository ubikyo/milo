// Les personnes que citent les modèles du Support (SUPPORT_REPLY_VARIABLES) :
// le compte qui écrit, et l'expéditeur de la demande. Leurs fiches viennent
// d'Entra — téléphone, poste, adresse… — quand l'annuaire est branché et
// qu'il les connaît ; à défaut, de ce qu'en sait Milo : un nom, une adresse.
//
// Une fiche lue est gardée quelques minutes : chaque réponse qui s'ouvre en
// redemande, et l'annuaire n'a pas à répondre à chaque fois.

import { emptySupportPerson, splitPersonName } from "@milo/shared";
import type { SupportPerson } from "@milo/shared";
import type { SupportRequestRow, UserRow } from "../db/rows.js";
import { entraConfiguree, ficheEntra, ficheEntraParAdresse } from "./entra.js";
import type { FicheEntra } from "./entra.js";

const DUREE_CACHE = 10 * 60_000;
const cache = new Map<string, { lue: number; fiche: FicheEntra | null }>();

/** La fiche, lue dans l'annuaire ou dans le cache ; « null » sur un échec. */
const fiche = async (
  cle: string,
  lire: () => Promise<FicheEntra | null>,
): Promise<FicheEntra | null> => {
  const deja = cache.get(cle);
  if (deja && Date.now() - deja.lue < DUREE_CACHE) return deja.fiche;
  try {
    const lue = await lire();
    cache.set(cle, { lue: Date.now(), fiche: lue });
    return lue;
  } catch (erreur) {
    // Un annuaire injoignable ne bloque pas la réponse : Milo y supplée.
    console.error(`Fiche Entra « ${cle} » :`, erreur);
    return null;
  }
};

/** Ce que Milo sait déjà, complété par la fiche d'Entra là où elle dit quelque chose. */
const completer = (base: SupportPerson, f: FicheEntra | null): SupportPerson => {
  if (!f) return base;
  const entra: Partial<SupportPerson> = {
    prenom: f.givenName ?? "",
    nom: f.surname ?? "",
    nom_complet: f.displayName ?? "",
    email: f.mail ?? "",
    telephone: f.businessPhones?.[0] ?? "",
    mobile: f.mobilePhone ?? "",
    poste: f.jobTitle ?? "",
    service: f.department ?? "",
    entreprise: f.companyName ?? "",
    adresse: f.streetAddress ?? "",
    ville: f.city ?? "",
    departement: f.state ?? "",
    code_postal: f.postalCode ?? "",
    pays: f.country ?? "",
  };
  const fusion = { ...base };
  for (const [champ, valeur] of Object.entries(entra) as [keyof SupportPerson, string][]) {
    if (valeur.trim()) fusion[champ] = valeur.trim();
  }
  return fusion;
};

/** Le compte qui écrit la réponse. */
export const personneDuCompte = async (user: UserRow): Promise<SupportPerson> => {
  const base: SupportPerson = {
    ...emptySupportPerson(),
    prenom: user.first_name,
    nom: user.last_name,
    nom_complet: user.name,
    email: user.email,
  };
  if (!user.entra_id || !entraConfiguree()) return base;
  return completer(base, await fiche(`oid:${user.entra_id}`, () => ficheEntra(user.entra_id)));
};

/** L'expéditeur de la demande ; « null » quand elle n'en a pas. */
export const personneExpediteur = async (
  demande: Pick<SupportRequestRow, "sender_name" | "sender_email">,
): Promise<SupportPerson | null> => {
  const email = demande.sender_email.trim();
  if (!email && !demande.sender_name.trim()) return null;
  const base: SupportPerson = {
    ...emptySupportPerson(),
    ...splitPersonName(demande.sender_name),
    nom_complet: demande.sender_name || email,
    email,
  };
  if (!email || !entraConfiguree()) return base;
  return completer(
    base,
    await fiche(`mail:${email.toLowerCase()}`, () => ficheEntraParAdresse(email)),
  );
};
