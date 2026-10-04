import { Stack } from "@mantine/core";
import { IconColumns } from "@tabler/icons-react";
import { LabelBars, NAME, Nothing, IndicatorTitle } from "./common";
import type { TaskIndicatorWidget } from "./types";
import { useListColors } from "../../components/board/TaskBoard";

// The open board's lists, by number of cards, in the board's order:
// where tasks pile up. Each bar takes its list's background from the
// board, resolved for the current theme, and covers at least its name: an
// empty list is still recognized by its color.

const LABEL = "Cartes par liste";

export const listsIndicator: TaskIndicatorWidget = {
  type: "lists",
  kind: "task",
  label: LABEL,
  icon: IconColumns,
  defaultConfig: { [NAME]: "" },

  Display: ({ config, lists }) => {
    const colors = useListColors();
    const data = lists.map((list) => ({
      name: list.name,
      value: list.cards.filter((c) => c.kind === "card").length,
      color: colors(list.color).background,
    }));
    return (
      <Stack gap="xs" style={{ flex: 1 }}>
        <IndicatorTitle config={config} defaultValue={LABEL} />
        {data.length === 0 ? <Nothing>Aucune liste</Nothing> : <LabelBars data={data} insideLabel ownColors />}
      </Stack>
    );
  },
};
