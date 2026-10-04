import { Select, Stack } from "@mantine/core";
import { IconCards } from "@tabler/icons-react";
import { dueState } from "../lib/due";
import { withField, text } from "../widgets/types";
import { NameField, NAME, IndicatorTitle, IndicatorValue, tasksOf } from "./common";
import type { TaskIndicatorWidget } from "./types";
import type { Id, TaskCard } from "@milo/shared";

// A number of cards: those of the open board that match the chosen type
// — all, the late ones, those nobody carries.

const TYPE = "type";

interface CardType {
  value: string;
  label: string;
  account: (c: TaskCard, me: Id) => boolean;
}

const DEFAULT_TYPE: CardType = { value: "total", label: "Cartes au total", account: () => true };

const TYPES: CardType[] = [
  DEFAULT_TYPE,
  { value: "late", label: "Cartes en retard", account: (c) => dueState(c.due_date) === "late" },
  {
    value: "soon",
    label: "Cartes à échéance proche",
    account: (c) => dueState(c.due_date) === "soon",
  },
  { value: "unassigned", label: "Cartes sans membre", account: (c) => c.members.length === 0 },
  {
    value: "mine",
    label: "Cartes qui me sont attribuées",
    account: (c, me) => c.members.some((m) => m.id === me),
  },
  {
    value: "checklist",
    label: "Cartes à checklist inachevée",
    account: (c) => c.checklist_total > c.checklist_done,
  },
];

/** The stored type, or the first: an unknown value does not bring anything down. */
const typeOf = (config: unknown) =>
  TYPES.find((t) => t.value === text(config, TYPE)) ?? DEFAULT_TYPE;

export const cardsIndicator: TaskIndicatorWidget = {
  type: "cards",
  kind: "task",
  label: "Indicateur",
  icon: IconCards,
  withValue: true,
  defaultConfig: { [NAME]: "", [TYPE]: DEFAULT_TYPE.value },

  Display: ({ config, lists, userId }) => {
    const type = typeOf(config);
    return (
      // The name at the top, the quantity at bottom left, like tickets.
      <Stack gap={4} justify="space-between" style={{ flex: 1 }}>
        <IndicatorTitle config={config} defaultValue={type.label} />
        <IndicatorValue config={config}>
          {tasksOf(lists).filter((c) => type.account(c, userId)).length}
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
