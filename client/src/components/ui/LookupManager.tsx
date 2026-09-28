import { ActionIcon, Group, Stack, Text, TextInput, UnstyledButton } from "@mantine/core";
import { IconPencil, IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import { RED } from "../../themes/colors";
import DeleteConfirmModal from "./DeleteConfirmModal";
import ErrorAlert from "./ErrorAlert";
import ListItems from "./ListItems";
import type { ComponentType, ReactNode } from "react";

/**
 * Ce qu'une ligne doit porter. Le nombre de projets rattachés ne vaut que pour
 * les sociétés et les catégories : il dit ce que la suppression emporterait.
 */
export interface LookupItem {
  id: number;
  name: string;
  project_count?: number;
}
import { messageErreur } from "../../lib/errors";

/**
 * Liste éditable pour les ressources qui n'ont qu'un nom : sociétés et
 * catégories. La présentation vient de ListItems ; ce composant n'apporte
 * que l'édition d'un libellé.
 *
 * Tout se passe sur la ligne : cliquer le nom l'édite sur place (Entrée
 * enregistre, Échap annule, quitter le champ enregistre). La dernière ligne est
 * un champ d'ajout permanent qui garde le focus : on enchaîne les saisies.
 */
interface LookupManagerProps {
  items: LookupItem[];
  addTitle: string;
  onCreate: (name: string) => Promise<unknown>;
  onUpdate: (id: number, name: string) => Promise<unknown>;
  onDelete: (id: number) => Promise<unknown>;
  emptyIcon: ComponentType<{ size?: number }>;
  emptyText?: ReactNode;
  entityLabel: string;
  maxRows?: number;
}

/**
 * Ce que la suppression va emporter. Sorti du corps de la liste : le pluriel
 * et un compte facultatif à l'intérieur d'un attribut JSX se lisaient mal, et
 * obligeaient à répéter la vérification du cas « rien à supprimer ».
 */
function SuppressionMessage({ item }: { item: LookupItem | null }) {
  if (!item) return null;
  const projets = item.project_count ?? 0;
  const pluriel = (n: number) => (n > 1 ? "s" : "");

  return (
    <>
      Voulez-vous vraiment supprimer « {item.name} » ?
      {projets > 0 && (
        <>
          {" "}
          <strong>
            {projets} projet{pluriel(projets)}
          </strong>{" "}
          rattaché{pluriel(projets)} et leurs commentaires seront également supprimés.
        </>
      )}{" "}
      Cette action est irréversible.
    </>
  );
}

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
}: LookupManagerProps) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<LookupItem | null>(null);

  const run = async (action: () => Promise<unknown>): Promise<boolean> => {
    setError(null);
    setBusy(true);
    try {
      await action();
      return true;
    } catch (e) {
      setError(messageErreur(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (item: LookupItem) => {
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
    if (!nom || nom === item?.name || editingId === null) return cancelEdit();
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
          if (pendingDelete) await run(() => onDelete(pendingDelete.id));
          setPendingDelete(null);
        }}
        title={`Supprimer ${entityLabel}`}
        message={<SuppressionMessage item={pendingDelete} />}
      />
    </Stack>
  );
}
