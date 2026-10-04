import { Select, Stack } from "@mantine/core";
import { IconCards } from "@tabler/icons-react";
import { etatEcheance } from "../lib/echeance";
import { avec, texte } from "../widgets/types";
import { ChampNom, NOM, TitreIndicateur, ValeurIndicateur, tachesDe } from "./commun";
import type { TaskIndicatorWidget } from "./types";
import type { Id, TaskCard } from "@milo/shared";

// Un nombre de cartes : celles du tableau ouvert qui répondent au type choisi
// — toutes, celles en retard, celles que personne ne porte.

const TYPE = "type";

interface TypeDeCartes {
  value: string;
  label: string;
  compte: (c: TaskCard, moi: Id) => boolean;
}

const TYPE_PAR_DEFAUT: TypeDeCartes = { value: "total", label: "Cartes au total", compte: () => true };

const TYPES: TypeDeCartes[] = [
  TYPE_PAR_DEFAUT,
  { value: "late", label: "Cartes en retard", compte: (c) => etatEcheance(c.due_date) === "retard" },
  {
    value: "soon",
    label: "Cartes à échéance proche",
    compte: (c) => etatEcheance(c.due_date) === "bientot",
  },
  { value: "unassigned", label: "Cartes sans membre", compte: (c) => c.members.length === 0 },
  {
    value: "mine",
    label: "Cartes qui me sont attribuées",
    compte: (c, moi) => c.members.some((m) => m.id === moi),
  },
  {
    value: "checklist",
    label: "Cartes à checklist inachevée",
    compte: (c) => c.checklist_total > c.checklist_done,
  },
];

/** Le type rangé, ou le premier : une valeur inconnue ne fait rien tomber. */
const typeDe = (config: unknown) =>
  TYPES.find((t) => t.value === texte(config, TYPE)) ?? TYPE_PAR_DEFAUT;

export const cartesIndicator: TaskIndicatorWidget = {
  type: "cards",
  kind: "task",
  label: "Indicateur",
  icon: IconCards,
  avecValeur: true,
  defaultConfig: { [NOM]: "", [TYPE]: TYPE_PAR_DEFAUT.value },

  Display: ({ config, lists, userId }) => {
    const type = typeDe(config);
    return (
      // Le nom en haut, la quantité en bas à gauche, comme les tickets.
      <Stack gap={4} justify="space-between" style={{ flex: 1 }}>
        <TitreIndicateur config={config} defaut={type.label} />
        <ValeurIndicateur config={config}>
          {tachesDe(lists).filter((c) => type.compte(c, userId)).length}
        </ValeurIndicateur>
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
