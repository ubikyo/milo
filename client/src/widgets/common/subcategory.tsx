import { IconFolderOpen } from "@tabler/icons-react";
import { createWidgetTitle } from "./title";

/** The gray that other elements reuse for their labels. */
export const SUBCATEGORY_COLOR = "rgb(220, 220, 220)";

/** The space it leaves above and below itself, which other elements reuse. */
export const SUBCATEGORY_GAP = 15;

// A subcategory: the same role as a category, one step lower. It therefore
// reads smaller and lighter, and leaves a little less space below it. Under its
// category, it stands slightly apart; preceded by any other element, it leaves
// clearly more space above: it opens a group, and sets itself apart from the
// previous one.
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
