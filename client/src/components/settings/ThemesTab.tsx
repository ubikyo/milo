import { Button, Group, Stack, Text } from "@mantine/core";
import { THEME_COLOR_GROUPS, THEME_COLORS, THEME_SIZES, cleanThemeSize, hexaString, parseThemeColor } from "@milo/shared";
import type { ThemeColors } from "@milo/shared";
import { errorMessage, notifyError } from "../../lib/errors";
import {
  defaultHexaOf,
  themeHexaOf,
  themeSizeOf,
  updateThemeColors,
  useThemeColors,
  type Scheme,
} from "../../lib/themeColors";
import SettingRows, { EYE_DROPPER_FIELD_WIDTH } from "../ui/SettingRows";
import { THEME_SHADES, THEME_SHADES_PER_ROW } from "../../widgets/style-fields";
import type { SettingRow } from "../ui/SettingRows";

// The "Thèmes" section of Settings ("Paramétrage"): each color of the
// application, with its value on the dark theme and on the light one, grouped
// by what they color — the scale, the interface, then each kind of widget. A
// group may also carry sizes — a title's size —, with a value per theme too.
// A change shows at once, everywhere, and is saved shortly after.

interface ThemesTabProps {
  canEdit: boolean;
}

const SCHEMES: { scheme: Scheme; label: string }[] = [
  { scheme: "dark", label: "Sombre" },
  { scheme: "light", label: "Clair" },
];

const NAME_WIDTH = 230;

const onError = (e: unknown) => notifyError(errorMessage(e));

export default function ThemesTab({ canEdit }: ThemesTabProps) {
  const colors = useThemeColors();

  /**
   * Sets one theme's value, as #rrggbbaa whatever its writing; brought back to
   * its default, it is no longer stored.
   */
  const change = (key: string, scheme: Scheme, value: string) => {
    const parsed = parseThemeColor(value);
    if (!canEdit || !parsed) return;
    const hexa = hexaString(parsed);
    const own = { ...colors[key] };
    if (hexa === defaultHexaOf(key, scheme)) delete own[scheme];
    else own[scheme] = hexa;
    const next: ThemeColors = { ...colors };
    if (own.light || own.dark) next[key] = own;
    else delete next[key];
    updateThemeColors(next, onError);
  };

  /** Sets one theme's size; emptied or brought back to its default, it is no longer stored. */
  const changeSize = (key: string, scheme: Scheme, value: number | "") => {
    const definition = THEME_SIZES.find((s) => s.key === key);
    if (!canEdit || !definition) return;
    const size = value === "" ? null : cleanThemeSize(definition, value);
    const sizes = { ...colors[key]?.sizes };
    if (size === null || size === definition.defaultValue) delete sizes[scheme];
    else sizes[scheme] = size;
    const next: ThemeColors = { ...colors };
    if (sizes.light !== undefined || sizes.dark !== undefined) next[key] = { sizes };
    else delete next[key];
    updateThemeColors(next, onError);
  };

  const reset = (key: string) => {
    const next: ThemeColors = { ...colors };
    delete next[key];
    updateThemeColors(next, onError);
  };

  const rows = (group: string): SettingRow[] => [
    ...THEME_COLORS.filter((c) => c.group === group).map((c) => ({
      name: c.label,
      hint: c.hint,
      what: `« ${c.label} »`,
      colors: SCHEMES.map(({ scheme, label }) => ({
        value: themeHexaOf(c.key, scheme),
        onChange: (v: string) => change(c.key, scheme, v),
        format: "hexa" as const,
        swatches: THEME_SHADES,
        swatchesPerRow: THEME_SHADES_PER_ROW,
        eyeDropper: true,
        what: `« ${c.label} » (${label.toLowerCase()})`,
      })),
      modified: Boolean(colors[c.key]),
      reset: () => reset(c.key),
    })),
    ...THEME_SIZES.filter((s) => s.group === group).map((s) => ({
      name: s.label,
      hint: s.hint,
      what: `« ${s.label} »`,
      // Under the column headers, like the colors.
      sizes: SCHEMES.map(({ scheme, label }) => ({
        value: themeSizeOf(s.key, scheme),
        defaultValue: s.defaultValue,
        min: s.min,
        max: s.max,
        step: s.step,
        suffix: s.unit ? ` ${s.unit}` : "",
        width: EYE_DROPPER_FIELD_WIDTH,
        what: `« ${s.label} » (${label.toLowerCase()})`,
        onChange: (v: number | "") => changeSize(s.key, scheme, v),
      })),
      modified: Boolean(colors[s.key]),
      reset: () => reset(s.key),
    })),
  ];

  const modified = Object.keys(colors).length > 0;

  return (
    <Stack gap="lg">
      <Group justify="space-between" wrap="nowrap">
        <Text size="sm" c="dimmed">
          Chaque couleur a sa valeur sur le thème sombre et sur le thème clair,
          au format #RRGGBBAA : choisie dans la palette ou saisie, en
          hexadécimal ou en rgba(). Une couleur modifiée s'applique aussitôt à
          toute l'application.
        </Text>
        {canEdit && (
          <Button
            variant="default"
            size="xs"
            disabled={!modified}
            onClick={() => updateThemeColors({}, onError)}
            style={{ flexShrink: 0 }}
          >
            Tout réinitialiser
          </Button>
        )}
      </Group>
      {/* The column headers, over the rows' color fields. */}
      <Group gap="sm" justify="flex-end" wrap="nowrap" mb={-16} pr={10}>
        {SCHEMES.map(({ label }) => (
          <Text key={label} size="xs" fw={600} w={EYE_DROPPER_FIELD_WIDTH}>
            {label}
          </Text>
        ))}
      </Group>
      {THEME_COLOR_GROUPS.map((g) => (
        <SettingRows
          key={g.key}
          label={g.label}
          description={g.hint}
          rows={rows(g.key)}
          nameWidth={NAME_WIDTH}
        />
      ))}
    </Stack>
  );
}
