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
} from "../ui/LignesDuTiroir";
import PointMenu, { menuPosition, type PointMenuPosition } from "../ui/PointMenu";

// Les étiquettes qu'un ticket arrivé par e-mail reçoit d'office, au
// Paramétrage. Elles se présentent comme les colonnes d'une liste
// (ChampsColonnes) : une ligne par étiquette, sa pastille et son nom, qu'un
// clic remplace par une autre. Le clic droit la retire ; « Ajouter » pose une
// ligne vide au bout, où l'on choisit laquelle — quittée sans choix, elle
// s'efface. Une étiquette ne revient pas deux fois.

/** La taille de la pastille de couleur, dans le champ. */
const BADGE_SIZE = 12;

interface NewMessageLabelsProps {
  /** Les étiquettes du Support. */
  labels: SupportLabel[];
  /** Celles qu'un nouveau message reçoit. */
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
  // La ligne ajoutée, en attente de son étiquette.
  const [adding, setAdding] = useState(false);
  /** Le rang de la ligne dont la liste est ouverte : son champ prend le fond. */
  const [isOpen, setOpened] = useState<number | null>(null);
  const [menu, setMenu] = useState<{ rank: number; position: PointMenuPosition } | null>(null);

  // Une étiquette supprimée depuis ne se montre plus.
  const selected = value.filter((id) => labels.some((e) => String(e.id) === id));
  const rows = adding ? [...selected, ""] : selected;

  /** Les étiquettes qu'une ligne peut prendre : la sienne, et celles qui ne sont pas déjà prises. */
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
                key={newRow ? "nouvelle" : id}
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
                  // La ligne ajoutée, quittée sans étiquette, s'efface.
                  onBlur={() => newRow && setAdding(false)}
                  onDropdownOpen={() => setOpened(rank)}
                  onDropdownClose={() => setOpened(null)}
                  allowDeselect={false}
                  autoFocus={newRow}
                  disabled={!canEdit}
                  // La pastille de l'étiquette, devant son nom.
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

      {/* Au plus près de la liste qu'il allonge — tant qu'il reste une étiquette à ajouter. */}
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
