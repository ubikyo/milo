import { Checkbox, Stack } from "@mantine/core";
import { IconUsers } from "@tabler/icons-react";
import { ActorRings } from "../support/actors";
import { withField } from "../types";
import { NameField, NAME, IndicatorTitle, isFinished } from "./common";
import type { ProjectIndicatorWidget } from "./types";

// Each actor's share in the open board's projects, as radial
// bars, like in Support. Finished projects only count if
// asked.

const LABEL = "Acteurs";
const ALL = "include_all";

const allProjects = (config: unknown) =>
  Boolean((config as Record<string, unknown> | null)?.[ALL]);

export const projectActorsIndicator: ProjectIndicatorWidget = {
  type: "actors",
  kind: "project",
  label: LABEL,
  icon: IconUsers,
  defaultConfig: { [NAME]: "", [ALL]: false },

  Display: ({ config, projects }) => {
    const accounts = allProjects(config) ? projects : projects.filter((p) => !isFinished(p));
    return (
      <Stack gap={4} style={{ flex: 1 }}>
        <IndicatorTitle config={config} defaultValue={LABEL} />
        <ActorRings actors={accounts.map((p) => p.actors)} unit="projets" />
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
