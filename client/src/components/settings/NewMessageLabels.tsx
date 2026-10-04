import { ColorSwatch, Group, Input, Menu, Select, Stack } from "@mantine/core";
import { IconChevronDown, IconTag, IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import type { SupportLabel } from "@milo/shared";
import { RED } from "../../themes/colors";
import AddButton from "../ui/AddButton";
import { useLabelColors } from "../ui/LabelChip";
import {
  ROUNDING,
  EmptyList,
  ROW_INSET,
  NAME_INSET,
  nameFieldStyle,
  rowStyle,
} from "../ui/DrawerRows";
import PointMenu, { menuPosition, type PointMenuPosition } from "../ui/PointMenu";

// The labels a ticket received by e-mail gets automatically, in Settings
// ("Paramétrage"). They look like the columns of a list (ColumnFields): one
// row per label, with its dot and name, which a click replaces with another.
// Right-click removes it; "Ajouter" adds an empty row at the end, where you
// pick which one — left without a choice, it disappears. A label never
// appears twice.

/** Size of the color dot, in the field. */
const BADGE_SIZE = 12;

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
  const colors = useLabelColors();
  // The added row, waiting for its label.
  const [adding, setAdding] = useState(false);
  /** Index of the row whose list is open: its field takes the background. */
  const [isOpen, setOpened] = useState<number | null>(null);
  const [menu, setMenu] = useState<{ rank: number; position: PointMenuPosition } | null>(null);

  // A label deleted since then is no longer shown.
  const selected = value.filter((id) => labels.some((e) => String(e.id) === id));
  const rows = adding ? [...selected, ""] : selected;

  /** The labels a row can take: its own, and those not already taken. */
  const options = (id: string) =>
    labels
      .filter((e) => String(e.id) === id || !selected.includes(String(e.id)))
      .map((e) => ({ value: String(e.id), label: e.name }));

  const replaceExisting = (rank: number, id: string | null) => {
    setAdding(false);
    if (!id) return;
    if (rank === selected.length) return onChange([...selected, id]);
    onChange(selected.map((c, i) => (i === rank ? id : c)));
  };

  const dot = (id: string) => {
    const label = labels.find((e) => String(e.id) === id);
    return label ? (
      <ColorSwatch
        color={colors(label.color).backgroundColor}
        size={BADGE_SIZE}
        withShadow={false}
      />
    ) : null;
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
                onContextMenu={(e) => {
                  if (!canEdit || newRow) return;
                  setMenu({ rank, position: menuPosition(e) });
                }}
                style={{ ...rowStyle(rank, rows.length, false), paddingLeft: ROW_INSET }}
              >
                <Select
                  size="sm"
                  radius={ROUNDING}
                  style={{ flex: 1, minWidth: 0 }}
                  data={options(id)}
                  value={id || null}
                  placeholder="Choisir une étiquette"
                  onChange={(choice) => replaceExisting(rank, choice)}
                  // The added row, left without a label, disappears.
                  onBlur={() => newRow && setAdding(false)}
                  onDropdownOpen={() => setOpened(rank)}
                  onDropdownClose={() => setOpened(null)}
                  allowDeselect={false}
                  autoFocus={newRow}
                  disabled={!canEdit}
                  // The label's dot, in front of its name.
                  leftSection={dot(id)}
                  leftSectionWidth={id ? NAME_INSET + BADGE_SIZE : undefined}
                  rightSection={<IconChevronDown size={14} />}
                  rightSectionPointerEvents="none"
                  comboboxProps={{ shadow: "md", withinPortal: true }}
                  styles={{
                    section: { justifyContent: "flex-end" },
                    input: {
                      ...nameFieldStyle(isOpen === rank),
                      cursor: "pointer",
                      ...(id ? { paddingLeft: NAME_INSET + BADGE_SIZE + 8 } : null),
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
      {canEdit && selected.length < labels.length && (
        <AddButton label="Ajouter une étiquette" onClick={() => setAdding(true)} mt={4} />
      )}

      {menu && (
        <PointMenu position={menu.position} onClose={() => setMenu(null)}>
          <Menu.Item
            color={RED}
            leftSection={<IconTrash size={16} />}
            onClick={() => {
              onChange(selected.filter((_, i) => i !== menu.rank));
              setMenu(null);
            }}
          >
            Retirer
          </Menu.Item>
        </PointMenu>
      )}
    </Input.Wrapper>
  );
}
