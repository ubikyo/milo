import { Select, Stack } from "@mantine/core";
import { IconFolders } from "@tabler/icons-react";
import dayjs from "dayjs";
import { withField, text } from "../types";
import { NameField, NAME, IndicatorTitle, IndicatorValue, isFinished } from "./common";
import type { ProjectIndicatorWidget } from "./types";
import type { Id, Project } from "@milo/shared";

// A number of projects: those of the open board that match the chosen type
// — all, those in progress, those that nobody carries, those that are
// no longer touched.

const TYPE = "type";

/** Beyond this, a project in progress that is no longer edited is at a standstill; below, a project is recent. */
const DAYS = 30;

const since = (date: string): number => dayjs().diff(dayjs(date), "day", true);

interface ProjectType {
  value: string;
  label: string;
  account: (p: Project, me: Id) => boolean;
}

const DEFAULT_TYPE: ProjectType = {
  value: "in_progress",
  label: "Projets en cours",
  account: (p) => !isFinished(p),
};

const TYPES: ProjectType[] = [
  DEFAULT_TYPE,
  { value: "not_started", label: "Projets non démarrés", account: (p) => p.status === 0 },
  { value: "done", label: "Projets terminés", account: isFinished },
  {
    value: "unassigned",
    label: "Projets sans acteur",
    account: (p) => !isFinished(p) && p.actors.length === 0,
  },
  {
    value: "mine",
    label: "Projets qui me sont attribués",
    account: (p, me) => !isFinished(p) && p.actors.some((a) => a.id === me),
  },
  {
    value: "stale",
    label: `Projets sans activité depuis ${DAYS} jours`,
    account: (p) => !isFinished(p) && since(p.updated_at) >= DAYS,
  },
  {
    value: "recent",
    label: `Projets créés ces ${DAYS} derniers jours`,
    account: (p) => since(p.created_at) < DAYS,
  },
  { value: "total", label: "Projets au total", account: () => true },
];

/** The stored type, or the first: an unknown value does not bring anything down. */
const typeOf = (config: unknown) =>
  TYPES.find((t) => t.value === text(config, TYPE)) ?? DEFAULT_TYPE;

export const projectsIndicator: ProjectIndicatorWidget = {
  type: "projects",
  kind: "project",
  label: "Indicateur",
  icon: IconFolders,
  withValue: true,
  defaultConfig: { [NAME]: "", [TYPE]: DEFAULT_TYPE.value },

  Display: ({ config, projects, userId }) => {
    const type = typeOf(config);
    return (
      // The name at the top, the quantity at bottom left, like tickets.
      <Stack gap={4} justify="space-between" style={{ flex: 1 }}>
        <IndicatorTitle config={config} defaultValue={type.label} />
        <IndicatorValue config={config}>
          {projects.filter((p) => type.account(p, userId)).length}
        </IndicatorValue>
      </Stack>
    );
  },

  Config: ({ config, onChange }) => (
    <Stack gap="xl">
      <NameField config={config} onChange={onChange} defaultValue={typeOf(config).label} />
      <Select
        label="Données"
        data={TYPES.map(({ value, label }) => ({ value, label }))}
        value={typeOf(config).value}
        onChange={(value) => value && onChange(withField(config, TYPE, value))}
        allowDeselect={false}
      />
    </Stack>
  ),
};
