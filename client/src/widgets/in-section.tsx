import { Stack } from "@mantine/core";
import { categoryWidget } from "./category";
import { clockWidget } from "./clock";
import { linkWidget } from "./link";
import { marginsOf } from "./margins";
import { numberWidget } from "./number";
import { subcategoryWidget } from "./subcategory";
import type { IndicatorConfigProps } from "../indicators/types";
import type { AccessWidget, Margins } from "./types";
import type { ComponentType } from "react";
import type { AccessBlockType } from "@milo/shared";

// Des widgets du mode Accès, prêts à se poser dans les sections des autres
// modes — Support, Assets, Projet, Tâche : les titres, le lien, les attributs
// et l'horloge. Ce sont les mêmes : même affichage, mêmes champs, et l'air
// qu'ils laissent entre eux. Seul change ce que la section leur passe — ni
// élément d'accès, ni tiroir à ouvrir d'eux-mêmes : le leur s'ouvre par le
// clic droit, sans les marges réglables, qui n'appartiennent qu'au mode Accès.

/** Ce que les sections des autres modes passent à un widget d'accès. */
export interface AccessDisplay {
  config: unknown;
  onChange?: (config: Record<string, unknown>) => void | Promise<void>;
  locked?: boolean;
}

/** Un widget du mode Accès, en widget des sections d'un autre mode. */
export interface SectionWidget<Type extends string, P extends AccessDisplay> {
  type: Type;
  kind: AccessWidget["kind"];
  label: string;
  icon: AccessWidget["icon"];
  defaultConfig: Record<string, unknown>;
  /** « P » : ce que la section du mode passe à ses widgets ; le widget n'en lit que sa part. */
  Display: ComponentType<P>;
  Config: ComponentType<IndicatorConfigProps>;
  /**
   * Toujours vrai : chacun se pose sans la carte des indicateurs. Le lien
   * garde son clic, les titres leur double-clic, et les attributs et
   * l'horloge ont déjà leur encart.
   */
  ownClicks: true;
  inlineEdit?: true;
  margins: (config: unknown, previousType: string | null, nextType: string | null) => Margins;
  hidden?: (config: unknown, locked: boolean) => boolean;
}

/** Les champs du tiroir d'accès, ceux du bas compris : l'interrupteur d'un lien. */
const fieldsOf = (widget: AccessWidget): ComponentType<IndicatorConfigProps> => {
  const { Config, ConfigEnd } = widget;
  if (!ConfigEnd) return Config;
  return function Fields(props: IndicatorConfigProps) {
    return (
      <Stack gap="xl">
        <Config {...props} />
        <ConfigEnd {...props} />
      </Stack>
    );
  };
};

const inSection = <Type extends string, P extends AccessDisplay>(
  widget: AccessWidget,
): SectionWidget<Type, P> => ({
  type: widget.type as Type,
  kind: widget.kind,
  label: widget.label,
  icon: widget.icon,
  defaultConfig: widget.defaultConfig,
  Config: fieldsOf(widget),
  ownClicks: true,
  ...(widget.inlineEdit ? { inlineEdit: true as const } : {}),
  // Les types des autres modes ne sont pas ceux de l'accès, mais les titres
  // et les attributs y portent le même nom : l'air se décide pareil.
  margins: (config, previousType, nextType) =>
    marginsOf(widget, config, {
      previousType: previousType as AccessBlockType | null,
      nextType: nextType as AccessBlockType | null,
    }),
  ...(widget.hidden ? { hidden: widget.hidden } : {}),
  Display: ({ config, onChange, locked = false }: P) => (
    <widget.Display
      blockId={0}
      config={config}
      onChange={onChange ?? (() => {})}
      onEdit={() => {}}
      locked={locked}
    />
  ),
});

/** Dans l'ordre du tiroir des widgets : les titres, le lien, les attributs, l'horloge. */
export const accessWidgets = <Type extends string, P extends AccessDisplay>(): SectionWidget<
  Type,
  P
>[] =>
  [categoryWidget, subcategoryWidget, linkWidget, numberWidget, clockWidget].map((w) =>
    inSection<Type, P>(w),
  );
