import { ActionIcon, Group, Paper, Stack, Text, Textarea } from "@mantine/core";
import { IconCheck, IconMessage, IconPencil, IconSend2, IconTrash, IconX } from "@tabler/icons-react";
import dayjs from "dayjs";
import { useState } from "react";
import { RED } from "../../themes/colors";
import { PersonAvatar } from "../ui/ActorAvatars";
import DeleteConfirmModal from "../ui/DeleteConfirmModal";
import EmptyPanel from "../ui/EmptyPanel";
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

// Filet en pointillé entre l'entête du commentaire — auteur, date, actions —
// et son texte.
const HEADER_LINE = "1px dotted var(--mantine-color-default-border)";

// Retrait du texte dans sa bulle. Le champ qui le remplace en saisie prend le
// même : le texte ne bouge pas d'un pixel quand on passe de l'un à l'autre.
const COMMENT_PADDING = 30;

interface CommentBubbleProps {
  comment: FilItem;
  onUpdate: (id: number | string, text: string) => void;
  onDelete: (id: number | string) => void;
}

function CommentBubble({ comment, onUpdate, onDelete }: CommentBubbleProps) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(comment.text);
  const [confirmDeleteOpened, setConfirmDeleteOpened] = useState(false);

  const startEdit = () => {
    setText(comment.text);
    setEditing(true);
  };

  const save = () => {
    if (!text.trim()) return;
    onUpdate(comment.id, text.trim());
    setEditing(false);
  };

  const remove = () => {
    setConfirmDeleteOpened(false);
    onDelete(comment.id);
  };

  return (
    <>
      <Paper
        withBorder
        bg="light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-6))"
        style={{ borderRadius: "var(--mantine-radius-default)" }}
      >
        {/* Modifier un commentaire ne le sort pas de sa bulle : l'entête reste
            en place, seul le texte passe en saisie, et les deux actions de
            l'entête deviennent « annuler » et « valider ». */}
        <Stack gap={0}>
          <Group
            justify="space-between"
            align="center"
            wrap="nowrap"
            px="sm"
            // Autant d'air au-dessus qu'en dessous : sans quoi l'auteur, la
            // date et les actions se posent trop haut dans leur bandeau.
            py={8}
            style={{ borderBottom: HEADER_LINE }}
          >
            {/* L'auteur devant la date. Un commentaire écrit avant qu'on
                retienne l'auteur, ou dont le compte a été supprimé, n'en a
                pas : sa pastille reste, sans nom. */}
            <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
              <PersonAvatar person={comment.author} size={22} />
              {comment.author && (
                <Text size="xs" fw={600} truncate>
                  {comment.author.name}
                </Text>
              )}
              <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
                {formatTimestamp(comment.updated_at)}
                {comment.updated_at !== comment.created_at ? " (modifié)" : ""}
              </Text>
            </Group>

            {/* Un mot écrit par l'application — la création de la carte ou du
                projet — note un fait : il ne se retouche ni ne s'efface, et ne
                porte donc aucune action. */}
            {!comment.system &&
              (editing ? (
                <Group gap={4}>
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="sm"
                    onClick={() => setEditing(false)}
                    aria-label="Annuler"
                  >
                    <IconX size={14} />
                  </ActionIcon>
                  <ActionIcon
                    variant="subtle"
                    color="teal"
                    size="sm"
                    onClick={save}
                    disabled={!text.trim()}
                    aria-label="Valider"
                  >
                    <IconCheck size={14} />
                  </ActionIcon>
                </Group>
              ) : (
                <Group gap={4}>
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="sm"
                    onClick={startEdit}
                    aria-label="Modifier"
                  >
                    <IconPencil size={14} />
                  </ActionIcon>
                  <ActionIcon
                    variant="subtle"
                    color={RED}
                    size="sm"
                    onClick={() => setConfirmDeleteOpened(true)}
                    aria-label="Supprimer le commentaire"
                  >
                    <IconTrash size={14} />
                  </ActionIcon>
                </Group>
              ))}
          </Group>

          {/* Le commentaire est du texte simple : ses retours à la ligne
              comptent, et rien d'autre ne se met en forme. En saisie, le champ
              prend exactement la place du texte — même retrait, même taille,
              ni cadre ni fond : on écrit là où on lisait. */}
          {editing ? (
            <Textarea
              value={text}
              onChange={(e) => setText(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setEditing(false);
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
        </Stack>
      </Paper>

      <DeleteConfirmModal
        opened={confirmDeleteOpened}
        onClose={() => setConfirmDeleteOpened(false)}
        onConfirm={remove}
        title="Supprimer le commentaire"
        message={<>Voulez-vous vraiment supprimer ce commentaire ? Cette action est irréversible.</>}
      />
    </>
  );
}

interface CommentThreadProps {
  comments: FilItem[];
  onAdd: (text: string) => void;
  onUpdate: (id: number | string, text: string) => void;
  onDelete: (id: number | string) => void;
}

export default function CommentThread({
  comments,
  onAdd,
  onUpdate,
  onDelete,
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

      {comments.length === 0 ? (
        // Le fil vide occupe toute la hauteur restante ; la saisie au-dessus
        // tient déjà lieu d'action, l'invite n'a donc pas de bouton.
        <EmptyPanel icon={IconMessage} message="Aucun commentaire pour le moment." />
      ) : (
        <Stack gap="xs">
          {comments.map((comment) => (
            <CommentBubble key={comment.id} comment={comment} onUpdate={onUpdate} onDelete={onDelete} />
          ))}
        </Stack>
      )}
    </Stack>
  );
}
