import { Group, RingProgress, Stack, Switch, Text } from "@mantine/core";
import { IconShieldCheck } from "@tabler/icons-react";
import { DISK_FULL, DAYS_WITHOUT_INVENTORY } from "../lib/workstation";
import { withField } from "../widgets/types";
import { RED } from "../themes/colors";
import {
  NameField,
  diskFull,
  NAME,
  notEncrypted,
  Nothing,
  unprotected,
  silent,
  IndicatorTitle,
  windows10,
} from "./common";
import type { AssetIndicatorWidget } from "./types";
import type { Asset } from "@milo/shared";

// La part des postes en règle, en anneau : un poste l'est quand il ne manque
// à aucune des règles cochées. À côté, ce qui manque, règle par règle — c'est
// là qu'on voit par où commencer.

const LABEL = "Conformité";

interface Rule {
  key: string;
  /** Ce que la règle exige, dans le tiroir. */
  label: string;
  /** Ce qui y manque, à côté de l'anneau. */
  missingLabel: string;
  inDefault: (a: Asset) => boolean;
}

const RULES: Rule[] = [
  { key: "encryption", label: "Disque système chiffré", missingLabel: "non chiffrés", inDefault: notEncrypted },
  { key: "antivirus", label: "Antivirus actif", missingLabel: "sans antivirus", inDefault: unprotected },
  {
    key: "disk",
    label: `Disque système occupé à ${DISK_FULL} % au plus`,
    missingLabel: "disques pleins",
    inDefault: diskFull,
  },
  {
    key: "inventory",
    label: `Inventorié depuis moins de ${DAYS_WITHOUT_INVENTORY} jours`,
    missingLabel: "muets",
    inDefault: silent,
  },
  { key: "system", label: "Système encore maintenu", missingLabel: "sous Windows 10", inDefault: windows10 },
];

/** Une règle compte tant qu'on ne l'a pas décochée : un indicateur neuf les prend toutes. */
const active = (config: unknown, rule: Rule): boolean =>
  (config as Record<string, unknown> | null)?.[rule.key] !== false;

/** La couleur de l'anneau : vert à 90 % et plus, orange à 70 %, rouge en dessous. */
const color = (part: number): string => (part >= 90 ? "teal" : part >= 70 ? "orange" : RED);

export const complianceIndicator: AssetIndicatorWidget = {
  type: "compliance",
  kind: "asset",
  label: LABEL,
  icon: IconShieldCheck,
  defaultConfig: { [NAME]: "", ...Object.fromEntries(RULES.map((r) => [r.key, true])) },

  Display: ({ config, assets }) => {
    const rules = RULES.filter((r) => active(config, r));
    const compliant = assets.filter((a) => !rules.some((r) => r.inDefault(a))).length;
    const part = assets.length ? Math.round((compliant / assets.length) * 100) : 0;
    const missingLabels = rules
      .map((r) => ({ rule: r, count: assets.filter(r.inDefault).length }))
      .filter((m) => m.count > 0);

    return (
      <Stack gap="xs" style={{ flex: 1 }}>
        <IndicatorTitle config={config} defaultValue={LABEL} />
        {assets.length === 0 ? (
          <Nothing>Aucun poste</Nothing>
        ) : (
          <Group gap="md" wrap="nowrap">
            <RingProgress
              size={110}
              thickness={12}
              roundCaps
              sections={[{ value: part, color: color(part) }]}
              label={
                <Text ta="center" fw={600} fz="lg">
                  {part} %
                </Text>
              }
            />
            <Stack gap={2} style={{ minWidth: 0 }}>
              <Text size="sm">
                {compliant} / {assets.length} postes en règle
              </Text>
              {missingLabels.map(({ rule, count }) => (
                <Text key={rule.key} size="sm" c="dimmed" truncate>
                  {count} {rule.missingLabel}
                </Text>
              ))}
            </Stack>
          </Group>
        )}
      </Stack>
    );
  },

  Config: ({ config, onChange }) => (
    <Stack gap="md">
      <NameField config={config} onChange={onChange} defaultValue={LABEL} />
      <Stack gap="xs">
        <Text size="sm" fw={500}>
          Règles
        </Text>
        {RULES.map((rule) => (
          <Switch
            key={rule.key}
            label={rule.label}
            checked={active(config, rule)}
            onChange={(e) => onChange(withField(config, rule.key, e.currentTarget.checked))}
            color="teal"
          />
        ))}
      </Stack>
    </Stack>
  ),
};
