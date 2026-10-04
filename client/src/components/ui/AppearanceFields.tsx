import { count, text } from "../../widgets/types";
import { insertRow, type SettingRow } from "./SettingRows";
import { BACKGROUND, TITLE, VALUE, type CardText } from "./IndicatorTitle";

// The look of an indicator's card, as rows of the "Apparence" block
// (SettingRows): the title and the value set their color and
// size; the background, its color only. The registry (board-widgets) adds the
// frame and the margins, common to all widgets.

type Config = Record<string, unknown>;

const textLine = (
  name: string,
  what: string,
  t: CardText,
  config: unknown,
  onChange: (config: Config) => void,
): SettingRow => {
  const size = count(config, t.sizeKey, t.defaultSize);
  const color = text(config, t.colorKey);
  return {
    name,
    what,
    color: {
      value: color,
      onChange: (v) => onChange(insertRow(config, { [t.colorKey]: v })),
    },
    size: {
      value: size,
      defaultValue: t.defaultSize,
      min: t.minSize,
      max: t.maxSize,
      onChange: (v) =>
        onChange(
          insertRow(config, { [t.sizeKey]: v === t.defaultSize ? "" : v }),
        ),
    },
    modified: size !== t.defaultSize || color !== "",
    reset: () =>
      onChange(insertRow(config, { [t.sizeKey]: "", [t.colorKey]: "" })),
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
  const background = text(config, BACKGROUND);
  return [
    textLine("Titre", "du titre", TITLE, config, onChange),
    ...(withValue ? [textLine("Valeur", "de la valeur", VALUE, config, onChange)] : []),
    {
      name: "Fond",
      what: "du fond",
      color: {
        value: background,
        onChange: (v) => onChange(insertRow(config, { [BACKGROUND]: v })),
      },
      modified: background !== "",
      reset: () => onChange(insertRow(config, { [BACKGROUND]: "" })),
    },
  ];
};
