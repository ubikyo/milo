// The printers of the "Impression" section of the Settings ("Paramétrage"),
// and the paper formats they print on: set once for the whole application,
// then used to print labels.

import type { Id } from "./domain.js";

/** The kinds of printers Milo can talk to. Zebra only, for now. */
export const PRINTER_TYPES = ["zebra"] as const;

export type PrinterType = (typeof PRINTER_TYPES)[number];

export const PRINTER_TYPE_LABELS: Record<PrinterType, string> = {
  zebra: "Zebra",
};

export interface Printer {
  id: Id;
  type: PrinterType;
  name: string;
  /**
   * Its IP address — or a host name. Required, from its creation. It is
   * reached on its raw port, 9100 (lib/zebra.ts).
   */
  host: string;
}

export type PrinterInput = Partial<Omit<Printer, "id">>;

/**
 * The print head's resolutions, in dots per inch: a Zebra's 6, 8, 12 and 24
 * dots per millimeter.
 */
export const PRINTER_DPIS = [152, 203, 300, 600] as const;

export type PrinterDpi = (typeof PRINTER_DPIS)[number];

/** What a printer that answers says of itself. */
export interface PrinterInfo {
  /** "ZD421-203dpi"; empty if it would not say. */
  model: string;
  /** Its head's resolution, if it said. */
  dpi: PrinterDpi | null;
}

/** Each printer, by id: what it says of itself, or null when it does not answer. */
export type PrinterInfos = Record<Id, PrinterInfo | null>;

/**
 * A label's size, on a given printer. Its resolution is the printer's own
 * head: the printer gives it (PrinterInfo).
 */
export interface PaperFormat {
  id: Id;
  name: string;
  printer_id: Id | null;
  /** In millimeters, to the hundredth: 40.08. Required, from its creation. */
  width: number;
  height: number;
}

export type PaperFormatInput = Partial<Omit<PaperFormat, "id">>;
