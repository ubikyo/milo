import { Select } from "@mantine/core";
import { useLabelGroups } from "../lib/label-groups";
import type { Bar } from "./support/labels";
import { withField } from "./types";
import type { Id, LabelsBase } from "@milo/shared";

// The "Étiquettes" indicators of the three modes — tasks, projects, Support —
// count either all the labels, or those of one group, chosen in their drawer.

/** The configuration key: the group's id, absent for all labels. */
const GROUP = "label_group";

/** The group whose labels are counted; null for all of them. */
export const groupOf = (config: unknown): Id | null => {
  const value = (config as Record<string, unknown> | null)?.[GROUP];
  return typeof value === "number" ? value : null;
};

/** What a label carries that counts here. */
interface CountedLabel {
  id: Id;
  name: string;
  color: string;
  group_id: Id;
}

/**
 * The bars of the labels carried — one list per card, project or request —,
 * the most carried first. With a group, only its labels count.
 */
export const labelBars = (carried: CountedLabel[][], group: Id | null): Bar[] => {
  const byLabel = new Map<Id, Bar>();
  for (const labels of carried) {
    for (const label of labels) {
      if (group !== null && label.group_id !== group) continue;
      const already = byLabel.get(label.id);
      if (already) already.value += 1;
      else byLabel.set(label.id, { name: label.name, value: 1, color: label.color });
    }
  }
  return [...byLabel.values()].sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
};

const ALL = "all";

/**
 * The choice of the group, in the indicator's drawer: "Toutes les étiquettes",
 * or one of the groups of the open board — of Support, for its labels.
 */
export function LabelGroupSelect({
  base,
  config,
  onChange,
}: {
  base: LabelsBase;
  config: unknown;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const groups = useLabelGroups(base);
  const group = groupOf(config);
  return (
    <Select
      label="Étiquettes affichées"
      data={[
        { value: ALL, label: "Toutes les étiquettes" },
        ...groups.map((g) => ({ value: String(g.id), label: g.name })),
      ]}
      // A group deleted since then matches no option: the field says so.
      value={group === null ? ALL : String(group)}
      placeholder="Groupe supprimé"
      onChange={(value) =>
        value && onChange(withField(config, GROUP, value === ALL ? null : Number(value)))
      }
      allowDeselect={false}
    />
  );
}
