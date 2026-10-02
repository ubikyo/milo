import { categorieWidget } from "./categorie";
import { sousCategorieWidget } from "./sous-categorie";
import type { IndicatorConfigProps } from "../indicators/types";
import type { AccessWidget } from "./types";
import type { ComponentType } from "react";

// La catégorie et la sous-catégorie du mode Accès, prêtes à se poser dans les
// sections des modes Support et Assets. Ce sont les mêmes titres : ils se
// nomment au double-clic, là où ils sont, et leur tiroir n'a que le titre.
// Seul change ce que la section leur passe — ni élément d'accès, ni tiroir à
// ouvrir d'eux-mêmes.

/** Ce que les sections du Support et des Assets passent à un titre. */
export interface AffichageTitre {
  config: unknown;
  onChange?: (config: Record<string, unknown>) => void | Promise<void>;
  locked?: boolean;
}

/** Un titre du mode Accès, en widget des sections du Support ou des Assets. */
export interface TitreDeSection<Type extends string, P extends AffichageTitre> {
  type: Type;
  label: string;
  icon: AccessWidget["icon"];
  defaultConfig: Record<string, unknown>;
  /** « P » : ce que la section du mode passe à ses widgets ; le titre n'en lit que sa part. */
  Display: ComponentType<P>;
  Config: ComponentType<IndicatorConfigProps>;
  ownClicks: true;
  inlineEdit: true;
}

const enTitreDeSection = <Type extends string, P extends AffichageTitre>(
  widget: AccessWidget,
): TitreDeSection<Type, P> => ({
  type: widget.type as Type,
  label: widget.label,
  icon: widget.icon,
  defaultConfig: widget.defaultConfig,
  Config: widget.Config,
  ownClicks: true,
  inlineEdit: true,
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

/** La catégorie puis la sous-catégorie, dans l'ordre de la boîte de choix. */
export const titresDeSection = <Type extends string, P extends AffichageTitre>(): TitreDeSection<
  Type,
  P
>[] => [enTitreDeSection<Type, P>(categorieWidget), enTitreDeSection<Type, P>(sousCategorieWidget)];
