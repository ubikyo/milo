// Le registre de tous les widgets qu'un tableau peut porter. Un seul endroit
// les connaît : le tiroir des widgets y prend sa liste, le panneau du tableau
// l'affichage de chacun, le tiroir de réglage ses champs.
//
// Il réunit les registres d'origine : ceux du mode Accès (widgets/), communs
// à toutes les vues, et ceux du Support, des Assets, des projets et des
// tâches. Ces derniers se rangent en base sous un préfixe — « support.list »,
// « project.labels » — : deux d'entre eux portaient le même nom, chacun dans
// son panneau.

import { Stack } from "@mantine/core";
import type { ComponentType, ReactNode } from "react";
import { COMMON_WIDGET_TYPES } from "@milo/shared";
import type { AccessBlockType, Asset, Id, Project, SupportRequest, TaskList } from "@milo/shared";
import { ASSET_INDICATORS } from "../asset-indicators";
import { INDICATORS } from "../indicators";
import type { IndicatorConfigProps } from "../indicators/types";
import { PROJECT_INDICATORS } from "../project-indicators";
import { TASK_INDICATORS } from "../task-indicators";
import { WIDGETS } from "../widgets";
import { ChampsMarges, margesDe } from "../widgets/marges";
import type { AccessWidget } from "../widgets/types";
import type { IndicatorWidgetBase, RenduWidget } from "../components/ui/IndicatorsPanel";

/** Ce qu'un tableau met à la disposition de ses widgets : ses données, filtrées par lui. */
export interface DonneesDuTableau {
  requests: SupportRequest[];
  projects: Project[];
  lists: TaskList[];
  assets: Asset[];
  /** Le compte connecté : ce qui « me » revient se compte par lui. */
  userId: Id;
}

/** Un widget de tableau : ce que tout widget porte, et de quoi l'afficher. */
export interface WidgetDeTableau extends IndicatorWidgetBase<string> {
  /** La largeur de son tiroir, quand ses champs ne tiennent pas dans celle de tous. */
  drawerSize?: number;
  /** Ce que la section montre de lui. */
  afficher: (donnees: DonneesDuTableau, config: unknown, rendu: RenduWidget) => ReactNode;
}

const COMMUNS = new Set<string>(COMMON_WIDGET_TYPES);

/**
 * Les champs d'un widget du mode Accès : les siens, les marges qu'il laisse
 * autour de lui, puis ceux qu'il pose tout en bas — l'interrupteur d'un lien.
 * Le tiroir ne connaît pas ses voisins : les marges proposées par défaut sont
 * celles d'un widget seul dans sa colonne.
 */
const champsDe = (widget: AccessWidget): ComponentType<IndicatorConfigProps> =>
  function Champs({ config, onChange }: IndicatorConfigProps) {
    const objet = (config ?? {}) as Record<string, unknown>;
    return (
      <Stack gap="xl">
        <widget.Config config={config} onChange={onChange} />
        <ChampsMarges
          widget={widget}
          config={objet}
          onChange={onChange}
          voisins={{ previousType: null, nextType: null }}
        />
        {widget.ConfigFin && <widget.ConfigFin config={config} onChange={onChange} />}
      </Stack>
    );
  };

/** Un widget du mode Accès, en widget de tableau. */
const deLAcces = (widget: AccessWidget): WidgetDeTableau => ({
  type: widget.type,
  kind: widget.kind,
  label: widget.label,
  icon: widget.icon,
  defaultConfig: widget.defaultConfig,
  Config: champsDe(widget),
  // Les titres gardent leur double-clic, le lien son clic, et les autres
  // ont déjà leur encart : aucun ne se pose dans la carte des indicateurs.
  ownClicks: true,
  ...(widget.inlineEdit ? { inlineEdit: true } : {}),
  ...(widget.drawerSize ? { drawerSize: widget.drawerSize } : {}),
  ...(widget.hidden ? { hidden: widget.hidden } : {}),
  marges: (config, previousType, nextType) =>
    margesDe(widget, config, {
      previousType: previousType as AccessBlockType | null,
      nextType: nextType as AccessBlockType | null,
    }),
  afficher: (_donnees, config, { id, onChange, locked }) => (
    <widget.Display
      blockId={id}
      config={config}
      onChange={onChange}
      onEdit={() => {}}
      locked={locked}
    />
  ),
});

/**
 * Les widgets propres à un type de données, sous leur préfixe. Les widgets
 * communs que leur registre reprenait du mode Accès n'y sont pas : ils
 * viennent une fois, du mode Accès lui-même.
 */
const propres = <W extends IndicatorWidgetBase<string>>(
  prefixe: string,
  widgets: W[],
  afficher: (widget: W, donnees: DonneesDuTableau, config: unknown, rendu: RenduWidget) => ReactNode,
): WidgetDeTableau[] =>
  widgets
    .filter((w) => !COMMUNS.has(w.type))
    .map((w) => ({
      ...w,
      type: `${prefixe}.${w.type}`,
      afficher: (donnees, config, rendu) => afficher(w, donnees, config, rendu),
    }));

/** Dans l'ordre où le tiroir des widgets les présente, groupés par type. */
export const WIDGETS_DE_TABLEAU: WidgetDeTableau[] = [
  ...WIDGETS.map(deLAcces),
  ...propres("project", PROJECT_INDICATORS, (w, d, config, rendu) => (
    <w.Display config={config} projects={d.projects} userId={d.userId} {...rendu} />
  )),
  ...propres("task", TASK_INDICATORS, (w, d, config, rendu) => (
    <w.Display config={config} lists={d.lists} userId={d.userId} {...rendu} />
  )),
  ...propres("support", INDICATORS, (w, d, config, rendu) => (
    <w.Display config={config} requests={d.requests} userId={d.userId} {...rendu} />
  )),
  ...propres("asset", ASSET_INDICATORS, (w, d, config, rendu) => (
    <w.Display config={config} assets={d.assets} {...rendu} />
  )),
];

const PAR_TYPE = new Map(WIDGETS_DE_TABLEAU.map((w) => [w.type, w]));

/**
 * Le widget qui sait lire ce type, ou « undefined » : un type rangé par une
 * version qui en connaissait un de plus n'a pas à faire tomber la page.
 */
export const widgetDeTableau = (type: string): WidgetDeTableau | undefined => PAR_TYPE.get(type);

/** Les conversions permises : la catégorie et la sous-catégorie partagent leur configuration. */
export const CONVERSIONS: Record<string, string> = {
  category: "subcategory",
  subcategory: "category",
};
