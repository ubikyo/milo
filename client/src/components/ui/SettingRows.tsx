import {
  ActionIcon,
  ColorInput,
  Group,
  Input,
  NumberInput,
  SegmentedControl,
  Stack,
  Switch,
  Text,
  Tooltip,
} from "@mantine/core";
import { IconRestore } from "@tabler/icons-react";
import { useState } from "react";
import type { ComponentType } from "react";
import { GREEN, SEGMENTS_BG } from "../../themes/colors";
import { SHADES, SHADES_PER_ROW } from "../../widgets/style-fields";
import {
  ROUNDING,
  ROW_INSET,
  INPUT_STYLE,
  numberKeys,
  rowStyle,
} from "./DrawerRows";

// Appearance settings as rows, like the columns of a list
// (ColumnFields): the look of an indicator, a title or a link, the
// margins of an Access mode element. Each row carries on the left the button
// that resets it to the default — green when there is something to reset —, its name, then its
// color and size, or its switch, aligned right.

/** The width of the row's name: the rows' fields line up beneath it. */
const NAME_WIDTH = 100;

/** The space between the button and the name. */
const NAME_GAP = 10;
const SIZE_WIDTH = 80;
const COLOR_WIDTH = 120;

/**
 * Mantine's heights, which it only defines inside its components: a format
 * button's (ActionIcon "md") and an "xs" field's.
 */
const BUTTON_HEIGHT = "calc(1.75rem * var(--mantine-scale))";
const FIELD_HEIGHT = "calc(1.875rem * var(--mantine-scale))";

/** The button's background, darker than the row's (ROW_BACKGROUND). */
const BUTTON_BACKGROUND = "var(--milo-control-bg)";

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

/** A setting of a row's "formats": its button shows the icon, and is green when on. */
export interface FormatSetting {
  label: string;
  icon: ComponentType<{ size?: number }>;
  value: boolean;
  onChange: (value: boolean) => void;
}

/** A size in pixels, set in a row. */
export interface SizeSetting {
  value: number;
  defaultValue: number;
  min: number;
  max: number;
  /** Empty when the field is. */
  onChange: (value: number | "") => void;
  /**
   * When a row carries several: what tells them apart — the field's
   * prefix, an arrow for a padding's top or bottom —, and what its label
   * says ("du padding haut").
   */
  prefix?: string;
  what?: string;
  /** What follows the value: " px" by default, " %" for a share. */
  suffix?: string;
}

export interface SettingRow {
  name: string;
  /** "du titre", "de la marge haute": what the field labels say. */
  what: string;
  /** "alpha": the color carries its transparency — a chart's fill. */
  color?: { value: string; onChange: (value: string) => void; alpha?: boolean };
  /**
   * Several colors side by side, aligned right — a theme color's dark and
   * light values —, each told apart by what its label says.
   */
  colors?: { value: string; onChange: (value: string) => void; alpha?: boolean; what: string }[];
  /** A line under the name: what the setting applies to. */
  hint?: string;
  size?: SizeSetting;
  /** Several sizes side by side, aligned right — a padding's top and bottom. */
  sizes?: SizeSetting[];
  /** A setting that turns on or off — a widget's frame —, aligned right. */
  toggle?: { value: boolean; onChange: (value: boolean) => void };
  /** One option among a few — an alignment —, side by side, aligned right. */
  choice?: {
    value: string;
    data: { value: string; label: string }[];
    onChange: (value: string) => void;
  };
  /**
   * Settings that each turn on or off, as buttons side by side — a text's
   * bold, italic, underline —, aligned right.
   */
  formats?: FormatSetting[];
  /** True when one of the row's settings differs from the default. */
  modified: boolean;
  reset: () => void;
}

/**
 * The row's button, on the left: it resets all its settings to the default.
 * Also that of the e-mail templates' rows (MailTemplates).
 */
export function Reset({
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
  alpha = false,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  alpha?: boolean;
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
      format={alpha ? "hexa" : "hex"}
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
  first = true,
}: {
  size: SizeSetting;
  label: string;
  /** The first of the row's sizes: it pushes them all to the right. */
  first?: boolean;
}) {
  const [input, setInput] = useState(false);
  return (
    <NumberInput
      size="xs"
      radius={ROUNDING}
      w={SIZE_WIDTH}
      style={first ? { marginLeft: "auto" } : undefined}
      placeholder={String(size.defaultValue)}
      prefix={size.prefix ? `${size.prefix} ` : undefined}
      suffix={size.suffix ?? " px"}
      min={size.min}
      max={size.max}
      allowDecimal={false}
      allowNegative={false}
      aria-label={label}
      value={size.value}
      onChange={(v) => size.onChange(v === "" ? "" : Number(v))}
      {...numberKeys(size.onChange)}
      onFocus={() => setInput(true)}
      onBlur={() => setInput(false)}
      styles={input ? { input: INPUT_STYLE } : undefined}
    />
  );
}

/** The width of a row's color field: column headers line up with it. */
export const COLOR_FIELD_WIDTH = COLOR_WIDTH;

export default function SettingRows({
  label,
  description,
  rows,
  nameWidth = NAME_WIDTH,
}: {
  label: string;
  description?: string;
  rows: SettingRow[];
  /** The width of the names, when they are longer than a widget's. */
  nameWidth?: number;
}) {
  return (
    <Input.Wrapper label={label} description={description} inputWrapperOrder={["label", "description", "input"]}>
      <Stack gap={1}>
        {rows.map((l, rank) => (
          <Group
            // Two rows may share a name — an attribute's color, then its
            // alignment —: what they set tells them apart.
            key={`${l.name}|${l.what}`}
            gap="sm"
            wrap="nowrap"
            // The button, at the start, sits against the left edge like the
            // last field against the right one.
            style={{
              ...rowStyle(rank, rows.length, false),
              paddingLeft: ROW_INSET,
              // A row with a choice keeps a field's height: the one that
              // appears with an option — a height's value — doesn't enlarge it.
              ...(l.choice && {
                minHeight: `calc(${FIELD_HEIGHT} + ${2 * ROW_INSET}px)`,
              }),
            }}
          >
            <Reset
              active={l.modified}
              what={l.what}
              onClick={l.reset}
            />
            <Text
              component="div"
              size="sm"
              w={nameWidth}
              style={{
                flexShrink: 0,
                marginLeft: `calc(${NAME_GAP}px - var(--mantine-spacing-sm))`,
              }}
            >
              {l.name}
              {l.hint && (
                <Text size="xs" c="dimmed">
                  {l.hint}
                </Text>
              )}
            </Text>
            {l.color && (
              <Color
                value={l.color.value}
                onChange={l.color.onChange}
                alpha={l.color.alpha}
                label={`Couleur ${l.what}`}
              />
            )}
            {l.colors && (
              <Group gap="sm" wrap="nowrap" style={{ marginLeft: "auto" }}>
                {l.colors.map((c) => (
                  <Color
                    key={c.what}
                    value={c.value}
                    onChange={c.onChange}
                    alpha={c.alpha}
                    label={`Couleur ${c.what}`}
                  />
                ))}
              </Group>
            )}
            {l.size && (
              <Size size={l.size} label={`Taille ${l.what}`} />
            )}
            {l.sizes?.map((size, rank) => (
              <Size
                key={rank}
                size={size}
                label={`Taille ${size.what ?? l.what}`}
                first={rank === 0}
              />
            ))}
            {l.choice && (
              <SegmentedControl
                size="xs"
                color="teal"
                radius="xs"
                data={l.choice.data}
                // The chosen option fills the control to its edges, in green on
                // the others' gray.
                styles={{
                  root: { padding: 0, backgroundColor: SEGMENTS_BG },
                  indicator: { borderRadius: "var(--sc-radius)" },
                  // As tall as the format buttons (ActionIcon "md").
                  label: {
                    borderRadius: "var(--sc-radius)",
                    height: BUTTON_HEIGHT,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  },
                }}
                value={l.choice.value}
                onChange={l.choice.onChange}
                // A click on the option already shown still chooses it: the
                // default one shows without being chosen — a horizontal "Gauche"
                // that must then really apply.
                onClickCapture={(e) => {
                  const choice = l.choice!;
                  const label = (e.target as HTMLElement).closest("label")?.textContent;
                  const option = choice.data.find((o) => o.label === label);
                  if (option?.value === choice.value) choice.onChange(option.value);
                }}
                aria-label={l.name}
                // After a field — a height's value —, it follows it; alone, it
                // goes to the right.
                style={{ marginLeft: l.size || l.sizes ? undefined : "auto", marginRight: 1 }}
              />
            )}
            {l.formats && (
              <Group gap={4} wrap="nowrap" style={{ marginLeft: "auto" }}>
                {l.formats.map((f) => (
                  <Tooltip key={f.label} label={f.label}>
                    <ActionIcon
                      variant="filled"
                      radius={3}
                      aria-label={f.label}
                      aria-pressed={f.value}
                      onClick={() => f.onChange(!f.value)}
                      style={{
                        backgroundColor: f.value ? GREEN : BUTTON_BACKGROUND,
                        color: f.value ? "#ffffff" : "var(--mantine-color-text)",
                      }}
                    >
                      <f.icon size={16} />
                    </ActionIcon>
                  </Tooltip>
                ))}
              </Group>
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
