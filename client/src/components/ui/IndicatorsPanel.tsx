import { Box, Menu, Stack, UnstyledButton } from "@mantine/core";
import { IconCopy, IconCopyPlus, IconPencil, IconTrash } from "@tabler/icons-react";
import { useRef, useState, type ComponentType, type ReactNode } from "react";
import inset from "../../assets/styles/AccessNumber.module.css";
import { withField, isFramed, text } from "../../widgets/types";
import { paddingStyle, sideMargins } from "../../widgets/margins";
import { useWidgetAccess } from "../../lib/rights";
import { RED } from "../../themes/colors";
import { copyWidget, useCopiedWidget } from "../../lib/clipboard";
import { errorMessage, notifyError } from "../../lib/errors";
import { notifications } from "@mantine/notifications";
import DeleteConfirmModal from "./DeleteConfirmModal";
import { LIST_ITEMS } from "../../lib/lists";
import IndicatorDrawer from "./IndicatorDrawer";
import PointMenu, { menuPosition, type PointMenuPosition } from "./PointMenu";
import SectionsBoard from "./SectionsBoard";
import { IndicatorCardContext, BACKGROUND, NAME } from "./IndicatorTitle";
import { InsertionLine, useWidgetDrop, type WidgetDrag } from "./WidgetDrop";
import type { PanelSections } from "../../api";
import type { IndicatorConfigProps } from "../../widgets/support/types";
import { accessIncludes, canUpdate, isListWidgetType } from "@milo/shared";
import type { Id, IndicatorSection } from "@milo/shared";
import type { WidgetKind } from "../../widgets/kinds";
import { alignmentProps, isVerticallyAligned } from "../../widgets/alignment";

/** The gap between two indicators of a section. */
export const GAP = 20;

/** A framed card's padding while nothing is set ("spacing md"). */
export const CARD_PADDING = 16;

/** An indicator's height: its name at the top, the quantity at the bottom. */
const HEIGHT = 120;

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
   * True when the widget is named within the section itself — a category, a
   * subcategory: once chosen, it is added right away, without a drawer, and
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
  ) => { top: number; bottom: number };
  /**
   * The "Apparence" block of its drawer, under its own fields: the card, the
   * frame and the margins (board-widgets).
   */
  Appearance?: ComponentType<IndicatorConfigProps>;
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
  update: (id: Id, data: { config: Record<string, unknown> }) => Promise<unknown>;
  remove: (id: Id) => Promise<unknown>;
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
   * What a type converts into — category into subcategory —, and how to do it.
   * Without it, the menu offers no conversion.
   */
  conversion?: {
    to: Partial<Record<string, Type>>;
    convert: (indicator: Indicator<Type>, type: Type) => Promise<unknown>;
  };
  /**
   * Extra actions on a widget's right click, which do not reshape it: creating
   * a task from a link. They stay available when the widget is frozen. Nothing
   * to offer: "null".
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
  // The copied widget, pasted at the end of a section: only a type this panel
  // knows and the account can place.
  const copy = useCopiedWidget();
  const toPaste = copy ? widgetOf(copy.type as Type) : undefined;
  const pastable = copy && toPaste && canUpdate(access(toPaste.kind)) ? copy : null;
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

  const indicatorsOf = (section: IndicatorSection) =>
    indicators.filter((i) => i.section_id === section.id);

  const remove = async () => {
    const indicator = toDelete;
    setToDelete(null);
    if (indicator) await write(() => api.remove(indicator.id));
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
          // Frozen — the screen locked, or a type the account can only read —,
          // the widget only offers the actions that do not reshape it.
          const frozen = locked || !widget || !canUpdate(access(widget.kind));
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
              {/* Copy, in edit mode only. A list widget owns its items: it
                  cannot be copied any more than duplicated. */}
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
        // Creation goes through the targeted place.
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
  /** True when a frozen widget still has actions to offer. */
  withFrozenMenu: (indicator: Indicator<Type>) => boolean;
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
}: SectionIndicatorsProps<Type, P>) {
  const { target, propsOf } = useWidgetDrop(section.id, drag, locked);
  // The account's permission on each widget's type.
  const access = useWidgetAccess();
  // Where the last press happened. A widget that drags what it holds itself —
  // the lists and cards of Task mode — marks it "data-no-widget-drag": the
  // widget's native drag does not start there.
  const pressTarget = useRef<Element | null>(null);

  // A hidden widget, of an unknown type — stored by a more recent version — or
  // of a type the account cannot read, does not appear, and neither precedes
  // nor follows anyone.
  const visibleItems = indicators.flatMap((indicator) => {
    const widget = widgetOf(indicator.type);
    return widget && access(widget.kind) !== "" && !widget.hidden?.(indicator.config, locked)
      ? [{ indicator, widget }]
      : [];
  });

  /** The gap between two consecutive visible widgets. */
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
  // A widget that wants the full height gets it step by step: the stack
  // stretches in the column, and it in the stack. Only at the bottom of its
  // section: when followed by another widget, it sticks to its content, leaving
  // no gap between them.
  const fill = (rank: number) =>
    rank === visibleItems.length - 1 && Boolean(visibleItems[rank]?.widget.fill);
  // A widget aligned vertically takes the height left too, wherever it is:
  // its content moves in it (widgets/alignment.ts).
  const grows = (rank: number) =>
    fill(rank) || isVerticallyAligned(visibleItems[rank]?.indicator.config);
  const stretched = visibleItems.some((_, rank) => grows(rank));
  return (
    <Stack gap={0} style={stretched ? { flex: 1, minHeight: 0 } : undefined}>
      {visibleItems.map(({ indicator, widget }, rank) => {
        // The rank among all: this is what the drop stores.
        const index = indicators.indexOf(indicator);
        const gapBefore = rank === 0 ? 0 : gapBetween(rank);
        // Frozen — the screen locked, or a type the account can only read —, a
        // widget cannot be dragged, opened or modified: a widget that is
        // modified in place receives nothing to save.
        const frozen = locked || !canUpdate(access(widget.kind));
        // A widget whose content is used outside edit mode still saves it
        // there; it stays frozen for everything else.
        const writable = !frozen || (Boolean(widget.liveContent) && canUpdate(access(widget.kind)));
        const widgetRender: WidgetRender = {
          id: indicator.id,
          onChange: writable ? (config) => onChange(indicator, config) : () => {},
          locked: !writable,
        };
        const dragProps = { ...propsOf(indicator.id, index), ...(frozen ? { draggable: false } : {}) };
        const alignment = alignmentProps(indicator.config);
        // The right-click menu — edit, delete — is only for widgets that can be
        // modified, or that have other actions to offer.
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
              ...sideMargins(indicator.config),
              opacity: drag.dragged === indicator.id ? 0.4 : 1,
              cursor: frozen || widget.ownClicks ? "default" : "grab",
              ...(grows(rank)
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
                    minHeight: HEIGHT,
                    ...paddingStyle(
                      indicator.config,
                      isFramed(indicator.config, true) ? CARD_PADDING : 0,
                    ),
                    border: "none",
                    // Where the content sits in the card, as the drawer sets
                    // it: aligned vertically, the card fills its place.
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
