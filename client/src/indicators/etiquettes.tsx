import { Box, Checkbox, Group, Stack, Text, useMantineTheme } from "@mantine/core";
import { IconTags } from "@tabler/icons-react";
import { avec } from "../widgets/types";
import { ChampNom, enCours, NOM, Rien, TitreIndicateur } from "./commun";
import type { SupportIndicatorWidget } from "./types";
import type { Id } from "@milo/shared";

// Les étiquettes les plus portées, chacune dans sa couleur : ce qui occupe le
// support. Les demandes réglées n'y comptent que si on le demande.

const LIBELLE = "Étiquettes";
const TOUTES = "toutes";

/** La hauteur d'une barre. */
const HAUTEUR_BARRE = 24;

export interface Barre {
  name: string;
  value: number;
  color: string;
}

/** Le libellé d'une barre, posé à son bord gauche et jamais renvoyé à la ligne. */
function Libelle({ children, color }: { children: string; color: string }) {
  return (
    <Text
      size="sm"
      fw={500}
      c={color}
      px="sm"
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </Text>
  );
}

// Les barres des étiquettes, à la façon du BarsList de Mantine, mais dont le
// libellé déborde de la barre plutôt que de passer à la ligne quand elle est
// trop courte pour lui. Il est posé deux fois au même endroit : dessous, dans
// la couleur du texte ; dans la barre, dans la couleur qui se lit sur elle —
// la barre le rogne à sa longueur. Ce qui dépasse se lit donc sur le fond, ce
// qui est dedans sur la couleur de l'étiquette.
//
// Les modes Projet et Tâche s'en servent aussi, pour leurs étiquettes, leurs
// catégories et leurs listes. Avec « libelleDedans », une barre est au moins
// aussi large que son libellé : une liste vide garde ainsi sa couleur au lieu
// de disparaître.
export function BarresEtiquettes({
  data,
  libelleDedans = false,
}: {
  data: Barre[];
  libelleDedans?: boolean;
}) {
  const theme = useMantineTheme();
  const max = Math.max(...data.map((d) => d.value), 0);
  return (
    <Stack gap="xs">
      {data.map((barre) => {
        // Pleine comme l'étiquette elle-même (LabelChip) : le texte passe au
        // noir sur une couleur claire, au blanc sinon.
        const couleurs = theme.variantColorResolver({
          color: barre.color,
          theme,
          variant: "filled",
          autoContrast: true,
        });
        const part = max > 0 ? (barre.value / max) * 100 : 0;
        if (libelleDedans)
          return (
            <Group key={barre.name} gap="md" wrap="nowrap">
              <Box style={{ flex: 1, minWidth: 0 }}>
                <Text
                  size="sm"
                  fw={500}
                  c={couleurs.color}
                  px="sm"
                  truncate
                  style={{
                    width: "fit-content",
                    minWidth: `${part}%`,
                    maxWidth: "100%",
                    height: HAUTEUR_BARRE,
                    lineHeight: `${HAUTEUR_BARRE}px`,
                    borderRadius: "var(--mantine-radius-sm)",
                    backgroundColor: couleurs.background,
                  }}
                >
                  {barre.name}
                </Text>
              </Box>
              <Text size="sm" fw={500} style={{ whiteSpace: "nowrap" }}>
                {barre.value}
              </Text>
            </Group>
          );
        return (
          <Group key={barre.name} gap="md" wrap="nowrap">
            <Box
              style={{
                position: "relative",
                flex: 1,
                minWidth: 0,
                height: HAUTEUR_BARRE,
                overflow: "hidden",
              }}
            >
              <Libelle color="var(--mantine-color-text)">{barre.name}</Libelle>
              <Box
                style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  left: 0,
                  width: `${part}%`,
                  overflow: "hidden",
                  borderRadius: "var(--mantine-radius-sm)",
                  backgroundColor: couleurs.background,
                }}
              >
                {/* Le libellé de la barre court sur toute la rangée : il
                    tombe pile sur celui du dessous. */}
                <Box
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: part > 0 ? `${(100 / part) * 100}%` : 0,
                  }}
                >
                  <Libelle color={couleurs.color}>{barre.name}</Libelle>
                </Box>
              </Box>
            </Box>
            <Text size="sm" fw={500} style={{ whiteSpace: "nowrap" }}>
              {barre.value}
            </Text>
          </Group>
        );
      })}
    </Stack>
  );
}

const toutesLesDemandes = (config: unknown) =>
  Boolean((config as Record<string, unknown> | null)?.[TOUTES]);

export const etiquettesIndicator: SupportIndicatorWidget = {
  type: "labels",
  label: LIBELLE,
  icon: IconTags,
  defaultConfig: { [NOM]: "", [TOUTES]: false },

  Display: ({ config, requests }) => {
    const comptees = toutesLesDemandes(config) ? requests : requests.filter(enCours);
    const parEtiquette = new Map<Id, Barre>();
    for (const demande of comptees) {
      for (const etiquette of demande.labels) {
        const deja = parEtiquette.get(etiquette.id);
        if (deja) deja.value += 1;
        else
          parEtiquette.set(etiquette.id, {
            name: etiquette.name,
            value: 1,
            color: etiquette.color,
          });
      }
    }
    const data = [...parEtiquette.values()].sort(
      (a, b) => b.value - a.value || a.name.localeCompare(b.name),
    );

    return (
      <Stack gap="xs" style={{ flex: 1 }}>
        <TitreIndicateur config={config} defaut={LIBELLE} />
        {data.length === 0 ? <Rien>Aucune étiquette</Rien> : <BarresEtiquettes data={data} />}
      </Stack>
    );
  },

  Config: ({ config, onChange }) => (
    <Stack gap="xl">
      <ChampNom config={config} onChange={onChange} defaut={LIBELLE} />
      <Checkbox
        label="Compter aussi les tickets résolus et fermés"
        checked={toutesLesDemandes(config)}
        onChange={(e) => onChange(avec(config, TOUTES, e.currentTarget.checked))}
        color="teal"
      />
    </Stack>
  ),
};
