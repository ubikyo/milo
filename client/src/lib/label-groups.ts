import { useContext, useEffect, useState } from "react";
import { api } from "../api";
import { CopyPasteContext } from "../components/ui/CopyPasteActions";
import { errorMessage, notifyError } from "./errors";
import type { Id, LabelGroup, LabelsBase } from "@milo/shared";

// What the lists and indicators share about label groups: reading those of the
// open board — or of Support —, and keeping the labels of one group in their
// order.

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
 * The groups of a kind of labels: those of the open board, or of Support.
 * Empty while they are read, or without "base".
 */
export function useLabelGroups(base: LabelsBase | undefined): LabelGroup[] {
  const board = useContext(CopyPasteContext)?.board ?? null;
  const boardId = base === "/support-labels" ? undefined : board?.id;
  const [groups, setGroups] = useState<LabelGroup[]>([]);

  useEffect(() => {
    if (!base || (base !== "/support-labels" && boardId === undefined)) return;
    api
      .getLabelGroups(base, boardId)
      .then(setGroups)
      .catch((e) => notifyError(errorMessage(e)));
  }, [base, boardId]);

  return groups;
}
