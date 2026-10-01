import { Group, RingProgress, Stack, Switch, Text } from "@mantine/core";
import { IconShieldCheck } from "@tabler/icons-react";
import { DISQUE_PLEIN, JOURS_SANS_INVENTAIRE } from "../lib/poste";
import { avec } from "../widgets/types";
import { RED } from "../themes/colors";
import {
  ChampNom,
  disquePlein,
  NOM,
  nonChiffre,
  Rien,
  sansProtection,
  silencieux,
  TitreIndicateur,
  windows10,
} from "./commun";
import type { AssetIndicatorWidget } from "./types";
import type { Asset } from "@milo/shared";

// La part des postes en règle, en anneau : un poste l'est quand il ne manque
// à aucune des règles cochées. À côté, ce qui manque, règle par règle — c'est
// là qu'on voit par où commencer.

const LIBELLE = "Conformité";

interface Regle {
  cle: string;
  /** Ce que la règle exige, dans le tiroir. */
  label: string;
  /** Ce qui y manque, à côté de l'anneau. */
  manque: string;
  enDefaut: (a: Asset) => boolean;
}

const REGLES: Regle[] = [
  { cle: "chiffrement", label: "Disque système chiffré", manque: "non chiffrés", enDefaut: nonChiffre },
  { cle: "antivirus", label: "Antivirus actif", manque: "sans antivirus", enDefaut: sansProtection },
  {
    cle: "disque",
    label: `Disque système occupé à ${DISQUE_PLEIN} % au plus`,
    manque: "disques pleins",
    enDefaut: disquePlein,
  },
  {
    cle: "inventaire",
    label: `Inventorié depuis moins de ${JOURS_SANS_INVENTAIRE} jours`,
    manque: "muets",
    enDefaut: silencieux,
  },
  { cle: "systeme", label: "Système encore maintenu", manque: "sous Windows 10", enDefaut: windows10 },
];

/** Une règle compte tant qu'on ne l'a pas décochée : un indicateur neuf les prend toutes. */
const active = (config: unknown, regle: Regle): boolean =>
  (config as Record<string, unknown> | null)?.[regle.cle] !== false;

/** La couleur de l'anneau : vert à 90 % et plus, orange à 70 %, rouge en dessous. */
const couleur = (part: number): string => (part >= 90 ? "teal" : part >= 70 ? "orange" : RED);

export const conformiteIndicator: AssetIndicatorWidget = {
  type: "compliance",
  label: LIBELLE,
  icon: IconShieldCheck,
  defaultConfig: { [NOM]: "", ...Object.fromEntries(REGLES.map((r) => [r.cle, true])) },

  Display: ({ config, assets }) => {
    const regles = REGLES.filter((r) => active(config, r));
    const conformes = assets.filter((a) => !regles.some((r) => r.enDefaut(a))).length;
    const part = assets.length ? Math.round((conformes / assets.length) * 100) : 0;
    const manques = regles
      .map((r) => ({ regle: r, nombre: assets.filter(r.enDefaut).length }))
      .filter((m) => m.nombre > 0);

    return (
      <Stack gap="xs" style={{ flex: 1 }}>
        <TitreIndicateur config={config} defaut={LIBELLE} />
        {assets.length === 0 ? (
          <Rien>Aucun poste</Rien>
        ) : (
          <Group gap="md" wrap="nowrap">
            <RingProgress
              size={110}
              thickness={12}
              roundCaps
              sections={[{ value: part, color: couleur(part) }]}
              label={
                <Text ta="center" fw={600} fz="lg">
                  {part} %
                </Text>
              }
            />
            <Stack gap={2} style={{ minWidth: 0 }}>
              <Text size="sm">
                {conformes} / {assets.length} postes en règle
              </Text>
              {manques.map(({ regle, nombre }) => (
                <Text key={regle.cle} size="sm" c="dimmed" truncate>
                  {nombre} {regle.manque}
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
      <ChampNom config={config} onChange={onChange} defaut={LIBELLE} />
      <Stack gap="xs">
        <Text size="sm" fw={500}>
          Règles
        </Text>
        {REGLES.map((regle) => (
          <Switch
            key={regle.cle}
            label={regle.label}
            checked={active(config, regle)}
            onChange={(e) => onChange(avec(config, regle.cle, e.currentTarget.checked))}
            color="teal"
          />
        ))}
      </Stack>
    </Stack>
  ),
};
