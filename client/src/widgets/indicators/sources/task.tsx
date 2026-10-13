import { useMemo } from "react";
import type { TaskCard, TaskList } from "@milo/shared";
import { useListColors } from "../../../components/board/TaskBoard";
import { dueState } from "../../../lib/due";
import { useSourceItems } from "../../../lib/sources";
import { actorsDimension, dueDimension, labelsDimension } from "../dimensions";
import type { IndicatorSource } from "../types";

// What the cards give the indicators: those of the task lists named — the
// open board's as the page holds them —, separators aside, counted by list,
// due date, member or label, and dated by their creation.

/** A card, with the list that holds it. */
type Item = TaskCard & { list: TaskList };

const cardsOf = (lists: TaskList[]): Item[] =>
  lists.flatMap((list) => list.cards.filter((c) => c.kind === "card").map((c) => ({ ...c, list })));

export const taskSource: IndicatorSource<Item> = {
  data: "task",
  label: "Cartes",
  sourceType: "task.list",
  unit: "cartes",
  none: "Aucune carte",
  useItems: function useCards({ sources, board }) {
    const lists = useSourceItems("task", sources, board.lists);
    return useMemo(() => (lists ? cardsOf(lists) : null), [lists]);
  },
  measures: [
    { value: "total", label: "Cartes au total", weight: () => 1 },
    { value: "late", label: "Cartes en retard", weight: (c) => (dueState(c.due_date) === "late" ? 1 : 0) },
    { value: "soon", label: "Cartes à échéance proche", weight: (c) => (dueState(c.due_date) === "soon" ? 1 : 0) },
    { value: "unassigned", label: "Cartes sans membre", weight: (c) => (c.members.length === 0 ? 1 : 0) },
    {
      value: "mine",
      label: "Cartes qui me sont attribuées",
      weight: (c, { userId }) => (c.members.some((m) => m.id === userId) ? 1 : 0),
    },
    {
      value: "checklist",
      label: "Cartes à checklist inachevée",
      weight: (c) => (c.checklist_total > c.checklist_done ? 1 : 0),
    },
  ],
  dimensions: [
    {
      value: "lists",
      label: "Listes",
      // Each bar in its list's background, as the board resolves it for the
      // current theme, and at least as wide as its name.
      ownColors: true,
      insideLabel: true,
      useSlicer: function useLists({ sources, board }) {
        const colors = useListColors();
        const lists = useSourceItems("task", sources, board.lists);
        return useMemo(() => {
          const fixed = (lists ?? []).map((l) => ({
            key: String(l.id),
            name: l.name,
            color: colors(l.color).background,
          }));
          const byId = new Map(fixed.map((s) => [s.key, s]));
          return {
            fixed,
            slices: (c: Item) => {
              const slice = byId.get(String(c.list.id));
              return slice ? [slice] : [];
            },
          };
        }, [lists, colors]);
      },
    },
    dueDimension((c) => c.due_date),
    actorsDimension("members", "Membres", (c) => c.members),
    labelsDimension("/labels", "task.list", (c) => c.labels),
  ],
  dates: [{ value: "created", label: "Date de création", title: "Cartes créées", of: (c) => c.created_at }],
};
