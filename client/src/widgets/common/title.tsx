import { IconHeading } from "@tabler/icons-react";
import { H1_STYLE } from "@milo/shared";
import { createWidgetTitle } from "./titles";
// Declares the "H2" look, which its style reads.
import "./h2";
import { themeColor } from "../../lib/themeColors";

// A title: the one that opens a group in the column. White, and the larger of
// the two levels. Preceded by an element, it stands well apart from it: a new
// group begins. A new one takes the "H1" style. The database still stores it
// as "category", its former name.
export const titleWidget = createWidgetTitle({
  type: "category",
  label: "Titre",
  icon: IconHeading,
  order: 1,
  placeholder: "Sans titre",
  size: 18,
  get color() {
    return themeColor("widget-title");
  },
  style: H1_STYLE,
  lowMargin: 10,
  highMargin: 50,
});
