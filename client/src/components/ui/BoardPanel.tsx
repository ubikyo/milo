import { Menu } from "@mantine/core";
import { IconHeadset, IconSquarePlus } from "@tabler/icons-react";
import { useMemo } from "react";
import { api } from "../../api";
import {
  CONVERSIONS,
  BOARD_WIDGETS,
  boardWidget,
  type BoardData,
} from "../../widgets";
import IndicatorsPanel, { type IndicatorsApi } from "./IndicatorsPanel";
import type { BoardWidget, Id, IndicatorSection } from "@milo/shared";

interface BoardPanelProps {
  boardId: Id;
  /** "null" until the board's sections are read. */
  sections: IndicatorSection[] | null;
  widgets: BoardWidget[];
  /** What the board makes available to its widgets, filtered by it. */
  data: BoardData;
  onChanged: () => void | Promise<void>;
  /** Locked in this window, or for lack of a right: the screen is read-only. */
  locked: boolean;
  /** Unlock the board in this window; absent when it is frozen for lack of a right. */
  onUnlock?: () => void | Promise<void>;
  /** "Créer une tâche", on right-click of a link. */
  onCreateTask?: (widget: BoardWidget) => void;
  /** "Créer un ticket", on right-click of a link. */
  onCreateSupportRequest?: (widget: BoardWidget) => void;
}

/**
 * A board's sections and its widgets — all those of the registry, whatever
 * their type: a project list, a task board, links,
 * indicators. Each reads the board's data, filtered by it.
 */
export default function BoardPanel({
  boardId,
  sections,
  widgets,
  data,
  onChanged,
  locked,
  onUnlock,
  onCreateTask,
  onCreateSupportRequest,
}: BoardPanelProps) {
  const writings = useMemo<IndicatorsApi<string>>(
    () => ({
      create: api.createBoardWidget,
      update: (id, data) => api.updateBoardWidget(id, data),
      remove: api.deleteBoardWidget,
      reorder: api.reorderBoardWidgets,
      sections: api.boardSections(boardId),
    }),
    [boardId],
  );

  return (
    <IndicatorsPanel
      sections={sections}
      indicators={widgets}
      widgets={BOARD_WIDGETS}
      widgetOf={boardWidget}
      render={(widget, config, render) => widget.show(data, config, render)}
      api={writings}
      onChanged={onChanged}
      locked={locked}
      onUnlock={onUnlock}
      onDuplicate={(widget) => api.duplicateBoardWidget(widget.id)}
      conversion={{
        to: CONVERSIONS,
        convert: (widget, type) => api.updateBoardWidget(widget.id, { type }),
      }}
      // Only a link designates something to work on: a title, a
      // number or a clock calls for neither a task nor a ticket.
      extraMenu={(widget, close) =>
        widget.type === "link" && (onCreateTask || onCreateSupportRequest) ? (
          <>
            {onCreateTask && (
              <Menu.Item
                leftSection={<IconSquarePlus size={16} />}
                onClick={() => {
                  close();
                  onCreateTask(widget as BoardWidget);
                }}
              >
                Créer une tâche
              </Menu.Item>
            )}
            {onCreateSupportRequest && (
              <Menu.Item
                leftSection={<IconHeadset size={16} />}
                onClick={() => {
                  close();
                  onCreateSupportRequest(widget as BoardWidget);
                }}
              >
                Créer un ticket
              </Menu.Item>
            )}
          </>
        ) : null
      }
    />
  );
}
