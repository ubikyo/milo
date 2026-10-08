// The label templates of a board's asset widgets — supervised devices,
// declared devices, applications —: each names a paper format, and holds the
// ZPL its printer takes. Like the asset lists, they are the board's, not a
// widget's: every widget of the kind on the board shares them.

import type { Id } from "./domain.js";
import type { MailTemplateVariable } from "./mail-templates.js";

/** The asset kinds that print labels. */
export const LABEL_TEMPLATE_KINDS = [
  "managed_device_asset",
  "unmanaged_device_asset",
  "application_asset",
] as const;

export type LabelTemplateKind = (typeof LABEL_TEMPLATE_KINDS)[number];

export const isLabelTemplateKind = (value: unknown): value is LabelTemplateKind =>
  (LABEL_TEMPLATE_KINDS as readonly unknown[]).includes(value);

/** Beyond this, a name is no longer one. */
export const LABEL_TEMPLATE_NAME_MAX = 120;

export interface LabelTemplate {
  name: string;
  /** The paper format it prints on — and so its printer —; null once deleted. */
  paper_format_id: Id | null;
  zpl: string;
}

/** A board's templates of a kind, and the variables their ZPL may hold. */
export interface LabelTemplates {
  templates: LabelTemplate[];
  variables: MailTemplateVariable[];
}

/** The asset's number, in a template. */
export const ASSET_NUMBER_VARIABLE = "{{asset.number}}";

/** A label group's name, in a template: "{{label.Site}}". */
export const labelGroupVariable = (group: string): string => `{{label.${group}}}`;

/**
 * What a new template starts from — the "Etiquette Asset" of the supervised
 * devices (#6WF6), 320 × 162 dots: the asset's number in a QR code,
 * then the company, the number in large, and "NE PAS ENLEVER".
 */
export const DEFAULT_LABEL_ZPL = `^XA
^PON
^MD25
^PW320
^LL162
^LH0,0
^BY2,2,0
^FO25,37
^BQN,2,5,Q,7
^FDQA,${ASSET_NUMBER_VARIABLE}^FS
^CF0,19
^FO155,45
^FB160,2,0,L,0^FDSociété^FS
^FO154,72
^A@N,39,39,E:56112513.TTF
^FB175,1,0,L,0^FD${ASSET_NUMBER_VARIABLE}^FS
^CF0,19
^FO155,115
^FB160,2,0,L,0^FDNE PAS ENLEVER^FS
^XZ`;

/** True when a template's ZPL is no longer the one a new template starts from. */
export const isCustomLabelZpl = (zpl: string): boolean => zpl.trim() !== DEFAULT_LABEL_ZPL.trim();

/** What the printer drew of a template: a PNG, as a data URL. */
export interface LabelPreview {
  image: string;
}

/** A test label sent: the printer it went to. */
export interface LabelTestPrint {
  printer: string;
}
