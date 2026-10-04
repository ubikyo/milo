import { Checkbox, Stack } from "@mantine/core";
import { IconUsers } from "@tabler/icons-react";
import { ActorRings } from "../indicators/actors";
import { withField } from "../widgets/types";
import { NameField, NAME, IndicatorTitle, isFinished } from "./common";
import type { ProjectIndicatorWidget } from "./types";

// La part de chaque acteur dans les projets du tableau ouvert, en barres
// radiales, comme au Support. Les projets terminés n'y comptent que si on le
// demande.

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
