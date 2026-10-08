import { Select, Stack } from "@mantine/core";
import { IconDeviceDesktop } from "@tabler/icons-react";
import { DISK_FULL, DAYS_WITHOUT_INVENTORY } from "../../lib/workstation";
import { withField, text } from "../types";
import {
  NameField,
  diskFull,
  NAME,
  notEncrypted,
  unprotected,
  silent,
  IndicatorTitle,
  IndicatorValue,
  windows10,
} from "./common";
import type { ManagedDeviceAssetIndicatorWidget } from "./types";
import type { ManagedDeviceAsset } from "@milo/shared";

// A workstation count: those of the company being viewed that match the
// chosen type — all of them, or those that need attention.

const TYPE = "type";

interface WorkstationType {
  value: string;
  label: string;
  account: (a: ManagedDeviceAsset) => boolean;
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

/** The stored type, or the first one: an unknown value must not break anything. */
const typeOf = (config: unknown) =>
  TYPES.find((t) => t.value === text(config, TYPE)) ?? DEFAULT_TYPE;

export const workstationsIndicator: ManagedDeviceAssetIndicatorWidget = {
  type: "assets",
  kind: "managed_device_asset",
  label: "Indicateur",
  icon: IconDeviceDesktop,
  withValue: true,
  defaultConfig: { [NAME]: "", [TYPE]: DEFAULT_TYPE.value },

  Display: ({ config, assets }) => {
    const type = typeOf(config);
    return (
      // The name on top, the quantity bottom left, like tickets.
      <Stack gap={4} justify="space-between" style={{ flex: 1 }}>
        <IndicatorTitle config={config} defaultValue={type.label} />
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
