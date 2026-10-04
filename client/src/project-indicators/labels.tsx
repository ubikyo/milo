import { Checkbox, Stack } from "@mantine/core";
import { IconTags } from "@tabler/icons-react";
import { withField } from "../widgets/types";
import { LabelBars, NameField, NAME, Nothing, IndicatorTitle, isFinished } from "./common";
import type { Bar } from "./common";
import type { ProjectIndicatorWidget } from "./types";
import type { Id } from "@milo/shared";

// The labels most carried by the open board's projects, each
// in its color. Finished projects only count if asked.

const LABEL = "Étiquettes";
const ALL = "include_all";

const allProjects = (config: unknown) =>
  Boolean((config as Record<string, unknown> | null)?.[ALL]);

export const projectLabelsIndicator: ProjectIndicatorWidget = {
  type: "labels",
  kind: "project",
  label: LABEL,
  icon: IconTags,
  defaultConfig: { [NAME]: "", [ALL]: false },

  Display: ({ config, projects }) => {
    const accounts = allProjects(config) ? projects : projects.filter((p) => !isFinished(p));
    const byLabel = new Map<Id, Bar>();
    for (const project of accounts) {
      for (const label of project.labels) {
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
        <IndicatorTitle config={config} defaultValue={LABEL} />
        {data.length === 0 ? <Nothing>Aucune étiquette</Nothing> : <LabelBars data={data} ownColors />}
      </Stack>
    );
  },

  Config: ({ config, onChange }) => (
    <Stack gap="xl">
      <NameField config={config} onChange={onChange} defaultValue={LABEL} />
      <Checkbox
        label="Compter aussi les projets terminés"
        checked={allProjects(config)}
        onChange={(e) => onChange(withField(config, ALL, e.currentTarget.checked))}
        color="teal"
      />
    </Stack>
  ),
};
