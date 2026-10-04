import { NumberInput, Stack, TextInput, UnstyledButton } from "@mantine/core";
import { IconPencil, IconTags, IconTrash } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import DeleteConfirmModal from "../ui/DeleteConfirmModal";
import LabelChip from "../ui/LabelChip";
import { DEFAULT_LABEL_COLOR, LABEL_HUES } from "@milo/shared";
import type { Label, LabelHue, ProjectLabel, SupportLabel } from "@milo/shared";

// Height of a label row: slightly taller than the other lists,
// since the label holds a solid rectangle.
const LABEL_ROW_HEIGHT = 40;

// Height of the label and of its input field. The same for both:
// otherwise switching to edit mode would make the row jump.
const LABEL_FIELD_HEIGHT = 22;

// Width of the weight: enough to write three digits, like the percentage of
// milestones (MilestonesModal).
const WEIGHT_WIDTH = 52;

/** A label's weight, frameless: the list is the frame. */
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
import { DragHandle, InsertLine, useDraggableStack } from "../ui/DraggableStack";
import { errorMessage, notifyError } from "../../lib/errors";

/**
 * A board's labels, managed inline like companies or
 * categories (LookupManager): clicking the name edits it in place, the dot
 * opens the color picker, the last row adds. When the order can be
 * changed ("onReorder"), each row is dragged by its handle.
 */
/** Labels in all three modes are managed exactly the same way. */
type AnyLabel = Label | ProjectLabel | SupportLabel;

interface LabelsManagerProps {
  labels: AnyLabel[];
  onCreate: (name: string, color: string, weight: number) => Promise<unknown>;
  onUpdate: (
    id: number,
    data: { name?: string; color?: string; weight?: number },
  ) => Promise<unknown>;
  onDelete: (id: number) => Promise<unknown>;
  /** What the list says when empty: not everything is a board. */
  emptyText?: string;
  /** What deletion takes with it, said in the mode's own words. */
  carriers?: string;
  /** True when labels carry a weight: only the support mode has one. */
  withWeight?: boolean;
  /** The full order, once a row has been dragged. Without it, no handle. */
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
  // Color of the label being typed, chosen in the add row.
  const [newColor, setNewColor] = useState(DEFAULT_LABEL_COLOR);
  const [newWeight, setNewWeight] = useState<number | "">(0);
  // Weights being typed, per label: saved on leaving the field.
  const [weight, setWeights] = useState<Record<number, number | "">>({});
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<AnyLabel | null>(null);
  // The order just set, until the reloaded list reports it:
  // without it, the dropped row would briefly return to its previous place.
  const [placedOrder, setPlacedOrder] = useState<number[] | null>(null);
  useEffect(() => setPlacedOrder(null), [labels]);
  const bands = placedOrder
    ? placedOrder.flatMap((id) => labels.find((l) => l.id === id) ?? [])
    : labels;

  const { zoneRef, drag, onPointerDown } = useDraggableStack({
    ids: bands.map((l) => l.id),
    selector: "[data-label-row]",
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

  // The color is the one chosen in the add row; once the label is
  // created, the next one moves to the neighboring hue, in the same shade, so
  // they can be told apart without thinking.
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

  // An emptied weight reverts to the saved one; unchanged, it is not sent.
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
              data-label-row
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
                    {/* Only the handle moves the row: the dot and the name
                        keep their clicks. */}
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
                        // The field takes exactly the place of the label it
                        // replaces: the row does not move by a pixel.
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
                        // As a block, the label would sit on the button's baseline
                        // and drop below the middle of the row.
                        style={{
                          flex: 1,
                          minWidth: 0,
                          display: "flex",
                          alignItems: "center",
                          height: LABEL_FIELD_HEIGHT,
                        }}
                      >
                        {/* The label is shown as it will sit on a
                            card, not as bare text. */}
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
