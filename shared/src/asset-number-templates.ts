// The asset number templates of a board's declared asset widgets, kind by
// kind: a name each, and TypeScript that draws a new asset's number. Like the
// label templates, they are the board's, not a widget's: every widget of the
// kind on the board shares them. The browser runs a template (client,
// lib/assetNumber.ts), its variables replaced beforehand by their value, as a
// string: "{{label.Société}}" takes the asset's label in the group "Société".

import type { MailTemplateVariable } from "./mail-templates.js";

/** Beyond this, a name is no longer one. */
export const ASSET_NUMBER_TEMPLATE_NAME_MAX = 120;

/** Beyond this, a template is no longer one. */
export const ASSET_NUMBER_CODE_MAX = 20_000;

/** The function the template declares, which gives the number. */
export const ASSET_NUMBER_FUNCTION = "assetNumber";

/** A variable of the template, and the values a test draws from. */
export interface AssetNumberVariable extends MailTemplateVariable {
  samples: string[];
}

export interface AssetNumberTemplate {
  name: string;
  code: string;
}

/** A board's templates of a kind, and the variables their code may hold. */
export interface AssetNumberTemplates {
  templates: AssetNumberTemplate[];
  variables: AssetNumberVariable[];
}

/** What a new template starts from: 6 alphanumeric characters drawn at random. */
export const DEFAULT_ASSET_NUMBER_CODE = `// Le numéro d'asset : 6 caractères alphanumériques aléatoires.
//
// Les variables de gauche — {{label.Groupe}} — sont remplacées, avant
// l'exécution, par l'étiquette de l'asset dans ce groupe, entre guillemets :
// une chaîne de caractères, vide si l'asset n'en a pas.

const CHARACTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function randomCharacters(length: number): string {
  let text = "";
  for (let i = 0; i < length; i++) {
    text += CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)];
  }
  return text;
}

function ${ASSET_NUMBER_FUNCTION}(): string {
  return randomCharacters(6);
}
`;

/** The template a new widget of declared equipment brings. */
export const DEFAULT_ASSET_NUMBER_TEMPLATE_NAME = "Aléatoire";

/** True when a template's code is no longer the one a new template starts from. */
export const isCustomAssetNumberCode = (code: string): boolean =>
  code.trim() !== DEFAULT_ASSET_NUMBER_CODE.trim();
