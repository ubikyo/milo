import { IconFolderOpen } from "@tabler/icons-react";
import { createWidgetTitle } from "./title";

/** Le gris que d'autres éléments reprennent pour leurs libellés. */
export const SUBCATEGORY_COLOR = "rgb(220, 220, 220)";

/** L'air qu'elle laisse au-dessus et au-dessous d'elle, que d'autres éléments reprennent. */
export const SUBCATEGORY_GAP = 15;

// Une sous-catégorie : le même rôle qu'une catégorie, un cran plus bas. Elle
// se lit donc plus petite et plus légère, et laisse un peu moins d'air sous
// elle. Sous sa catégorie, elle s'en écarte un peu ; précédée de tout autre
// élément, elle laisse nettement plus d'air au-dessus : elle ouvre un groupe,
// et s'écarte de celui d'avant.
export const subcategoryWidget = createWidgetTitle({
  type: "subcategory",
  label: "Sous-catégorie",
  icon: IconFolderOpen,
  order: 2,
  placeholder: "Sans titre",
  size: 16,
  weight: 400,
  color: "#ffffff",
  lowMargin: SUBCATEGORY_GAP,
  highMargin: (previousType) => (previousType === "category" ? 20 : 30),
});
