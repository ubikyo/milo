// Le registre de tous les widgets qu'un tableau peut porter. Un seul endroit
// les connaît : le tiroir des widgets y prend sa liste, le panneau du tableau
// l'affichage de chacun, le tiroir de réglage ses champs.
//
// Il réunit les registres d'origine : ceux du mode Accès (widgets/), communs
// à toutes les vues, et ceux du Support, des Assets, des projets et des
// tâches. Ces derniers se rangent en base sous un préfixe — « support.list »,
// « project.labels » — : deux d'entre eux portaient le même nom, chacun dans
// son panneau.

import { Box, Stack } from "@mantine/core";
import type { ComponentType, ReactNode } from "react";
import { COMMON_WIDGET_TYPES } from "@milo/shared";
import type { AccessBlockType, Asset, Id, Project, SupportRequest, TaskList } from "@milo/shared";
import { ASSET_INDICATORS } from "../asset-indicators";
import { INDICATORS } from "../indicators";
import type { IndicatorConfigProps } from "../indicators/types";
import { PROJECT_INDICATORS } from "../project-indicators";
import { TASK_INDICATORS } from "../task-indicators";
import { WIDGETS } from "../widgets";
import { marginRows, marginRowsFor, marginsOf, configuredMargins } from "../widgets/margins";
import inset from "../assets/styles/AccessNumber.module.css";
import { appearanceRows } from "../components/ui/AppearanceFields";
import SettingRows, { frameRow } from "../components/ui/SettingRows";
import { FRAMED, isFramed, type AccessWidget } from "../widgets/types";
import { GAP } from "../components/ui/IndicatorsPanel";
import type { IndicatorWidgetBase, WidgetRender } from "../components/ui/IndicatorsPanel";

/** Ce qu'un tableau met à la disposition de ses widgets : ses données, filtrées par lui. */
export interface BoardData {
  requests: SupportRequest[];
  projects: Project[];
  lists: TaskList[];
  assets: Asset[];
  /** Le compte connecté : ce qui « me » revient se compte par lui. */
  userId: Id;
}

/** Un widget de tableau : ce que tout widget porte, et de quoi l'afficher. */
export interface BoardWidgetDefinition extends IndicatorWidgetBase<string> {
  /** La largeur de son tiroir, quand ses champs ne tiennent pas dans celle de tous. */
  drawerSize?: number;
  /** Ce que la section montre de lui. */
  show: (data: BoardData, config: unknown, render: WidgetRender) => ReactNode;
}

const COMMON = new Set<string>(COMMON_WIDGET_TYPES);

/**
 * Les champs d'un widget du mode Accès : les siens, puis le bloc
 * « Apparence » — ses lignes à lui, son cadre et ses marges, communs à tous —, puis ceux qu'il pose tout en bas — l'interrupteur d'un lien.
 * Le tiroir ne connaît pas ses voisins : les marges proposées par défaut sont
 * celles d'un widget seul dans sa colonne.
 */
const fieldsOf = (widget: AccessWidget): ComponentType<IndicatorConfigProps> =>
  function Fields({ config, onChange }: IndicatorConfigProps) {
    const subject = (config ?? {}) as Record<string, unknown>;
    return (
      <Stack gap="xl">
        <widget.Config config={config} onChange={onChange} />
        {/* Ses lignes d'apparence, puis les marges, en un seul bloc. */}
        <SettingRows
          label="Apparence"
          rows={[
            ...(widget.appearance?.(config, onChange) ?? []),
            frameRow(
              config,
              onChange,
              FRAMED,
              isFramed(config, widget.defaultFrame),
              widget.defaultFrame ?? false,
            ),
            ...marginRows(widget, subject, onChange, { previousType: null, nextType: null }),
          ]}
        />
        {widget.ConfigEnd && <widget.ConfigEnd config={config} onChange={onChange} />}
      </Stack>
    );
  };

/** Un widget du mode Accès, en widget de tableau. */
const fromAccess = (widget: AccessWidget): BoardWidgetDefinition => ({
  type: widget.type,
  kind: widget.kind,
  label: widget.label,
  icon: widget.icon,
  defaultConfig: widget.defaultConfig,
  Config: fieldsOf(widget),
  // Les titres gardent leur double-clic, le lien son clic, et les autres
  // ont déjà leur encart : aucun ne se pose dans la carte des indicateurs.
  ownClicks: true,
  ...(widget.inlineEdit ? { inlineEdit: true } : {}),
  ...(widget.drawerSize ? { drawerSize: widget.drawerSize } : {}),
  ...(widget.hidden ? { hidden: widget.hidden } : {}),
  margins: (config, previousType, nextType) =>
    marginsOf(widget, config, {
      previousType: previousType as AccessBlockType | null,
      nextType: nextType as AccessBlockType | null,
    }),
  show: (_data, config, { id, onChange, locked }) =>
    frame(
      <widget.Display
        blockId={id}
        config={config}
        onChange={onChange}
        onEdit={() => {}}
        locked={locked}
      />,
      // Un widget qui dessine son cadre lui-même n'en reçoit pas un second.
      !widget.ownFrame && isFramed(config, widget.defaultFrame),
    ),
});

/**
 * Le cadre que le registre pose autour d'un widget qui ne le dessine pas
 * lui-même : l'encart des attributs, sans trait — celui des horloges et des
 * flux encadrés.
 */
const frame = (content: ReactNode, framed: boolean): ReactNode =>
  framed ? (
    <Box className={inset.encart} style={{ border: "none" }}>
      {content}
    </Box>
  ) : (
    content
  );

/** L'air d'un indicateur tant que rien n'est réglé : la moitié de leur écart, de chaque côté. */
const MARGINS_INDICATOR = { top: GAP / 2, bottom: GAP / 2 };

/**
 * Le bloc « Apparence » d'un indicateur : sa carte — titre, valeur, fond —
 * s'il en a une, son cadre, ses marges. Une carte est encadrée tant que rien
 * n'est réglé ; une liste, qui garde ses clics, ne l'est pas.
 */
const appearanceOf = (w: IndicatorWidgetBase<string>): ComponentType<IndicatorConfigProps> =>
  function Appearance({ config, onChange }: IndicatorConfigProps) {
    const card = !w.ownClicks;
    return (
      <SettingRows
        label="Apparence"
        rows={[
          ...(card ? appearanceRows(config, onChange, w.withValue) : []),
          frameRow(config, onChange, FRAMED, isFramed(config, card), card),
          ...marginRowsFor(MARGINS_INDICATOR, config, onChange),
        ]}
      />
    );
  };

/**
 * Les widgets propres à un type de données, sous leur préfixe. Les widgets
 * communs que leur registre reprenait du mode Accès n'y sont pas : ils
 * viennent une fois, du mode Accès lui-même.
 */
const prefixed = <W extends IndicatorWidgetBase<string>>(
  prefix: string,
  widgets: W[],
  show: (widget: W, data: BoardData, config: unknown, render: WidgetRender) => ReactNode,
): BoardWidgetDefinition[] =>
  widgets
    .filter((w) => !COMMON.has(w.type))
    .map((w) => ({
      ...w,
      type: `${prefix}.${w.type}`,
      // Le cadre et les marges, comme pour tous les widgets : une carte
      // est déjà encadrée par le panneau (IndicatorsPanel) ; une liste l'est
      // ici, à la demande.
      Appearance: appearanceOf(w),
      margins: (config) => configuredMargins(config, MARGINS_INDICATOR),
      show: (data, config, render) =>
        frame(show(w, data, config, render), Boolean(w.ownClicks) && isFramed(config)),
    }));

/** Dans l'ordre où le tiroir des widgets les présente, groupés par type. */
export const BOARD_WIDGETS: BoardWidgetDefinition[] = [
  ...WIDGETS.map(fromAccess),
  ...prefixed("project", PROJECT_INDICATORS, (w, d, config, render) => (
    <w.Display config={config} projects={d.projects} userId={d.userId} {...render} />
  )),
  ...prefixed("task", TASK_INDICATORS, (w, d, config, render) => (
    <w.Display config={config} lists={d.lists} userId={d.userId} {...render} />
  )),
  ...prefixed("support", INDICATORS, (w, d, config, render) => (
    <w.Display config={config} requests={d.requests} userId={d.userId} {...render} />
  )),
  ...prefixed("asset", ASSET_INDICATORS, (w, d, config, render) => (
    <w.Display config={config} assets={d.assets} {...render} />
  )),
];

const BY_TYPE = new Map(BOARD_WIDGETS.map((w) => [w.type, w]));

/**
 * Le widget qui sait lire ce type, ou « undefined » : un type rangé par une
 * version qui en connaissait un de plus n'a pas à faire tomber la page.
 */
export const boardWidget = (type: string): BoardWidgetDefinition | undefined => BY_TYPE.get(type);

/** Les conversions permises : la catégorie et la sous-catégorie partagent leur configuration. */
export const CONVERSIONS: Record<string, string> = {
  category: "subcategory",
  subcategory: "category",
};
