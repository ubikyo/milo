import { Checkbox, Stack } from "@mantine/core";
import { IconCategory } from "@tabler/icons-react";
import { withField } from "../widgets/types";
import { LabelBars, NameField, NAME, Nothing, IndicatorTitle, isFinished } from "./common";
import type { Bar } from "./common";
import type { ProjectIndicatorWidget } from "./types";

// Les catégories du tableau ouvert, par nombre de projets : où se porte le
// travail. Les projets terminés n'y comptent que si on le demande.

const LABEL = "Catégories";
const ALL = "include_all";

const allProjects = (config: unknown) =>
  Boolean((config as Record<string, unknown> | null)?.[ALL]);

export const categoriesIndicator: ProjectIndicatorWidget = {
  type: "categories",
  kind: "project",
  label: LABEL,
  icon: IconCategory,
  defaultConfig: { [NAME]: "", [ALL]: false },

  Display: ({ config, projects }) => {
    const accounts = allProjects(config) ? projects : projects.filter((p) => !isFinished(p));
    const byCategory = new Map<string, Bar>();
    for (const project of accounts) {
      const already = byCategory.get(project.category_name);
      if (already) already.value += 1;
      else byCategory.set(project.category_name, { name: project.category_name, value: 1, color: "teal.6" });
    }
    const data = [...byCategory.values()].sort(
      (a, b) => b.value - a.value || a.name.localeCompare(b.name),
    );

    return (
      <Stack gap="xs" style={{ flex: 1 }}>
        <IndicatorTitle config={config} defaultValue={LABEL} />
        {data.length === 0 ? <Nothing>Aucun projet</Nothing> : <LabelBars data={data} />}
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
