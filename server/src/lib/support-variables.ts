// The people cited by the Support templates (SUPPORT_REPLY_VARIABLES): the
// account writing, and the request's sender. Their profiles come from Entra —
// phone, job title, address… — when the directory is connected and knows
// them; otherwise, from what Milo knows: a name, an address.
//
// A profile read is kept for a few minutes: every reply that opens asks for
// it again, and the directory need not answer each time.

import { emptySupportPerson, splitPersonName } from "@milo/shared";
import type { SupportPerson } from "@milo/shared";
import type { SupportRequestRow, UserRow } from "../db/rows.js";
import { entraConfigured, entraRecord, entraRecordByAddress } from "./entra.js";
import type { EntraRecord } from "./entra.js";

const CACHE_DURATION = 10 * 60_000;
const cache = new Map<string, { readValue: number; record: EntraRecord | null }>();

/** The profile, read from the directory or from the cache; "null" on failure. */
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
    // An unreachable directory does not block the reply: Milo fills in.
    console.error(`Entra profile "${key}":`, error);
    return null;
  }
};

/** What Milo already knows, completed by the Entra profile where it says something. */
const completeText = (base: SupportPerson, f: EntraRecord | null): SupportPerson => {
  if (!f) return base;
  const entra: Partial<SupportPerson> = {
    first_name: f.givenName ?? "",
    last_name: f.surname ?? "",
    full_name: f.displayName ?? "",
    email: f.mail ?? "",
    phone: f.businessPhones?.[0] ?? "",
    mobile: f.mobilePhone ?? "",
    job_title: f.jobTitle ?? "",
    department: f.department ?? "",
    company: f.companyName ?? "",
    street_address: f.streetAddress ?? "",
    city: f.city ?? "",
    state: f.state ?? "",
    postal_code: f.postalCode ?? "",
    country: f.country ?? "",
  };
  const merged = { ...base };
  for (const [field, value] of Object.entries(entra) as [keyof SupportPerson, string][]) {
    if (value.trim()) merged[field] = value.trim();
  }
  return merged;
};

/** The account writing the reply. */
export const accountPerson = async (user: UserRow): Promise<SupportPerson> => {
  const base: SupportPerson = {
    ...emptySupportPerson(),
    first_name: user.first_name,
    last_name: user.last_name,
    full_name: user.name,
    email: user.email,
  };
  if (!user.entra_id || !entraConfigured()) return base;
  return completeText(base, await record(`oid:${user.entra_id}`, () => entraRecord(user.entra_id)));
};

/** The request's sender; "null" when it has none. */
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
