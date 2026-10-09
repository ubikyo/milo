import { Button, Modal, Select, Stack, Text, TextInput } from "@mantine/core";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { useRights } from "../../lib/rights";
import { modalHeaderStyles } from "../../themes/modals";
import type { Board, Id, TaskList, View } from "@milo/shared";
import { errorMessage, notifyError } from "../../lib/errors";
import CloseButton from "../ui/CloseButton";
import Footer from "../ui/Footer";
import { themeWindow } from "../../lib/themeWindow";

// Move or copy a list to a board. Both gestures ask the same
// question — which one? — and the same dialog answers it, apart from the title.
//
// Two points set them apart. Moving takes the list elsewhere:
// its own board is not a destination, and its name does not change.
// Copying leaves it where it is: the current board becomes a destination
// again — this is the most common case, duplicating a list in place — and the copy
// is named, since two lists with the same name in the same column could no
// longer be told apart.
//
// The destination is not limited to the current view: a board belongs to
// a view, so you first choose which. The boards are then read for
// it — the screen only holds in memory those it displays. In another board,
// cards take the first of its contexts.
export type ListAction = "move" | "copy";

interface MoveOrCopyListModalProps {
  opened: boolean;
  onClose: () => void;
  mode: ListAction;
  list: TaskList | null;
  /** The open board's view: the destination is searched there by default. */
  viewId: Id | null;
  onDone: () => void | Promise<void>;
}

/** "Ma liste" -> "Ma liste (copie)". */
const copyName = (name: string): string => `${name} (copie)`;

export default function MoveOrCopyListModal({
  opened,
  onClose,
  mode,
  list,
  viewId,
  onDone,
}: MoveOrCopyListModalProps) {
  const can = useRights();
  const [views, setViews] = useState<View[] | null>(null);
  const [view, setView] = useState<string | null>(null);
  /** The boards of the chosen view; "null" while they are being read. */
  const [boards, setBoards] = useState<Board[] | null>(null);
  const [boardId, setBoardId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const copy = mode === "copy";

  // On open: the current board's view, and for a copy its board
  // — duplicating a list in place must ask nothing more than its
  // name.
  useEffect(() => {
    if (!opened) return;
    setView(viewId === null ? null : String(viewId));
    setBoardId(copy && list ? String(list.board_id) : null);
    setName(list ? copyName(list.name) : "");

    let cancelled = false;
    api
      .getViews()
      .then((readItems) => {
        if (!cancelled) setViews(readItems);
      })
      .catch((e) => {
        if (!cancelled) notifyError(errorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, [opened, list, copy, viewId]);

  // The boards follow the chosen view. A response arriving after a
  // new choice would be stale: it is dropped.
  useEffect(() => {
    if (!opened || !view) {
      setBoards(null);
      return;
    }
    let cancelled = false;
    setBoards(null);
    api
      .getBoards(view)
      .then((readItems) => {
        if (!cancelled) setBoards(readItems);
      })
      .catch((e) => {
        if (!cancelled) notifyError(errorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, [opened, view]);

  // Changing view means starting over from the board choice: the one that had
  // been chosen does not belong to the new one.
  const changeView = (value: string | null) => {
    setView(value);
    setBoardId(null);
  };

  // Moving excludes the board that already holds the list; copying accepts it.
  const boardOptions = (boards ?? [])
    .filter((board) => copy || board.id !== list?.board_id)
    .map((board) => ({ value: String(board.id), label: board.name }));

  // Without the right to add tasks, no view accepts.
  const viewOptions = can("tasks", "create")
    ? (views ?? []).map((v) => ({ value: String(v.id), label: v.name }))
    : [];

  const validate = async () => {
    if (!boardId || !list) return;
    setSaving(true);
    try {
      if (copy) {
        await api.copyTaskList(list.id, { board_id: Number(boardId), name: name.trim() });
      } else {
        await api.updateTaskList(list.id, { board_id: Number(boardId) });
      }
      await onDone();
      onClose();
    } catch (e) {
      notifyError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  // A view with no host board can receive nothing: we say so
  // instead of leaving an empty dropdown.
  const noDestination = boards !== null && boardOptions.length === 0;

  return (
    <Modal
      attributes={themeWindow("move-list")}
      opened={opened}
      onClose={onClose}
      title={copy ? "Copier la liste" : "Déplacer la liste"}
      centered
      padding={32}
      withCloseButton={false}
      styles={modalHeaderStyles(32)}
    >
      <Stack gap="md">

        {/* The view comes before the board: it drives the list of
            possible destinations. */}
        <Select
          label="Vue"
          placeholder="Choisir une vue"
          data={viewOptions}
          value={view}
          onChange={changeView}
          allowDeselect={false}
          searchable={viewOptions.length > 8}
        />

        <Select
          label="Tableau de destination"
          placeholder={boards === null ? "Lecture des tableaux…" : "Choisir un tableau"}
          data={boardOptions}
          value={boardId}
          onChange={setBoardId}
          allowDeselect={false}
          disabled={!view || boards === null || noDestination}
          searchable={boardOptions.length > 8}
        />

        {noDestination && (
          <Text size="sm" c="dimmed">
            {copy
              ? "Cette vue n'a aucun tableau où copier cette liste."
              : "Cette vue n'a aucun autre tableau où déplacer cette liste."}
          </Text>
        )}

        {/* The copy is named: placed in the original board, it would otherwise
            carry the name of the list it comes from. */}
        {copy && (
          <TextInput
            label="Nom de la copie"
            placeholder="Nom de la copie"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") validate();
            }}
            required
          />
        )}
      </Stack>

      <Footer>
        <CloseButton onClick={onClose} />
        <Button
          color="teal"
          onClick={validate}
          loading={saving}
          disabled={!boardId || (copy && !name.trim())}
        >
          {copy ? "Copier" : "Déplacer"}
        </Button>
      </Footer>
    </Modal>
  );
}
