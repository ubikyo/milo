import { IconFolder } from "@tabler/icons-react";
import { createWidgetTitle } from "./title";

// Une catégorie : le titre qui ouvre un groupe dans la colonne. Blanc, et le
// plus gros des deux niveaux. Précédée d'un élément, elle s'en écarte
// nettement : c'est un nouveau groupe qui commence.
export const categoryWidget = createWidgetTitle({
  type: "category",
  label: "Catégorie",
  icon: IconFolder,
  order: 1,
  placeholder: "Sans titre",
  size: 18,
  color: "#ffffff",
  lowMargin: 10,
  highMargin: 50,
});
