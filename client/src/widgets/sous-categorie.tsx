import { IconFolderOpen } from "@tabler/icons-react";
import { creerTitreWidget } from "./titre";

/** Le gris que d'autres éléments reprennent pour leurs libellés. */
export const COULEUR_SOUS_CATEGORIE = "rgb(220, 220, 220)";

/** L'air qu'elle laisse au-dessus et au-dessous d'elle, que d'autres éléments reprennent. */
export const ECART_SOUS_CATEGORIE = 15;

// Une sous-catégorie : le même rôle qu'une catégorie, un cran plus bas. Elle
// se lit donc plus petite et plus légère, et laisse un peu moins d'air sous
// elle. Sous sa catégorie, elle s'en écarte un peu ; précédée de tout autre
// élément, elle laisse nettement plus d'air au-dessus : elle ouvre un groupe,
// et s'écarte de celui d'avant.
export const sousCategorieWidget = creerTitreWidget({
  type: "subcategory",
  label: "Sous-catégorie",
  icon: IconFolderOpen,
  order: 2,
  placeholder: "Sans titre",
  taille: 16,
  graisse: 400,
  couleur: "var(--mantine-color-white)",
  margeBasse: ECART_SOUS_CATEGORIE,
  margeHaute: (previousType) => (previousType === "category" ? 20 : 30),
});
