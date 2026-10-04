import { Select, Stack } from "@mantine/core";
import { IconDeviceDesktop } from "@tabler/icons-react";
import { DISK_FULL, DAYS_WITHOUT_INVENTORY } from "../lib/poste";
import { withField, text } from "../widgets/types";
import {
  NameField,
  diskFull,
  NAME,
  notEncrypted,
  unprotected,
  silent,
  TitreIndicateur,
  IndicatorValue,
  windows10,
} from "./commun";
import type { AssetIndicatorWidget } from "./types";
import type { Asset } from "@milo/shared";

// Un nombre de postes : ceux de la société regardée qui répondent au type
// choisi — tous, ou ceux qui demandent qu'on s'en occupe.

const TYPE = "type";

interface WorkstationType {
  value: string;
  label: string;
  account: (a: Asset) => boolean;
}

const DEFAULT_TYPE: WorkstationType = { value: "total", label: "Postes au total", account: () => true };

const TYPES: WorkstationType[] = [
  DEFAULT_TYPE,
  { value: "unencrypted", label: "Postes non chiffrés", account: notEncrypted },
  { value: "unprotected", label: "Postes sans antivirus actif", account: unprotected },
  { value: "disk", label: `Disques pleins à plus de ${DISK_FULL} %`, account: diskFull },
  {
    value: "silent",
    label: `Postes muets depuis ${DAYS_WITHOUT_INVENTORY} jours`,
    account: silent,
  },
  { value: "windows10", label: "Postes sous Windows 10", account: windows10 },
];

/** Le type rangé, ou le premier : une valeur inconnue ne fait rien tomber. */
const typeOf = (config: unknown) =>
  TYPES.find((t) => t.value === text(config, TYPE)) ?? DEFAULT_TYPE;

export const workstationsIndicator: AssetIndicatorWidget = {
  type: "assets",
  kind: "asset",
  label: "Indicateur",
  icon: IconDeviceDesktop,
  withValue: true,
  defaultConfig: { [NAME]: "", [TYPE]: DEFAULT_TYPE.value },

  Display: ({ config, assets }) => {
    const type = typeOf(config);
    return (
      // Le nom en haut, la quantité en bas à gauche, comme les tickets.
      <Stack gap={4} justify="space-between" style={{ flex: 1 }}>
        <TitreIndicateur config={config} defaultValue={type.label} />
        <IndicatorValue config={config}>
          {assets.filter(type.account).length}
        </IndicatorValue>
      </Stack>
    );
  },

  Config: ({ config, onChange }) => (
    <Stack gap="md">
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
