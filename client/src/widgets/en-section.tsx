import { Stack } from "@mantine/core";
import { categorieWidget } from "./categorie";
import { horlogeWidget } from "./horloge";
import { lienWidget } from "./lien";
import { margesDe } from "./marges";
import { numeroWidget } from "./numero";
import { sousCategorieWidget } from "./sous-categorie";
import type { IndicatorConfigProps } from "../indicators/types";
import type { AccessWidget, Marges } from "./types";
import type { ComponentType } from "react";
import type { AccessBlockType } from "@milo/shared";

// Des widgets du mode Accès, prêts à se poser dans les sections des autres
// modes — Support, Assets, Projet, Tâche : les titres, le lien, les attributs
// et l'horloge. Ce sont les mêmes : même affichage, mêmes champs, et l'air
// qu'ils laissent entre eux. Seul change ce que la section leur passe — ni
// élément d'accès, ni tiroir à ouvrir d'eux-mêmes : le leur s'ouvre par le
// clic droit, sans les marges réglables, qui n'appartiennent qu'au mode Accès.

/** Ce que les sections des autres modes passent à un widget d'accès. */
export interface AffichageAcces {
  config: unknown;
  onChange?: (config: Record<string, unknown>) => void | Promise<void>;
  locked?: boolean;
}

/** Un widget du mode Accès, en widget des sections d'un autre mode. */
export interface WidgetEnSection<Type extends string, P extends AffichageAcces> {
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
  marges: (config: unknown, previousType: string | null, nextType: string | null) => Marges;
  hidden?: (config: unknown, locked: boolean) => boolean;
}

/** Les champs du tiroir d'accès, ceux du bas compris : l'interrupteur d'un lien. */
const champsDe = (widget: AccessWidget): ComponentType<IndicatorConfigProps> => {
  const { Config, ConfigFin } = widget;
  if (!ConfigFin) return Config;
  return function Champs(props: IndicatorConfigProps) {
    return (
      <Stack gap="xl">
        <Config {...props} />
        <ConfigFin {...props} />
      </Stack>
    );
  };
};

const enSection = <Type extends string, P extends AffichageAcces>(
  widget: AccessWidget,
): WidgetEnSection<Type, P> => ({
  type: widget.type as Type,
  kind: widget.kind,
  label: widget.label,
  icon: widget.icon,
  defaultConfig: widget.defaultConfig,
  Config: champsDe(widget),
  ownClicks: true,
  ...(widget.inlineEdit ? { inlineEdit: true as const } : {}),
  // Les types des autres modes ne sont pas ceux de l'accès, mais les titres
  // et les attributs y portent le même nom : l'air se décide pareil.
  marges: (config, previousType, nextType) =>
    margesDe(widget, config, {
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
export const widgetsDAcces = <Type extends string, P extends AffichageAcces>(): WidgetEnSection<
  Type,
  P
>[] =>
  [categorieWidget, sousCategorieWidget, lienWidget, numeroWidget, horlogeWidget].map((w) =>
    enSection<Type, P>(w),
  );
