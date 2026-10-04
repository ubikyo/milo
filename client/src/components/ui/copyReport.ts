import type { CopyResult } from "@milo/shared";

// What copying the labels or categories of a board to another produced, in
// one sentence (CopyPasteActions).
//
// What already exists in the destination board, under the same name, is not
// duplicated. The server counts it, and the notification that follows the
// copy says so rather than let you think everything went through.

/** Ce qu'on copie. */
export type ItemToCopy = "labels" | "categories";

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
