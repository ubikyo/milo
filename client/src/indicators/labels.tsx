import { Box, Checkbox, Group, Stack, Text, useMantineTheme } from "@mantine/core";
import { IconTags } from "@tabler/icons-react";
import { withField } from "../widgets/types";
import { NameField, ongoing, NAME, Nothing, TitreIndicateur } from "./common";
import type { SupportIndicatorWidget } from "./types";
import type { Id } from "@milo/shared";

// Les étiquettes les plus portées, chacune dans sa couleur : ce qui occupe le
// support. Les demandes réglées n'y comptent que si on le demande.

const LABEL = "Étiquettes";
const ALL = "toutes";

/** La hauteur d'une barre. */
const BAR_HEIGHT = 24;

export interface Bar {
  name: string;
  value: number;
  /**
   * Lue seulement avec « couleursPropres » ; sinon la barre prend sa couleur
   * de sa valeur (couleurDeValeur).
   */
  color: string;
}

/** Du plus bas au meilleur : rouge, orange, jaune, citron vert, vert. */
const GRADIENT = ["red.6", "orange.6", "yellow.6", "lime.6", "green.6"];

/**
 * La couleur d'une barre selon sa place entre la plus basse et la plus haute
 * du graphique : la plus haute en vert, la plus basse en rouge, les autres
 * entre les deux. Toutes égales — ou une seule —, elles sont vertes.
 */
const colorOfValue = (value: number, min: number, max: number): string => {
  const t = max > min ? (value - min) / (max - min) : 1;
  return GRADIENT[Math.round(t * (GRADIENT.length - 1))] as string;
};

/** Le libellé d'une barre, posé à son bord gauche et jamais renvoyé à la ligne. */
function LabelText({ children, color }: { children: string; color: string }) {
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

// Les barres des étiquettes, à la façon du BarsList de Mantine, colorées de
// rouge — la plus basse — à vert — la plus haute —, mais dont le
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
export function LabelBars({
  data,
  insideLabel = false,
  ownColors = false,
}: {
  data: Bar[];
  insideLabel?: boolean;
  /** Chaque barre garde sa couleur — celle d'une liste — au lieu du dégradé. */
  ownColors?: boolean;
}) {
  const theme = useMantineTheme();
  const max = Math.max(...data.map((d) => d.value), 0);
  const min = Math.min(...data.map((d) => d.value));
  return (
    <Stack gap="xs">
      {data.map((bar) => {
        // Pleine comme l'étiquette elle-même (LabelChip) : le texte passe au
        // noir sur une couleur claire, au blanc sinon.
        const colors = theme.variantColorResolver({
          color: ownColors ? bar.color : colorOfValue(bar.value, min, max),
          theme,
          variant: "filled",
          autoContrast: true,
        });
        const part = max > 0 ? (bar.value / max) * 100 : 0;
        if (insideLabel)
          return (
            <Group key={bar.name} gap="md" wrap="nowrap">
              <Box style={{ flex: 1, minWidth: 0 }}>
                <Text
                  size="sm"
                  fw={500}
                  c={colors.color}
                  px="sm"
                  truncate
                  style={{
                    width: "fit-content",
                    minWidth: `${part}%`,
                    maxWidth: "100%",
                    height: BAR_HEIGHT,
                    lineHeight: `${BAR_HEIGHT}px`,
                    borderRadius: "var(--mantine-radius-sm)",
                    backgroundColor: colors.background,
                  }}
                >
                  {bar.name}
                </Text>
              </Box>
              <Text size="sm" fw={500} style={{ whiteSpace: "nowrap" }}>
                {bar.value}
              </Text>
            </Group>
          );
        return (
          <Group key={bar.name} gap="md" wrap="nowrap">
            <Box
              style={{
                position: "relative",
                flex: 1,
                minWidth: 0,
                height: BAR_HEIGHT,
                overflow: "hidden",
              }}
            >
              <LabelText color="var(--mantine-color-text)">{bar.name}</LabelText>
              <Box
                style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  left: 0,
                  width: `${part}%`,
                  overflow: "hidden",
                  borderRadius: "var(--mantine-radius-sm)",
                  backgroundColor: colors.background,
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
                  <LabelText color={colors.color}>{bar.name}</LabelText>
                </Box>
              </Box>
            </Box>
            <Text size="sm" fw={500} style={{ whiteSpace: "nowrap" }}>
              {bar.value}
            </Text>
          </Group>
        );
      })}
    </Stack>
  );
}

const allRequests = (config: unknown) =>
  Boolean((config as Record<string, unknown> | null)?.[ALL]);

export const labelsIndicator: SupportIndicatorWidget = {
  type: "labels",
  kind: "helpdesk",
  label: LABEL,
  icon: IconTags,
  defaultConfig: { [NAME]: "", [ALL]: false },

  Display: ({ config, requests }) => {
    const counted = allRequests(config) ? requests : requests.filter(ongoing);
    const byLabel = new Map<Id, Bar>();
    for (const request of counted) {
      for (const label of request.labels) {
        const already = byLabel.get(label.id);
        if (already) already.value += 1;
        else
          byLabel.set(label.id, {
            name: label.name,
            value: 1,
            color: label.color,
          });
      }
    }
    const data = [...byLabel.values()].sort(
      (a, b) => b.value - a.value || a.name.localeCompare(b.name),
    );

    return (
      <Stack gap="xs" style={{ flex: 1 }}>
        <TitreIndicateur config={config} defaultValue={LABEL} />
        {data.length === 0 ? <Nothing>Aucune étiquette</Nothing> : <LabelBars data={data} ownColors />}
      </Stack>
    );
  },

  Config: ({ config, onChange }) => (
    <Stack gap="xl">
      <NameField config={config} onChange={onChange} defaultValue={LABEL} />
      <Checkbox
        label="Compter aussi les tickets résolus et fermés"
        checked={allRequests(config)}
        onChange={(e) => onChange(withField(config, ALL, e.currentTarget.checked))}
        color="teal"
      />
    </Stack>
  ),
};
