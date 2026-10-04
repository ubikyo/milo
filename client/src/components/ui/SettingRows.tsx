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
import { SHADES, SHADES_PER_ROW } from "../../widgets/style-fields";
import {
  ROUNDING,
  ROW_INSET,
  INPUT_STYLE,
  rowStyle,
} from "./DrawerRows";

// Appearance settings as rows, like the columns of a list
// (ColumnFields): the look of an indicator, a title or a link, the
// margins of an Access mode element. Each row carries on the left the button
// that resets it to the default — green when there is something to reset —, its name, then its
// color and size, or its switch, aligned right.

/** The width of the row's name: the rows' fields line up beneath it. */
const NAME_WIDTH = 41;

/** The space between the button and the name. */
const NAME_GAP = 10;
const SIZE_WIDTH = 80;
const COLOR_WIDTH = 120;

/** The button's background, darker than the row's (ROW_BACKGROUND). */
const BUTTON_BACKGROUND = "light-dark(#d4d4d4, var(--mantine-color-dark-4))";

type Config = Record<string, unknown>;

/** The configuration where the settings take their value; when empty, they are removed from it. */
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
  /** "du titre", "de la marge haute": what the field labels say. */
  what: string;
  color?: { value: string; onChange: (value: string) => void };
  size?: {
    value: number;
    defaultValue: number;
    min: number;
    max: number;
    /** Empty when the field is. */
    onChange: (value: number | "") => void;
  };
  /** A setting that turns on or off — a widget's frame —, aligned right. */
  toggle?: { value: boolean; onChange: (value: boolean) => void };
  /** True when one of the row's settings differs from the default. */
  modified: boolean;
  reset: () => void;
}

/** The row's button, on the left: it resets all its settings to the default. */
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
      {/* Green as soon as a setting differs from the default: there is something to
          revert. Otherwise, a background one notch darker than the row, in a neutral
          gray — Mantine's lean blue —, faded. */}
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

/** A row's color, with the usual shades (field styles). */
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

/** A row's size, in pixels, aligned right. */
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
            // The button, at the start, sits against the left edge like the
            // last field against the right one.
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
                // Aligned right, 3 px from the row's inset.
                style={{ marginLeft: "auto", marginRight: 3 }}
              />
            )}
          </Group>
        ))}
      </Stack>
    </Input.Wrapper>
  );
}

/**
 * The "Cadre" row, common to all widgets: "value" is the frame currently
 * in effect, "defaultValue" the widget's own while nothing is set.
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
