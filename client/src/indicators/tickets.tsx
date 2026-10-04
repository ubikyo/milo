import { Select, Stack } from "@mantine/core";
import { IconTicket } from "@tabler/icons-react";
import { dueState } from "../lib/due";
import { withField, text } from "../widgets/types";
import { NameField, NAME, TitreIndicateur, IndicatorValue } from "./common";
import type { SupportIndicatorWidget } from "./types";
import type { Id, SupportRequest } from "@milo/shared";

// Un nombre de demandes : celles de la société regardée qui répondent au type
// choisi — un statut, l'absence d'acteur, une échéance dépassée.

const TYPE = "type";

/** Une demande résolue ou fermée n'attend plus rien : ni acteur, ni échéance. */
const ongoing = (d: SupportRequest) => d.status !== "resolved" && d.status !== "closed";

interface TicketType {
  value: string;
  label: string;
  account: (d: SupportRequest, me: Id) => boolean;
}

const DEFAULT_TYPE: TicketType = {
  value: "open",
  label: "Tickets ouverts",
  account: (d) => d.status === "open",
};

const TYPES: TicketType[] = [
  DEFAULT_TYPE,
  { value: "pending", label: "Tickets en attente", account: (d) => d.status === "pending" },
  {
    value: "unassigned",
    label: "Tickets non assignés",
    account: (d) => ongoing(d) && d.actors.length === 0,
  },
  {
    value: "mine",
    label: "Tickets qui me sont attribués",
    account: (d, me) => ongoing(d) && d.actors.some((a) => a.id === me),
  },
  { value: "closed", label: "Tickets fermés", account: (d) => d.status === "closed" },
  { value: "resolved", label: "Tickets résolus", account: (d) => d.status === "resolved" },
  {
    value: "late",
    label: "Tickets en retard",
    account: (d) => ongoing(d) && dueState(d.due_date) === "retard",
  },
  { value: "total", label: "Tickets au total", account: () => true },
];

/** Le type rangé, ou le premier : une valeur inconnue ne fait rien tomber. */
const typeOf = (config: unknown) =>
  TYPES.find((t) => t.value === text(config, TYPE)) ?? DEFAULT_TYPE;

export const ticketsIndicator: SupportIndicatorWidget = {
  type: "tickets",
  kind: "helpdesk",
  label: "Indicateur",
  icon: IconTicket,
  withValue: true,
  defaultConfig: { [NAME]: "", [TYPE]: DEFAULT_TYPE.value },

  Display: ({ config, requests, userId }) => {
    const type = typeOf(config);
    return (
      // Le nom en haut, la quantité en bas à gauche : la carte donne la hauteur.
      <Stack gap={4} justify="space-between" style={{ flex: 1 }}>
        {/* Sans nom, l'indicateur se présente par son type. */}
        <TitreIndicateur config={config} defaultValue={type.label} />
        <IndicatorValue config={config}>
          {requests.filter((d) => type.account(d, userId)).length}
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
