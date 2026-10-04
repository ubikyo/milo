import { Select, Stack } from "@mantine/core";
import { IconTicket } from "@tabler/icons-react";
import { etatEcheance } from "../lib/echeance";
import { avec, texte } from "../widgets/types";
import { ChampNom, NOM, TitreIndicateur, ValeurIndicateur } from "./commun";
import type { SupportIndicatorWidget } from "./types";
import type { Id, SupportRequest } from "@milo/shared";

// Un nombre de demandes : celles de la société regardée qui répondent au type
// choisi — un statut, l'absence d'acteur, une échéance dépassée.

const TYPE = "type";

/** Une demande résolue ou fermée n'attend plus rien : ni acteur, ni échéance. */
const enCours = (d: SupportRequest) => d.status !== "resolved" && d.status !== "closed";

interface TypeDeTickets {
  value: string;
  label: string;
  compte: (d: SupportRequest, moi: Id) => boolean;
}

const TYPE_PAR_DEFAUT: TypeDeTickets = {
  value: "open",
  label: "Tickets ouverts",
  compte: (d) => d.status === "open",
};

const TYPES: TypeDeTickets[] = [
  TYPE_PAR_DEFAUT,
  { value: "pending", label: "Tickets en attente", compte: (d) => d.status === "pending" },
  {
    value: "unassigned",
    label: "Tickets non assignés",
    compte: (d) => enCours(d) && d.actors.length === 0,
  },
  {
    value: "mine",
    label: "Tickets qui me sont attribués",
    compte: (d, moi) => enCours(d) && d.actors.some((a) => a.id === moi),
  },
  { value: "closed", label: "Tickets fermés", compte: (d) => d.status === "closed" },
  { value: "resolved", label: "Tickets résolus", compte: (d) => d.status === "resolved" },
  {
    value: "late",
    label: "Tickets en retard",
    compte: (d) => enCours(d) && etatEcheance(d.due_date) === "retard",
  },
  { value: "total", label: "Tickets au total", compte: () => true },
];

/** Le type rangé, ou le premier : une valeur inconnue ne fait rien tomber. */
const typeDe = (config: unknown) =>
  TYPES.find((t) => t.value === texte(config, TYPE)) ?? TYPE_PAR_DEFAUT;

export const ticketsIndicator: SupportIndicatorWidget = {
  type: "tickets",
  kind: "helpdesk",
  label: "Indicateur",
  icon: IconTicket,
  avecValeur: true,
  defaultConfig: { [NOM]: "", [TYPE]: TYPE_PAR_DEFAUT.value },

  Display: ({ config, requests, userId }) => {
    const type = typeDe(config);
    return (
      // Le nom en haut, la quantité en bas à gauche : la carte donne la hauteur.
      <Stack gap={4} justify="space-between" style={{ flex: 1 }}>
        {/* Sans nom, l'indicateur se présente par son type. */}
        <TitreIndicateur config={config} defaut={type.label} />
        <ValeurIndicateur config={config}>
          {requests.filter((d) => type.compte(d, userId)).length}
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
