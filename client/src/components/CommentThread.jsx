import { ActionIcon, Button, Group, Paper, Stack, Text, Textarea } from "@mantine/core";
import { IconCheck, IconPencil, IconSend2, IconTrash, IconX } from "@tabler/icons-react";
import dayjs from "dayjs";
import { useState } from "react";

const formatTimestamp = (value) => dayjs(value).format("DD/MM/YYYY HH:mm");

function CommentBubble({ comment, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(comment.text);

  const startEdit = () => {
    setText(comment.text);
    setEditing(true);
  };

  const save = () => {
    if (!text.trim()) return;
    onUpdate(comment.id, text.trim());
    setEditing(false);
  };

  return (
    <Paper withBorder radius="lg" p="sm" bg="gray.0">
      {editing ? (
        <Stack gap="xs">
          <Textarea value={text} onChange={(e) => setText(e.currentTarget.value)} autosize minRows={2} autoFocus />
          <Group justify="flex-end" gap="xs">
            <ActionIcon variant="subtle" color="gray" onClick={() => setEditing(false)} aria-label="Annuler">
              <IconX size={16} />
            </ActionIcon>
            <ActionIcon variant="subtle" color="blue" onClick={save} aria-label="Valider">
              <IconCheck size={16} />
            </ActionIcon>
          </Group>
        </Stack>
      ) : (
        <Stack gap={4}>
          <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
            {comment.text}
          </Text>
          <Group justify="space-between" align="center">
            <Text size="xs" c="dimmed">
              {formatTimestamp(comment.updated_at)}
              {comment.updated_at !== comment.created_at ? " (modifié)" : ""}
            </Text>
            <Group gap={4}>
              <ActionIcon variant="subtle" color="gray" size="sm" onClick={startEdit} aria-label="Modifier">
                <IconPencil size={14} />
              </ActionIcon>
              <ActionIcon
                variant="subtle"
                color="red"
                size="sm"
                onClick={() => onDelete(comment.id)}
                aria-label="Supprimer le commentaire"
              >
                <IconTrash size={14} />
              </ActionIcon>
            </Group>
          </Group>
        </Stack>
      )}
    </Paper>
  );
}

export default function CommentThread({ comments, onAdd, onUpdate, onDelete }) {
  const [draft, setDraft] = useState("");

  const submit = () => {
    if (!draft.trim()) return;
    onAdd(draft.trim());
    setDraft("");
  };

  return (
    <Stack gap="sm">
      <Text fw={500} size="sm">
        Commentaires
      </Text>

      <Stack gap="xs">
        {comments.length === 0 && (
          <Text size="sm" c="dimmed">
            Aucun commentaire pour le moment.
          </Text>
        )}
        {comments.map((comment) => (
          <CommentBubble key={comment.id} comment={comment} onUpdate={onUpdate} onDelete={onDelete} />
        ))}
      </Stack>

      <Group align="flex-end" gap="xs">
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
        <ActionIcon variant="filled" color="blue" size="lg" onClick={submit} aria-label="Envoyer le commentaire">
          <IconSend2 size={16} />
        </ActionIcon>
      </Group>
    </Stack>
  );
}
