import {
  Box,
  getContrastColor,
  useComputedColorScheme,
  useMantineTheme,
} from "@mantine/core";
import { useCallback } from "react";
import type { Label, ProjectLabel } from "@milo/shared";
import { labelHex } from "../../themes/colors";

/** Labels of both modes are drawn the same way: only the name and the color matter here. */
type ChipLabel = Pick<Label | ProjectLabel, "name" | "color">;

/** A label's background and the color of the text on it. */
export interface LabelColors {
  backgroundColor: string;
  color: string;
}

// Colors offered for a label: eight hues arranged around the color wheel, from
// neutral to purple, in eight shades from lightest to darkest. The matrix reads
// as columns of hues and rows of shades. A color is written "hue.shade", as
// everywhere in Mantine; the server checks the same thing (server/src).
export const LABEL_HUES = [
  "gray",
  "red",
  "orange",
  "yellow",
  "green",
  "teal",
  "blue",
  "grape",
];

export const LABEL_SHADES = [2, 3, 4, 5, 6, 7, 8, 9];

// The flattened matrix, row by row: one shade, its eight hues.
export const LABEL_COLORS = LABEL_SHADES.flatMap((shade) =>
  LABEL_HUES.map((hue) => `${hue}.${shade}`),
);

// A label's default color: the blue of the middle shade.
export const DEFAULT_LABEL_COLOR = "blue.6";

// A label's background and the text on it. As for the board's lists, the text
// color is not chosen by hand: Mantine's "getContrastColor" decides between
// black and white based on the background's luminance, at the threshold set for
// the application (main.tsx).
export function useLabelColors() {
  const theme = useMantineTheme();
  const colorScheme = useComputedColorScheme("light");

  return useCallback(
    (color: string | null | undefined): LabelColors => {
      const background = labelHex(color);
      return {
        backgroundColor: background,
        color: getContrastColor({ color: background, theme, autoContrast: true, colorScheme }),
      };
    },
    [theme, colorScheme],
  );
}

// A label: a rectangle of its color, its name in the middle. Used everywhere it
// is shown — in its picker, in a card's detail, in the list that manages them.
// "height" imposes a fixed height, so that it lines up with the member bubbles.
interface LabelChipProps {
  label: ChipLabel;
  size?: "xs" | "sm";
  height?: number;
  fullWidth?: boolean;
}

export default function LabelChip({
  label,
  size = "sm",
  height,
  fullWidth = false,
}: LabelChipProps) {
  const colors = useLabelColors();
  const small = size === "xs";

  return (
    <Box
      style={{
        ...colors(label.color),
        display: fullWidth ? "flex" : "inline-flex",
        alignItems: "center",
        justifyContent: fullWidth ? "flex-start" : "center",
        borderRadius: 4,
        height,
        width: fullWidth ? "100%" : undefined,
        padding: small ? "1px 6px" : "3px 10px",
        fontSize: small ? 11 : 12,
        fontWeight: 600,
        lineHeight: 1.4,
        maxWidth: "100%",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
    >
      {label.name}
    </Box>
  );
}

// The label as it sits on a board card. It has two states: expanded, it shows
// its name; collapsed, only a bar of its color remains. The transition between
// the two is animated — hence numeric measurements rather than an "auto", which
// cannot be animated.
const CARD_LABEL_HEIGHT = 20;
const CARD_LABEL_MAX_WIDTH = 200;
const CARD_LABEL_COMPACT_WIDTH = 40;
const CARD_LABEL_COMPACT_HEIGHT = 8;
const CARD_LABEL_TRANSITION = "160ms ease";

interface CardLabelProps {
  label: ChipLabel;
  compact?: boolean;
  onClick?: () => void;
}

export function CardLabel({ label, compact, onClick }: CardLabelProps) {
  const colors = useLabelColors();

  return (
    <Box
      component="button"
      type="button"
      // The board moves its cards with the pointer: this attribute keeps the
      // label out of the drag, its own as well as that of its list.
      data-no-list-drag="true"
      data-no-card-drag="true"
      onClick={onClick}
      aria-label={label.name}
      style={{
        ...colors(label.color),
        border: "none",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: compact ? "center" : "flex-start",
        height: compact ? CARD_LABEL_COMPACT_HEIGHT : CARD_LABEL_HEIGHT,
        width: compact ? CARD_LABEL_COMPACT_WIDTH : undefined,
        maxWidth: compact ? CARD_LABEL_COMPACT_WIDTH : CARD_LABEL_MAX_WIDTH,
        borderRadius: compact ? 2 : 4,
        padding: compact ? 0 : "0 8px",
        fontSize: compact ? 0 : 11,
        fontWeight: 600,
        lineHeight: 1,
        overflow: "hidden",
        whiteSpace: "nowrap",
        textOverflow: "ellipsis",
        transition: [
          `height ${CARD_LABEL_TRANSITION}`,
          `max-width ${CARD_LABEL_TRANSITION}`,
          `border-radius ${CARD_LABEL_TRANSITION}`,
          `padding ${CARD_LABEL_TRANSITION}`,
          `font-size ${CARD_LABEL_TRANSITION}`,
        ].join(", "),
      }}
    >
      {label.name}
    </Box>
  );
}
