import { IconFolder } from "@tabler/icons-react";
import { createWidgetTitle } from "./title";

// A category: the title that opens a group in the column. White, and the
// larger of the two levels. Preceded by an element, it stands well apart from
// it: a new group begins.
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
