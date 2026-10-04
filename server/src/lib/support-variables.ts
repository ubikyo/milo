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
import { entraConfigured, entraRecord, entraRecordByAddress } from "./entra.js";
import type { EntraRecord } from "./entra.js";

const CACHE_DURATION = 10 * 60_000;
const cache = new Map<string, { readValue: number; record: EntraRecord | null }>();

/** La fiche, lue dans l'annuaire ou dans le cache ; « null » sur un échec. */
const record = async (
  key: string,
  read: () => Promise<EntraRecord | null>,
): Promise<EntraRecord | null> => {
  const already = cache.get(key);
  if (already && Date.now() - already.readValue < CACHE_DURATION) return already.record;
  try {
    const readValue = await read();
    cache.set(key, { readValue: Date.now(), record: readValue });
    return readValue;
  } catch (error) {
    // Un annuaire injoignable ne bloque pas la réponse : Milo y supplée.
    console.error(`Fiche Entra « ${key} » :`, error);
    return null;
  }
};

/** Ce que Milo sait déjà, complété par la fiche d'Entra là où elle dit quelque chose. */
const completeText = (base: SupportPerson, f: EntraRecord | null): SupportPerson => {
  if (!f) return base;
  const entra: Partial<SupportPerson> = {
    firstName: f.givenName ?? "",
    name: f.surname ?? "",
    full_name: f.displayName ?? "",
    email: f.mail ?? "",
    telephone: f.businessPhones?.[0] ?? "",
    mobile: f.mobilePhone ?? "",
    jobTitle: f.jobTitle ?? "",
    service: f.department ?? "",
    company: f.companyName ?? "",
    address: f.streetAddress ?? "",
    city: f.city ?? "",
    department: f.state ?? "",
    postal_code: f.postalCode ?? "",
    country: f.country ?? "",
  };
  const merged = { ...base };
  for (const [field, value] of Object.entries(entra) as [keyof SupportPerson, string][]) {
    if (value.trim()) merged[field] = value.trim();
  }
  return merged;
};

/** Le compte qui écrit la réponse. */
export const accountPerson = async (user: UserRow): Promise<SupportPerson> => {
  const base: SupportPerson = {
    ...emptySupportPerson(),
    firstName: user.first_name,
    name: user.last_name,
    full_name: user.name,
    email: user.email,
  };
  if (!user.entra_id || !entraConfigured()) return base;
  return completeText(base, await record(`oid:${user.entra_id}`, () => entraRecord(user.entra_id)));
};

/** L'expéditeur de la demande ; « null » quand elle n'en a pas. */
export const senderPerson = async (
  request: Pick<SupportRequestRow, "sender_name" | "sender_email">,
): Promise<SupportPerson | null> => {
  const email = request.sender_email.trim();
  if (!email && !request.sender_name.trim()) return null;
  const base: SupportPerson = {
    ...emptySupportPerson(),
    ...splitPersonName(request.sender_name),
    full_name: request.sender_name || email,
    email,
  };
  if (!email || !entraConfigured()) return base;
  return completeText(
    base,
    await record(`mail:${email.toLowerCase()}`, () => entraRecordByAddress(email)),
  );
};
