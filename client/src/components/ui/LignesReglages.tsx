import {
  ActionIcon,
  ColorInput,
  Group,
  Input,
  NumberInput,
  Stack,
  Switch,
  Text,
  Tooltip,
} from "@mantine/core";
import { IconRestore } from "@tabler/icons-react";
import { useState } from "react";
import { GREEN } from "../../themes/colors";
import { SHADES, SHADES_PER_ROW } from "../../widgets/champs-style";
import {
  ROUNDING,
  ROW_INSET,
  NAME_INSET,
  INPUT_STYLE,
  rowStyle,
} from "./LignesDuTiroir";

// Des réglages d'allure en lignes, comme les colonnes d'une liste
// (ChampsColonnes) : l'apparence d'un indicateur, d'un titre ou d'un lien, les
// marges d'un élément du mode Accès. Chaque ligne porte à gauche le bouton qui
// la ramène à l'ordinaire — vert quand il y a de quoi —, son nom, puis sa
// couleur et sa taille, ou son interrupteur, calés à droite.

/** La place du nom de la ligne : les champs des lignes s'alignent dessous. */
const NAME_WIDTH = 41;

/** L'air entre le bouton et le nom, plus serré que celui des champs. */
const NAME_GAP = 6;
const SIZE_WIDTH = 80;
const COLOR_WIDTH = 120;

/** Le fond du bouton, plus foncé que celui de la ligne (FOND_LIGNE). */
const BUTTON_BACKGROUND = "light-dark(#d4d4d4, var(--mantine-color-dark-4))";

type Config = Record<string, unknown>;

/** La configuration où les réglages prennent leur valeur ; vides, ils en sont retirés. */
export const insertRow = (
  config: unknown,
  settings: Record<string, unknown>,
): Config => {
  const next: Config = { ...((config as Config | null) ?? {}) };
  for (const [key, value] of Object.entries(settings)) {
    if (value === "" || value === undefined) delete next[key];
    else next[key] = value;
  }
  return next;
};

export interface SettingRow {
  name: string;
  /** « du titre », « de la marge haute » : ce que disent les libellés des champs. */
  what: string;
  color?: { value: string; onChange: (value: string) => void };
  size?: {
    value: number;
    defaultValue: number;
    min: number;
    max: number;
    /** Vide quand le champ l'est. */
    onChange: (value: number | "") => void;
  };
  /** Un réglage qui s'allume ou s'éteint — l'encadré d'un widget —, calé à droite. */
  toggle?: { value: boolean; onChange: (value: boolean) => void };
  /** Vrai quand un réglage de la ligne s'écarte de l'ordinaire. */
  modified: boolean;
  reset: () => void;
}

/** Le bouton de la ligne, à gauche : il ramène tous ses réglages à l'ordinaire. */
function Reset({
  active,
  onClick,
  what,
}: {
  active: boolean;
  onClick: () => void;
  what: string;
}) {
  const label = `Revenir à la valeur par défaut ${what}`;
  return (
    <Tooltip label={label} disabled={!active}>
      {/* Vert dès qu'un réglage s'écarte de l'ordinaire : il y a de quoi
          revenir. Sinon, un fond un cran plus foncé que la ligne, d'un gris
          neutre — ceux de Mantine tirent sur le bleu —, estompé. */}
      <ActionIcon
        variant="filled"
        radius={3}
        onClick={onClick}
        disabled={!active}
        aria-label={label}
        style={{
          backgroundColor: active ? GREEN : BUTTON_BACKGROUND,
          color: active ? "#ffffff" : "var(--mantine-color-text)",
          opacity: active ? 1 : 0.5,
        }}
      >
        <IconRestore size={16} />
      </ActionIcon>
    </Tooltip>
  );
}

/** La couleur d'une ligne, avec les nuances habituelles (champs-style). */
function Color({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  const [input, setInput] = useState(false);
  return (
    <ColorInput
      size="xs"
      radius={ROUNDING}
      w={COLOR_WIDTH}
      placeholder="Par défaut"
      value={value}
      onChange={(v) => onChange(v.toLowerCase())}
      format="hex"
      swatches={SHADES}
      swatchesPerRow={SHADES_PER_ROW}
      withEyeDropper={false}
      popoverProps={{ withinPortal: true }}
      aria-label={label}
      onFocus={() => setInput(true)}
      onBlur={() => setInput(false)}
      styles={input ? { input: INPUT_STYLE } : undefined}
    />
  );
}

/** La taille d'une ligne, en pixels, calée à droite. */
function Size({
  size,
  label,
}: {
  size: NonNullable<SettingRow["size"]>;
  label: string;
}) {
  const [input, setInput] = useState(false);
  return (
    <NumberInput
      size="xs"
      radius={ROUNDING}
      w={SIZE_WIDTH}
      style={{ marginLeft: "auto" }}
      placeholder={String(size.defaultValue)}
      suffix=" px"
      min={size.min}
      max={size.max}
      allowDecimal={false}
      allowNegative={false}
      aria-label={label}
      value={size.value}
      onChange={(v) => size.onChange(v === "" ? "" : Number(v))}
      onFocus={() => setInput(true)}
      onBlur={() => setInput(false)}
      styles={input ? { input: INPUT_STYLE } : undefined}
    />
  );
}

export default function SettingRows({
  label,
  rows,
}: {
  label: string;
  rows: SettingRow[];
}) {
  return (
    <Input.Wrapper label={label}>
      <Stack gap={1}>
        {rows.map((l, rank) => (
          <Group
            key={l.name}
            gap="sm"
            wrap="nowrap"
            // Le bouton, au début, se cale contre le bord gauche comme le
            // dernier champ contre le droit.
            style={{
              ...rowStyle(rank, rows.length, false),
              paddingLeft: ROW_INSET,
            }}
          >
            <Reset
              active={l.modified}
              what={l.what}
              onClick={l.reset}
            />
            <Text
              size="sm"
              w={NAME_WIDTH}
              style={{
                flexShrink: 0,
                marginLeft: `calc(${NAME_GAP}px - var(--mantine-spacing-sm))`,
              }}
            >
              {l.name}
            </Text>
            {l.color && (
              <Color
                value={l.color.value}
                onChange={l.color.onChange}
                label={`Couleur ${l.what}`}
              />
            )}
            {l.size && (
              <Size size={l.size} label={`Taille ${l.what}`} />
            )}
            {l.toggle && (
              <Switch
                checked={l.toggle.value}
                onChange={(e) => l.toggle?.onChange(e.currentTarget.checked)}
                color="teal"
                aria-label={l.name}
                // Calé à droite, à RETRAIT_NOM du bout comme les boutons des
                // lignes (BoutonDeLigne).
                style={{ marginLeft: "auto", marginRight: NAME_INSET - ROW_INSET }}
              />
            )}
          </Group>
        ))}
      </Stack>
    </Input.Wrapper>
  );
}

/**
 * La ligne « Cadre », commune à tous les widgets : « valeur » est le cadre en
 * vigueur, « defaut » celui du widget tant que rien n'est réglé.
 */
export const frameRow = (
  config: unknown,
  onChange: (config: Config) => void,
  key: string,
  value: boolean,
  defaultValue: boolean,
): SettingRow => ({
  name: "Cadre",
  what: "du cadre",
  toggle: {
    value,
    onChange: (v) => onChange(insertRow(config, { [key]: v === defaultValue ? "" : v })),
  },
  modified: value !== defaultValue,
  reset: () => onChange(insertRow(config, { [key]: "" })),
});
