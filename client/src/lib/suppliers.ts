import { useEffect, useMemo, useState } from "react";
import type { Contact, ContactCurrency, ContactSettings, SourceWidget } from "@milo/shared";
import { api } from "../api";
import { errorMessage, notifyError } from "./errors";
import { useSourceItems } from "./sources";

// The suppliers: the companies of Contact widgets, on any board one sees
// (lib/sources.tsx), each with its currency — a name of its widget's lists,
// read here as its code and symbol. A product names its suppliers
// (ProductDrawer), an order picks one (OrderDrawer).

export interface Supplier {
  contact: Contact;
  /** Its currency, as its widget's lists describe it; null when it has none. */
  currency: ContactCurrency | null;
}

/** A widget's lists, read once for the page. */
const settings = new Map<string, Promise<ContactSettings>>();

const settingsOf = (board: number, list: string): Promise<ContactSettings> => {
  const key = `${board}\n${list}`;
  if (!settings.has(key)) {
    const read = api.getContactSettings({ board, list });
    read.catch(() => settings.delete(key));
    settings.set(key, read);
  }
  return settings.get(key)!;
};

/**
 * The companies of these Contact widgets, by name — "suppliers" —, and all
 * their contacts, people too — "contacts": a company created from an order
 * picks its people among them. Null while they are read.
 */
export function useSuppliers(sources: SourceWidget[]): {
  suppliers: Supplier[] | null;
  contacts: Contact[] | null;
} {
  const contacts = useSourceItems("contact", sources);
  const companies = useMemo(
    () =>
      contacts
        ?.filter((c) => c.type === "company")
        .sort((a, b) => a.name.localeCompare(b.name, "fr", { numeric: true })) ?? null,
    [contacts],
  );
  // Each widget's currencies, by "board\nlist".
  const [currencies, setCurrencies] = useState<Map<string, ContactCurrency[]>>(new Map());
  const widgets = [...new Set((companies ?? []).map((c) => `${c.board_id}\n${c.list_key}`))]
    .sort()
    .join("|");

  useEffect(() => {
    let alive = true;
    const keys = widgets ? widgets.split("|") : [];
    Promise.all(
      keys.map(async (key) => {
        const [board, list] = key.split("\n");
        return [key, (await settingsOf(Number(board), list ?? "")).currencies] as const;
      }),
    )
      .then((read) => alive && setCurrencies(new Map(read)))
      .catch((e) => notifyError(errorMessage(e)));
    return () => {
      alive = false;
    };
  }, [widgets]);

  const suppliers = useMemo(
    () =>
      companies?.map((contact) => ({
        contact,
        currency:
          currencies
            .get(`${contact.board_id}\n${contact.list_key}`)
            ?.find((c) => c.name === contact.currency) ?? null,
      })) ?? null,
    [companies, currencies],
  );
  return { suppliers, contacts };
}

/** The unit an amount reads with: the currency's symbol, or its code. */
export const currencyUnit = (currency: ContactCurrency | null | undefined): string =>
  currency?.symbol || currency?.code || "";
