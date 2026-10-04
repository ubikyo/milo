import { Box, Menu, Stack, UnstyledButton } from "@mantine/core";
import { IconCopy, IconCopyPlus, IconPencil, IconTrash } from "@tabler/icons-react";
import { useRef, useState, type ComponentType, type ReactNode } from "react";
import inset from "../../assets/styles/AccessNumero.module.css";
import { withField, isFramed, text } from "../../widgets/types";
import { useWidgetAccess } from "../../lib/droits";
import { RED } from "../../themes/colors";
import { copyWidget, useCopiedWidget } from "../../lib/presse-papiers";
import { errorMessage, notifyError } from "../../lib/errors";
import { notifications } from "@mantine/notifications";
import DeleteConfirmModal from "./DeleteConfirmModal";
import { LIST_ITEMS } from "../../lib/listes";
import IndicatorDrawer from "./IndicatorDrawer";
import PointMenu, { menuPosition, type PointMenuPosition } from "./PointMenu";
import SectionsBoard from "./SectionsBoard";
import { IndicatorCardContext, BACKGROUND, NAME } from "./TitreIndicateur";
import { InsertionLine, useWidgetDrop, type WidgetDrag } from "./WidgetDrop";
import type { PanelSections } from "../../api";
import type { IndicatorConfigProps } from "../../indicators/types";
import { isListWidgetType } from "@milo/shared";
import type { Id, IndicatorSection } from "@milo/shared";
import type { WidgetKind } from "../../widgets/genres";

/** L'écart entre deux indicateurs d'une section. */
export const GAP = 20;

/** La hauteur d'un indicateur : son nom en haut, la quantité en bas. */
const HEIGHT = 120;

/** Un indicateur rangé, quel que soit son panneau. */
export interface Indicator<Type extends string> {
  id: Id;
  section_id: Id;
  type: Type;
  config: Record<string, unknown>;
}

/** Le nom d'un widget : celui qu'on lui a donné, sinon celui de son type. */
const titleOf = (indicator: { config: Record<string, unknown> }, defaultValue: string): string => {
  const name = indicator.config[NAME];
  return (typeof name === "string" && name.trim()) || defaultValue;
};

/** Ce que tout widget d'un panneau porte ; son affichage, lui, dépend du panneau. */
export interface IndicatorWidgetBase<Type extends string> {
  /** Ce que la base range : il ne change jamais. */
  type: Type;
  /** Son type : le groupe où le tiroir des widgets le range (widgets/genres.ts). */
  kind: WidgetKind;
  /** Son nom dans le tiroir des widgets, et en titre de son tiroir. */
  label: string;
  icon: ComponentType<{ size?: number }>;
  /** La configuration d'un indicateur neuf. */
  defaultConfig: Record<string, unknown>;
  /**
   * Les champs de son tiroir. Le tiroir lui-même est commun à tous. Sans
   * champs, le widget n'a que son nom à régler : choisi, il s'ajoute
   * aussitôt, sous le nom de son type, et n'a pas de tiroir : son nom se
   * change au double-clic sur son titre.
   */
  Config?: ComponentType<IndicatorConfigProps>;
  /**
   * Vrai quand le widget prend ses clics en charge — une liste, dont chaque
   * ligne ouvre ce qu'elle montre. Il se pose alors sans cadre de carte, et
   * son tiroir ne s'ouvre que par le clic droit, hors de ses lignes.
   */
  ownClicks?: boolean;
  /**
   * Vrai quand le widget montre une valeur — un nombre de tickets, de cartes,
   * de projets, de postes : son tiroir en propose la taille.
   */
  withValue?: boolean;
  /**
   * Vrai quand le widget occupe toute la hauteur que sa section lui laisse —
   * les listes de projets, de tâches, de demandes, de postes —, s'il est le
   * dernier de sa section ; suivi d'un autre, il s'en tient à son contenu.
   */
  fill?: boolean;
  /**
   * Vrai quand le widget se nomme à même la section — une catégorie, une
   * sous-catégorie : choisi, il s'ajoute aussitôt, sans tiroir, et attend
   * qu'on le renseigne au double-clic.
   */
  inlineEdit?: boolean;
  /**
   * L'air qu'il laisse au-dessus et au-dessous de lui, selon le type de ses
   * voisins — les widgets du mode Accès (widgets/en-section.tsx), serrés entre
   * eux comme dans une colonne d'accès. Entre deux widgets qui le disent,
   * c'est leur air qui les sépare ; sinon, l'écart des indicateurs.
   */
  margins?: (
    config: unknown,
    previousType: string | null,
    nextType: string | null,
  ) => { top: number; bottom: number };
  /**
   * Le bloc « Apparence » de son tiroir, sous ses propres champs : la carte,
   * le cadre et les marges (board-widgets).
   */
  Appearance?: ComponentType<IndicatorConfigProps>;
  /** Vrai quand il ne doit pas paraître — un lien éteint, une fois verrouillé. */
  hidden?: (config: unknown, locked: boolean) => boolean;
  /** La largeur de son tiroir, quand ses champs ne tiennent pas dans celle de tous. */
  drawerSize?: number;
}

/** Ce que le panneau passe au rendu d'un widget, en plus de sa configuration. */
export interface WidgetRender {
  /** L'identifiant du widget : ceux que le serveur relève (RSS) se lisent par lui. */
  id: Id;
  /** Enregistre une configuration modifiée sur place ; sans effet verrouillé. */
  onChange: (config: Record<string, unknown>) => void | Promise<void>;
  locked: boolean;
}

/** Les écritures d'un panneau, vers ses routes. */
export interface IndicatorsApi<Type extends string> {
  /** Rend l'indicateur créé : il se pose au bout de sa section. */
  create: (data: {
    section_id: Id;
    type: Type;
    config: Record<string, unknown>;
  }) => Promise<{ id: Id }>;
  update: (id: Id, data: { config: Record<string, unknown> }) => Promise<unknown>;
  remove: (id: Id) => Promise<unknown>;
  /** Ce que la section porte désormais, dans l'ordre. */
  reorder: (sectionId: Id, ids: Id[]) => Promise<unknown>;
  sections: PanelSections;
}

// Les sections d'un mode qui liste — les demandes du Support, les postes des
// Assets, les projets, les listes de tâches — et ce qu'elles portent. La liste y est un widget comme les
// indicateurs : il n'y a plus de liste à gauche et de panneau à droite, tout
// se range en sections (SectionsBoard), comme au mode Accès. Chaque section a
// sa largeur, se glisse par sa poignée et s'ajoute par le « + » de l'écart.
// Le clic sur un indicateur ouvre son tiroir, le clic droit le modifie ou le
// supprime, et chaque widget se glisse d'une place ou d'une section à
// l'autre. Verrouillé, l'écran se lit seulement.
interface IndicatorsPanelProps<Type extends string, P extends IndicatorWidgetBase<Type>> {
  /** « null » tant que les sections ne sont pas lues. */
  sections: IndicatorSection[] | null;
  indicators: Indicator<Type>[];
  /** Les widgets du panneau, dans l'ordre du tiroir des widgets. */
  widgets: P[];
  widgetOf: (type: Type) => P | undefined;
  /** Ce que le widget montre : c'est le panneau qui sait quoi lui passer. */
  render: (widget: P, config: unknown, widgetRender: WidgetRender) => ReactNode;
  api: IndicatorsApi<Type>;
  onChanged: () => void | Promise<void>;
  locked: boolean;
  /** Déverrouiller l'écran : voir SectionsBoard. */
  onUnlock?: () => void | Promise<void>;
  /** Dupliquer un widget : la copie se pose sous l'original. Sans lui, le menu ne le propose pas. */
  onDuplicate?: (indicator: Indicator<Type>) => Promise<unknown>;
  /**
   * Ce en quoi un type se convertit — la catégorie en sous-catégorie —, et
   * de quoi le faire. Sans lui, le menu ne propose pas de conversion.
   */
  conversion?: {
    to: Partial<Record<string, Type>>;
    convert: (indicator: Indicator<Type>, type: Type) => Promise<unknown>;
  };
  /**
   * Des gestes de plus au clic droit d'un widget, qui ne le remanient pas :
   * créer une tâche depuis un lien. Ils restent proposés quand le widget est
   * figé. Rien à proposer : « null ».
   */
  extraMenu?: (indicator: Indicator<Type>, close: () => void) => ReactNode;
}

export default function IndicatorsPanel<Type extends string, P extends IndicatorWidgetBase<Type>>({
  sections,
  indicators,
  widgets,
  widgetOf,
  render,
  api,
  onChanged,
  locked,
  onUnlock,
  onDuplicate,
  conversion,
  extraMenu,
}: IndicatorsPanelProps<Type, P>) {
  const access = useWidgetAccess();
  // Le widget copié, qu'on colle au bout d'une section : seulement un type
  // que ce panneau connaît et que le compte peut poser.
  const copy = useCopiedWidget();
  const toPaste = copy ? widgetOf(copy.type as Type) : undefined;
  const pastable = copy && toPaste && access(toPaste.kind) === "update" ? copy : null;
  const [drawerOpen, setDrawerOpened] = useState(false);
  const [modified, setModified] = useState<Indicator<Type> | null>(null);
  /** Le widget posé depuis le tiroir de gauche, en attente de ses réglages. */
  const [created, setCreated] = useState<{ widget: P; sectionId: Id; index: number } | null>(null);

  const [menu, setMenu] = useState<{
    indicator: Indicator<Type>;
    position: PointMenuPosition;
  } | null>(null);
  const [toDelete, setToDelete] = useState<Indicator<Type> | null>(null);

  /** Écrire, puis relire quoi qu'il arrive : c'est la lecture qui fait foi. */
  const write = async (writing: () => Promise<unknown>) => {
    try {
      await writing();
    } finally {
      await onChanged();
    }
  };

  const indicatorsOf = (section: IndicatorSection) =>
    indicators.filter((i) => i.section_id === section.id);

  const remove = async () => {
    const indicator = toDelete;
    setToDelete(null);
    if (indicator) await write(() => api.remove(indicator.id));
  };

  /**
   * Créer, puis ranger à la place visée : la création pose au bout de la
   * section.
   */
  const createAt = async (
    data: { section_id: Id; type: Type; config: Record<string, unknown> },
    index: number,
  ) => {
    const created = await api.create(data);
    const ids = indicators.filter((i) => i.section_id === data.section_id).map((i) => i.id);
    if (index < ids.length) {
      await api.reorder(data.section_id, [...ids.slice(0, index), created.id, ...ids.slice(index)]);
    }
    return created;
  };

  /**
   * Un widget posé depuis le tiroir de gauche. Sans réglages, ou nommé sur
   * place, il est créé aussitôt ; sinon son tiroir s'ouvre, et il ne naît
   * qu'à l'enregistrement — à la place où il a été posé.
   */
  const insertRow = async (section: IndicatorSection, type: string, index: number) => {
    const widget = widgets.find((w) => w.type === type);
    if (!widget) return;
    if (!widget.Config || widget.inlineEdit) {
      await write(() =>
        createAt({ section_id: section.id, type: widget.type, config: widget.defaultConfig }, index),
      );
      return;
    }
    setModified(null);
    setCreated({ widget, sectionId: section.id, index });
    setDrawerOpened(true);
  };

  // Un widget sans champs à lui naît sans tiroir (poser), mais en a un
  // ensuite : son apparence — cadre, marges — se règle comme celle de tous.
  // Seul un widget qui n'aurait ni l'un ni l'autre n'en a pas.
  const hasDrawer = (indicator: Indicator<Type>) => {
    const widget = widgetOf(indicator.type);
    return Boolean(widget?.Config || widget?.Appearance);
  };

  const updateStatement = (indicator: Indicator<Type>) => {
    if (!hasDrawer(indicator)) return;
    setCreated(null);
    setModified(indicator);
    setDrawerOpened(true);
  };

  return (
    <>
      <SectionsBoard
        sections={sections}
        locked={locked}
        onUnlock={onUnlock}
        widgetIds={(section) => indicatorsOf(section).map((i) => i.id)}
        renderWidgets={(section, drag) => (
          <SectionIndicators
            section={section}
            indicators={indicatorsOf(section)}
            drag={drag}
            locked={locked}
            widgetOf={widgetOf}
            render={render}
            onChange={(indicator, config) => write(() => api.update(indicator.id, { config }))}
            onOpen={updateStatement}
            onRename={(indicator, name) =>
              write(() => api.update(indicator.id, { config: withField(indicator.config, NAME, name) }))
            }
            onContextMenu={(indicator, position) => setMenu({ indicator, position })}
            withFrozenMenu={(indicator) => Boolean(extraMenu?.(indicator, () => {}))}
          />
        )}
        widgets={widgets}
        onCreateWidget={insertRow}
        onReorderWidgets={(sectionId, ids) => write(() => api.reorder(sectionId, ids))}
        onAddSection={(rank) =>
          write(() => api.sections.create(rank !== undefined ? { index: rank } : {}))
        }
        onDuplicateSection={(section) => write(() => api.sections.duplicate(section.id))}
        // Lâché sur la corbeille : la même question que « Supprimer », pour
        // un widget que le compte peut modifier.
        onDeleteWidget={(id) => {
          const indicator = indicators.find((i) => i.id === id);
          const widget = indicator ? widgetOf(indicator.type) : undefined;
          if (indicator && widget && access(widget.kind) === "update") setToDelete(indicator);
        }}
        paste={
          pastable
            ? {
                label: pastable.label,
                onPaste: (section) =>
                  write(() =>
                    api.create({
                      section_id: section.id,
                      type: pastable.type as Type,
                      config: pastable.config,
                    }),
                  )
                    .then(() => {
                      notifications.show({
                        color: "teal",
                        message: `Widget « ${pastable.label} » collé`,
                      });
                    })
                    .catch((e: unknown) => notifyError(errorMessage(e))),
              }
            : undefined
        }
        onDeleteSection={(section) => write(() => api.sections.remove(section.id))}
        onReorderSections={(ids) => write(() => api.sections.reorder(ids))}
        onChangeSection={(section, change) => write(() => api.sections.update(section.id, change))}
      />

      {menu &&
        (() => {
          const { indicator } = menu;
          const widget = widgetOf(indicator.type);
          // Figé — l'écran verrouillé, ou un type que le compte ne fait que
          // lire —, le widget ne propose que les gestes qui ne le remanient pas.
          const frozen = locked || !widget || access(widget.kind) !== "update";
          const close = () => setMenu(null);
          const extra = extraMenu?.(indicator, close) ?? null;
          const toType = conversion?.to[indicator.type];
          const converted = toType ? widgetOf(toType) : undefined;
          return (
            <PointMenu position={menu.position} onClose={close}>
              {!frozen && hasDrawer(indicator) && (
                <Menu.Item leftSection={<IconPencil size={16} />} onClick={() => updateStatement(indicator)}>
                  Modifier
                </Menu.Item>
              )}
              {/* Un widget de liste possède ses éléments : il ne se duplique pas. */}
              {!frozen && onDuplicate && !isListWidgetType(String(indicator.type)) && (
                <Menu.Item
                  leftSection={<IconCopyPlus size={16} />}
                  onClick={() => {
                    close();
                    void write(() => onDuplicate(indicator));
                  }}
                >
                  Dupliquer
                </Menu.Item>
              )}
              {/* Copier, en modification seulement. Un widget de liste
                  possède ses éléments : il ne se copie pas plus qu'il ne se
                  duplique. */}
              {!locked && widget && !isListWidgetType(String(indicator.type)) && (
                <Menu.Item
                  leftSection={<IconCopy size={16} />}
                  onClick={() => {
                    close();
                    copyWidget({
                      type: String(indicator.type),
                      config: indicator.config,
                      label: titleOf(indicator, widget.label),
                    });
                  }}
                >
                  Copier
                </Menu.Item>
              )}
              {!frozen && conversion && toType && converted && (
                <Menu.Item
                  leftSection={<converted.icon size={16} />}
                  onClick={() => {
                    close();
                    void write(() => conversion.convert(indicator, toType));
                  }}
                >
                  Convertir en {converted.label.toLowerCase()}
                </Menu.Item>
              )}
              {extra}
              {!frozen && (
                <>
                  <Menu.Divider />
                  <Menu.Item
                    color={RED}
                    leftSection={<IconTrash size={16} />}
                    onClick={() => setToDelete(indicator)}
                  >
                    Supprimer
                  </Menu.Item>
                </>
              )}
            </PointMenu>
          );
        })()}

      <DeleteConfirmModal
        opened={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={remove}
        title="Supprimer le widget"
        message={
          <>
            Voulez-vous vraiment supprimer ce widget ?
            {toDelete && LIST_ITEMS[String(toDelete.type)] && (
              <> {LIST_ITEMS[String(toDelete.type)]} seront supprimés avec lui.</>
            )}{" "}
            Cette action est irréversible.
          </>
        }
      />

      <IndicatorDrawer
        opened={drawerOpen}
        onClose={() => setDrawerOpened(false)}
        indicator={modified}
        creating={created?.widget ?? null}
        sectionId={created?.sectionId ?? null}
        widgetOf={widgetOf}
        // La création passe par la place visée.
        api={{ ...api, create: (data) => createAt(data, created?.index ?? Number.MAX_SAFE_INTEGER) }}
        onSaved={async () => {
          setDrawerOpened(false);
          await onChanged();
        }}
      />
    </>
  );
}

interface SectionIndicatorsProps<Type extends string, P extends IndicatorWidgetBase<Type>> {
  section: IndicatorSection;
  indicators: Indicator<Type>[];
  drag: WidgetDrag;
  locked: boolean;
  widgetOf: (type: Type) => P | undefined;
  render: (widget: P, config: unknown, widgetRender: WidgetRender) => ReactNode;
  onChange: (indicator: Indicator<Type>, config: Record<string, unknown>) => Promise<void>;
  onOpen: (indicator: Indicator<Type>) => void;
  onRename: (indicator: Indicator<Type>, name: string) => Promise<void>;
  onContextMenu: (indicator: Indicator<Type>, position: PointMenuPosition) => void;
  /** Vrai quand un widget figé a tout de même des gestes à proposer. */
  withFrozenMenu: (indicator: Indicator<Type>) => boolean;
}

/** Les indicateurs d'une section, en cartes, et le glisser qui les range. */
function SectionIndicators<Type extends string, P extends IndicatorWidgetBase<Type>>({
  section,
  indicators,
  drag,
  locked,
  widgetOf,
  render,
  onChange,
  onOpen,
  onRename,
  onContextMenu,
  withFrozenMenu,
}: SectionIndicatorsProps<Type, P>) {
  const { target, propsOf } = useWidgetDrop(section.id, drag, locked);
  // La permission du compte sur le type de chaque widget.
  const access = useWidgetAccess();
  // Là où le dernier appui a eu lieu. Un widget qui glisse lui-même ce qu'il
  // porte — les listes et les cartes du mode Tâche — le marque
  // « data-no-widget-drag » : le glisser natif du widget n'y part pas.
  const pressTarget = useRef<Element | null>(null);

  // Un widget caché, d'un type inconnu — rangé par une version plus
  // récente — ou d'un type que le compte ne lit pas ne paraît pas, et ne
  // précède ni ne suit personne.
  const visibleItems = indicators.flatMap((indicator) => {
    const widget = widgetOf(indicator.type);
    return widget && access(widget.kind) !== "" && !widget.hidden?.(indicator.config, locked)
      ? [{ indicator, widget }]
      : [];
  });

  /** L'écart entre deux widgets visibles qui se suivent. */
  const gapBetween = (rank: number): number => {
    const before = visibleItems[rank - 1];
    const after = visibleItems[rank];
    if (!before?.widget.margins || !after?.widget.margins) return GAP;
    const typeOf = (r: number) => visibleItems[r]?.indicator.type ?? null;
    return (
      before.widget.margins(before.indicator.config, typeOf(rank - 2), after.indicator.type).bottom +
      after.widget.margins(after.indicator.config, before.indicator.type, typeOf(rank + 1)).top
    );
  };

  if (visibleItems.length === 0) return null;
  // Un widget qui veut toute la hauteur l'obtient de proche en proche : la
  // pile s'étire dans la colonne, et lui dans la pile. Seulement en bas de sa
  // section : suivi d'un autre widget, il s'en tient à son contenu, sans
  // laisser de vide entre eux.
  const fill = (rank: number) =>
    rank === visibleItems.length - 1 && Boolean(visibleItems[rank]?.widget.fill);
  const stretched = fill(visibleItems.length - 1);
  return (
    <Stack gap={0} style={stretched ? { flex: 1, minHeight: 0 } : undefined}>
      {visibleItems.map(({ indicator, widget }, rank) => {
        // Le rang parmi tous : c'est lui que le dépôt range.
        const index = indicators.indexOf(indicator);
        const gapBefore = rank === 0 ? 0 : gapBetween(rank);
        // Figé — l'écran verrouillé, ou un type que le compte ne fait que
        // lire —, un widget ne se glisse, ne s'ouvre ni ne se modifie : un
        // widget qui se modifie sur place ne reçoit rien à enregistrer.
        const frozen = locked || access(widget.kind) !== "update";
        const widgetRender: WidgetRender = {
          id: indicator.id,
          onChange: frozen ? () => {} : (config) => onChange(indicator, config),
          locked: frozen,
        };
        const dragProps = { ...propsOf(indicator.id, index), ...(frozen ? { draggable: false } : {}) };
        // Le menu du clic droit — modifier, supprimer — n'est qu'aux widgets
        // qu'on peut modifier, ou qui ont d'autres gestes à proposer.
        const menuOf = (e: React.MouseEvent<HTMLElement>) => {
          if (frozen && !withFrozenMenu(indicator)) return;
          onContextMenu(indicator, menuPosition(e));
        };
        return (
          <Box
            key={indicator.id}
            {...dragProps}
            onPointerDownCapture={(e) => {
              pressTarget.current = e.target as Element;
            }}
            onDragStart={(e) => {
              if (pressTarget.current?.closest("[data-no-widget-drag]")) {
                e.preventDefault();
                return;
              }
              dragProps.onDragStart(e);
            }}
            style={{
              position: "relative",
              marginTop: gapBefore,
              opacity: drag.dragged === indicator.id ? 0.4 : 1,
              cursor: frozen || widget.ownClicks ? "default" : "grab",
              ...(fill(rank)
                ? { flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }
                : {}),
            }}
          >
            {target?.id === indicator.id && (
              <InsertionLine
                before={target.before}
                gap={target.before ? gapBefore : gapBetween(rank + 1)}
              />
            )}
            {widget.ownClicks ? (
              // Un widget qui garde ses clics — une liste, un titre — se pose
              // tel quel, sans l'encart des indicateurs.
              <Box
                onContextMenu={menuOf}
                style={
                  fill(rank)
                    ? { flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }
                    : undefined
                }
              >
                {render(widget, indicator.config, widgetRender)}
              </Box>
            ) : (
              <IndicatorCardContext.Provider
                value={{
                  openItem: () => !frozen && onOpen(indicator),
                  rename: (name) => (frozen ? Promise.resolve() : onRename(indicator, name)),
                }}
              >
                {/* Une div et non un bouton : le titre s'y change sur place,
                    et une saisie n'a rien à faire dans un bouton. Le fond et
                    le trait sont ceux de l'encart de l'horloge et des
                    numéros du mode Accès. */}
                <UnstyledButton
                  component="div"
                  role="button"
                  tabIndex={0}
                  w="100%"
                  // Sans cadre, la carte perd son fond et son retrait : il ne
                  // reste que son contenu.
                  className={isFramed(indicator.config, true) ? inset.encart : undefined}
                  onClick={() => !frozen && onOpen(indicator)}
                  onContextMenu={menuOf}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    minHeight: HEIGHT,
                    padding: isFramed(indicator.config, true)
                      ? "var(--mantine-spacing-md)"
                      : 0,
                    border: "none",
                    // Le fond choisi dans le tiroir, sinon celui de l'encart.
                    ...(isFramed(indicator.config, true) &&
                      text(indicator.config, BACKGROUND) && {
                      backgroundColor: text(indicator.config, BACKGROUND),
                    }),
                  }}
                >
                  {render(widget, indicator.config, widgetRender)}
                </UnstyledButton>
              </IndicatorCardContext.Provider>
            )}
          </Box>
        );
      })}
    </Stack>
  );
}
