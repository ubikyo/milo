import { Select, Stack } from "@mantine/core";
import { IconMailForward } from "@tabler/icons-react";
import { withField, count } from "../widgets/types";
import { NameField, NAME, Nothing, TitreIndicateur } from "./commun";
import { LabelBars, type Bar } from "./etiquettes";
import type { SupportIndicatorWidget } from "./types";

// Qui écrit le plus au support : les expéditeurs des demandes reçues par
// e-mail, du plus fréquent au moins fréquent. Une demande saisie à la main n'a
// pas d'expéditeur, elle ne compte pas.

const LABEL = "Top demandeurs";
const QUANTITY = "quantite";
const QUANTITIES = [3, 5, 10];
const QUANTITY_DEFAULT = 5;

const quantityOf = (config: unknown) => {
  const n = count(config, QUANTITY, QUANTITY_DEFAULT);
  return QUANTITIES.includes(n) ? n : QUANTITY_DEFAULT;
};

export const requestersIndicator: SupportIndicatorWidget = {
  type: "senders",
  kind: "helpdesk",
  label: LABEL,
  icon: IconMailForward,
  defaultConfig: { [NAME]: "", [QUANTITY]: QUANTITY_DEFAULT },

  Display: ({ config, requests }) => {
    // Un expéditeur se reconnaît à son adresse : son nom peut changer d'un
    // e-mail à l'autre, on garde le premier lu.
    const byAddress = new Map<string, Bar>();
    for (const request of requests) {
      const address = request.sender_email.trim().toLowerCase();
      if (!address) continue;
      const already = byAddress.get(address);
      if (already) already.value += 1;
      else
        byAddress.set(address, {
          name: request.sender_name.trim() || address,
          value: 1,
          color: "teal.6",
        });
    }
    const data = [...byAddress.values()]
      .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
      .slice(0, quantityOf(config));

    return (
      <Stack gap="xs" style={{ flex: 1 }}>
        <TitreIndicateur config={config} defaultValue={LABEL} />
        {data.length === 0 ? (
          <Nothing>Aucun demandeur</Nothing>
        ) : (
          <LabelBars data={data} />
        )}
      </Stack>
    );
  },

  Config: ({ config, onChange }) => (
    <Stack gap="xl">
      <NameField config={config} onChange={onChange} defaultValue={LABEL} />
      <Select
        label="Nombre de demandeurs"
        data={QUANTITIES.map((n) => ({ value: String(n), label: String(n) }))}
        value={String(quantityOf(config))}
        onChange={(value) => value && onChange(withField(config, QUANTITY, Number(value)))}
        allowDeselect={false}
      />
    </Stack>
  ),
};
