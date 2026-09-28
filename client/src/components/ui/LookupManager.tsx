import { ActionIcon, Group, Stack, Text, TextInput, UnstyledButton } from "@mantine/core";
import { IconPencil, IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import { RED } from "../../themes/colors";
import DeleteConfirmModal from "./DeleteConfirmModal.jsx";
import ErrorAlert from "./ErrorAlert.jsx";
import ListItems from "./ListItems.jsx";

/**
 * Liste éditable pour les ressources qui n'ont qu'un nom : sociétés, bâtiments
 * et catégories. La présentation vient de ListItems ; ce composant n'apporte
 * que l'édition d'un libellé.
 *
 * Tout se passe sur la ligne : cliquer le nom l'édite sur place (Entrée
 * enregistre, Échap annule, quitter le champ enregistre). La dernière ligne est
 * un champ d'ajout permanent qui garde le focus : on enchaîne les saisies.
 */
export default function LookupManager({
  items,
  addTitle,
  onCreate,
  onUpdate,
  onDelete,
  emptyIcon,
  emptyText,
  entityLabel,
  maxRows,
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
    // Un nom vidé ou inchangé : on referme sans rien demander au serveur.
    const nom = editingName.trim();
    const item = items.find((i) => i.id === editingId);
    if (!nom || nom === item?.name) return cancelEdit();
    if (await run(() => onUpdate(editingId, nom))) cancelEdit();
  };

  // Le champ d'ajout garde le focus : la saisie suivante enchaîne.
  const create = async () => {
    if (!newName.trim()) return;
    if (await run(() => onCreate(newName.trim()))) setNewName("");
  };

  return (
    <Stack gap="sm">
      {error && <ErrorAlert onClose={() => setError(null)}>{error}</ErrorAlert>}

      <ListItems
        maxRows={maxRows}
        isEmpty={items.length === 0}
        emptyIcon={emptyIcon}
        emptyText={emptyText}
        add={{
          placeholder: addTitle,
          value: newName,
          onChange: setNewName,
          onSubmit: create,
          onCancel: () => setNewName(""),
          disabled: busy,
        }}
      >
        {items.map((item) => (
          <ListItems.Row key={item.id}>
            {(active) => (
              <>
                {editingId === item.id ? (
                  <TextInput
                    value={editingName}
                    onChange={(e) => setEditingName(e.currentTarget.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveEdit();
                      if (e.key === "Escape") cancelEdit();
                    }}
                    onBlur={saveEdit}
                    // Sans cadre : la ligne ne bouge pas quand elle passe en
                    // édition, seul le curseur signale la saisie.
                    variant="unstyled"
                    size="sm"
                    style={{ flex: 1, minWidth: 0 }}
                    disabled={busy}
                    autoFocus
                    aria-label={`Renommer ${item.name}`}
                  />
                ) : (
                  <UnstyledButton
                    onClick={() => startEdit(item)}
                    style={{ flex: 1, minWidth: 0 }}
                  >
                    <Text size="sm" truncate>
                      {item.name}
                    </Text>
                  </UnstyledButton>
                )}

                {/* Toujours présentes pour rester accessibles au clavier, mais
                    visibles seulement sur la ligne en cours. */}
                <Group gap={2} wrap="nowrap" style={{ opacity: active ? 1 : 0, flexShrink: 0 }}>
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="sm"
                    onClick={() => startEdit(item)}
                    aria-label={`Modifier ${item.name}`}
                  >
                    <IconPencil size={14} />
                  </ActionIcon>
                  <ActionIcon
                    variant="subtle"
                    color={RED}
                    size="sm"
                    onClick={() => setPendingDelete(item)}
                    aria-label={`Supprimer ${item.name}`}
                  >
                    <IconTrash size={14} />
                  </ActionIcon>
                </Group>
              </>
            )}
          </ListItems.Row>
        ))}
      </ListItems>

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
