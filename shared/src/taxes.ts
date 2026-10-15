// The taxes: entered in a board's "Taxes" widgets (group "Logistique"), each
// its own (LIST_KEY) — a name and a rate in percent each, in their order. The
// Produits widgets, the declared equipment and the applications offer those of
// the Taxes widgets they name in their drawer (TAX_SOURCES), of any board one
// sees: a price takes one of their rates.

/** The widget that owns its taxes (LIST_KEY). */
export const TAX_LIST_TYPE = "tax.list";

/** The route: "/api/taxes", "?board=&list=". */
export const TAX_ROUTES = {
  taxes: "/taxes",
} as const;

/** The configuration key of a widget that offers taxes: the Taxes widgets it reads. */
export const TAX_SOURCES = "tax_sources";

/** A tax: its name — "TVA normale" —, empty when not given, and its rate, in percent. */
export interface Tax {
  name: string;
  rate: number;
}

/** A widget's taxes until it records its own: the French VAT rates. */
export const TAX_DEFAULTS: Tax[] = [
  { name: "TVA taux normal", rate: 20 },
  { name: "TVA taux intermédiaire", rate: 10 },
  { name: "TVA taux réduit", rate: 5.5 },
  { name: "Exonéré", rate: 0 },
];

/** How many taxes a widget has at most, the longest name and the largest rate. */
export const TAXES_MAX = 50;
export const TAX_NAME_MAX = 100;
export const TAX_RATE_MAX = 100;

/** A rate as it reads: "20 %", "5,5 %". */
export const taxLabel = (rate: number): string => `${rate.toLocaleString("fr-FR")} %`;
