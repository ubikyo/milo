import { Stack, Switch } from "@mantine/core";
import { IconTags } from "@tabler/icons-react";
import { withField } from "../types";
import { LabelGroupSelect, groupOf, labelBars } from "../label-groups";
import { LabelBars, NameField, NAME, Nothing, IndicatorTitle, isFinished } from "./common";
import type { ProjectIndicatorWidget } from "./types";

// The labels most carried by the open board's projects, each
// in its color: all of them, or those of one group. Finished projects only
// count if asked.

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
    const data = labelBars(
      accounts.map((p) => p.labels),
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
      <LabelGroupSelect base="/project-labels" config={config} onChange={onChange} />
      <Switch
        label="Compter aussi les projets terminés"
        checked={allProjects(config)}
        onChange={(e) => onChange(withField(config, ALL, e.currentTarget.checked))}
        color="teal"
      />
    </Stack>
  ),
};
