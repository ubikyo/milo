import { Box, Group, Input, Stack, Text } from "@mantine/core";
import { IconExternalLink } from "@tabler/icons-react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { useState } from "react";
import type { ComponentPropsWithoutRef, ComponentType, DragEvent, ReactNode } from "react";
import { FIELD_ICON } from "../../themes/colors";
import FileDropzone from "../ui/FileDropzone";
import {
  Handle,
  ListFooter,
  RowCheckbox,
  move,
  useRowSelection,
} from "../ui/DrawerRows";
import DeleteConfirmModal from "../ui/DeleteConfirmModal";
import type { Attachment, Id } from "@milo/shared";
import classes from "../../assets/styles/CardAttachments.module.css";

// "il y a 3 minutes" rather than a date: an attachment has most often just
// been dropped, and that is what one wants to read. The French comes from
// the locale loaded at startup (main.tsx).
dayjs.extend(relativeTime);

// The left inset: the photo, or the extension. Wide enough for a
// thumbnail to be recognizable, low enough for two lines of text to fit
// next to it without stretching the row.
const THUMBNAIL_W = 64;
const THUMBNAIL_H = 48;

/** A file name's extension, in capitals: "CER", "PDF", "ZIP". */
const extension = (name: string): string => {
  const found = /\.([A-Za-z0-9]{1,5})$/.exec(name.trim());
  return found ? found[1]!.toUpperCase() : "FIC";
};

/**
 * When the attachment arrived. Brand new, we say "à l'instant" rather than
 * "il y a quelques secondes"; past a week, the relative time says nothing
 * useful and the date takes over.
 */
const since = (iso: string): string => {
  const date = dayjs(iso);
  if (!date.isValid()) return "";

  const seconds = dayjs().diff(date, "second");
  if (seconds < 60) return "à l'instant";
  if (seconds < 7 * 24 * 3600) return date.locale("fr").fromNow();
  return date.locale("fr").format("DD/MM/YYYY [à] HH:mm");
};

/** A file size, in the unit that reads well: "240 Ko", "3,1 Mo". */
const size = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} Mo`;
};

/** What a row shows of a file: an attachment, a cover. */
export type File = Pick<Attachment, "url" | "name" | "created_at" | "size" | "is_image">;

// The whole row opens the file in a new tab: its link stretches over the
// row (CardAttachments.module.css). The handle that reorders the files and the
// checkbox that selects them for deletion sit in front, above the link and
// outside it, so that a click on them opens nothing. Cover images (CardCovers)
// show on the same row.
interface RowProps extends ComponentPropsWithoutRef<"div"> {
  attachment: File;
  /** Placed before the thumbnail: the handle that reorders the files. */
  handle?: ReactNode;
  /** After the handle: the checkbox that selects the file for deletion. */
  checkbox?: ReactNode;
}

export function FileRow({ attachment, handle, checkbox, ...props }: RowProps) {
  return (
    <div className={classes.row} {...props}>
      {/* The thumbnail sits 4 px closer to the checkbox than the row's usual gap. */}
      <Group gap="calc(var(--mantine-spacing-sm) - 4px)" wrap="nowrap" align="center">
        {(handle || checkbox) && (
          <Group gap="sm" wrap="nowrap" className={classes.above}>
            {handle}
            {checkbox}
          </Group>
        )}
        <a
          href={attachment.url}
          target="_blank"
          rel="noreferrer"
          className={classes.link}
          aria-label={`Ouvrir ${attachment.name}`}
        >
          {/* The inset: the photo if it is one, otherwise its extension in the center. */}
          <Box
            w={THUMBNAIL_W}
            h={THUMBNAIL_H}
            className={classes.thumbnail}
            style={{
              flexShrink: 0,
              overflow: "hidden",
              borderRadius: "var(--mantine-radius-sm)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {attachment.is_image ? (
              <img
                src={attachment.url}
                alt={attachment.name}
                // Decoded separately: a large photo doesn't freeze the card.
                decoding="async"
                loading="lazy"
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <Text size="sm" fw={700} c="dimmed">
                {extension(attachment.name)}
              </Text>
            )}
          </Box>

          {/* The name, and below it the time of upload. */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <Text size="sm" fw={500} truncate>
              {attachment.name}
            </Text>
            <Text size="xs" c="dimmed">
              {since(attachment.created_at)} · {size(attachment.size)}
            </Text>
          </div>

          {/* The reminder that the click opens a new tab. */}
          <IconExternalLink size={16} style={{ flexShrink: 0, color: FIELD_ICON }} />
        </a>
      </Group>
    </div>
  );
}

/**
 * A stack of files reordered with the handle — attachments,
 * covers. The order moves on screen during the drag and is only sent on
 * drop, if it changed. Renders what must be placed on each row.
 */
export function useOrderedFiles<T extends { id: Id; name: string }>(
  files: T[],
  onReorder: (ids: Id[]) => void | Promise<void>,
  active: boolean,
) {
  const [order, setOrder] = useState<T[] | null>(null);
  const [held, setHeld] = useState<number | null>(null);

  const release = () => {
    const end = order;
    setHeld(null);
    setOrder(null);
    if (end && end.some((f, i) => f.id !== files[i]?.id)) void onReorder(end.map((f) => f.id));
  };

  const row = (file: T, rank: number) => ({
    onDragOver: (e: DragEvent<HTMLDivElement>) => {
      if (held === null || !order) return;
      e.preventDefault();
      const next = move(order, held, rank);
      if (!next) return;
      setHeld(rank);
      setOrder(next);
    },
    onDrop: (e: DragEvent<HTMLDivElement>) => e.preventDefault(),
    style: { opacity: held === rank ? 0.5 : 1 },
    handle: active && (
      <Handle
        label={`Déplacer ${file.name || "le fichier"}`}
        onDragStart={() => {
          setHeld(rank);
          setOrder(files);
        }}
        onDragEnd={release}
      />
    ),
  });

  return { displayed: order ?? files, row };
}

/**
 * A card's attachments, at the end of its sheet. They arrive by
 * dragging files onto the drawer, through the "Actions" menu or through the link
 * placed under the list; everything goes to the server at once, without waiting for
 * "Enregistrer", like checklists.
 *
 * The inset only shows when there is something to show: a card without
 * attachments doesn't carry one more empty block.
 */
/** What the block needs of an attachment: a card's, or a declared equipment's. */
type AttachedFile = File & Pick<Attachment, "id">;

/**
 * A drop zone (FileDropzone): in place of the rows while there are none, and
 * under them while files are dragged over the drawer ("shown").
 */
export interface DropTarget {
  icon: ComponentType<{ size?: number }>;
  message: string;
  /** The browser's files: "File" here names an attachment as shown. */
  onDrop: (files: globalThis.File[]) => void;
  accept?: string[];
  rejected?: string;
  shown: boolean;
}

/** How the block names its files. */
interface AttachmentWords {
  title: string;
  /** "la pièce jointe", for deleting one. */
  one: string;
  /** "pièces jointes", after a count. */
  many: string;
}

const ATTACHMENT_WORDS: AttachmentWords = {
  title: "Pièces jointes",
  one: "la pièce jointe",
  many: "pièces jointes",
};

interface CardAttachmentsProps<T extends AttachedFile> {
  attachments: T[];
  /** Opens the drawer's file picker, the very one the "Actions" menu opens. */
  onPick: () => void;
  /** The full order, when a handle is dropped. */
  onReorder: (ids: Id[]) => void | Promise<void>;
  onDelete: (attachment: T) => void | Promise<void>;
  /**
   * Shown even without an attachment: its title, a drop zone, and "Ajouter un
   * fichier" — a declared equipment has no "Actions" menu to add the first
   * one from.
   */
  drop?: DropTarget;
  words?: AttachmentWords;
}

export default function CardAttachments<T extends AttachedFile>({
  attachments,
  onPick,
  onReorder,
  onDelete,
  drop,
  words = ATTACHMENT_WORDS,
}: CardAttachmentsProps<T>) {
  const [confirming, setConfirming] = useState(false);

  const attachmentList = attachments || [];
  const { displayed, row } = useOrderedFiles(attachmentList, onReorder, true);
  const selection = useRowSelection(attachmentList.map((a) => a.id));
  if (attachmentList.length === 0 && !drop) return null;

  const toDelete = attachmentList.filter((a) => selection.isChecked(a.id));

  return (
    // The block carries its heading like the other fields of the card — the
    // title, the description, the checklists —, and disappears with them when the
    // card has no attachment.
    <Input.Wrapper label={words.title}>
      {/* A stack of gray rows, like checklists: the drawer
          background shows between two attachments. */}
      <Box>
        {attachmentList.length === 0 && drop ? (
          <FileDropzone {...drop} />
        ) : (
          <Stack gap={2}>
            {displayed.map((attachment, rank) => (
              <FileRow
                key={attachment.id}
                attachment={attachment}
                checkbox={
                  <RowCheckbox
                    label={`Sélectionner ${attachment.name}`}
                    checked={selection.isChecked(attachment.id)}
                    onChange={(on) => selection.toggle(attachment.id, on)}
                    afterHandle
                  />
                }
                {...row(attachment, rank)}
              />
            ))}
          </Stack>
        )}
        {attachmentList.length > 0 && drop?.shown && (
          <div style={{ marginTop: 8 }}>
            <FileDropzone {...drop} reveal />
          </div>
        )}

        {/* As close as possible to the stack it extends. */}
        <ListFooter
          addLabel="Ajouter un fichier"
          onAdd={onPick}
          checkedCount={toDelete.length}
          onDeleteChecked={() => setConfirming(true)}
        />

        <DeleteConfirmModal
          opened={confirming && toDelete.length > 0}
          onClose={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            // The deleted attachments leave the list, and their boxes with
            // them; one the server refused stays checked (onDelete notifies).
            void Promise.all(toDelete.map((attachment) => onDelete(attachment)));
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
              <>Voulez-vous vraiment supprimer « {toDelete[0]?.name} » ?</>
            )
          }
        />
      </Box>
    </Input.Wrapper>
  );
}
