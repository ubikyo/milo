import { Select, Stack, Text } from "@mantine/core";
import { IconDeviceDesktop } from "@tabler/icons-react";
import { DISQUE_PLEIN, JOURS_SANS_INVENTAIRE } from "../lib/poste";
import { avec, texte } from "../widgets/types";
import {
  ChampNom,
  disquePlein,
  NOM,
  nonChiffre,
  sansProtection,
  silencieux,
  TitreIndicateur,
  windows10,
} from "./commun";
import type { AssetIndicatorWidget } from "./types";
import type { Asset } from "@milo/shared";

// Un nombre de postes : ceux de la société regardée qui répondent au type
// choisi — tous, ou ceux qui demandent qu'on s'en occupe.

const TYPE = "type";

interface TypeDePostes {
  value: string;
  label: string;
  compte: (a: Asset) => boolean;
}

const TYPE_PAR_DEFAUT: TypeDePostes = { value: "total", label: "Postes au total", compte: () => true };

const TYPES: TypeDePostes[] = [
  TYPE_PAR_DEFAUT,
  { value: "unencrypted", label: "Postes non chiffrés", compte: nonChiffre },
  { value: "unprotected", label: "Postes sans antivirus actif", compte: sansProtection },
  { value: "disk", label: `Disques pleins à plus de ${DISQUE_PLEIN} %`, compte: disquePlein },
  {
    value: "silent",
    label: `Postes muets depuis ${JOURS_SANS_INVENTAIRE} jours`,
    compte: silencieux,
  },
  { value: "windows10", label: "Postes sous Windows 10", compte: windows10 },
];

/** Le type rangé, ou le premier : une valeur inconnue ne fait rien tomber. */
const typeDe = (config: unknown) =>
  TYPES.find((t) => t.value === texte(config, TYPE)) ?? TYPE_PAR_DEFAUT;

export const postesIndicator: AssetIndicatorWidget = {
  type: "assets",
  kind: "asset",
  label: "Indicateur",
  icon: IconDeviceDesktop,
  defaultConfig: { [NOM]: "", [TYPE]: TYPE_PAR_DEFAUT.value },

  Display: ({ config, assets }) => {
    const type = typeDe(config);
    return (
      // Le nom en haut, la quantité en bas à gauche, comme les tickets.
      <Stack gap={4} justify="space-between" style={{ flex: 1 }}>
        <TitreIndicateur config={config} defaut={type.label} />
        <Text fz={28} fw={600} lh={1}>
          {assets.filter(type.compte).length}
        </Text>
      </Stack>
    );
  },

  Config: ({ config, onChange }) => (
    <Stack gap="md">
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
