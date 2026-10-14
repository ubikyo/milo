import { Box, Menu, Stack, UnstyledButton } from "@mantine/core";
import {
  IconClipboard,
  IconCopy,
  IconCopyPlus,
  IconCut,
  IconPencil,
  IconTrash,
} from "@tabler/icons-react";
import {
  createContext,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
  type ReactNode,
} from "react";
import inset from "../../assets/styles/AccessNumber.module.css";
import { withField, isFramed, text } from "../../widgets/types";
import { paddingStyle, sideMargins } from "../../widgets/margins";
import { useWidgetAccess } from "../../lib/rights";
import { RED } from "../../themes/colors";
import { clearCopiedWidget, copyWidget, useCopiedWidget } from "../../lib/clipboard";
import { errorMessage, notifyError } from "../../lib/errors";
import { notifications } from "@mantine/notifications";
import DeleteConfirmModal from "./DeleteConfirmModal";
import { LIST_ITEMS } from "../../lib/lists";
import IndicatorDrawer from "./IndicatorDrawer";
import PointMenu, { menuPosition, type PointMenuPosition } from "./PointMenu";
import SectionsBoard, { COLUMN_HEIGHT } from "./SectionsBoard";
import { IndicatorCardContext, BACKGROUND, NAME } from "./IndicatorTitle";
import { InsertionLine, useWidgetDrop, type WidgetDrag } from "./WidgetDrop";
import type { PanelSections } from "../../api";
import type { IndicatorConfigProps } from "../../widgets/support/types";
import type { SettingRow } from "./SettingRows";
import { accessIncludes, canUpdate, canUse, isListWidgetType } from "@milo/shared";
import type { Id, IndicatorSection } from "@milo/shared";
import type { WidgetKind } from "../../widgets/kinds";
import { alignmentProps } from "../../widgets/alignment";
import { heightStyle, isPercentHeight, isSized } from "../../widgets/height";
import { rememberDeletion } from "../../lib/undo";

/** The gap between two indicators of a section. */
export const GAP = 20;

/** A framed card's padding — a chart, an indicator — while nothing is set. */
export const CARD_PADDING = 15;

/** An indicator's height: its name at the top, the quantity at the bottom. */
export const CARD_HEIGHT = 120;

/** A stored indicator, whatever its panel. */
export interface Indicator<Type extends string> {
  id: Id;
  section_id: Id;
  type: Type;
  config: Record<string, unknown>;
}

/** A widget's name: the one it was given, otherwise that of its type. */
const titleOf = (indicator: { config: Record<string, unknown> }, defaultValue: string): string => {
  const name = indicator.config[NAME];
  return (typeof name === "string" && name.trim()) || defaultValue;
};

/** What every widget of a panel carries; how it is displayed depends on the panel. */
export interface IndicatorWidgetBase<Type extends string> {
  /** What the database stores: it never changes. */
  type: Type;
  /**
   * Its usual height in pixels, padding and title included: where "Hauteur"
   * starts in px (widgets/height.ts). Failing that, the unit's own default.
   */
  defaultHeight?: (config: unknown) => number;
  /** Its type: the group where the widget drawer files it (widgets/kinds.ts). */
  kind: WidgetKind;
  /** Its name in the widget drawer, and as the title of its own drawer. */
  label: string;
  icon: ComponentType<{ size?: number }>;
  /** La configuration d'un indicateur neuf. */
  defaultConfig: Record<string, unknown>;
  /**
   * The fields of its drawer. The drawer itself is shared by all. Without
   * fields, the widget only has its name to set: once chosen, it is added right
   * away, under its type's name, and has no drawer: its name is changed by
   * double-clicking its title.
   */
  Config?: ComponentType<IndicatorConfigProps>;
  /**
   * True when the widget handles its own clicks — a list, each row of which
   * opens what it shows. It is then placed without a card frame, and its drawer
   * only opens through a right click, outside its rows.
   */
  ownClicks?: boolean;
  /**
   * Its parts' groups of its drawer, in place of the common alignment and
   * texts — a figure's "Nom" and "Valeur" —: it places its content itself, the
   * panel only gives it its place (widgets/alignment.ts).
   */
  ownAlignment?: (
    config: unknown,
    onChange: (config: Record<string, unknown>) => void,
  ) => { label: string; rows: SettingRow[] }[];
  /**
   * True when a widget that counts places its "Widgets associés" field itself
   * (lib/sources.tsx) — the logistics' indicator, whose lists follow its data.
   */
  ownSource?: boolean;
  /**
   * True when a list never has a frame — the appointments, whose gray sections
   * are their own: its drawer offers none.
   */
  frameless?: boolean;
  /** True when its content stays modifiable while the screen is locked (todo). */
  liveContent?: boolean;
  /**
   * True when the widget shows a value — a number of tickets, cards, projects,
   * positions: its drawer offers its size.
   */
  withValue?: boolean;
  /**
   * True when the widget takes all the height its section leaves it — the lists
   * of projects, tasks, requests, positions —, if it is the last one in its
   * section; when followed by another, it sticks to its content.
   */
  fill?: boolean;
  /**
   * True when the widget is named within the section itself — a title: once
   * chosen, it is added right away, without a drawer, and
   * waits to be filled in by double-click.
   */
  inlineEdit?: boolean;
  /**
   * The space it leaves above and below itself, depending on the type of its
   * neighbors — Access mode widgets (widgets/in-section.tsx), tight against
   * each other as in an access column. Between two widgets that say so, it is
   * their own spacing that separates them; otherwise, the indicator gap.
   */
  margins?: (
    config: unknown,
    previousType: string | null,
    nextType: string | null,
  ) => { top: number; bottom: number; collapse?: boolean };
  /**
   * The "Apparence" block of its drawer, under its own fields: the card, the
   * frame and the margins (board-widgets).
   */
  Appearance?: ComponentType<IndicatorConfigProps>;
  /**
   * A chart's colors: the "Apparence du graphique" block of its drawer, under
   * the "Apparence" one.
   */
  chartAppearance?: (config: unknown, onChange: IndicatorConfigProps["onChange"]) => SettingRow[];
  /**
   * The configuration as it is displayed, when it is not the stored one: a
   * title's style replaces its own appearance — its side margins included.
   */
  styled?: (config: unknown) => Record<string, unknown>;
  /** The style it has when it names none (widgets/types.ts). */
  defaultStyle?: string;
  /** True when it must not appear — a disabled link, once locked. */
  hidden?: (config: unknown, locked: boolean) => boolean;
  /** The width of its drawer, when its fields do not fit in the common one. */
  drawerSize?: number;
}

/** What the panel passes to a widget's rendering, besides its configuration. */
export interface WidgetRender {
  /** The widget's identifier: the ones the server picks up (RSS) are read through it. */
  id: Id;
  /** Saves a configuration modified in place; has no effect when locked. */
  onChange: (config: Record<string, unknown>) => void | Promise<void>;
  /** Opens its drawer; has no effect when frozen. */
  onEdit: () => void;
  locked: boolean;
}

/** A panel's writes, to its routes. */
export interface IndicatorsApi<Type extends string> {
  /** Returns the created indicator: it lands at the end of its section. */
  create: (data: {
    section_id: Id;
    type: Type;
    config: Record<string, unknown>;
  }) => Promise<{ id: Id }>;
  /**
   * `in_use`: changed in place with the screen locked — the edit mode off —,
   * the server announces it as use, not as edit.
   */
  update: (id: Id, data: { config: Record<string, unknown>; in_use?: boolean }) => Promise<unknown>;
  remove: (id: Id) => Promise<unknown>;
  /**
   * A cut widget, pasted: moved to this section — of this board or another —
   * at this place, with its configuration and its content (lib/clipboard.ts).
   */
  move: (id: Id, sectionId: Id, index: number) => Promise<unknown>;
  /** What the section now holds, in order. */
  reorder: (sectionId: Id, ids: Id[]) => Promise<unknown>;
  sections: PanelSections;
}

// The sections of a listing mode — Support requests, Assets positions,
// projects, task lists — and what they hold. The list is a widget there, like
// the indicators: there is no longer a list on the left and a panel on the
// right, everything is organized in sections (SectionsBoard), as in Access
// mode. Each section has its own width, is dragged by its handle and added with
// the "+" in the gap. Clicking an indicator opens its drawer, right-clicking it
// edits or deletes it, and each widget can be dragged from one place or section
// to another. When locked, the screen is read-only.
interface IndicatorsPanelProps<Type extends string, P extends IndicatorWidgetBase<Type>> {
  /** "null" until the sections are read. */
  sections: IndicatorSection[] | null;
  indicators: Indicator<Type>[];
  /** The panel's widgets, in widget drawer order. */
  widgets: P[];
  widgetOf: (type: Type) => P | undefined;
  /** What the widget shows: the panel knows what to pass it. */
  render: (widget: P, config: unknown, widgetRender: WidgetRender) => ReactNode;
  api: IndicatorsApi<Type>;
  onChanged: () => void | Promise<void>;
  locked: boolean;
  /** Unlock the screen: see SectionsBoard. */
  onUnlock?: () => void | Promise<void>;
  /**
   * Duplicate a widget: the copy lands under the original. Without it, the menu
   * does not offer it.
   */
  onDuplicate?: (indicator: Indicator<Type>) => Promise<unknown>;
  /**
   * Extra actions on a widget's right click, which do not reshape it: creating
   * a task from a link. They stay available when the widget is frozen. Nothing
   * to offer: "null".
   */
  extraMenu?: (indicator: Indicator<Type>, close: () => void) => ReactNode;
  /**
   * Actions on a widget's right click that do reshape it — a title's style:
   * offered only while it can be modified, before "Supprimer".
   */
  editMenu?: (indicator: Indicator<Type>, close: () => void) => ReactNode;
}

/**
 * The board's widgets, in column order then each one's: a widget that follows
 * another of its board — a mail count, its Mail widget — finds it there, in
 * its display as in its drawer.
 */
export const BoardWidgetsContext = createContext<Indicator<string>[]>([]);

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
  extraMenu,
  editMenu,
}: IndicatorsPanelProps<Type, P>) {
  const access = useWidgetAccess();
  // The copied widget, pasted at the end of a section: only a type this panel
  // knows and the account can place ("Utiliser").
  const copy = useCopiedWidget();
  const toPaste = copy ? widgetOf(copy.type as Type) : undefined;
  const pastable = copy && toPaste && canUse(access(toPaste.kind)) ? copy : null;
  const [drawerOpen, setDrawerOpened] = useState(false);
  const [modified, setModified] = useState<Indicator<Type> | null>(null);
  /** The widget dropped from the left drawer, waiting for its settings. */
  const [created, setCreated] = useState<{ widget: P; sectionId: Id; index: number } | null>(null);

  const [menu, setMenu] = useState<{
    indicator: Indicator<Type>;
    position: PointMenuPosition;
  } | null>(null);
  const [toDelete, setToDelete] = useState<Indicator<Type> | null>(null);

  /** Write, then re-read no matter what: the read is the source of truth. */
  const write = async (writing: () => Promise<unknown>) => {
    try {
      await writing();
    } finally {
      await onChanged();
    }
  };

  /** What the clipboard keeps of a widget: its type and its configuration. */
  const copiedOf = (indicator: Indicator<Type>) => ({
    type: String(indicator.type),
    config: indicator.config,
    label: titleOf(indicator, widgetOf(indicator.type)?.label ?? String(indicator.type)),
  });

  /**
   * Put on the clipboard as cut: the widget stays in place, dimmed, until it is
   * pasted — which moves it, configuration and content (lib/clipboard.ts).
   */
  const cut = (indicator: Indicator<Type>) => {
    const copy = { ...copiedOf(indicator), cut: indicator.id };
    copyWidget(copy);
    notifications.show({
      color: "teal",
      message: `Widget « ${copy.label} » coupé : collez-le là où il doit aller`,
    });
  };

  const indicatorsOf = (section: IndicatorSection) =>
    indicators.filter((i) => i.section_id === section.id);

  const remove = async () => {
    const indicator = toDelete;
    setToDelete(null);
    if (indicator) {
      await write(async () =>
        rememberDeletion(await api.remove(indicator.id), "Widget supprimé", { reload: onChanged }),
      );
    }
  };

  /**
   * Create, then move to the targeted place: creation puts it at the end of the
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
   * Paste the copied widget into a section: at its end, or at the given place —
   * right after the widget whose menu pasted it. A cut widget is moved there,
   * as it is; a copied one is created from its configuration. Pasted, it leaves
   * the clipboard: it is not pasted a second time.
   */
  const pasteInto = (section: Id, index = Number.MAX_SAFE_INTEGER) => {
    if (!pastable) return;
    const { cut } = pastable;
    void write(() =>
      cut !== undefined
        ? api.move(cut, section, index)
        : createAt({ section_id: section, type: pastable.type as Type, config: pastable.config }, index),
    )
      .then(() => {
        clearCopiedWidget();
        notifications.show({ color: "teal", message: `Widget « ${pastable.label} » collé` });
      })
      .catch((e: unknown) => {
        // A cut widget that could not move stays where it was: nothing is
        // lost, and the clipboard no longer offers it.
        if (cut !== undefined) clearCopiedWidget();
        notifyError(errorMessage(e));
      });
  };

  /**
   * A widget dropped from the left drawer. With no settings, or named in place,
   * it is created right away; otherwise its drawer opens, and it is only born
   * on save — at the place where it was dropped.
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

  /**
   * The types around the widget in the drawer, as its section shows them — a
   * hidden widget, unknown or unreadable, neither precedes nor follows anyone
   * (SectionIndicators): the margins it proposes are those it really has. A
   * widget being created takes the place where it was dropped.
   */
  const drawerNeighbors = (() => {
    const sectionId = modified?.section_id ?? created?.sectionId;
    if (sectionId === undefined) return undefined;
    const inSection = indicators.filter((i) => i.section_id === sectionId);
    const visible = (i: Indicator<Type>) => {
      const widget = widgetOf(i.type);
      return Boolean(widget) && !widget!.hidden?.(i.config, locked);
    };
    const rank = modified ? inSection.findIndex((i) => i.id === modified.id) : created!.index;
    const before = inSection.slice(0, Math.max(0, rank)).filter(visible);
    const after = inSection.slice(modified ? rank + 1 : rank).filter(visible);
    return {
      previousType: before[before.length - 1]?.type ?? null,
      nextType: after[0]?.type ?? null,
    };
  })();

  // A widget with no fields of its own is born without a drawer (drop), but has
  // one afterwards: its appearance — frame, margins — is set like everyone
  // else's. Only a widget with neither has none.
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

  const inOrder = (sections ?? []).flatMap((section) => indicatorsOf(section));

  return (
    <BoardWidgetsContext.Provider value={inOrder}>
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
            onChange={(indicator, config) =>
              write(() => api.update(indicator.id, { config, ...(locked && { in_use: true }) }))
            }
            onOpen={updateStatement}
            onRename={(indicator, name) =>
              write(() => api.update(indicator.id, { config: withField(indicator.config, NAME, name) }))
            }
            onContextMenu={(indicator, position) => setMenu({ indicator, position })}
            cutId={copy?.cut}
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
        // Dropped on the trash: the same question as "Supprimer", for a widget
        // the account can modify.
        onDeleteWidget={(id) => {
          const indicator = indicators.find((i) => i.id === id);
          const widget = indicator ? widgetOf(indicator.type) : undefined;
          if (indicator && widget && accessIncludes(access(widget.kind), "delete")) {
            setToDelete(indicator);
          }
        }}
        paste={
          pastable
            ? {
                label: pastable.label,
                onPaste: (section) => pasteInto(section.id),
              }
            : undefined
        }
        onDeleteSection={(section) =>
          write(async () =>
            rememberDeletion(await api.sections.remove(section.id), "Section supprimée", {
              reload: onChanged,
            }),
          )
        }
        onReorderSections={(ids) => write(() => api.sections.reorder(ids))}
        onChangeSection={(section, change) => write(() => api.sections.update(section.id, change))}
      />

      {menu &&
        (() => {
          const { indicator } = menu;
          const widget = widgetOf(indicator.type);
          // Frozen — the screen locked, or a type the account cannot modify —,
          // the widget only offers the actions that do not reshape it.
          const frozen = locked || !widget || !canUpdate(access(widget.kind));
          const close = () => setMenu(null);
          const extra = extraMenu?.(indicator, close) ?? null;
          // Every widget is copied: its configuration only. A list widget
          // pasted is a new list, with its own key (server, board-widgets.ts).
          const copiable = Boolean(widget);
          // Cutting deletes it: only a widget the account may delete.
          const removable = !frozen && widget !== undefined && accessIncludes(access(widget.kind), "delete");
          const editItems = frozen ? null : (editMenu?.(indicator, close) ?? null);
          // The clipboard group, set apart from the items around it.
          const above =
            !frozen &&
            (hasDrawer(indicator) || (Boolean(onDuplicate) && !isListWidgetType(String(indicator.type))));
          const below = Boolean(editItems || extra);
          return (
            <PointMenu position={menu.position} onClose={close}>
              {!frozen && hasDrawer(indicator) && (
                <Menu.Item leftSection={<IconPencil size={16} />} onClick={() => updateStatement(indicator)}>
                  Modifier
                </Menu.Item>
              )}
              {/* A list widget owns its items: it is not duplicated. */}
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
              {/* The clipboard, in edit mode only, for every widget: copy,
                  cut, paste right after this widget. */}
              {!locked && (copiable || pastable) && (
                <>
                  {above && <Menu.Divider />}
                  {copiable && (
                    <Menu.Item
                      leftSection={<IconCopy size={16} />}
                      onClick={() => {
                        close();
                        copyWidget(copiedOf(indicator));
                      }}
                    >
                      Copier
                    </Menu.Item>
                  )}
                  {copiable && removable && (
                    <Menu.Item
                      leftSection={<IconCut size={16} />}
                      onClick={() => {
                        close();
                        cut(indicator);
                      }}
                    >
                      Couper
                    </Menu.Item>
                  )}
                  {pastable && (
                    <Menu.Item
                      leftSection={<IconClipboard size={16} />}
                      onClick={() => {
                        close();
                        const inSection = indicators
                          .filter((i) => i.section_id === indicator.section_id)
                          .map((i) => i.id);
                        // A cut widget moving within its section: the place
                        // is counted without it. Pasted after itself, it stays.
                        const ids = inSection.filter((id) => id !== pastable.cut);
                        pasteInto(
                          indicator.section_id,
                          indicator.id === pastable.cut
                            ? inSection.indexOf(indicator.id)
                            : ids.indexOf(indicator.id) + 1,
                        );
                      }}
                    >
                      Coller « {pastable.label} »
                    </Menu.Item>
                  )}
                  {below && <Menu.Divider />}
                </>
              )}
              {editItems}
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
        neighbors={drawerNeighbors}
        // Creation goes through the targeted place.
        api={{ ...api, create: (data) => createAt(data, created?.index ?? Number.MAX_SAFE_INTEGER) }}
        onSaved={async () => {
          setDrawerOpened(false);
          await onChanged();
        }}
      />
    </BoardWidgetsContext.Provider>
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
  /** True when a frozen widget still has actions to offer. */
  withFrozenMenu: (indicator: Indicator<Type>) => boolean;
  /** The widget cut, waiting to be pasted: it is dimmed. */
  cutId?: Id;
}

/** A section's indicators, as cards, and the drag that reorders them. */
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
  cutId,
}: SectionIndicatorsProps<Type, P>) {
  const { target, propsOf, stackProps } = useWidgetDrop(section.id, drag, locked);
  // The account's permission on each widget's type.
  const access = useWidgetAccess();
  // Where the last press happened. A widget that drags what it holds itself —
  // the lists and cards of Task mode — marks it "data-no-widget-drag": the
  // widget's native drag does not start there.
  const pressTarget = useRef<Element | null>(null);

  // A hidden widget, or of an unknown type — stored by a more recent version —,
  // does not appear, and neither precedes nor follows anyone. Whatever the
  // account's permission on its type, a widget is read.
  const visibleItems = indicators.flatMap((indicator) => {
    const widget = widgetOf(indicator.type);
    return widget && !widget.hidden?.(indicator.config, locked)
      ? [{ indicator, widget }]
      : [];
  });

  /** The gap between two consecutive visible widgets. */
  const gapBetween = (rank: number): number => {
    const before = visibleItems[rank - 1];
    const after = visibleItems[rank];
    if (!before?.widget.margins || !after?.widget.margins) return GAP;
    const typeOf = (r: number) => visibleItems[r]?.indicator.type ?? null;
    const below = before.widget.margins(
      before.indicator.config,
      typeOf(rank - 2),
      after.indicator.type,
    ).bottom;
    const above = after.widget.margins(after.indicator.config, before.indicator.type, typeOf(rank + 1));
    // Above a title, the larger of the two; elsewhere, their sum.
    return above.collapse ? Math.max(below, above.top) : below + above.top;
  };

  if (visibleItems.length === 0) return null;
  // A widget that wants the full height gets it step by step: the stack
  // stretches in the column, and it in the stack. Only at the bottom of its
  // section: when followed by another widget, it sticks to its content, leaving
  // no gap between them.
  const fill = (rank: number) =>
    rank === visibleItems.length - 1 && Boolean(visibleItems[rank]?.widget.fill);
  // A height in percent is a share of the column's visible height — the
  // window's, not what the column holds (SectionsBoard, COLUMN_HEIGHT): the
  // stack then takes that height, and the widget its share of it.
  const percent = visibleItems.some(({ indicator }) => isPercentHeight(indicator.config));
  const stretched = percent || visibleItems.some((_, rank) => fill(rank));
  const stackStyle: CSSProperties | undefined = percent
    ? { flex: "0 0 auto", height: `var(${COLUMN_HEIGHT})`, minHeight: 0 }
    : stretched
      ? { flex: 1, minHeight: 0 }
      : undefined;
  return (
    <Stack {...stackProps} gap={0} style={stackStyle}>
      {visibleItems.map(({ indicator, widget }, rank) => {
        // The rank among all: this is what the drop stores.
        const index = indicators.indexOf(indicator);
        const gapBefore = rank === 0 ? 0 : gapBetween(rank);
        // Frozen — the screen locked, or a type the account cannot modify —, a
        // widget cannot be dragged, opened or modified: a widget that is
        // modified in place receives nothing to save.
        const frozen = locked || !canUpdate(access(widget.kind));
        // A widget whose content is used outside edit mode still saves it
        // there; it stays frozen for everything else.
        const writable = !frozen || (Boolean(widget.liveContent) && canUpdate(access(widget.kind)));
        const widgetRender: WidgetRender = {
          id: indicator.id,
          onChange: writable ? (config) => onChange(indicator, config) : () => {},
          onEdit: () => !frozen && onOpen(indicator),
          locked: !writable,
        };
        const dragProps = { ...propsOf(indicator.id, index), ...(frozen ? { draggable: false } : {}) };
        const alignment = alignmentProps(indicator.config, widget.ownAlignment !== undefined);
        // The right-click menu: always in edit mode — every widget copies —;
        // otherwise only for widgets that have other actions to offer.
        const menuOf = (e: React.MouseEvent<HTMLElement>) => {
          if (locked && !withFrozenMenu(indicator)) return;
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
              ...sideMargins(widget.styled?.(indicator.config) ?? indicator.config),
              opacity: drag.dragged === indicator.id ? 0.4 : cutId === indicator.id ? 0.5 : 1,
              cursor: frozen || widget.ownClicks ? "default" : "grab",
              ...(fill(rank)
                ? { flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }
                : {}),
              // A height of its own: what it holds fills it (widgets/alignment.ts).
              ...(isSized(indicator.config)
                ? { display: "flex", flexDirection: "column", ...heightStyle(indicator.config, widget.defaultHeight?.(indicator.config)) }
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
              // A widget that keeps its clicks — a list, a title — is placed as
              // is, without the indicators' inset.
              <Box
                onContextMenu={menuOf}
                // Where the content sits, as the drawer sets it.
                className={alignment.className}
                style={{
                  ...(fill(rank)
                    ? { flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }
                    : {}),
                  ...alignment.style,
                }}
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
                {/* A div and not a button: the title is changed in place there,
                    and an input has no business inside a button. The background
                    and line are those of the clock inset and of the Access mode
                    numbers. */}
                <UnstyledButton
                  component="div"
                  role="button"
                  tabIndex={0}
                  w="100%"
                  // Without a frame, the card loses its background and its
                  // inset: only its content remains.
                  className={[
                    isFramed(indicator.config, true) ? inset.inset : undefined,
                    alignment.className,
                  ]
                    .filter(Boolean)
                    .join(" ") || undefined}
                  onClick={() => !frozen && onOpen(indicator)}
                  onContextMenu={menuOf}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    minHeight: CARD_HEIGHT,
                    ...paddingStyle(
                      indicator.config,
                      isFramed(indicator.config, true) ? CARD_PADDING : 0,
                    ),
                    border: "none",
                    // Where the content sits in the card, as the drawer sets
                    // it: with a height of its own, the card fills its place.
                    ...alignment.style,
                    // The background chosen in the drawer, otherwise that of
                    // the inset.
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
