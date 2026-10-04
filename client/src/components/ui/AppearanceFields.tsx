import { count, text } from "../../widgets/types";
import { insertRow, type SettingRow } from "./SettingRows";
import { BACKGROUND, TITLE, VALUE, type CardText } from "./IndicatorTitle";

// L'allure de la carte d'un indicateur, en lignes du bloc « Apparence »
// (LignesReglages) : le titre et la valeur règlent leur couleur et leur
// taille ; le fond, sa seule couleur. Le registre (board-widgets) y ajoute le
// cadre et les marges, communs à tous les widgets.

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
 * Les lignes de la carte d'un indicateur : le titre, la valeur pour un
 * indicateur qui compte, puis le fond.
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
