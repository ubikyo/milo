import { Box, Group, Input, Menu, Stack, Text } from "@mantine/core";
import { IconExternalLink, IconTrash } from "@tabler/icons-react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { useState } from "react";
import type { ComponentPropsWithoutRef, DragEvent, ReactNode } from "react";
import { FIELD_ICON, RED } from "../../themes/colors";
import AddButton from "../ui/AddButton";
import { Handle, move } from "../ui/DrawerRows";
import DeleteConfirmModal from "../ui/DeleteConfirmModal";
import PointMenu, {
  menuPosition,
  type PointMenuPosition,
} from "../ui/PointMenu";
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

// The whole row opens the file in a new tab; "Supprimer" is in its context
// menu, on right click, like for checklists and board cards. Cover images
// (CardCovers) show on the same row, with a handle in front to reorder them.
interface RowProps extends Omit<ComponentPropsWithoutRef<"a">, "onContextMenu"> {
  attachment: File;
  onContextMenu: (position: PointMenuPosition) => void;
  /** Placed before the thumbnail: the handle that reorders the covers. */
  handle?: ReactNode;
}

export function FileRow({ attachment, onContextMenu, handle, ...props }: RowProps) {
  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noreferrer"
      className={classes.row}
      aria-label={`Ouvrir ${attachment.name}`}
      onContextMenu={(e) => onContextMenu(menuPosition(e))}
      {...props}
    >
      <Group gap="sm" wrap="nowrap" align="center">
        {handle}
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
        <IconExternalLink
          size={16}
          style={{ flexShrink: 0, color: FIELD_ICON }}
        />
      </Group>
    </a>
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
    onDragOver: (e: DragEvent<HTMLAnchorElement>) => {
      if (held === null || !order) return;
      e.preventDefault();
      const next = move(order, held, rank);
      if (!next) return;
      setHeld(rank);
      setOrder(next);
    },
    onDrop: (e: DragEvent<HTMLAnchorElement>) => e.preventDefault(),
    style: { opacity: held === rank ? 0.5 : 1 },
    handle: active && (
      // A click on the handle must not open the file.
      <span onClick={(e) => e.preventDefault()} style={{ display: "flex" }}>
        <Handle
          label={`Déplacer ${file.name || "le fichier"}`}
          onDragStart={() => {
            setHeld(rank);
            setOrder(files);
          }}
          onDragEnd={release}
        />
      </span>
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
interface CardAttachmentsProps {
  attachments: Attachment[];
  /** Opens the drawer's file picker, the very one the "Actions" menu opens. */
  onPick: () => void;
  /** The full order, when a handle is dropped. */
  onReorder: (ids: Id[]) => void | Promise<void>;
  onDelete: (attachment: Attachment) => void | Promise<void>;
}

export default function CardAttachments({
  attachments,
  onPick,
  onReorder,
  onDelete,
}: CardAttachmentsProps) {
  const [toDelete, setToDelete] = useState<Attachment | null>(null);
  const [menu, setMenu] = useState<{
    attachment: Attachment;
    position: PointMenuPosition;
  } | null>(null);

  const attachmentList = attachments || [];
  const { displayed, row } = useOrderedFiles(attachmentList, onReorder, true);
  if (attachmentList.length === 0) return null;

  return (
    // The block carries its heading like the other fields of the card — the
    // title, the description, the checklists —, and disappears with them when the
    // card has no attachment.
    <Input.Wrapper label="Pièces jointes">
      {/* A stack of gray rows, like checklists: the drawer
          background shows between two attachments. */}
      <Box>
        <Stack gap={2}>
          {displayed.map((attachment, rank) => (
            <FileRow
              key={attachment.id}
              attachment={attachment}
              onContextMenu={(position) => setMenu({ attachment, position })}
              {...row(attachment, rank)}
            />
          ))}
        </Stack>

        {/* As close as possible to the stack it extends. */}
        <AddButton label="Ajouter un fichier" onClick={onPick} mt={4} />

        {menu && (
          <PointMenu position={menu.position} onClose={() => setMenu(null)}>
            <Menu.Item
              color={RED}
              leftSection={<IconTrash size={16} />}
              onClick={() => setToDelete(menu.attachment)}
            >
              Supprimer
            </Menu.Item>
          </PointMenu>
        )}

        <DeleteConfirmModal
          opened={toDelete !== null}
          onClose={() => setToDelete(null)}
          onConfirm={() => {
            const attachment = toDelete;
            setToDelete(null);
            if (attachment) void onDelete(attachment);
          }}
          title="Supprimer la pièce jointe"
          message={<>Voulez-vous vraiment supprimer « {toDelete?.name} » ?</>}
        />
      </Box>
    </Input.Wrapper>
  );
}
