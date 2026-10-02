import { ActionIcon, Collapse, Group, Menu, Paper, Stack, Text, Textarea } from "@mantine/core";
import {
  IconChevronLeft,
  IconMessage,
  IconPencil,
  IconSend2,
  IconTrash,
} from "@tabler/icons-react";
import dayjs from "dayjs";
import { useState } from "react";
import { RED } from "../../themes/colors";
import { PersonAvatar } from "../ui/ActorAvatars";
import DeleteConfirmModal from "../ui/DeleteConfirmModal";
import EmptyPanel from "../ui/EmptyPanel";
import PointMenu, { positionDuMenu } from "../ui/PointMenu";
import type { PointMenuPosition } from "../ui/PointMenu";
import { MILO_ACTOR_ID } from "@milo/shared";
import type { Actor, SqliteBool } from "@milo/shared";

/**
 * Un commentaire tel que le fil l'affiche. Les deux fils du serveur — projets
 * et cartes — s'y rangent, ainsi que les brouillons d'un projet pas encore
 * créé, dont l'identifiant n'est pas encore un numéro de ligne.
 */
export interface FilItem {
  id: number | string;
  text: string;
  /** Les mots que l'application écrit elle-même : ni retouchés, ni effacés. */
  system?: SqliteBool;
  created_at: string;
  updated_at: string;
  author: Actor | null;
}

const formatTimestamp = (value: string): string => dayjs(value).format("DD/MM/YYYY HH:mm");

// Filet en pointillé entre l'entête du commentaire — auteur et date —
// et son texte.
const HEADER_LINE = "1px dotted var(--mantine-color-default-border)";

// Retrait du texte dans sa bulle. Le champ qui le remplace en saisie prend le
// même : le texte ne bouge pas d'un pixel quand on passe de l'un à l'autre.
const COMMENT_PADDING = 30;

interface CommentBubbleProps {
  comment: FilItem;
  onUpdate: (id: number | string, text: string) => void;
  onDelete: (id: number | string) => void;
  /** Le fil se lit sans s'écrire : la bulle ne se modifie ni ne se supprime. */
  readOnly?: boolean;
}

function CommentBubble({ comment, onUpdate, onDelete, readOnly = false }: CommentBubbleProps) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(comment.text);
  const [confirmDeleteOpened, setConfirmDeleteOpened] = useState(false);
  const [menu, setMenu] = useState<PointMenuPosition | null>(null);

  const startEdit = () => {
    setText(comment.text);
    setEditing(true);
  };

  const save = () => {
    if (!text.trim()) return;
    onUpdate(comment.id, text.trim());
    setEditing(false);
  };

  // Un mot écrit par l'application — la création de la carte ou du projet,
  // signée Milo — note un fait : il ne se retouche ni ne s'efface.
  const fige = readOnly || Boolean(comment.system) || comment.author?.id === MILO_ACTOR_ID;

  // Un mot de Milo — la création, les modifications — se montre plié : la
  // bulle se réduit à son bandeau, Milo et la date, sur fond bleu. Le bouton
  // à droite de la bulle le déplie, avec l'animation d'un accordéon.
  const systeme = Boolean(comment.system) || comment.author?.id === MILO_ACTOR_ID;
  const [deplie, setDeplie] = useState(false);
  const plie = systeme && !deplie;

  const remove = () => {
    setConfirmDeleteOpened(false);
    onDelete(comment.id);
  };

  return (
    <>
      <Paper
        // Replié, la bulle est un bandeau bleu plein, sans bordure.
        withBorder={!plie}
        bg={
          plie
            ? "var(--mantine-color-blue-filled)"
            : "light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-6))"
        }
        style={{
          borderRadius: "var(--mantine-radius-default)",
          transition: "background-color 200ms ease",
        }}
        // Les actions passent par le clic droit, et le double-clic modifie —
        // qui que soit l'auteur. Un mot figé n'a ni menu ni double-clic.
        onContextMenu={fige || editing ? undefined : (e) => setMenu(positionDuMenu(e))}
        onDoubleClick={fige || editing ? undefined : startEdit}
      >
        {/* Modifier un commentaire ne le sort pas de sa bulle : l'entête reste
            en place, seul le texte passe en saisie. Entrée valide, Maj+Entrée
            passe à la ligne, Échap annule. */}
        <Stack gap={0}>
          <Group
            justify="space-between"
            align="center"
            wrap="nowrap"
            px="sm"
            // Autant d'air au-dessus qu'en dessous : sans quoi l'auteur
            // et la date se posent trop haut dans leur bandeau.
            py={8}
            // Plié, le bandeau est toute la bulle : il n'a rien à séparer.
            style={plie ? undefined : { borderBottom: HEADER_LINE }}
          >
            {/* L'auteur à gauche, la date à droite. Un commentaire écrit avant
                qu'on retienne l'auteur, ou dont le compte a été supprimé, n'en
                a pas : sa pastille reste, sans nom. */}
            <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
              <PersonAvatar person={comment.author} size={22} />
              {comment.author && (
                <Text size="xs" fw={600} c={plie ? "white" : undefined} truncate>
                  {comment.author.name}
                </Text>
              )}
            </Group>

            <Group gap={4} wrap="nowrap" style={{ flexShrink: 0 }}>
              {/* Un mot de Milo complété par une retouche voisine n'est pas
                  « modifié » : il raconte la suite. */}
              <Text size="xs" c={plie ? "white" : "dimmed"}>
                {formatTimestamp(comment.updated_at)}
                {!systeme && comment.updated_at !== comment.created_at ? " (modifié)" : ""}
              </Text>

              {systeme && (
                <ActionIcon
                  variant="subtle"
                  color={plie ? "white" : "gray"}
                  size="sm"
                  onClick={() => setDeplie((d) => !d)}
                  aria-label={deplie ? "Replier le commentaire" : "Déplier le commentaire"}
                  aria-expanded={deplie}
                >
                  {/* Vers la gauche plié, vers le bas déplié : le chevron
                    tourne comme celui d'un accordéon. */}
                  <IconChevronLeft
                    size={16}
                    style={{
                      transform: deplie ? "rotate(-90deg)" : "none",
                      transition: "transform 200ms ease",
                    }}
                  />
                </ActionIcon>
              )}
            </Group>
          </Group>

          {/* Le commentaire est du texte simple : ses retours à la ligne
              comptent, et rien d'autre ne se met en forme. En saisie, le champ
              prend exactement la place du texte — même retrait, même taille,
              ni cadre ni fond : on écrit là où on lisait. */}
          <Collapse expanded={!plie}>
            {editing ? (
              <Textarea
                value={text}
                onChange={(e) => setText(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setEditing(false);
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    save();
                  }
                }}
                autosize
                minRows={1}
                autoFocus
                variant="unstyled"
                size="sm"
                p={COMMENT_PADDING}
                styles={{ input: { padding: 0, minHeight: 0 } }}
                aria-label="Modifier le commentaire"
              />
            ) : (
              <Text size="sm" p={COMMENT_PADDING} style={{ whiteSpace: "pre-wrap" }}>
                {comment.text}
              </Text>
            )}
          </Collapse>
        </Stack>
      </Paper>

      {menu && !fige && (
        <PointMenu position={menu} onClose={() => setMenu(null)}>
          <Menu.Item leftSection={<IconPencil size={16} />} onClick={startEdit}>
            Modifier
          </Menu.Item>
          <Menu.Divider />
          <Menu.Item
            color={RED}
            leftSection={<IconTrash size={16} />}
            onClick={() => setConfirmDeleteOpened(true)}
          >
            Supprimer
          </Menu.Item>
        </PointMenu>
      )}

      <DeleteConfirmModal
        opened={confirmDeleteOpened && !fige}
        onClose={() => setConfirmDeleteOpened(false)}
        onConfirm={remove}
        title="Supprimer le commentaire"
        message={
          <>Voulez-vous vraiment supprimer ce commentaire ? Cette action est irréversible.</>
        }
      />
    </>
  );
}

interface CommentThreadProps {
  comments: FilItem[];
  onAdd: (text: string) => void;
  onUpdate: (id: number | string, text: string) => void;
  onDelete: (id: number | string) => void;
  /**
   * Sans le droit de modifier l'élément, son fil se lit seulement : ni saisie,
   * ni modification, ni suppression.
   */
  readOnly?: boolean;
}

export default function CommentThread({
  comments,
  onAdd,
  onUpdate,
  onDelete,
  readOnly = false,
}: CommentThreadProps) {
  const [draft, setDraft] = useState("");

  const submit = () => {
    if (!draft.trim()) return;
    onAdd(draft.trim());
    setDraft("");
  };

  return (
    <Stack gap={0} style={{ flex: 1, minHeight: 0 }}>
      {/* La saisie garde ses 30 px sous elle ; l'écart de la pile est à zéro,
          sinon il s'ajouterait à ce retrait. */}
      {!readOnly && (
        <Group align="flex-end" gap="xs" pb={30}>
          <Textarea
            placeholder="Ajouter un commentaire…"
            value={draft}
            onChange={(e) => setDraft(e.currentTarget.value)}
            autosize
            minRows={1}
            maxRows={4}
            style={{ flex: 1 }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
          />
          <ActionIcon
            variant="filled"
            color="teal"
            size="lg"
            onClick={submit}
            aria-label="Envoyer le commentaire"
          >
            <IconSend2 size={16} />
          </ActionIcon>
        </Group>
      )}

      {comments.length === 0 ? (
        // Le fil vide occupe toute la hauteur restante ; la saisie au-dessus
        // tient déjà lieu d'action, l'invite n'a donc pas de bouton.
        <EmptyPanel icon={IconMessage} message="Aucun commentaire pour le moment." />
      ) : (
        <Stack gap="xs">
          {comments.map((comment) => (
            <CommentBubble
              key={comment.id}
              comment={comment}
              onUpdate={onUpdate}
              onDelete={onDelete}
              readOnly={readOnly}
            />
          ))}
        </Stack>
      )}
    </Stack>
  );
}
