import {
  ActionIcon,
  Alert,
  Button,
  Group,
  Paper,
  PasswordInput,
  ScrollArea,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { IconCheck, IconPencil, IconPlus, IconTrash, IconX } from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import DeleteConfirmModal from "./DeleteConfirmModal.jsx";

const emptyDraft = { name: "", email: "", password: "" };

export default function UsersTab({ currentUser }) {
  const [users, setUsers] = useState([]);
  const [draft, setDraft] = useState(emptyDraft);
  const [editing, setEditing] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => setUsers(await api.getUsers()), []);

  useEffect(() => {
    reload();
  }, [reload]);

  const run = async (action) => {
    setError(null);
    setBusy(true);
    try {
      await action();
      await reload();
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    if (await run(() => api.createUser({ ...draft, name: draft.name.trim(), email: draft.email.trim() })))
      setDraft(emptyDraft);
  };

  const saveEdit = async () => {
    const payload = { name: editing.name.trim(), email: editing.email.trim() };
    // Mot de passe laissé vide = inchangé.
    if (editing.password) payload.password = editing.password;
    if (await run(() => api.updateUser(editing.id, payload))) setEditing(null);
  };

  return (
    <Stack gap="sm" style={{ flex: 1, minHeight: 0 }}>
      {error && (
        <Alert color="red" variant="light" withCloseButton onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <ScrollArea style={{ flex: 1, minHeight: 0 }} type="auto" scrollbarSize={2} offsetScrollbars>
        <Stack gap="xs">
          {users.map((user) => (
            <Paper key={user.id} withBorder radius="md" p="xs">
              {editing?.id === user.id ? (
                <Stack gap="xs">
                  <TextInput
                    label="Nom"
                    value={editing.name}
                    onChange={(e) => setEditing((u) => ({ ...u, name: e.currentTarget.value }))}
                  />
                  <TextInput
                    label="E-mail"
                    value={editing.email}
                    onChange={(e) => setEditing((u) => ({ ...u, email: e.currentTarget.value }))}
                  />
                  <PasswordInput
                    label="Nouveau mot de passe"
                    placeholder="Laisser vide pour ne pas changer"
                    value={editing.password}
                    onChange={(e) => setEditing((u) => ({ ...u, password: e.currentTarget.value }))}
                  />
                  <Group justify="flex-end" gap="xs">
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      onClick={() => setEditing(null)}
                      aria-label="Annuler"
                    >
                      <IconX size={16} />
                    </ActionIcon>
                    <ActionIcon
                      variant="subtle"
                      color="blue"
                      onClick={saveEdit}
                      loading={busy}
                      aria-label="Valider"
                    >
                      <IconCheck size={16} />
                    </ActionIcon>
                  </Group>
                </Stack>
              ) : (
                <Group justify="space-between" wrap="nowrap">
                  <div style={{ minWidth: 0 }}>
                    <Text size="sm">
                      {user.name}
                      {user.id === currentUser?.id && (
                        <Text span size="xs" c="dimmed">
                          {" "}
                          (vous)
                        </Text>
                      )}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {user.email}
                    </Text>
                  </div>
                  <Group gap={4} wrap="nowrap">
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      onClick={() => setEditing({ ...user, password: "" })}
                      aria-label={`Modifier ${user.name}`}
                    >
                      <IconPencil size={16} />
                    </ActionIcon>
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      onClick={() => setPendingDelete(user)}
                      disabled={user.id === currentUser?.id}
                      aria-label={`Supprimer ${user.name}`}
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Group>
                </Group>
              )}
            </Paper>
          ))}
        </Stack>
      </ScrollArea>

      <Paper withBorder radius="md" p="xs">
        <Stack gap="xs">
          <Text size="xs" fw={500}>
            Nouvel utilisateur
          </Text>
          <Group gap="xs" grow>
            <TextInput
              placeholder="Nom"
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.currentTarget.value }))}
            />
            <TextInput
              placeholder="E-mail"
              value={draft.email}
              onChange={(e) => setDraft((d) => ({ ...d, email: e.currentTarget.value }))}
            />
          </Group>
          <Group gap="xs" wrap="nowrap">
            <PasswordInput
              placeholder="Mot de passe (8 caractères min.)"
              value={draft.password}
              onChange={(e) => setDraft((d) => ({ ...d, password: e.currentTarget.value }))}
              style={{ flex: 1 }}
            />
            <Button
              color="teal"
              leftSection={<IconPlus size={16} />}
              onClick={create}
              loading={busy}
              disabled={!draft.name.trim() || !draft.email.trim() || !draft.password}
            >
              Ajouter
            </Button>
          </Group>
        </Stack>
      </Paper>

      <DeleteConfirmModal
        opened={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={async () => {
          await run(() => api.deleteUser(pendingDelete.id));
          setPendingDelete(null);
        }}
        title="Supprimer l'utilisateur"
        message={
          <>
            Voulez-vous vraiment supprimer « {pendingDelete?.name} » ? Cette personne perdra l'accès à Milo.
            Cette action est irréversible.
          </>
        }
      />
    </Stack>
  );
}
