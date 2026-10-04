import { Stack } from "@mantine/core";
import { IconTags } from "@tabler/icons-react";
import { LabelBars, NAME, Nothing, TitreIndicateur, tasksOf } from "./common";
import type { Bar } from "./common";
import type { TaskIndicatorWidget } from "./types";
import type { Id } from "@milo/shared";

// Les étiquettes les plus portées par les cartes du tableau ouvert, chacune
// dans sa couleur.

const LABEL = "Étiquettes";

export const taskLabelsIndicator: TaskIndicatorWidget = {
  type: "labels",
  kind: "task",
  label: LABEL,
  icon: IconTags,
  defaultConfig: { [NAME]: "" },

  Display: ({ config, lists }) => {
    const byLabel = new Map<Id, Bar>();
    for (const card of tasksOf(lists)) {
      for (const label of card.labels) {
        const already = byLabel.get(label.id);
        if (already) already.value += 1;
        else
          byLabel.set(label.id, {
            name: label.name,
            value: 1,
            color: label.color,
          });
      }
    }
    const data = [...byLabel.values()].sort(
      (a, b) => b.value - a.value || a.name.localeCompare(b.name),
    );

    return (
      <Stack gap="xs" style={{ flex: 1 }}>
        <TitreIndicateur config={config} defaultValue={LABEL} />
        {data.length === 0 ? <Nothing>Aucune étiquette</Nothing> : <LabelBars data={data} ownColors />}
      </Stack>
    );
  },
};
