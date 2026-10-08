import { Group, Input, Stack } from "@mantine/core";
import { useState } from "react";
import { COVER_ROTATIONS } from "@milo/shared";
import type { CardCover } from "@milo/shared";
import DeleteConfirmModal from "../ui/DeleteConfirmModal";
import { ListFooter, RowCheckbox, useRowSelection } from "../ui/DrawerRows";
import FileDropzone from "../ui/FileDropzone";
import type { DropTarget } from "./CardAttachments";
import { FileRow, useOrderedFiles } from "./CardAttachments";
import { SmallChoice } from "./CardDueDate";

const ROTATIONS = COVER_ROTATIONS.map((r) => ({ value: String(r.value), label: r.label }));
/**
 * A card's cover images, at the top of its details, in the same style as
 * its attachments: one row per image, which opens it on click, and a
 * checkbox to select it for deletion. A handle in front of each row reorders
 * them — the first is the one the card shows on the board —, and the
 * rotation interval, to the right of the label, makes them take turns.
 *
 * The block carries "data-covers": a file dropped on it becomes a
 * cover rather than an attachment (CardDrawer).
 *
 * A declared asset's photos take the same block (DeclaredAssetDrawer):
 * their own words, no rotation, and shown even empty — they have no
 * "Actions" menu to add the first one from.
 */

/** What the block needs of an image. */
type CoverFile = Pick<CardCover, "id" | "name" | "size" | "url" | "created_at">;

/** How the block names its images. */
interface CoverWords {
  title: string;
  /** "l'image de couverture", for deleting one. */
  one: string;
  /** "images de couverture", after a count. */
  many: string;
}

const COVER_WORDS: CoverWords = {
  title: "Images de couverture",
  one: "l'image de couverture",
  many: "images de couverture",
};

interface CardCoversProps<T extends CoverFile> {
  covers: T[];
  /**
   * Seconds between two images on the board; zero, the first one stays.
   * Without "onInterval", no rotation is offered.
   */
  interval?: number;
  onInterval?: (seconds: number) => void;
  onPick: () => void;
  onReorder: (ids: T["id"][]) => void | Promise<void>;
  onDelete: (cover: T) => void | Promise<void>;
  readOnly?: boolean;
  words?: CoverWords;
  /** Shown even without an image: its title, a drop zone, "Ajouter une image". */
  drop?: DropTarget;
}

export default function CardCovers<T extends CoverFile>({
  covers,
  interval = 0,
  onInterval,
  onPick,
  onReorder,
  onDelete,
  readOnly,
  words = COVER_WORDS,
  drop,
}: CardCoversProps<T>) {
  const [confirming, setConfirming] = useState(false);

  const { displayed, row } = useOrderedFiles(covers, onReorder, !readOnly);
  const selection = useRowSelection(covers.map((c) => c.id));
  if (covers.length === 0 && !drop) return null;

  // Read-only, nothing is deleted: no box is shown, none counts.
  const toDelete = readOnly ? [] : covers.filter((c) => selection.isChecked(c.id));

  return (
    <div data-covers>
      <Group justify="space-between" align="flex-end" wrap="nowrap">
        <Input.Label>{words.title}</Input.Label>
        {onInterval && (
          <SmallChoice
            data={ROTATIONS}
            value={String(interval)}
            onChange={(v) => onInterval(Number(v))}
            label="Intervalle de rotation"
            disabled={readOnly}
          />
        )}
      </Group>

      {covers.length === 0 && drop ? (
        <FileDropzone {...drop} />
      ) : (
        <Stack gap={2}>
          {displayed.map((cover, rank) => (
            <FileRow
              key={cover.id}
              attachment={{ ...cover, is_image: true }}
              checkbox={
                !readOnly && (
                  <RowCheckbox
                    label={`Sélectionner ${cover.name || "l'image"}`}
                    checked={selection.isChecked(cover.id)}
                    onChange={(on) => selection.toggle(cover.id, on)}
                    afterHandle
                  />
                )
              }
              {...row(cover, rank)}
            />
          ))}
        </Stack>
      )}
      {covers.length > 0 && drop?.shown && (
        <div style={{ marginTop: 8 }}>
          <FileDropzone {...drop} reveal />
        </div>
      )}

      <ListFooter
        addLabel={readOnly ? undefined : "Ajouter une image"}
        onAdd={readOnly ? undefined : onPick}
        checkedCount={toDelete.length}
        onDeleteChecked={() => setConfirming(true)}
      />

      <DeleteConfirmModal
        opened={confirming && toDelete.length > 0}
        onClose={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          // The deleted images leave the list, and their boxes with them; one
          // the server refused stays checked (onDelete notifies).
          void Promise.all(toDelete.map((cover) => onDelete(cover)));
        }}
        title={
          toDelete.length > 1
            ? `Supprimer ${toDelete.length} ${words.many}`
            : `Supprimer ${words.one}`
        }
        message={
          toDelete.length > 1 ? (
            <>Voulez-vous vraiment supprimer ces {toDelete.length} {words.many} ?</>
          ) : (
            <>Voulez-vous vraiment supprimer « {toDelete[0]?.name || "cette image"} » ?</>
          )
        }
      />
    </div>
  );
}
