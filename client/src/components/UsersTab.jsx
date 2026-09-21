import {
  ActionIcon,
  Button,
  Fieldset,
  Group,
  Paper,
  ScrollArea,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { IconCheck, IconPencil, IconPlus, IconTrash, IconX } from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { RED } from "../colors";
import ActorAvatars from "./ActorAvatars.jsx";
import DeleteConfirmModal from "./DeleteConfirmModal.jsx";
import ErrorAlert from "./ErrorAlert.jsx";

// L'administrateur n'invite qu'une adresse : le profil est complété par la
// personne lors de sa première connexion.
const emptyDraft = { email: "" };

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
    if (await run(() => api.createUser({ email: draft.email.trim() }))) setDraft(emptyDraft);
  };

  const saveEdit = async () => {
    const payload = {
      first_name: editing.first_name.trim(),
      last_name: editing.last_name.trim(),
      email: editing.email.trim(),
    };
    if (await run(() => api.updateUser(editing.id, payload))) setEditing(null);
  };

  return (
    <Stack gap="sm" style={{ flex: 1, minHeight: 0 }}>
      {error && <ErrorAlert onClose={() => setError(null)}>{error}</ErrorAlert>}

      <ScrollArea style={{ flex: 1, minHeight: 0 }} type="auto" scrollbarSize={2} offsetScrollbars>
        <Stack gap="xs">
          {users.map((user) => (
            <Paper key={user.id} withBorder radius="md" p="xs">
              {editing?.id === user.id ? (
                <Stack gap="xs">
                  <TextInput
                    label="Prénom"
                    value={editing.first_name}
                    onChange={(e) => {
                      const { value } = e.currentTarget;
                      setEditing((u) => ({ ...u, first_name: value }));
                    }}
                  />
                  <TextInput
                    label="Nom"
                    value={editing.last_name}
                    onChange={(e) => {
                      const { value } = e.currentTarget;
                      setEditing((u) => ({ ...u, last_name: value }));
                    }}
                  />
                  <TextInput
                    label="E-mail"
                    value={editing.email}
                    onChange={(e) => {
                      const { value } = e.currentTarget;
                      setEditing((u) => ({ ...u, email: value }));
                    }}
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
                      color="teal"
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
                  <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
                    <ActorAvatars actors={[user]} max={1} />
                    <div style={{ minWidth: 0 }}>
                      <Text size="sm">
                        {user.first_name || user.last_name ? user.name : "—"}
                        {user.id === currentUser?.id && (
                          <Text span size="xs" c="dimmed">
                            {" "}
                            (vous)
                          </Text>
                        )}
                        {!user.activated && (
                          <Text span size="xs" c="dimmed">
                            {" "}
                            (première connexion à faire)
                          </Text>
                        )}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {user.email}
                      </Text>
                    </div>
                  </Group>
                  {/* Son propre compte se gère depuis les préférences : aucune
                      action n'est proposée ici. */}
                  {user.id !== currentUser?.id && (
                    <Group gap={4} wrap="nowrap">
                      <ActionIcon
                        variant="subtle"
                        color="gray"
                        onClick={() => setEditing({ ...user })}
                        aria-label={`Modifier ${user.name}`}
                      >
                        <IconPencil size={16} />
                      </ActionIcon>
                      <ActionIcon
                        variant="subtle"
                        color={RED}
                        onClick={() => setPendingDelete(user)}
                        aria-label={`Supprimer ${user.name}`}
                      >
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Group>
                  )}
                </Group>
              )}
            </Paper>
          ))}
        </Stack>
      </ScrollArea>

      <Fieldset legend="Nouvel utilisateur" p="xs" radius="md">
        <Group gap="xs" wrap="nowrap">
          <TextInput
            placeholder="E-mail"
            type="email"
            value={draft.email}
            onChange={(e) => {
              const { value } = e.currentTarget;
              setDraft((d) => ({ ...d, email: value }));
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") create();
            }}
            style={{ flex: 1 }}
          />
          <Button
            color="teal"
            leftSection={<IconPlus size={16} />}
            onClick={create}
            loading={busy}
            disabled={!draft.email.trim()}
          >
            Ajouter
          </Button>
        </Group>
      </Fieldset>

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
