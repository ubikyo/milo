import { Stack } from "@mantine/core";
import { IconTags } from "@tabler/icons-react";
import { LabelGroupSelect, groupOf, labelBars } from "../label-groups";
import { LabelBars, NameField, NAME, Nothing, IndicatorTitle, tasksOf } from "./common";
import type { TaskIndicatorWidget } from "./types";

// The labels most carried by the open board's cards, each
// in its color: all of them, or those of one group.

const LABEL = "Étiquettes";

export const taskLabelsIndicator: TaskIndicatorWidget = {
  type: "labels",
  kind: "task",
  label: LABEL,
  icon: IconTags,
  defaultConfig: { [NAME]: "" },

  Display: ({ config, lists }) => {
    const data = labelBars(
      tasksOf(lists).map((c) => c.labels),
      groupOf(config),
    );

    return (
      <Stack gap="xs" style={{ flex: 1 }}>
        <IndicatorTitle config={config} defaultValue={LABEL} />
        {data.length === 0 ? <Nothing>Aucune étiquette</Nothing> : <LabelBars data={data} ownColors />}
      </Stack>
    );
  },

  Config: ({ config, onChange }) => (
    <Stack gap="xl">
      <NameField config={config} onChange={onChange} defaultValue={LABEL} />
      <LabelGroupSelect base="/labels" config={config} onChange={onChange} />
    </Stack>
  ),
};
