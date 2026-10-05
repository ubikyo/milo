import { Group, Input, Select, Stack } from "@mantine/core";
import { IconChevronDown, IconTag } from "@tabler/icons-react";
import { useState } from "react";
import type { SupportLabel } from "@milo/shared";
import LabelChip from "../ui/LabelChip";
import {
  ROUNDING,
  EmptyList,
  ListFooter,
  RowCheckbox,
  RowCheckboxSpace,
  useRowSelection,
  ROW_INSET,
  NAME_INSET,
  INPUT_INSET,
  nameFieldStyle,
  rowStyle,
  pickKeys,
} from "../ui/DrawerRows";

// The labels a ticket received by e-mail gets automatically, in the drawer
// of its "Tickets" list. They look like the columns of a list (ColumnFields): one
// row per label, drawn as its tag, which a click replaces with another.
// Its box, at the start, selects it: the checked rows are removed together,
// from the button that takes the place of "Ajouter" meanwhile. "Ajouter" adds
// an empty row at the end, where you pick which one — left without a choice,
// it disappears. A label never appears twice.

interface NewMessageLabelsProps {
  /** The Support labels. */
  labels: SupportLabel[];
  /** Those a new message receives. */
  value: string[];
  onChange: (ids: string[]) => void;
  canEdit: boolean;
}

export default function NewMessageLabels({
  labels,
  value,
  onChange,
  canEdit,
}: NewMessageLabelsProps) {
  // The added row, waiting for its label.
  const [adding, setAdding] = useState(false);
  /** Index of the row whose list is open: its field takes the background. */
  const [isOpen, setOpened] = useState<number | null>(null);

  // A label deleted since then is no longer shown.
  const selected = value.filter((id) => labels.some((e) => String(e.id) === id));
  const rows = adding ? [...selected, ""] : selected;
  /** The checked labels, by identifier: a label never appears twice. */
  const checks = useRowSelection(selected);

  const removeChecked = () => {
    onChange(selected.filter((id) => !checks.isChecked(id)));
    checks.reset();
  };

  /**
   * The labels a row can take: its own, and those not already taken, under
   * the name of their group.
   */
  const options = (id: string) => {
    const groups: { group: string; items: { value: string; label: string }[] }[] = [];
    for (const e of labels) {
      if (String(e.id) !== id && selected.includes(String(e.id))) continue;
      const group = e.group_name ?? "";
      if (groups.at(-1)?.group !== group) groups.push({ group, items: [] });
      groups.at(-1)!.items.push({ value: String(e.id), label: e.name });
    }
    return groups;
  };

  const replaceExisting = (rank: number, id: string | null) => {
    setAdding(false);
    if (!id) return;
    if (rank === selected.length) return onChange([...selected, id]);
    onChange(selected.map((c, i) => (i === rank ? id : c)));
  };

  const labelOf = (id: string) => labels.find((e) => String(e.id) === id);

  const chip = (id: string) => {
    const label = labelOf(id);
    return label ? <LabelChip label={label} /> : null;
  };

  return (
    <Input.Wrapper label="Étiquettes nouveau message">
      {rows.length === 0 ? (
        <EmptyList icon={IconTag} message="Aucune étiquette" />
      ) : (
        <Stack gap={1}>
          {rows.map((id, rank) => {
            const newRow = rank === selected.length;
            return (
              <Group
                key={newRow ? "new" : id}
                gap="sm"
                wrap="nowrap"
                // Read-only, without boxes, the label sits to the left like
                // the end of its field to the right: at ROW_INSET from the
                // row's edge.
                style={{
                  ...rowStyle(rank, rows.length, false),
                  ...(canEdit ? null : { paddingLeft: ROW_INSET }),
                }}
              >
                {canEdit &&
                  (newRow ? (
                    // The added row cannot be selected yet: an empty space
                    // keeps it aligned.
                    <RowCheckboxSpace />
                  ) : (
                    <RowCheckbox
                      label={`Sélectionner ${labelOf(id)?.name ?? "l'étiquette"}`}
                      checked={checks.isChecked(id)}
                      onChange={(on) => checks.toggle(id, on)}
                    />
                  ))}
                <Select
                  size="sm"
                  radius={ROUNDING}
                  // The label aligns with the checkbox, as a column's name
                  // with its handle.
                  style={{ flex: 1, minWidth: 0, marginLeft: canEdit ? -NAME_INSET : 0 }}
                  data={options(id)}
                  value={id || null}
                  placeholder="Choisir une étiquette"
                  onChange={(choice) => replaceExisting(rank, choice)}
                  // The added row, left without a label, disappears.
                  onBlur={() => newRow && setAdding(false)}
                  {...pickKeys}
                  onDropdownOpen={() => setOpened(rank)}
                  onDropdownClose={() => setOpened(null)}
                  allowDeselect={false}
                  autoFocus={newRow}
                  disabled={!canEdit}
                  // The label as a tag, over its name which stays hidden: a
                  // click goes through it to the field.
                  leftSection={chip(id)}
                  leftSectionPointerEvents="none"
                  leftSectionProps={{
                    style: {
                      width: "auto",
                      maxWidth: "calc(100% - 40px)",
                      paddingLeft: INPUT_INSET,
                      justifyContent: "flex-start",
                    },
                  }}
                  // The tags in the list too.
                  renderOption={({ option }) => chip(option.value)}
                  rightSection={<IconChevronDown size={14} />}
                  rightSectionPointerEvents="none"
                  comboboxProps={{ shadow: "md", withinPortal: true }}
                  styles={{
                    section: { justifyContent: "flex-end" },
                    // The tags 4 px closer to the edge than the "sm" option's padding.
                    option: { paddingLeft: "calc(0.625rem * var(--mantine-scale) - 4px)" },
                    input: {
                      ...nameFieldStyle(isOpen === rank),
                      cursor: "pointer",
                      ...(id ? { color: "transparent" } : null),
                    },
                  }}
                  aria-label={newRow ? "Étiquette à ajouter" : "Étiquette"}
                />
              </Group>
            );
          })}
        </Stack>
      )}

      {/* As close as possible to the list it extends — as long as a label remains to add. */}
      {canEdit && (
        <ListFooter
          {...(selected.length < labels.length
            ? { addLabel: "Ajouter une étiquette", onAdd: () => setAdding(true) }
            : null)}
          checkedCount={checks.checked.length}
          onDeleteChecked={removeChecked}
        />
      )}
    </Input.Wrapper>
  );
}
