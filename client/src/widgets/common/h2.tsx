import { defineTitleLook } from "./titles";
import { themeColor } from "../../lib/themeColors";

/** The space an "H2" title leaves above and below itself, which other elements reuse. */
export const H2_GAP = 15;

// The usual look of the "H2" style — once the subcategory widget's, which has
// become a title in "H2": one step lower than a title, it reads smaller and
// lighter, and leaves a little less space below it. Under a title, it stands
// slightly apart; preceded by any other element, it leaves clearly more space
// above: it opens a group, and sets itself apart from the previous one.
defineTitleLook("subcategory", {
  order: 2,
  size: 16,
  weight: 400,
  get color() {
    return themeColor("widget-h2");
  },
  lowMargin: H2_GAP,
  highMargin: (previousType) => (previousType === "category" ? 20 : 30),
});
