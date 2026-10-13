import { Box, Group, Stack, Text, useMantineTheme } from "@mantine/core";

// The bars the "Indicateurs" breakdowns draw (widgets/indicators): a label's,
// a category's, a list's…

/** The height of a bar. */
const BAR_HEIGHT = 24;

export interface Bar {
  name: string;
  value: number;
  /**
   * Read only with "ownColors"; otherwise the bar takes its color
   * from its value (colorOfValue).
   */
  color: string;
}

/** From lowest to best: red, orange, yellow, lime, green. */
const GRADIENT = ["red.6", "orange.6", "yellow.6", "lime.6", "green.6"];

/**
 * A bar's color according to its place between the lowest and the highest
 * of the chart: the highest in green, the lowest in red, the others
 * in between. All equal — or only one —, they are green.
 */
const colorOfValue = (value: number, min: number, max: number): string => {
  const t = max > min ? (value - min) / (max - min) : 1;
  return GRADIENT[Math.round(t * (GRADIENT.length - 1))] as string;
};

/** A bar's label, placed at its left edge and never wrapped. */
function LabelText({ children, color }: { children: string; color: string }) {
  return (
    <Text
      size="sm"
      fw={500}
      c={color}
      px="sm"
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </Text>
  );
}

// The labels' bars, like Mantine's BarsList, colored from
// red — the lowest — to green — the highest —, but whose
// label overflows the bar rather than wrapping when it is
// too short for it. It is placed twice at the same spot: below, in
// the text color; in the bar, in the color that reads on it —
// the bar clips it to its length. What sticks out is thus read on the background, what
// is inside on the label's color.
//
// Project and Task modes use it too, for their labels, categories
// and lists. With "insideLabel", a bar is at least as wide as its
// label: an empty list thus keeps its color instead of
// disappearing.
export function LabelBars({
  data,
  insideLabel = false,
  ownColors = false,
}: {
  data: Bar[];
  insideLabel?: boolean;
  /** Each bar keeps its color — a list's — instead of the gradient. */
  ownColors?: boolean;
}) {
  const theme = useMantineTheme();
  const max = Math.max(...data.map((d) => d.value), 0);
  const min = Math.min(...data.map((d) => d.value));
  return (
    <Stack gap="xs">
      {data.map((bar) => {
        // Full like the label itself (LabelChip): the text turns
        // black on a light color, white otherwise.
        const colors = theme.variantColorResolver({
          color: ownColors ? bar.color : colorOfValue(bar.value, min, max),
          theme,
          variant: "filled",
          autoContrast: true,
        });
        const part = max > 0 ? (bar.value / max) * 100 : 0;
        if (insideLabel)
          return (
            <Group key={bar.name} gap="md" wrap="nowrap">
              <Box style={{ flex: 1, minWidth: 0 }}>
                <Text
                  size="sm"
                  fw={500}
                  c={colors.color}
                  px="sm"
                  truncate
                  style={{
                    width: "fit-content",
                    minWidth: `${part}%`,
                    maxWidth: "100%",
                    height: BAR_HEIGHT,
                    lineHeight: `${BAR_HEIGHT}px`,
                    borderRadius: "var(--mantine-radius-sm)",
                    backgroundColor: colors.background,
                  }}
                >
                  {bar.name}
                </Text>
              </Box>
              <Text size="sm" fw={500} style={{ whiteSpace: "nowrap" }}>
                {bar.value}
              </Text>
            </Group>
          );
        return (
          <Group key={bar.name} gap="md" wrap="nowrap">
            <Box
              style={{
                position: "relative",
                flex: 1,
                minWidth: 0,
                height: BAR_HEIGHT,
                overflow: "hidden",
              }}
            >
              <LabelText color="var(--mantine-color-text)">{bar.name}</LabelText>
              <Box
                style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  left: 0,
                  width: `${part}%`,
                  overflow: "hidden",
                  borderRadius: "var(--mantine-radius-sm)",
                  backgroundColor: colors.background,
                }}
              >
                {/* The bar's label runs across the whole row: it
                    falls exactly on the one below. */}
                <Box
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: part > 0 ? `${(100 / part) * 100}%` : 0,
                  }}
                >
                  <LabelText color={colors.color}>{bar.name}</LabelText>
                </Box>
              </Box>
            </Box>
            <Text size="sm" fw={500} style={{ whiteSpace: "nowrap" }}>
              {bar.value}
            </Text>
          </Group>
        );
      })}
    </Stack>
  );
}
