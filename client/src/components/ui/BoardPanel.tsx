import { Menu } from "@mantine/core";
import { IconHeadset, IconSquarePlus } from "@tabler/icons-react";
import { useMemo } from "react";
import { api } from "../../api";
import {
  CONVERSIONS,
  BOARD_WIDGETS,
  boardWidget,
  type BoardData,
} from "../../board-widgets";
import IndicatorsPanel, { type IndicatorsApi } from "./IndicatorsPanel";
import type { BoardWidget, Id, IndicatorSection } from "@milo/shared";

interface BoardPanelProps {
  boardId: Id;
  /** « null » tant que les sections du tableau ne sont pas lues. */
  sections: IndicatorSection[] | null;
  widgets: BoardWidget[];
  /** Ce que le tableau met à la disposition de ses widgets, filtré par lui. */
  data: BoardData;
  onChanged: () => void | Promise<void>;
  /** Verrouillé dans cette fenêtre, ou faute de droit : l'écran se lit seulement. */
  locked: boolean;
  /** Déverrouiller le tableau dans cette fenêtre ; absent quand il est figé faute de droit. */
  onUnlock?: () => void | Promise<void>;
  /** « Créer une tâche », au clic droit sur un lien. */
  onCreateTask?: (widget: BoardWidget) => void;
  /** « Créer un ticket », au clic droit sur un lien. */
  onCreateSupportRequest?: (widget: BoardWidget) => void;
}

/**
 * Les sections d'un tableau et ses widgets — tous ceux du registre, quel que
 * soit leur type : une liste de projets, un tableau de tâches, des liens, des
 * indicateurs. Chacun lit les données du tableau, filtrées par lui.
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
      // Seul un lien désigne quelque chose sur quoi travailler : un titre, un
      // numéro ou une horloge n'appellent ni tâche ni ticket.
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
