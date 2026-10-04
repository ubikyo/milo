import { Button, Group, Modal, Select, Stack, Switch, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { modalHeaderStyles } from "../../themes/modals";
import { errorMessage, notifyError } from "../../lib/errors";
import type { CopyResult, Id, View } from "@milo/shared";
import CloseButton from "./CloseButton";

// Copy the labels, categories or contexts of a board to another one.
//
// The destination is chosen in two steps: the view, then one of its boards. The
// source board's view is offered first.
//
// What already exists in the destination board, under the same name, is not
// duplicated. The server counts it, and the notification that follows the copy
// says so rather than let you think everything went through. Labels and
// contexts can also replace those of the destination: a switch deletes them
// first.

/** Ce qu'on copie. */
export type ItemToCopy = "labels" | "categories" | "contexts";

const WORDS: Record<
  ItemToCopy,
  { title: string; nounPhrase: string; plural: string; feminine: boolean }
> = {
  labels: { title: "Copier les étiquettes", nounPhrase: "étiquette", plural: "étiquettes", feminine: true },
  categories: {
    title: "Copier les catégories",
    nounPhrase: "catégorie",
    plural: "catégories",
    feminine: true,
  },
  contexts: { title: "Copier les contextes", nounPhrase: "contexte", plural: "contextes", feminine: false },
};

/**
 * What the copy produced, in one sentence. "ou" locates the destination board:
 * "là-bas" from the source, "ici" when pasting into it.
 */
export const report = (
  item: ItemToCopy,
  { copied, skipped, removed, kept }: CopyResult,
  or = "là-bas",
): string => {
  const words = WORDS[item];
  const name = (n: number) => (n > 1 ? words.plural : words.nounPhrase);
  // Grammatical agreement follows the gender of what is copied.
  const none = words.feminine ? "aucune" : "aucun";
  const copy = words.feminine ? "copiée" : "copié";

  if (copied === 0 && skipped === 0) return `Ce tableau n'a ${none} ${words.nounPhrase} à copier.`;

  const copiedPhrase =
    copied === 0
      ? `${words.feminine ? "Aucune" : "Aucun"} ${words.nounPhrase} ${copy}`
      : `${copied} ${name(copied)} ${copy}${copied > 1 ? "s" : ""}`;

  // What was deleted beforehand, when it was requested.
  const cleared = removed
    ? ` ${removed} ${name(removed)} ${words.feminine ? "effacée" : "effacé"}${removed > 1 ? "s" : ""} avant.`
    : "";

  // What the replacement had to keep: categories that hold projects.
  const keptCount = kept
    ? ` ${kept} ${name(kept)} ${words.feminine ? "gardée" : "gardé"}${kept > 1 ? "s" : ""} : ${
        kept > 1 ? "elles rangent" : "elle range"
      } encore des projets.`
    : "";

  if (skipped === 0) return `${copiedPhrase}.${cleared}${keptCount}`;

  const already =
    skipped > 1
      ? `${skipped} portaient déjà ce nom ${or}`
      : `1 portait déjà ce nom ${or}`;
  return `${copiedPhrase} — ${already}.${cleared}${keptCount}`;
};

/**
 * The switch that first deletes what the destination holds — contexts with
 * everything they contain. Categories have none.
 */
const REPLACEABLE: Partial<Record<ItemToCopy, string>> = {
  labels: "Effacer les étiquettes existantes",
  contexts: "Effacer les contextes existants",
};

/**
 * Contexts also carry over, by default, the label of "Tous les …" — the global
 * selector — of the source board.
 */
const RENAME: Partial<Record<ItemToCopy, string>> = {
  contexts: "Renommer le sélecteur global",
};

interface CopyToBoardModalProps {
  opened: boolean;
  onClose: () => void;
  item: ItemToCopy;
  /** The source board: it is not a destination. */
  sourceId: Id;
  /** The source board's view: the destination is searched there first. */
  viewId: Id | string | null;
  /**
   * The copy to make, once the destination is chosen. "replace": first delete
   * what the destination holds (REMPLACER); "rename": give it the label of
   * "Tous les …" from the source (RENOMMER).
   */
  onCopy: (boardId: Id, replaceExisting: boolean, rename: boolean) => Promise<CopyResult>;
}

export default function CopyToBoardModal({
  opened,
  onClose,
  item,
  sourceId,
  viewId,
  onCopy,
}: CopyToBoardModalProps) {
  const [views, setViews] = useState<View[] | null>(null);
  const [view, setView] = useState<string | null>(null);
  /** The boards that can be copied into; "null" while they are being read. */
  const [boards, setBoards] = useState<{ id: Id; name: string }[] | null>(null);
  const [boardId, setBoardId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [replaceExisting, setReplace] = useState(false);
  const [rename, setRename] = useState(true);

  const words = WORDS[item];
  const replacement = REPLACEABLE[item];
  const renaming = RENAME[item];

  // On open: start over, on the source board's view.
  useEffect(() => {
    if (!opened) return;
    setBoardId(null);
    setReplace(false);
    setRename(true);
    setView(viewId != null ? String(viewId) : null);
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
  }, [opened, viewId]);

  // The boards of the selected view. A response arriving after a new choice
  // would be stale: it is dropped.
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

  // Changing view means starting over from the board choice: the one that was
  // selected does not belong to the new view.
  const changeView = (value: string | null) => {
    setView(value);
    setBoardId(null);
  };

  // The source board is not a destination: copying into it would do nothing.
  const boardOptions = (boards ?? [])
    .filter((board) => board.id !== sourceId)
    .map((board) => ({ value: String(board.id), label: board.name }));

  const viewChoices = (views ?? []).map((v) => ({ value: String(v.id), label: v.name }));

  const noDestination = boards !== null && boardOptions.length === 0;

  const validate = async () => {
    if (!boardId) return;
    setSaving(true);
    try {
      // The destination board is not the one being viewed: the notification is
      // the only place to say what the copy produced.
      const done = await onCopy(
        Number(boardId),
        replacement ? replaceExisting : false,
        renaming ? rename : false,
      );
      notifications.show({ color: "teal", title: words.title, message: report(item, done) });
      onClose();
    } catch (e) {
      notifyError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={words.title}
      centered
      padding={32}
      withCloseButton={false}
      styles={modalHeaderStyles(32)}
    >
      <Stack gap="md">

        {/* The view comes before the board: it drives the list of possible
            destinations. */}
        <Select
          label="Vue"
          placeholder="Choisir une vue"
          data={viewChoices}
          value={view}
          onChange={changeView}
          allowDeselect={false}
          searchable={viewChoices.length > 8}
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
            Cette vue n'a aucun autre tableau où copier.
          </Text>
        )}
        {renaming && (
          <Switch
            label={renaming}
            checked={rename}
            onChange={(e) => setRename(e.currentTarget.checked)}
            color="teal"
          />
        )}
        {replacement && (
          <Switch
            label={replacement}
            checked={replaceExisting}
            onChange={(e) => setReplace(e.currentTarget.checked)}
            color="teal"
          />
        )}
      </Stack>

      <Group justify="flex-end" mt={32}>
        <CloseButton onClick={onClose} />
        <Button color="teal" onClick={validate} loading={saving} disabled={!boardId}>
          Copier
        </Button>
      </Group>
    </Modal>
  );
}
