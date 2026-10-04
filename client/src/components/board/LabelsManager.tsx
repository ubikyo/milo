import { NumberInput, Stack, TextInput, UnstyledButton } from "@mantine/core";
import { IconPencil, IconTags, IconTrash } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import DeleteConfirmModal from "../ui/DeleteConfirmModal";
import LabelChip from "../ui/LabelChip";
import { DEFAULT_LABEL_COLOR, LABEL_HUES } from "@milo/shared";
import type { Label, LabelHue, ProjectLabel, SupportLabel } from "@milo/shared";

// Hauteur d'une ligne d'étiquette : un peu plus haute que les autres listes,
// l'étiquette y tenant un rectangle plein.
const LABEL_ROW_HEIGHT = 40;

// Hauteur de l'étiquette et de son champ de saisie. La même pour les deux :
// sans quoi passer en modification ferait sauter la ligne.
const LABEL_FIELD_HEIGHT = 22;

// Largeur du poids : de quoi écrire trois chiffres, comme le pourcentage des
// jalons (MilestonesModal).
const WEIGHT_WIDTH = 52;

/** Le poids d'une étiquette, sans cadre : la liste en est le cadre. */
function WeightField({
  value,
  onChange,
  onBlur,
  label,
}: {
  value: number | "";
  onChange: (value: number | "") => void;
  onBlur?: () => void;
  label: string;
}) {
  return (
    <NumberInput
      value={value}
      onChange={(v) => onChange(v === "" ? "" : Number(v))}
      onBlur={onBlur}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      allowDecimal={false}
      hideControls
      placeholder="Poids"
      title="Poids : les plus lourdes passent devant dans les grilles"
      variant="unstyled"
      size="sm"
      w={WEIGHT_WIDTH}
      style={{ flexShrink: 0 }}
      styles={{
        input: {
          height: LABEL_FIELD_HEIGHT,
          minHeight: LABEL_FIELD_HEIGHT,
          lineHeight: `${LABEL_FIELD_HEIGHT}px`,
        },
      }}
      aria-label={label}
    />
  );
}
import LabelColorPicker from "../ui/LabelColorPicker";
import ListItems from "../ui/ListItems";
import { DragHandle, InsertLine, useDraggableStack } from "../ui/PileGlissante";
import { errorMessage, notifyError } from "../../lib/errors";

/**
 * Les étiquettes d'un tableau, gérées en ligne comme les sociétés ou les
 * catégories (LookupManager) : cliquer le nom l'édite sur place, la pastille
 * ouvre le choix des couleurs, la dernière ligne ajoute. Quand l'ordre se
 * règle (« onReorder »), chaque ligne se glisse par sa poignée.
 */
/** Les étiquettes des trois modes se gèrent exactement pareil. */
type AnyLabel = Label | ProjectLabel | SupportLabel;

interface LabelsManagerProps {
  labels: AnyLabel[];
  onCreate: (name: string, color: string, weight: number) => Promise<unknown>;
  onUpdate: (
    id: number,
    data: { name?: string; color?: string; weight?: number },
  ) => Promise<unknown>;
  onDelete: (id: number) => Promise<unknown>;
  /** Ce que dit la liste quand elle est vide : tout n'est pas un tableau. */
  emptyText?: string;
  /** Ce que la suppression emporte, dit dans les mots du mode. */
  carriers?: string;
  /** Vrai quand les étiquettes portent un poids : le support seul en a un. */
  withWeight?: boolean;
  /** L'ordre complet, une fois une ligne glissée. Sans elle, pas de poignée. */
  onReorder?: (ids: number[]) => Promise<unknown>;
}

export default function LabelsManager({
  labels,
  onCreate,
  onUpdate,
  onDelete,
  emptyText = "Aucune étiquette sur ce tableau",
  carriers = "des cartes qui la portent",
  withWeight = false,
  onReorder,
}: LabelsManagerProps) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [newName, setNewName] = useState("");
  // Couleur de l'étiquette en cours de saisie, choisie dans la ligne d'ajout.
  const [newColor, setNewColor] = useState(DEFAULT_LABEL_COLOR);
  const [newWeight, setNewWeight] = useState<number | "">(0);
  // Les poids en cours de saisie, par étiquette : enregistrés en quittant le champ.
  const [weight, setWeights] = useState<Record<number, number | "">>({});
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<AnyLabel | null>(null);
  // L'ordre qu'on vient de poser, le temps que la liste relue le rapporte :
  // sans lui, la ligne lâchée reviendrait un instant à sa place d'avant.
  const [placedOrder, setPlacedOrder] = useState<number[] | null>(null);
  useEffect(() => setPlacedOrder(null), [labels]);
  const bands = placedOrder
    ? placedOrder.flatMap((id) => labels.find((l) => l.id === id) ?? [])
    : labels;

  const { zoneRef, drag, onPointerDown } = useDraggableStack({
    ids: bands.map((l) => l.id),
    selector: "[data-ligne-etiquette]",
    onReorder: async (order) => {
      if (!onReorder) return;
      const ids = order.map(Number);
      setPlacedOrder(ids);
      if (!(await run(() => onReorder(ids)))) setPlacedOrder(null);
    },
  });

  const run = async (action: () => Promise<unknown>): Promise<boolean> => {
    setBusy(true);
    try {
      await action();
      return true;
    } catch (e) {
      notifyError(errorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (label: AnyLabel) => {
    setEditingId(label.id);
    setEditingName(label.name);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingName("");
  };

  const saveEdit = async () => {
    const name = editingName.trim();
    const label = labels.find((l) => l.id === editingId);
    if (!name || name === label?.name || editingId === null) return cancelEdit();
    if (await run(() => onUpdate(editingId, { name: name }))) cancelEdit();
  };

  // La couleur est celle choisie dans la ligne d'ajout ; une fois l'étiquette
  // créée, la suivante passe à la teinte voisine, dans la même nuance, pour
  // qu'on les distingue sans y penser.
  const create = async () => {
    if (!newName.trim()) return;
    if (await run(() => onCreate(newName.trim(), newColor, Number(newWeight) || 0))) {
      setNewName("");
      setNewWeight(0);
      const [hue, shade] = newColor.split(".");
      const rank = LABEL_HUES.indexOf(hue as LabelHue);
      const next = LABEL_HUES[(rank + 1) % LABEL_HUES.length];
      setNewColor(`${next}.${shade}`);
    }
  };

  // Un poids vidé revient à celui enregistré ; inchangé, il ne part pas.
  const saveWeights = async (label: AnyLabel) => {
    const entered = weight[label.id];
    const forget = () =>
      setWeights(({ [label.id]: _, ...rest }) => rest);
    const current = "weight" in label ? label.weight : 0;
    if (entered === undefined || entered === "" || entered === current) return forget();
    if (await run(() => onUpdate(label.id, { weight: entered }))) forget();
  };

  return (
    <Stack gap="sm">

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
          section: (
            <>
              <LabelColorPicker
                color={newColor}
                onChange={setNewColor}
                label="la nouvelle étiquette"
              />
              {withWeight && (
                <WeightField
                  value={newWeight}
                  onChange={setNewWeight}
                  label="Poids de la nouvelle étiquette"
                />
              )}
            </>
          ),
        }}
      >
        <div ref={zoneRef}>
          {bands.map((label, rank) => (
            <div
              key={label.id}
              data-ligne-etiquette
              style={{ opacity: drag?.id === label.id ? 0.4 : 1 }}
            >
              {drag?.target === rank && <InsertLine />}
              <ListItems.Row
                height={LABEL_ROW_HEIGHT}
                actions={[
                  {
                    label: "Modifier",
                    icon: IconPencil,
                    onClick: () => startEdit(label),
                  },
                  {
                    label: "Supprimer",
                    icon: IconTrash,
                    onClick: () => setPendingDelete(label),
                    danger: true,
                  },
                ]}
              >
                {(active) => (
                  <>
                    {/* Seule la poignée déplace la ligne : la pastille et le nom
                        gardent leurs clics. */}
                    {onReorder && (
                      <DragHandle
                        onPointerDown={onPointerDown(label.id, rank)}
                        visible={active}
                        label="Glisser pour réordonner"
                      />
                    )}
                    <LabelColorPicker
                      color={label.color}
                      label={label.name}
                      onChange={(color) => run(() => onUpdate(label.id, { color }))}
                    />

                    {withWeight && (
                      <WeightField
                        value={weight[label.id] ?? ("weight" in label ? label.weight : 0)}
                        onChange={(v) => setWeights((p) => ({ ...p, [label.id]: v }))}
                        onBlur={() => void saveWeights(label)}
                        label={`Poids de ${label.name}`}
                      />
                    )}

                    {editingId === label.id ? (
                      <TextInput
                        value={editingName}
                        onChange={(e) => setEditingName(e.currentTarget.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            saveEdit();
                          }
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
                  </>
                )}
              </ListItems.Row>
            </div>
          ))}
          {drag && drag.target >= bands.length && <InsertLine />}
        </div>
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
            Voulez-vous vraiment supprimer « {pendingDelete?.name} » ? Elle sera
            retirée {carriers}. Cette action est irréversible.
          </>
        }
      />
    </Stack>
  );
}
