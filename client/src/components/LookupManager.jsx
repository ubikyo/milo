import { ActionIcon, Alert, Button, Group, Paper, ScrollArea, Stack, Text, TextInput } from "@mantine/core";
import { IconCheck, IconPencil, IconPlus, IconTrash, IconX } from "@tabler/icons-react";
import { useState } from "react";
import DeleteConfirmModal from "./DeleteConfirmModal.jsx";

/**
 * Liste éditable en ligne (ajout / modification / suppression) pour les
 * ressources qui n'ont qu'un nom : sociétés et catégories.
 */
export default function LookupManager({
  items,
  onCreate,
  onUpdate,
  onDelete,
  addPlaceholder,
  emptyText,
  entityLabel,
}) {
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState("");
  const [newName, setNewName] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);

  const run = async (action) => {
    setError(null);
    setBusy(true);
    try {
      await action();
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (item) => {
    setError(null);
    setEditingId(item.id);
    setEditingName(item.name);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingName("");
  };

  const saveEdit = async () => {
    if (!editingName.trim()) return;
    if (await run(() => onUpdate(editingId, editingName.trim()))) cancelEdit();
  };

  const create = async () => {
    if (!newName.trim()) return;
    if (await run(() => onCreate(newName.trim()))) setNewName("");
  };

  return (
    <Stack gap="sm" style={{ flex: 1, minHeight: 0 }}>
      {error && (
        <Alert color="red" variant="light" withCloseButton onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <ScrollArea
        style={{ flex: 1, minHeight: 0 }}
        type="always"
        scrollbarSize={2}
        styles={{
          // La barre pilote bien cette liste, mais on la sort de son conteneur
          // pour la coller au bord droit de la modale, sur toute sa hauteur :
          // `root` en position statique, la barre se cale alors sur le premier
          // ancêtre positionné, c'est-à-dire le contenu de la modale.
          root: { position: "static" },
          scrollbar: {
            top: 0,
            bottom: 0,
            right: 0,
            left: "auto",
            height: "auto",
            width: "var(--scrollarea-scrollbar-size)",
          },
        }}
      >
        <Stack gap="xs">
          {items.length === 0 && (
            <Text size="sm" c="dimmed">
              {emptyText}
            </Text>
          )}

          {items.map((item) => (
            <Paper key={item.id} withBorder radius="md" p="xs">
              {editingId === item.id ? (
                <Group gap="xs" wrap="nowrap">
                  <TextInput
                    value={editingName}
                    onChange={(e) => setEditingName(e.currentTarget.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveEdit();
                      if (e.key === "Escape") cancelEdit();
                    }}
                    style={{ flex: 1 }}
                    autoFocus
                  />
                  <ActionIcon variant="subtle" color="gray" onClick={cancelEdit} aria-label="Annuler">
                    <IconX size={16} />
                  </ActionIcon>
                  <ActionIcon
                    variant="subtle"
                    color="blue"
                    onClick={saveEdit}
                    loading={busy}
                    disabled={!editingName.trim()}
                    aria-label="Valider"
                  >
                    <IconCheck size={16} />
                  </ActionIcon>
                </Group>
              ) : (
                <Group gap="xs" wrap="nowrap" justify="space-between">
                  <Text size="sm" style={{ flex: 1 }}>
                    {item.name}
                  </Text>
                  <Group gap={4} wrap="nowrap">
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      onClick={() => startEdit(item)}
                      aria-label={`Modifier ${item.name}`}
                    >
                      <IconPencil size={16} />
                    </ActionIcon>
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      onClick={() => setPendingDelete(item)}
                      aria-label={`Supprimer ${item.name}`}
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

      <Group gap="xs" wrap="nowrap">
        <TextInput
          placeholder={addPlaceholder}
          value={newName}
          onChange={(e) => setNewName(e.currentTarget.value)}
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
          disabled={!newName.trim()}
        >
          Ajouter
        </Button>
      </Group>

      <DeleteConfirmModal
        opened={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={async () => {
          await run(() => onDelete(pendingDelete.id));
          setPendingDelete(null);
        }}
        title={`Supprimer ${entityLabel}`}
        message={
          <>
            Voulez-vous vraiment supprimer « {pendingDelete?.name} » ?
            {pendingDelete?.building_count > 0 && (
              <>
                {" "}
                <strong>
                  {pendingDelete.building_count} bâtiment
                  {pendingDelete.building_count > 1 ? "s" : ""}
                </strong>{" "}
                seront supprimés.
              </>
            )}
            {pendingDelete?.project_count > 0 && (
              <>
                {" "}
                <strong>
                  {pendingDelete.project_count} projet
                  {pendingDelete.project_count > 1 ? "s" : ""}
                </strong>{" "}
                rattaché{pendingDelete.project_count > 1 ? "s" : ""} et leurs commentaires seront également
                supprimés.
              </>
            )}{" "}
            Cette action est irréversible.
          </>
        }
      />
    </Stack>
  );
}
