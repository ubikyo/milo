// The words of a set of labels in their editor (LabelGroupsEditor): labels in
// groups by default; a product's variants reuse it, as values in attributes.

export interface LabelWords {
  /** "Ajouter une étiquette". */
  addLabel: string;
  /** "Ajouter un groupe". */
  addGroup: string;
  /** "l'étiquette": a label without a name, and in the titles. */
  theLabel: string;
  /** "le groupe ", followed by its name — or "l'attribut " —. */
  theGroup: string;
  /** "Nom du groupe". */
  groupName: string;
  /** "Aucun groupe". */
  noGroup: string;
  /** "Aucune étiquette dans ce groupe". */
  noLabelInGroup: string;
  /** A save refused for a missing name. */
  missingName: string;
}

export const LABEL_WORDS: LabelWords = {
  addLabel: "Ajouter une étiquette",
  addGroup: "Ajouter un groupe",
  theLabel: "l'étiquette",
  theGroup: "le groupe ",
  groupName: "Nom du groupe",
  noGroup: "Aucun groupe",
  noLabelInGroup: "Aucune étiquette dans ce groupe",
  missingName: "Étiquettes : chaque groupe et chaque étiquette demandent un nom.",
};

/** A product's variants: values, gathered in their attributes. */
export const VARIANT_WORDS: LabelWords = {
  addLabel: "Ajouter une valeur",
  addGroup: "Ajouter un attribut",
  theLabel: "la valeur",
  theGroup: "l'attribut ",
  groupName: "Nom de l'attribut",
  noGroup: "Aucun attribut",
  noLabelInGroup: "Aucune valeur dans cet attribut",
  missingName: "Variantes : chaque attribut et chaque valeur demandent un nom.",
};
