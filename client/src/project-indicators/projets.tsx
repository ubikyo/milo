import { Select, Stack, Text } from "@mantine/core";
import { IconFolders } from "@tabler/icons-react";
import dayjs from "dayjs";
import { avec, texte } from "../widgets/types";
import { ChampNom, NOM, TitreIndicateur, termine } from "./commun";
import type { ProjectIndicatorWidget } from "./types";
import type { Id, Project } from "@milo/shared";

// Un nombre de projets : ceux du tableau ouvert qui répondent au type choisi
// — tous, ceux en cours, ceux qui n'ont personne pour les porter, ceux qu'on
// ne touche plus.

const TYPE = "type";

/** Au-delà, un projet en cours qu'on ne modifie plus est à l'arrêt ; en deçà, un projet est récent. */
const JOURS = 30;

const depuis = (date: string): number => dayjs().diff(dayjs(date), "day", true);

interface TypeDeProjets {
  value: string;
  label: string;
  compte: (p: Project, moi: Id) => boolean;
}

const TYPE_PAR_DEFAUT: TypeDeProjets = {
  value: "in_progress",
  label: "Projets en cours",
  compte: (p) => !termine(p),
};

const TYPES: TypeDeProjets[] = [
  TYPE_PAR_DEFAUT,
  { value: "not_started", label: "Projets non démarrés", compte: (p) => p.status === 0 },
  { value: "done", label: "Projets terminés", compte: termine },
  {
    value: "unassigned",
    label: "Projets sans acteur",
    compte: (p) => !termine(p) && p.actors.length === 0,
  },
  {
    value: "mine",
    label: "Projets qui me sont attribués",
    compte: (p, moi) => !termine(p) && p.actors.some((a) => a.id === moi),
  },
  {
    value: "stale",
    label: `Projets sans activité depuis ${JOURS} jours`,
    compte: (p) => !termine(p) && depuis(p.updated_at) >= JOURS,
  },
  {
    value: "recent",
    label: `Projets créés ces ${JOURS} derniers jours`,
    compte: (p) => depuis(p.created_at) < JOURS,
  },
  { value: "total", label: "Projets au total", compte: () => true },
];

/** Le type rangé, ou le premier : une valeur inconnue ne fait rien tomber. */
const typeDe = (config: unknown) =>
  TYPES.find((t) => t.value === texte(config, TYPE)) ?? TYPE_PAR_DEFAUT;

export const projetsIndicator: ProjectIndicatorWidget = {
  type: "projects",
  kind: "project",
  label: "Indicateur",
  icon: IconFolders,
  defaultConfig: { [NOM]: "", [TYPE]: TYPE_PAR_DEFAUT.value },

  Display: ({ config, projects, userId }) => {
    const type = typeDe(config);
    return (
      // Le nom en haut, la quantité en bas à gauche, comme les tickets.
      <Stack gap={4} justify="space-between" style={{ flex: 1 }}>
        <TitreIndicateur config={config} defaut={type.label} />
        <Text fz={28} fw={600} lh={1}>
          {projects.filter((p) => type.compte(p, userId)).length}
        </Text>
      </Stack>
    );
  },

  Config: ({ config, onChange }) => (
    <Stack gap="xl">
      <ChampNom config={config} onChange={onChange} defaut={typeDe(config).label} />
      <Select
        label="Données"
        data={TYPES.map(({ value, label }) => ({ value, label }))}
        value={typeDe(config).value}
        onChange={(value) => value && onChange(avec(config, TYPE, value))}
        allowDeselect={false}
      />
    </Stack>
  ),
};
