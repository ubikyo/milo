import { ActionIcon, Group, Stack, TextInput, UnstyledButton } from "@mantine/core";
import { IconPencil, IconTags, IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import { RED } from "../../themes/colors";
import DeleteConfirmModal from "../ui/DeleteConfirmModal";
import ErrorAlert from "../ui/ErrorAlert";
import LabelChip from "../ui/LabelChip";
import { DEFAULT_LABEL_COLOR, LABEL_HUES } from "@milo/shared";
import type { Label, LabelHue, ProjectLabel, SupportLabel } from "@milo/shared";

// Hauteur d'une ligne d'étiquette : un peu plus haute que les autres listes,
// l'étiquette y tenant un rectangle plein.
const LABEL_ROW_HEIGHT = 34;

// Hauteur de l'étiquette et de son champ de saisie. La même pour les deux :
// sans quoi passer en modification ferait sauter la ligne.
const LABEL_FIELD_HEIGHT = 22;
import LabelColorPicker from "../ui/LabelColorPicker";
import ListItems from "../ui/ListItems";
import { messageErreur } from "../../lib/errors";

/**
 * Les étiquettes d'un tableau, gérées en ligne comme les sociétés ou les
 * catégories (LookupManager) : cliquer le nom l'édite sur place, la pastille
 * ouvre le choix des couleurs, la dernière ligne ajoute.
 */
/** Les étiquettes des trois modes se gèrent exactement pareil. */
type Etiquette = Label | ProjectLabel | SupportLabel;

interface LabelsManagerProps {
  labels: Etiquette[];
  onCreate: (name: string, color: string) => Promise<unknown>;
  onUpdate: (id: number, data: { name?: string; color?: string }) => Promise<unknown>;
  onDelete: (id: number) => Promise<unknown>;
  /** Ce que dit la liste quand elle est vide : tout n'est pas un tableau. */
  emptyText?: string;
  /** Ce que la suppression emporte, dit dans les mots du mode. */
  porteurs?: string;
}

export default function LabelsManager({
  labels,
  onCreate,
  onUpdate,
  onDelete,
  emptyText = "Aucune étiquette sur ce tableau",
  porteurs = "des cartes qui la portent",
}: LabelsManagerProps) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [newName, setNewName] = useState("");
  // Couleur de l'étiquette en cours de saisie, choisie dans la ligne d'ajout.
  const [newColor, setNewColor] = useState(DEFAULT_LABEL_COLOR);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Etiquette | null>(null);

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

  const startEdit = (label: Etiquette) => {
    setError(null);
    setEditingId(label.id);
    setEditingName(label.name);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingName("");
  };

  const saveEdit = async () => {
    const nom = editingName.trim();
    const label = labels.find((l) => l.id === editingId);
    if (!nom || nom === label?.name || editingId === null) return cancelEdit();
    if (await run(() => onUpdate(editingId, { name: nom }))) cancelEdit();
  };

  // La couleur est celle choisie dans la ligne d'ajout ; une fois l'étiquette
  // créée, la suivante passe à la teinte voisine, dans la même nuance, pour
  // qu'on les distingue sans y penser.
  const create = async () => {
    if (!newName.trim()) return;
    if (await run(() => onCreate(newName.trim(), newColor))) {
      setNewName("");
      const [teinte, nuance] = newColor.split(".");
      const rang = LABEL_HUES.indexOf(teinte as LabelHue);
      const suivante = LABEL_HUES[(rang + 1) % LABEL_HUES.length];
      setNewColor(`${suivante}.${nuance}`);
    }
  };

  return (
    <Stack gap="sm">
      {error && <ErrorAlert onClose={() => setError(null)}>{error}</ErrorAlert>}

      <ListItems
        maxRows={8}
        rowHeight={LABEL_ROW_HEIGHT}
        isEmpty={labels.length === 0}
        emptyIcon={IconTags}
        emptyText={emptyText}
        add={{
          placeholder: "Nouvelle étiquette",
          value: newName,
          onChange: setNewName,
          onSubmit: create,
          onCancel: () => setNewName(""),
          disabled: busy,
          // Pas de « + » : la pastille de couleur prend sa place et s'aligne
          // sur celles des étiquettes déjà créées.
          withPlus: false,
          section: (
            <LabelColorPicker color={newColor} onChange={setNewColor} label="la nouvelle étiquette" />
          ),
        }}
      >
        {labels.map((label) => (
          <ListItems.Row key={label.id} height={LABEL_ROW_HEIGHT}>
            {(active) => (
              <>
                <LabelColorPicker
                  color={label.color}
                  label={label.name}
                  onChange={(color) => run(() => onUpdate(label.id, { color }))}
                />

                {editingId === label.id ? (
                  <TextInput
                    value={editingName}
                    onChange={(e) => setEditingName(e.currentTarget.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveEdit();
                      if (e.key === "Escape") cancelEdit();
                    }}
                    onBlur={saveEdit}
                    variant="unstyled"
                    size="sm"
                    style={{ flex: 1, minWidth: 0 }}
                    // Le champ occupe exactement la place de l'étiquette qu'il
                    // remplace : la ligne ne bouge pas d'un pixel.
                    styles={{
                      input: {
                        height: LABEL_FIELD_HEIGHT,
                        minHeight: LABEL_FIELD_HEIGHT,
                        lineHeight: `${LABEL_FIELD_HEIGHT}px`,
                      },
                    }}
                    disabled={busy}
                    autoFocus
                    aria-label={`Renommer ${label.name}`}
                  />
                ) : (
                  <UnstyledButton
                    onClick={() => startEdit(label)}
                    // En bloc, l'étiquette se poserait sur la ligne de base du
                    // bouton et retomberait sous le milieu de la ligne.
                    style={{
                      flex: 1,
                      minWidth: 0,
                      display: "flex",
                      alignItems: "center",
                      height: LABEL_FIELD_HEIGHT,
                    }}
                  >
                    {/* L'étiquette se montre telle qu'elle se posera sur une
                        carte, pas en texte nu. */}
                    <LabelChip label={label} height={LABEL_FIELD_HEIGHT} />
                  </UnstyledButton>
                )}

                <Group gap={2} wrap="nowrap" style={{ opacity: active ? 1 : 0, flexShrink: 0 }}>
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="sm"
                    onClick={() => startEdit(label)}
                    aria-label={`Modifier ${label.name}`}
                  >
                    <IconPencil size={14} />
                  </ActionIcon>
                  <ActionIcon
                    variant="subtle"
                    color={RED}
                    size="sm"
                    onClick={() => setPendingDelete(label)}
                    aria-label={`Supprimer ${label.name}`}
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
        title="Supprimer l'étiquette"
        message={
          <>
            Voulez-vous vraiment supprimer « {pendingDelete?.name} » ? Elle sera retirée{" "}
            {porteurs}. Cette action est irréversible.
          </>
        }
      />
    </Stack>
  );
}
