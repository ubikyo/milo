import {
  ActionIcon,
  Box,
  Group,
  Input,
  Menu,
  Paper,
  Stack,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { IconExternalLink, IconPlus, IconTrash } from "@tabler/icons-react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { useState } from "react";
import { ADD_ACTION, FIELD_ICON, RED } from "../../themes/colors";
import { PLUS_GAP, PLUS_SIZE } from "../../themes/plus";
import DeleteConfirmModal from "../ui/DeleteConfirmModal";
import PointMenu, {
  positionDuMenu,
  type PointMenuPosition,
} from "../ui/PointMenu";
import type { Attachment } from "@milo/shared";

// « il y a 3 minutes » plutôt qu'une date : une pièce jointe vient d'être
// déposée le plus souvent, et c'est cela qu'on veut lire. Le français vient de
// la locale chargée au démarrage (main.tsx).
dayjs.extend(relativeTime);

// L'encart de gauche : la photo, ou l'extension. Assez large pour qu'une
// vignette se reconnaisse, assez bas pour que deux lignes de texte tiennent à
// côté sans que la ligne ne s'étire.
const VIGNETTE_L = 64;
const VIGNETTE_H = 48;

const VIGNETTE_BG =
  "light-dark(var(--mantine-color-gray-1), var(--mantine-color-dark-5))";

/** L'extension d'un nom de fichier, en capitales : « CER », « PDF », « ZIP ». */
const extension = (nom: string): string => {
  const trouve = /\.([A-Za-z0-9]{1,5})$/.exec(nom.trim());
  return trouve ? trouve[1]!.toUpperCase() : "FIC";
};

/**
 * Quand la pièce jointe est arrivée. Tout frais, on dit « à l'instant » plutôt
 * que « il y a quelques secondes » ; passé une semaine, le relatif ne dit plus
 * rien d'utile et la date reprend la main.
 */
const depuis = (iso: string): string => {
  const date = dayjs(iso);
  if (!date.isValid()) return "";

  const secondes = dayjs().diff(date, "second");
  if (secondes < 60) return "à l'instant";
  if (secondes < 7 * 24 * 3600) return date.locale("fr").fromNow();
  return date.locale("fr").format("DD/MM/YYYY [à] HH:mm");
};

/** Une taille de fichier, à l'unité qui se lit : « 240 Ko », « 3,1 Mo ». */
const taille = (octets: number): string => {
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} Ko`;
  return `${(octets / (1024 * 1024)).toFixed(1).replace(".", ",")} Mo`;
};

// « Supprimer » est dans le menu contextuel de la ligne, au clic droit, comme
// pour les checklists et les cartes du tableau.
interface LigneProps {
  piece: Attachment;
  onContextMenu: (position: PointMenuPosition) => void;
}

function Ligne({ piece, onContextMenu }: LigneProps) {
  return (
    <Group
      gap="sm"
      wrap="nowrap"
      align="center"
      onContextMenu={(e) => onContextMenu(positionDuMenu(e))}
    >
      {/* L'encart : la photo si c'en est une, sinon son extension au centre. */}
      <Box
        w={VIGNETTE_L}
        h={VIGNETTE_H}
        style={{
          flexShrink: 0,
          overflow: "hidden",
          borderRadius: "var(--mantine-radius-sm)",
          backgroundColor: VIGNETTE_BG,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {piece.is_image ? (
          <img
            src={piece.url}
            alt={piece.name}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <Text size="sm" fw={700} c="dimmed">
            {extension(piece.name)}
          </Text>
        )}
      </Box>

      {/* Le nom, et dessous le moment du dépôt. */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <Text size="sm" fw={500} truncate>
          {piece.name}
        </Text>
        <Text size="xs" c="dimmed">
          {depuis(piece.created_at)} · {taille(piece.size)}
        </Text>
      </div>

      <ActionIcon
        component="a"
        href={piece.url}
        target="_blank"
        rel="noreferrer"
        variant="subtle"
        color="gray"
        size="sm"
        style={{ flexShrink: 0, color: FIELD_ICON }}
        aria-label={`Ouvrir ${piece.name}`}
      >
        <IconExternalLink size={16} />
      </ActionIcon>
    </Group>
  );
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
  onDelete: (piece: Attachment) => void | Promise<void>;
}

export default function CardAttachments({
  attachments,
  onPick,
  onDelete,
}: CardAttachmentsProps) {
  const [aSupprimer, setASupprimer] = useState<Attachment | null>(null);
  const [menu, setMenu] = useState<{
    piece: Attachment;
    position: PointMenuPosition;
  } | null>(null);

  const pieces = attachments || [];
  if (pieces.length === 0) return null;

  return (
    // Le bloc porte son intitulé comme les autres champs de la fiche — le
    // titre, la description, les checklists —, et disparaît avec eux quand la
    // carte n'a aucune pièce jointe.
    <Input.Wrapper label="Pièces jointes">
      {/* Le fond des champs de la fiche, sans leur bordure, comme les
          checklists. */}
      <Paper radius="md" p="sm" bg="var(--mantine-color-default)">
        <Stack gap="sm">
          {pieces.map((piece) => (
            <Ligne
              key={piece.id}
              piece={piece}
              onContextMenu={(position) => setMenu({ piece, position })}
            />
          ))}

          {/* Le vert des actions « ajouter », comme au bout d'une checklist. */}
          <UnstyledButton onClick={onPick} mt={4}>
            <Group gap={PLUS_GAP} wrap="nowrap" c={ADD_ACTION.color}>
              <IconPlus size={PLUS_SIZE} />
              <Text size="sm">Ajouter un fichier</Text>
            </Group>
          </UnstyledButton>
        </Stack>

        {menu && (
          <PointMenu position={menu.position} onClose={() => setMenu(null)}>
            <Menu.Item
              color={RED}
              leftSection={<IconTrash size={16} />}
              onClick={() => setASupprimer(menu.piece)}
            >
              Supprimer
            </Menu.Item>
          </PointMenu>
        )}

        <DeleteConfirmModal
          opened={aSupprimer !== null}
          onClose={() => setASupprimer(null)}
          onConfirm={() => {
            const piece = aSupprimer;
            setASupprimer(null);
            if (piece) void onDelete(piece);
          }}
          title="Supprimer la pièce jointe"
          message={<>Voulez-vous vraiment supprimer « {aSupprimer?.name} » ?</>}
        />
      </Paper>
    </Input.Wrapper>
  );
}
