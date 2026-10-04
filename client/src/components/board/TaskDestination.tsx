import { Group, Select, Text } from "@mantine/core";
import { useEffect, useState } from "react";
import { itemLink } from "@milo/shared";
import type { Board, Id, LinkTargetKind, TaskList, View } from "@milo/shared";
import { api } from "../../api";
import { errorMessage } from "../../lib/errors";

// "Créer une tâche", from the context menu of a project, a support request,
// a workstation or an Access mode item. The card details
// open empty (components/board/CardDrawer.tsx): they take the item's name
// — editable —, and the description carries the link back to it. You
// choose where it goes, on a row above the title: the company (the item's own
// by default), then the board, then the list.

/** The item the task is created from. */
export interface SourceTask {
  kind: Exclude<LinkTargetKind, "card">;
  /** For "access", the category: it is what the link opens. */
  id: Id;
  title: string;
  /** An Access mode link: its address follows in the description. */
  url?: string;
  /**
   * The item's board in its mode — a project's, an access's
   * category. Its name is used to guess the company and the task board.
   */
  boardName?: string;
}

/** A name as compared: case-insensitive, accent-free, punctuation-free. */
const normalizeValue = (name: string): string =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * What bears the same name as the origin board: the exact name first,
 * otherwise the one that contains the other — the longest wins, it says the
 * most. Nothing matches: "undefined", and the default choice stays.
 */
const findClosest = <T extends { name: string }>(name: string | undefined, items: T[]): T | undefined => {
  const target = normalizeValue(name ?? "");
  if (!target) return undefined;
  const names = items.map((item) => ({ item, name: normalizeValue(item.name) })).filter((n) => n.name);
  const exact = names.find((n) => n.name === target);
  if (exact) return exact.item;
  const word = (a: string, b: string) => ` ${a} `.includes(` ${b} `);
  return names
    .filter((n) => word(n.name, target) || word(target, n.name))
    .sort((a, b) => b.name.length - a.name.length)[0]?.item;
};

const ORIGIN_LABELS: Record<SourceTask["kind"], string> = {
  project: "le projet",
  support: "la demande",
  asset: "le poste",
  access: "l'accès",
};

const escape = (text: string): string =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * The card's description: an empty line, where you write first, an em
 * dash, then where it comes from: its name, as a link back to it.
 */
export const descriptionOf = (source: SourceTask): string => {
  const returnValue = `${window.location.origin}${window.location.pathname}${itemLink(source.kind, source.id)}`;
  const rows = [
    "<p></p>",
    "<p>—</p>",
    `<p>Créée depuis ${ORIGIN_LABELS[source.kind]} <a href="${escape(returnValue)}" target="_blank" rel="noopener noreferrer">${escape(source.title)}</a></p>`,
  ];
  if (source.url) {
    rows.push(
      `<p><a href="${escape(source.url)}" target="_blank" rel="noopener noreferrer">${escape(source.url)}</a></p>`,
    );
  }
  return rows.join("");
};

/** Where the card will go: "null" while nothing is chosen. */
export interface Destination {
  boardId: string | null;
  listId: string | null;
}

interface TaskDestinationProps {
  source: SourceTask;
  onChange: (destination: Destination) => void;
  onError: (message: string) => void;
}

/**
 * View, board, list: three cascading choices, on a single row. Each
 * picks the first of what it offers by default.
 */
export default function TaskDestination({ source, onChange, onError }: TaskDestinationProps) {
  const [views, setViews] = useState<View[] | null>(null);
  const [view, setView] = useState<string | null>(null);
  const [boards, setBoards] = useState<Board[] | null>(null);
  const [boardId, setBoardId] = useState<string | null>(null);
  const [lists, setLists] = useState<TaskList[] | null>(null);
  const [listId, setListId] = useState<string | null>(null);

  useEffect(() => {
    onChange({ boardId, listId });
  }, [boardId, listId]);

  // The views: the tasks one is picked by default — the one whose name
  // says so —, otherwise the first: there is always a first choice.
  useEffect(() => {
    let cancelled = false;
    api
      .getViews()
      .then((readItems) => {
        if (cancelled) return;
        setViews(readItems);
        const guessed = findClosest("Tâches", readItems) ?? readItems[0];
        setView(guessed ? String(guessed.id) : null);
      })
      .catch((e) => !cancelled && onError(errorMessage(e)));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  // The boards follow the view: the one bearing the origin board's
  // name is picked by default, otherwise the first.
  useEffect(() => {
    setBoards(null);
    setBoardId(null);
    if (!view) return;
    let cancelled = false;
    api
      .getBoards(view)
      .then((readItems) => {
        if (cancelled) return;
        setBoards(readItems);
        const chosen = findClosest(source.boardName, readItems) ?? readItems[0];
        setBoardId(chosen ? String(chosen.id) : null);
      })
      .catch((e) => !cancelled && onError(errorMessage(e)));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  // The lists follow the board; the first is picked by default.
  useEffect(() => {
    setLists(null);
    setListId(null);
    if (!boardId) return;
    let cancelled = false;
    api
      .getTaskLists(boardId)
      .then((readItems) => {
        if (cancelled) return;
        setLists(readItems);
        setListId(readItems[0] ? String(readItems[0].id) : null);
      })
      .catch((e) => !cancelled && onError(errorMessage(e)));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId]);

  const viewChoices = (views ?? []).map((v) => ({ value: String(v.id), label: v.name }));
  const boardOptions = (boards ?? []).map((b) => ({ value: String(b.id), label: b.name }));
  const listOptions = (lists ?? []).map((l) => ({ value: String(l.id), label: l.name }));

  // A view with no board, a board with no list: we say so rather than
  // leaving an empty dropdown.
  const withoutBoard = boards !== null && boards.length === 0;
  const withoutList = lists !== null && lists.length === 0;

  return (
    <div>
      <Group gap="md" wrap="nowrap" grow align="flex-start">
        <Select
          label="Vue"
          placeholder="Choisir"
          data={viewChoices}
          value={view}
          onChange={setView}
          allowDeselect={false}
          searchable={viewChoices.length > 8}
          comboboxProps={{ withinPortal: true }}
        />
        <Select
          label="Tableau"
          placeholder={view && boards === null ? "Lecture…" : "Choisir"}
          data={boardOptions}
          value={boardId}
          onChange={setBoardId}
          allowDeselect={false}
          disabled={!view || boards === null || withoutBoard}
          searchable={boardOptions.length > 8}
          comboboxProps={{ withinPortal: true }}
        />
        <Select
          label="Liste"
          placeholder={boardId && lists === null ? "Lecture…" : "Choisir"}
          data={listOptions}
          value={listId}
          onChange={setListId}
          allowDeselect={false}
          disabled={!boardId || lists === null || withoutList}
          searchable={listOptions.length > 8}
          comboboxProps={{ withinPortal: true }}
        />
      </Group>

      {(withoutBoard || withoutList) && (
        <Text size="sm" c="dimmed" mt="xs">
          {withoutBoard
            ? "Cette vue n'a aucun tableau où créer la tâche."
            : "Ce tableau n'a aucune liste où créer la tâche."}
        </Text>
      )}
    </div>
  );
}
