import { ActionIcon, Anchor, Group, NumberInput, TextInput } from "@mantine/core";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import { api } from "../../api";
import { errorMessage, notifyError } from "../../lib/errors";
import { ADD_ACTION, RED } from "../../themes/colors";
import { PLUS_GAP, PLUS_SIZE } from "../../themes/plus";
import ChipPicker from "./ChipPicker";
import DeleteConfirmModal from "./DeleteConfirmModal";
import LabelChip from "./LabelChip";
import { DEFAULT_LABEL_COLOR } from "@milo/shared";
import type { Label, ProjectLabel, SupportLabel } from "@milo/shared";
import type { ReactNode } from "react";

/** Labels of the three modes have the same shape here. */
type AnyLabel = Label | ProjectLabel | SupportLabel;

/**
 * What it takes to manage a set of labels. The routes change from one mode to
 * another, the actions do not.
 *
 * `parentId` is what the labels hang from: a board for cards and projects, a
 * company for tickets.
 */
export interface LabelsApi {
  create: (parentId: number, name: string, color: string, weight: number) => Promise<AnyLabel>;
  update: (
    id: number,
    data: { name?: string; color?: string; weight?: number },
  ) => Promise<AnyLabel>;
  remove: (id: number) => Promise<unknown>;
  /** What deletion takes along, stated in the mode's own words. */
  carriers: string;
  /** True when labels carry a weight: those of projects and support. */
  withWeight?: boolean;
}

/** A label being edited: its name and color, before validation. */
interface Draft {
  id?: number;
  name: string;
  color: string;
  weight: number | "";
}

/** A label's weight; those that carry none weigh zero. */
const weightOf = (label: AnyLabel): number => ("weight" in label ? label.weight : 0);

// Width of the weight: enough to write three digits.
const WEIGHT_WIDTH = 40;
import LabelColorPicker from "./LabelColorPicker";

// The label's offset in the list: it breathes two pixels after its checkbox.
const LABEL_INDENT = 2;

// Card labels and project labels are chosen, renamed, recolored and deleted in
// the same way: only the routes change. They are named here rather than calling
// "api" directly, so that the same component serves both modes.
export const CARD_LABELS_API: LabelsApi = {
  create: api.createLabel,
  update: api.updateLabel,
  remove: api.deleteLabel,
  // What deletion takes along, stated in the mode's own words.
  carriers: "des cartes qui la portent",
};

export const PROJECT_LABELS_API: LabelsApi = {
  create: api.createProjectLabel,
  update: api.updateProjectLabel,
  remove: api.deleteProjectLabel,
  carriers: "des projets qui la portent",
  withWeight: true,
};

// Support ones are shared by all companies: they hang from nothing, and
// "boardId" does not apply here.
export const SUPPORT_LABELS_API: LabelsApi = {
  create: (_boardId, name, color, weight) => api.createSupportLabel(name, color, weight),
  update: api.updateSupportLabel,
  remove: api.deleteSupportLabel,
  carriers: "des demandes qui la portent",
  withWeight: true,
};

/**
 * A card's labels: a click checks them to apply them, a double click opens one
 * to rename or recolor it, the trash at the end of the row deletes it, and the
 * link at the bottom adds one without leaving the list. Renaming, recoloring or
 * deleting affects the board's label, hence all the cards that carry it.
 */
interface LabelPickerProps {
  labels: AnyLabel[];
  /** The selected identifiers, as strings. */
  value: string[];
  onChange: (value: string[]) => void;
  /** What these labels hang from: a board, or a company in Support. */
  boardId: string | number;
  /** Without argument: re-read. With a patch: apply it in place. */
  onLabelsChanged: (patch?: { id: number; data: Partial<AnyLabel> }) => void | Promise<void>;
  chipHeight?: number;
  /** The mode these labels belong to: cards by default. */
  labelsApi?: LabelsApi;
  /** What the list says when there is no label yet to choose from. */
  emptyText?: string;
  /** The field's title: "Étiquettes" by default. */
  label?: string;
}

export default function LabelPicker({
  labels,
  value,
  onChange,
  boardId,
  onLabelsChanged,
  chipHeight,
  // The mode these labels belong to: cards by default.
  labelsApi = CARD_LABELS_API,
  emptyText = "Aucune étiquette sur ce tableau",
  label = "Étiquettes",
}: LabelPickerProps) {
  // Label being modified — its name and color live there until validated — and
  // the one being added.
  const [edited, setEdited] = useState<Draft | null>(null);
  const [adding, setAdding] = useState<Draft | null>(null);
  // Hovered label — only its trash shows — and the one awaiting deletion
  // confirmation.
  const [hovering, setHovered] = useState<number | null>(null);
  const [toDelete, setToDelete] = useState<AnyLabel | null>(null);

  const openEdit = (label: AnyLabel) => {
    setAdding(null);
    setEdited({ id: label.id, name: label.name, color: label.color, weight: weightOf(label) });
  };

  const closeEdit = () => setEdited(null);

  // Choosing a color is a self-sufficient action: it applies immediately,
  // everywhere the label shows. The name, on the other hand, waits to be
  // validated — we do not want to see it change with every letter typed.
  const applyColor = async (label: AnyLabel, color: string) => {
    setEdited((e) => (e ? { ...e, color } : e));
    if (color === label.color) return;
    // The color is first applied on screen, then sent to the server: otherwise
    // the cards would wait for the round trip to change hue.
    onLabelsChanged({ id: label.id, data: { color } });
    await labelsApi.update(label.id, { color });
    await onLabelsChanged();
  };

  // The name only goes to the server on validation: elsewhere — the list, the
  // card's thumbnails, the board's cards — the label keeps it until it has
  // really changed.
  const save = async (label: AnyLabel) => {
    const current = edited;
    closeEdit();
    if (!current) return;
    const name = current.name.trim();
    if (!name) return;
    // An emptied weight keeps the saved one.
    const weight = current.weight === "" ? weightOf(label) : current.weight;
    if (name === label.name && current.color === label.color && weight === weightOf(label)) return;
    await labelsApi.update(label.id, {
      name: name,
      color: current.color,
      ...(labelsApi.withWeight ? { weight } : {}),
    });
    await onLabelsChanged();
  };

  const openAdd = () => {
    closeEdit();
    setAdding({ name: "", color: DEFAULT_LABEL_COLOR, weight: 0 });
  };

  // The list closes: what was being typed is concluded, otherwise the field
  // would disappear with it and the chosen color would be lost — the unmounted
  // field has no chance to hand control back.
  const finish = () => {
    if (edited) {
      const label = labels.find((l) => l.id === edited.id);
      if (label) save(label);
      return;
    }
    if (adding) create();
  };

  // The created label is applied to the card right away: it was just requested.
  const create = async () => {
    const newValue = (adding?.name ?? "").trim();
    if (!newValue || !adding) {
      setAdding(null);
      return;
    }
    const created = await labelsApi.create(
      Number(boardId),
      newValue,
      adding.color,
      Number(adding.weight) || 0,
    );
    setAdding(null);
    await onLabelsChanged();
    onChange([...value, String(created.id)]);
  };

  // Deleting asks before doing it: the label leaves the board, and so
  // everything that carries it, not just the open card.
  const requestDeletion = (label: AnyLabel) => {
    closeEdit();
    setAdding(null);
    setToDelete(label);
  };

  const remove = async () => {
    const label = toDelete;
    setToDelete(null);
    if (!label) return;
    try {
      await labelsApi.remove(label.id);
    } catch (e) {
      // A label that is still in use cannot be deleted: the server says by how
      // many resources.
      notifyError(errorMessage(e), "Suppression impossible");
      return;
    }
    // The open card loses it right away: otherwise saving would put it back,
    // even though the server no longer knows it.
    onChange(value.filter((v) => v !== String(label.id)));
    await onLabelsChanged();
  };

  // An input row: the color swatch, the name, then the weight when the mode has
  // one. Used for editing as well as for adding.
  interface InputProps {
    color: string;
    name: string;
    weight: number | "";
    onColor: (color: string) => void;
    onName: (name: string) => void;
    onWeight: (weight: number | "") => void;
    onSubmit: () => void;
    onCancel: () => void;
    aria: string;
  }

  const input = ({
    color,
    name,
    weight,
    onColor,
    onName,
    onWeight,
    onSubmit,
    onCancel,
    aria,
  }: InputProps): ReactNode => (
    <Group
      data-label-editor="true"
      gap={6}
      wrap="nowrap"
      style={{ flex: 1, minWidth: 0 }}
      // The input's clicks stay with it: placing the cursor or choosing a color
      // must not check or uncheck the label.
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <LabelColorPicker
        color={color}
        onChange={onColor}
        label={name || "l'étiquette"}
        withinPortal={false}
      />
      <TextInput
        value={name}
        onChange={(e) => onName(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onSubmit();
          }
          if (e.key === "Escape") onCancel();
        }}
        // Focus moving to the swatch or its palette stays within the input:
        // otherwise, going to choose a color would close it.
        onBlur={(e) => {
          if (e.relatedTarget?.closest("[data-label-editor]")) return;
          onSubmit();
        }}
        variant="unstyled"
        size="xs"
        autoFocus
        style={{ flex: 1, minWidth: 0 }}
        aria-label={aria}
      />
      {labelsApi.withWeight && (
        <NumberInput
          value={weight}
          onChange={(v) => onWeight(v === "" ? "" : Number(v))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onSubmit();
            }
            if (e.key === "Escape") onCancel();
          }}
          onBlur={(e) => {
            if (e.relatedTarget?.closest("[data-label-editor]")) return;
            onSubmit();
          }}
          allowDecimal={false}
          hideControls
          placeholder="Poids"
          title="Poids : les plus lourdes passent devant dans les grilles"
          variant="unstyled"
          size="xs"
          w={WEIGHT_WIDTH}
          style={{ flexShrink: 0 }}
          aria-label={`Poids de ${name || "l'étiquette"}`}
        />
      )}
    </Group>
  );

  return (
    <>
      <ChipPicker
        chipHeight={chipHeight}
        // A label's "+" is rectangular, like it: same radius.
        plusRadius={4}
        onClose={finish}
        // The confirmation window counts as a click "outside": the list would
        // go away, and we would be back at the card as soon as the question is
        // answered.
        closeBlocked={toDelete !== null}
        label={label}
        options={labels}
        value={value}
        onChange={onChange}
        emptyText={emptyText}
        fullWidthOptions
        // A label that is already open stays in edit mode: double-clicking in
        // its field must not reopen it and erase what is being written.
        onOptionClick={(l) => edited?.id !== l.id && openEdit(l)}
        // The card's thumbnail does not follow the edit: it shows the label as
        // it is saved, and will only change once the input is validated. Only
        // the list row goes into edit mode.
        renderChip={(l) => <LabelChip label={l} height={chipHeight} />}
        render={(l) => (
          // The row: the label — or its input — and, at the end, the trash.
          <Group
            gap={4}
            wrap="nowrap"
            style={{ flex: 1, minWidth: 0 }}
            onMouseEnter={() => setHovered(l.id)}
            onMouseLeave={() => setHovered((id) => (id === l.id ? null : id))}
          >
            {edited?.id === l.id ? (
              // In edit mode only: the color swatch joins the name. At rest,
              // the label stands on its own.
              input({
                color: edited.color,
                name: edited.name,
                weight: edited.weight,
                onColor: (color) => applyColor(l, color),
                onName: (name) => setEdited((e) => (e ? { ...e, name } : e)),
                onWeight: (weight) => setEdited((e) => (e ? { ...e, weight } : e)),
                onSubmit: () => save(l),
                onCancel: closeEdit,
                aria: `Renommer ${l.name}`,
              })
            ) : (
              // The label takes the whole width of the list, like a banner.
              <div style={{ flex: 1, minWidth: 0, paddingLeft: LABEL_INDENT }}>
                <LabelChip label={l} height={chipHeight} fullWidth />
              </div>
            )}

            {/* The trash only appears on hover or during edit, but always keeps
                its place: the row does not move when the mouse crosses it. */}
            <ActionIcon
              variant="subtle"
              color={RED}
              size="sm"
              style={{
                flexShrink: 0,
                opacity: hovering === l.id || edited?.id === l.id ? 1 : 0,
              }}
              // The click stops here: it must not check or open the label about
              // to be deleted.
              onClick={(e) => {
                e.stopPropagation();
                requestDeletion(l);
              }}
              onDoubleClick={(e) => e.stopPropagation()}
              aria-label={`Supprimer ${l.name}`}
            >
              <IconTrash size={14} />
            </ActionIcon>
          </Group>
        )}
        footer={
          <div style={{ paddingTop: 6 }}>
            {adding ? (
              <div style={{ padding: 4 }}>
                {input({
                  color: adding.color,
                  name: adding.name,
                  weight: adding.weight,
                  onColor: (color) => setAdding((a) => (a ? { ...a, color } : a)),
                  onName: (name) => setAdding((a) => (a ? { ...a, name } : a)),
                  onWeight: (weight) => setAdding((a) => (a ? { ...a, weight } : a)),
                  onSubmit: create,
                  onCancel: () => setAdding(null),
                  aria: "Nom de la nouvelle étiquette",
                })}
              </div>
            ) : (
              <Anchor
                component="button"
                type="button"
                size="sm"
                c={ADD_ACTION.color}
                onClick={openAdd}
                px={4}
              >
                <Group gap={PLUS_GAP} wrap="nowrap">
                  <IconPlus size={PLUS_SIZE} />
                  <span>Ajouter une étiquette</span>
                </Group>
              </Anchor>
            )}
          </div>
        }
      />

      {/* Placed outside the list, which would take it along when closing: the
          question thus survives, and the list stays open behind it. */}
      <DeleteConfirmModal
        opened={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={remove}
        title="Supprimer l'étiquette"
        message={
          <>
            Voulez-vous vraiment supprimer « {toDelete?.name} » ? Elle sera
            retirée {labelsApi.carriers}. Cette action est irréversible.
          </>
        }
      />
    </>
  );
}
