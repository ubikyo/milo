import { createContext, useContext, useEffect, useState } from "react";
import { api, LABEL_GROUPS_EVENT } from "../api";
import { CopyPasteContext } from "../components/ui/CopyPasteActions";
import { errorMessage, notifyError } from "./errors";
import type { Id, LabelGroup, LabelsBase, SupportLabel } from "@milo/shared";

// What the lists and indicators share about label groups: reading those of the
// open board, and keeping the labels of one group in their order.

/** What a label carries that matters here: its group and its place. */
interface Placed {
  group_id: Id;
  position: number;
}

/**
 * The labels of a group — all of them when "group" is null —, in their order:
 * group after group, then within the group, as "position" reads them.
 */
export const ofGroup = <L extends Placed>(labels: L[], group: Id | null | undefined): L[] =>
  labels
    .filter((l) => group == null || l.group_id === group)
    .sort((a, b) => a.position - b.position);

/**
 * What a list sorts on: the place of the first of these labels; null when
 * there is none, which goes to the bottom.
 */
export const labelRank = (labels: Placed[], group: Id | null | undefined): number | null =>
  ofGroup(labels, group)[0]?.position ?? null;

/**
 * The title of a labels column: its group's name, or "Étiquette" when it shows
 * them all — or when its group is gone.
 */
export const labelsColumnTitle = (groups: LabelGroup[], group: Id | null | undefined): string =>
  (group == null ? undefined : groups.find((g) => g.id === group)?.name) ?? "Étiquette";

/**
 * The groups being edited in a widget drawer (LabelGroupsEditor), by kind of
 * labels, before "Sauvegarder": the drawer's group choices follow them as they
 * are typed. A group not yet created has a negative id; the save replaces it
 * with its real one in the configuration (remapGroups). Null outside a drawer.
 */
export const LabelGroupDraftsContext = createContext<{
  drafts: Partial<Record<LabelsBase, LabelGroup[]>>;
  /** Publishes the draft of "base"; null once its editor is gone. */
  publish: (base: LabelsBase, groups: LabelGroup[] | null) => void;
} | null>(null);

/**
 * The configuration with the groups not yet created replaced by their real
 * ids: that of a labels indicator ("label_group"), those of a list's labels
 * columns ("columns").
 */
export const remapGroups = (
  config: Record<string, unknown>,
  ids: Map<Id, Id>,
): Record<string, unknown> => {
  const remap = (value: unknown) =>
    typeof value === "number" && ids.has(value) ? ids.get(value) : value;
  const next = { ...config };
  if ("label_group" in next) next.label_group = remap(next.label_group);
  if (Array.isArray(next.columns)) {
    next.columns = next.columns.map((c: unknown) =>
      c && typeof c === "object" && "group" in c ? { ...c, group: remap(c.group) } : c,
    );
  }
  return next;
};

/**
 * The groups of a kind of labels: those of the open board — in a drawer that
 * edits them, its draft.
 * Empty while they are read, or without "base". Re-read when they change —
 * a group renamed, added, removed or moved —: column titles and group
 * choices follow.
 */
export function useLabelGroups(base: LabelsBase | undefined): LabelGroup[] {
  const drafts = useContext(LabelGroupDraftsContext)?.drafts;
  const draft = base ? drafts?.[base] : undefined;
  const board = useContext(CopyPasteContext)?.board ?? null;
  const boardId = board?.id;
  const [groups, setGroups] = useState<LabelGroup[]>([]);

  useEffect(() => {
    if (!base || boardId === undefined) return;
    let current = true;
    const read = () =>
      api
        .getLabelGroups(base, boardId)
        .then((next) => current && setGroups(next))
        .catch((e) => notifyError(errorMessage(e)));
    const changed = (e: Event) => (e as CustomEvent<LabelsBase>).detail === base && read();
    read();
    window.addEventListener(LABEL_GROUPS_EVENT, changed);
    return () => {
      current = false;
      window.removeEventListener(LABEL_GROUPS_EVENT, changed);
    };
  }, [base, boardId]);

  return draft ?? groups;
}

/** The open board's Support labels, in order. Empty while they are read. */
export function useSupportLabels(): SupportLabel[] {
  const boardId = useContext(CopyPasteContext)?.board?.id;
  const [labels, setLabels] = useState<SupportLabel[]>([]);

  useEffect(() => {
    if (boardId === undefined) return;
    api
      .getSupportLabels(boardId)
      .then(setLabels)
      .catch((e) => notifyError(errorMessage(e)));
  }, [boardId]);

  return labels;
}
