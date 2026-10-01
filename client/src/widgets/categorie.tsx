import { IconFolder } from "@tabler/icons-react";
import { creerTitreWidget } from "./titre";

// Une catégorie : le titre qui ouvre un groupe dans la colonne. Blanc, et le
// plus gros des deux niveaux. Précédée d'un élément, elle s'en écarte
// nettement : c'est un nouveau groupe qui commence.
export const categorieWidget = creerTitreWidget({
  type: "category",
  label: "Catégorie",
  icon: IconFolder,
  order: 1,
  placeholder: "Sans titre",
  taille: 18,
  couleur: "var(--mantine-color-white)",
  margeBasse: 10,
  margeHaute: 50,
});
