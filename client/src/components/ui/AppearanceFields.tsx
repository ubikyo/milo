import { count, text } from "../../widgets/types";
import { insertRow, type SettingRow } from "./SettingRows";
import { BACKGROUND, TITLE, VALUE, type CardText } from "./IndicatorTitle";
import { themeColor } from "../../lib/themeColors";

// The look of an indicator's card, as rows of the "Apparence" block
// (SettingRows): the title and the value set their color and
// size; the background, its color only. The registry (board-widgets) adds the
// frame and the margins, common to all widgets.
//
// Each color field shows its default, in hexadecimal: the title's white, the
// theme's text color for the value, the inset's for the background — the
// last two in the current scheme. Brought back to it, a color is no longer
// stored: the display keeps following the scheme.

type Config = Record<string, unknown>;


/** Mantine's text color, in the current scheme. */
const textColor = () => themeColor("text");

/** The inset's background (AccessNumber.module.css): dark-8 or gray-1. */
const insetColor = () => themeColor("inset-bg");

/** A color field showing its default; brought back to it, nothing is stored. */
const colorOf = (
  config: unknown,
  key: string,
  defaultColor: string,
  onChange: (config: Config) => void,
) => {
  const color = text(config, key);
  return {
    field: {
      value: color || defaultColor,
      onChange: (v: string) => onChange(insertRow(config, { [key]: v === defaultColor ? "" : v })),
    },
    modified: color !== "" && color !== defaultColor,
  };
};

const textLine = (
  name: string,
  what: string,
  t: CardText,
  config: unknown,
  onChange: (config: Config) => void,
): SettingRow => {
  const size = count(config, t.sizeKey, t.defaultSize);
  const color = colorOf(config, t.colorKey, t.defaultColor ?? textColor(), onChange);
  return {
    name,
    what,
    color: color.field,
    size: {
      value: size,
      defaultValue: t.defaultSize,
      min: t.minSize,
      max: t.maxSize,
      onChange: (v) => onChange(insertRow(config, { [t.sizeKey]: v === t.defaultSize ? "" : v })),
    },
    modified: size !== t.defaultSize || color.modified,
    reset: () => onChange(insertRow(config, { [t.sizeKey]: "", [t.colorKey]: "" })),
  };
};

/**
 * The rows of an indicator's card: the title, the value for an
 * indicator that counts, then the background.
 */
export const appearanceRows = (
  config: unknown,
  onChange: (config: Config) => void,
  withValue?: boolean,
): SettingRow[] => {
  const background = colorOf(config, BACKGROUND, insetColor(), onChange);
  return [
    textLine("Titre", "du titre", TITLE, config, onChange),
    ...(withValue ? [textLine("Valeur", "de la valeur", VALUE, config, onChange)] : []),
    {
      name: "Fond",
      what: "du fond",
      color: background.field,
      modified: background.modified,
      reset: () => onChange(insertRow(config, { [BACKGROUND]: "" })),
    },
  ];
};
