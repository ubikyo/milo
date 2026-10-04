import { Select, Stack } from "@mantine/core";
import { IconMailForward } from "@tabler/icons-react";
import { withField, count } from "../widgets/types";
import { NameField, NAME, Nothing, IndicatorTitle } from "./common";
import { LabelBars, type Bar } from "./labels";
import type { SupportIndicatorWidget } from "./types";

// Who writes to support the most: the senders of requests received by
// e-mail, from most to least frequent. A request entered by hand has
// no sender, it does not count.

const LABEL = "Top demandeurs";
const QUANTITY = "count";
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
    // A sender is recognized by their address: their name may change from one
    // e-mail to the next, the first one read is kept.
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
        <IndicatorTitle config={config} defaultValue={LABEL} />
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
