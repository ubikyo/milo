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
import { lignesMarges, lignesMargesPour, margesDe, margesReglees } from "../widgets/marges";
import encart from "../assets/styles/AccessNumero.module.css";
import { lignesApparence } from "../components/ui/ChampsApparence";
import LignesReglages, { ligneCadre } from "../components/ui/LignesReglages";
import { ENCADRE, estEncadre, type AccessWidget } from "../widgets/types";
import { ECART } from "../components/ui/IndicatorsPanel";
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
 * Les champs d'un widget du mode Accès : les siens, puis le bloc
 * « Apparence » — ses lignes à lui, son cadre et ses marges, communs à tous —, puis ceux qu'il pose tout en bas — l'interrupteur d'un lien.
 * Le tiroir ne connaît pas ses voisins : les marges proposées par défaut sont
 * celles d'un widget seul dans sa colonne.
 */
const champsDe = (widget: AccessWidget): ComponentType<IndicatorConfigProps> =>
  function Champs({ config, onChange }: IndicatorConfigProps) {
    const objet = (config ?? {}) as Record<string, unknown>;
    return (
      <Stack gap="xl">
        <widget.Config config={config} onChange={onChange} />
        {/* Ses lignes d'apparence, puis les marges, en un seul bloc. */}
        <LignesReglages
          label="Apparence"
          lignes={[
            ...(widget.apparence?.(config, onChange) ?? []),
            ligneCadre(
              config,
              onChange,
              ENCADRE,
              estEncadre(config, widget.cadreParDefaut),
              widget.cadreParDefaut ?? false,
            ),
            ...lignesMarges(widget, objet, onChange, { previousType: null, nextType: null }),
          ]}
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
  afficher: (_donnees, config, { id, onChange, locked }) =>
    encadrer(
      <widget.Display
        blockId={id}
        config={config}
        onChange={onChange}
        onEdit={() => {}}
        locked={locked}
      />,
      // Un widget qui dessine son cadre lui-même n'en reçoit pas un second.
      !widget.cadrePropre && estEncadre(config, widget.cadreParDefaut),
    ),
});

/**
 * Le cadre que le registre pose autour d'un widget qui ne le dessine pas
 * lui-même : l'encart des attributs, sans trait — celui des horloges et des
 * flux encadrés.
 */
const encadrer = (contenu: ReactNode, encadre: boolean): ReactNode =>
  encadre ? (
    <Box className={encart.encart} style={{ border: "none" }}>
      {contenu}
    </Box>
  ) : (
    contenu
  );

/** L'air d'un indicateur tant que rien n'est réglé : la moitié de leur écart, de chaque côté. */
const MARGES_INDICATEUR = { haute: ECART / 2, basse: ECART / 2 };

/**
 * Le bloc « Apparence » d'un indicateur : sa carte — titre, valeur, fond —
 * s'il en a une, son cadre, ses marges. Une carte est encadrée tant que rien
 * n'est réglé ; une liste, qui garde ses clics, ne l'est pas.
 */
const apparenceDe = (w: IndicatorWidgetBase<string>): ComponentType<IndicatorConfigProps> =>
  function Apparence({ config, onChange }: IndicatorConfigProps) {
    const carte = !w.ownClicks;
    return (
      <LignesReglages
        label="Apparence"
        lignes={[
          ...(carte ? lignesApparence(config, onChange, w.avecValeur) : []),
          ligneCadre(config, onChange, ENCADRE, estEncadre(config, carte), carte),
          ...lignesMargesPour(MARGES_INDICATEUR, config, onChange),
        ]}
      />
    );
  };

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
      // Le cadre et les marges, comme pour tous les widgets : une carte
      // est déjà encadrée par le panneau (IndicatorsPanel) ; une liste l'est
      // ici, à la demande.
      Apparence: apparenceDe(w),
      marges: (config) => margesReglees(config, MARGES_INDICATEUR),
      afficher: (donnees, config, rendu) =>
        encadrer(afficher(w, donnees, config, rendu), Boolean(w.ownClicks) && estEncadre(config)),
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
