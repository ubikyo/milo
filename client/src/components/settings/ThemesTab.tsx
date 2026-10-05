import { Button, Group, Stack, Text } from "@mantine/core";
import { THEME_COLOR_GROUPS, THEME_COLORS, isThemeHex } from "@milo/shared";
import type { ThemeColors } from "@milo/shared";
import { errorMessage, notifyError } from "../../lib/errors";
import {
  themeColorOf,
  updateThemeColors,
  useThemeColors,
  type Scheme,
} from "../../lib/themeColors";
import SettingRows, { COLOR_FIELD_WIDTH } from "../ui/SettingRows";
import type { SettingRow } from "../ui/SettingRows";

// The "Thèmes" section of Settings ("Paramétrage"): each color of the
// application, with its value on the dark theme and on the light one, grouped
// by what they color — the scale, the interface, then each kind of widget.
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

  /** Sets one theme's value; brought back to its default, it is no longer stored. */
  const change = (key: string, scheme: Scheme, value: string) => {
    if (!canEdit || !isThemeHex(value)) return;
    const definition = THEME_COLORS.find((c) => c.key === key)!;
    const own = { ...colors[key] };
    if (value === themeColorOfDefault(definition[scheme])) delete own[scheme];
    else own[scheme] = value;
    const next: ThemeColors = { ...colors };
    if (own.light || own.dark) next[key] = own;
    else delete next[key];
    updateThemeColors(next, onError);
  };

  /**
   * The hexadecimal value of a default: a shade's is the scale's current
   * one, so that choosing it again means "the default".
   */
  const themeColorOfDefault = (value: string): string => {
    if (value === "white") return "#ffffff";
    if (value === "black") return "#000000";
    const shade = /^(gray|dark)\.(\d)$/.exec(value);
    if (shade) return themeColorOf(`shade-${shade[2]}`, shade[1] === "gray" ? "light" : "dark");
    return value.toLowerCase();
  };

  const reset = (key: string) => {
    const next: ThemeColors = { ...colors };
    delete next[key];
    updateThemeColors(next, onError);
  };

  const rows = (group: string): SettingRow[] =>
    THEME_COLORS.filter((c) => c.group === group).map((c) => ({
      name: c.label,
      hint: c.hint,
      what: `« ${c.label} »`,
      colors: SCHEMES.map(({ scheme, label }) => ({
        value: themeColorOf(c.key, scheme),
        onChange: (v: string) => change(c.key, scheme, v),
        alpha: c.alpha,
        what: `« ${c.label} » (${label.toLowerCase()})`,
      })),
      modified: Boolean(colors[c.key]),
      reset: () => reset(c.key),
    }));

  const modified = Object.keys(colors).length > 0;

  return (
    <Stack gap="lg">
      <Group justify="space-between" wrap="nowrap">
        <Text size="sm" c="dimmed">
          Chaque couleur a sa valeur sur le thème sombre et sur le thème clair.
          Une couleur modifiée s'applique aussitôt à toute l'application.
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
          <Text key={label} size="xs" fw={600} w={COLOR_FIELD_WIDTH}>
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
