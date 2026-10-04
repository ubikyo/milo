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

// « il y a 3 minutes » plutôt qu'une date : une pièce jointe vient d'être
// déposée le plus souvent, et c'est cela qu'on veut lire. Le français vient de
// la locale chargée au démarrage (main.tsx).
dayjs.extend(relativeTime);

// L'encart de gauche : la photo, ou l'extension. Assez large pour qu'une
// vignette se reconnaisse, assez bas pour que deux lignes de texte tiennent à
// côté sans que la ligne ne s'étire.
const THUMBNAIL_W = 64;
const THUMBNAIL_H = 48;

/** L'extension d'un nom de fichier, en capitales : « CER », « PDF », « ZIP ». */
const extension = (name: string): string => {
  const found = /\.([A-Za-z0-9]{1,5})$/.exec(name.trim());
  return found ? found[1]!.toUpperCase() : "FIC";
};

/**
 * Quand la pièce jointe est arrivée. Tout frais, on dit « à l'instant » plutôt
 * que « il y a quelques secondes » ; passé une semaine, le relatif ne dit plus
 * rien d'utile et la date reprend la main.
 */
const since = (iso: string): string => {
  const date = dayjs(iso);
  if (!date.isValid()) return "";

  const seconds = dayjs().diff(date, "second");
  if (seconds < 60) return "à l'instant";
  if (seconds < 7 * 24 * 3600) return date.locale("fr").fromNow();
  return date.locale("fr").format("DD/MM/YYYY [à] HH:mm");
};

/** Une taille de fichier, à l'unité qui se lit : « 240 Ko », « 3,1 Mo ». */
const size = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} Mo`;
};

/** Ce qu'une ligne montre d'un fichier : une pièce jointe, une couverture. */
export type File = Pick<Attachment, "url" | "name" | "created_at" | "size" | "is_image">;

// Toute la ligne ouvre le fichier dans un nouvel onglet ; « Supprimer » est
// dans son menu contextuel, au clic droit, comme pour les checklists et les
// cartes du tableau. Les images de couverture (CardCovers) se montrent sur la
// même ligne, une poignée devant pour les ranger.
interface RowProps extends Omit<ComponentPropsWithoutRef<"a">, "onContextMenu"> {
  attachment: File;
  onContextMenu: (position: PointMenuPosition) => void;
  /** Posé avant la vignette : la poignée qui range les couvertures. */
  handle?: ReactNode;
}

export function FileRow({ attachment, onContextMenu, handle, ...props }: RowProps) {
  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noreferrer"
      className={classes.ligne}
      aria-label={`Ouvrir ${attachment.name}`}
      onContextMenu={(e) => onContextMenu(menuPosition(e))}
      {...props}
    >
      <Group gap="sm" wrap="nowrap" align="center">
        {handle}
        {/* L'encart : la photo si c'en est une, sinon son extension au centre. */}
        <Box
          w={THUMBNAIL_W}
          h={THUMBNAIL_H}
          className={classes.vignette}
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
              // Décodée à part : une grande photo ne fige pas la fiche.
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

        {/* Le nom, et dessous le moment du dépôt. */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <Text size="sm" fw={500} truncate>
            {attachment.name}
          </Text>
          <Text size="xs" c="dimmed">
            {since(attachment.created_at)} · {size(attachment.size)}
          </Text>
        </div>

        {/* Le rappel que le clic ouvre un nouvel onglet. */}
        <IconExternalLink
          size={16}
          style={{ flexShrink: 0, color: FIELD_ICON }}
        />
      </Group>
    </a>
  );
}

/**
 * Une pile de fichiers qu'on range à la poignée — les pièces jointes, les
 * couvertures. L'ordre bouge à l'écran pendant le glisser et ne part qu'au
 * lâcher, s'il a changé. Rend ce qu'il faut poser sur chaque ligne.
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
      // Un clic sur la poignée ne doit pas ouvrir le fichier.
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
 * Les pièces jointes d'une carte, à la fin de sa fiche. Elles arrivent en
 * glissant des fichiers sur le tiroir, par le menu « Actions » ou par le lien
 * posé sous la liste ; tout part au serveur aussitôt, sans attendre
 * « Enregistrer », comme les checklists.
 *
 * L'encart ne se montre que s'il y a quelque chose à montrer : une carte sans
 * pièce jointe ne porte pas un bloc vide de plus.
 */
interface CardAttachmentsProps {
  attachments: Attachment[];
  /** Ouvre le sélecteur de fichiers du tiroir, celui-là même que le menu « Actions » ouvre. */
  onPick: () => void;
  /** L'ordre complet, au lâcher d'une poignée. */
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
    // Le bloc porte son intitulé comme les autres champs de la fiche — le
    // titre, la description, les checklists —, et disparaît avec eux quand la
    // carte n'a aucune pièce jointe.
    <Input.Wrapper label="Pièces jointes">
      {/* Une pile de lignes grises, comme les checklists : le fond du
          tiroir se montre entre deux pièces. */}
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

        {/* Au plus près de la pile qu'il allonge. */}
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
