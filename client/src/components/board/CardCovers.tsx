import { Group, Input, Menu, Stack } from "@mantine/core";
import { IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import { COVER_ROTATIONS } from "@milo/shared";
import type { CardCover } from "@milo/shared";
import { RED } from "../../themes/colors";
import AddButton from "../ui/AddButton";
import DeleteConfirmModal from "../ui/DeleteConfirmModal";
import PointMenu, { type PointMenuPosition } from "../ui/PointMenu";
import { FileRow, useOrderedFiles } from "./CardAttachments";
import { SmallChoice } from "./CardDueDate";

const ROTATIONS = COVER_ROTATIONS.map((r) => ({ value: String(r.value), label: r.label }));
/**
 * A card's cover images, at the top of its details, in the same style as
 * its attachments: one row per image, which opens it on click, and
 * "Supprimer" on right-click. A handle in front of each row reorders
 * them — the first is the one the card shows on the board —, and the
 * rotation interval, to the right of the label, makes them take turns.
 *
 * The block carries "data-covers": a file dropped on it becomes a
 * cover rather than an attachment (CardDrawer).
 */
interface CardCoversProps {
  covers: CardCover[];
  /** Seconds between two images on the board; zero, the first one stays. */
  interval: number;
  onInterval: (seconds: number) => void;
  onPick: () => void;
  onReorder: (ids: CardCover["id"][]) => void | Promise<void>;
  onDelete: (cover: CardCover) => void | Promise<void>;
  readOnly?: boolean;
}

export default function CardCovers({
  covers,
  interval,
  onInterval,
  onPick,
  onReorder,
  onDelete,
  readOnly,
}: CardCoversProps) {
  const [toDelete, setToDelete] = useState<CardCover | null>(null);
  const [menu, setMenu] = useState<{ cover: CardCover; position: PointMenuPosition } | null>(
    null,
  );

  const { displayed, row } = useOrderedFiles(covers, onReorder, !readOnly);
  if (covers.length === 0) return null;

  return (
    <div data-covers>
      <Group justify="space-between" align="flex-end" wrap="nowrap">
        <Input.Label>Images de couverture</Input.Label>
        <SmallChoice
          data={ROTATIONS}
          value={String(interval)}
          onChange={(v) => onInterval(Number(v))}
          label="Intervalle de rotation"
          disabled={readOnly}
        />
      </Group>

      <Stack gap={2}>
        {displayed.map((cover, rank) => (
          <FileRow
            key={cover.id}
            attachment={{ ...cover, is_image: true }}
            onContextMenu={(position) => !readOnly && setMenu({ cover, position })}
            {...row(cover, rank)}
          />
        ))}
      </Stack>

      {!readOnly && <AddButton label="Ajouter une image" onClick={onPick} mt={4} />}

      {menu && (
        <PointMenu position={menu.position} onClose={() => setMenu(null)}>
          <Menu.Item
            color={RED}
            leftSection={<IconTrash size={16} />}
            onClick={() => setToDelete(menu.cover)}
          >
            Supprimer
          </Menu.Item>
        </PointMenu>
      )}

      <DeleteConfirmModal
        opened={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={() => {
          const cover = toDelete;
          setToDelete(null);
          if (cover) void onDelete(cover);
        }}
        title="Supprimer l'image de couverture"
        message={<>Voulez-vous vraiment supprimer « {toDelete?.name || "cette image"} » ?</>}
      />
    </div>
  );
}
