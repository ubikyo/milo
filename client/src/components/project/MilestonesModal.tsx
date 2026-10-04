import {
  Button,
  Group,
  Modal,
  NumberInput,
  Slider,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useEffect, useState } from "react";
import { RED, defaultMilestoneColor } from "../../themes/colors";
import { MODAL_PADDING, modalHeaderStyles } from "../../themes/modals";
import LabelColorPicker from "../ui/LabelColorPicker";
import { useLabelColors } from "../ui/LabelChip";
import {
  ROUNDING,
  NAME_INSET,
  INPUT_STYLE,
  ListFooter,
  RowCheckbox,
  RowCheckboxSpace,
  nameFieldStyle,
  rowStyle,
  useRowSelection,
} from "../ui/DrawerRows";
import { MilestoneLabels, milestoneMarks } from "./milestoneMarks";
import { errorMessage, notifyError } from "../../lib/errors";
import { DEFAULT_LABEL_COLOR } from "@milo/shared";
import type { Milestone, MilestoneType } from "@milo/shared";
import CloseButton from "../ui/CloseButton";

/** A milestone being typed: the value can be emptied while typing. */
interface InputEntry {
  key: number;
  value: number | "";
  label: string;
  /** The color of the slice the milestone closes. */
  color: string;
  /** The end milestone, at 100%: always there, neither movable nor deletable. */
  fixed?: boolean;
}

/** The end milestone's value. */
const END = 100;

interface MilestonesModalProps {
  /** The type whose milestones are being set; "null" closes the window. */
  type: MilestoneType | null;
  onClose: () => void;
  onSave: (milestones: Milestone[]) => Promise<unknown>;
}

/** The space between the percentage and the label. */
const LABEL_GAP = 4;
/** The space between the swatch and the percentage. */
const PERCENT_GAP = 10;

// Width of the percentage: enough to write "100 %" in a field.
const PERCENT_WIDTH = 54;

interface PercentageFieldProps {
  value: number | "";
  onChange: (value: number | "") => void;
  onBlur?: () => void;
  label: string;
}

// The other milestones stop before the end: 100% is already taken.
const MAX_MILESTONE = END - 1;

/** A milestone's percentage: an "xs" field on the row, like a column width. */
function PercentageField({
  value,
  onChange,
  onBlur,
  label,
}: PercentageFieldProps) {
  const [entered, setEntered] = useState(false);
  return (
    <NumberInput
      value={value}
      onChange={(v) => onChange(v === "" ? "" : Number(v))}
      onFocus={() => setEntered(true)}
      onBlur={() => {
        setEntered(false);
        onBlur?.();
      }}
      min={0}
      max={MAX_MILESTONE}
      clampBehavior="strict"
      allowDecimal={false}
      suffix="%"
      hideControls
      size="xs"
      radius={ROUNDING}
      w={PERCENT_WIDTH}
      style={{ flexShrink: 0 }}
      // The label's font size, on the right: an "xs" field has the height of the
      // others, but smaller text.
      styles={{
        input: { fontSize: "var(--mantine-font-size-sm)", ...(entered ? INPUT_STYLE : null) },
      }}
      aria-label={label}
    />
  );
}

// The added milestone is placed halfway between the last milestone and the end: its
// percentage is then adjusted on its row.
const halfway = (list: InputEntry[]) => {
  const last = list
    .filter((s) => !s.fixed)
    .reduce((max, s) => Math.max(max, Number(s.value) || 0), 0);
  return Math.min(MAX_MILESTONE, Math.round((last + END) / 2));
};

let nextKey = 0;
const toInput = (m: Milestone): InputEntry => ({
  key: nextKey++,
  value: m.value,
  label: m.label,
  color: m.color ?? defaultMilestoneColor(m.value),
});

/**
 * The list received, with its end milestone: kept if it was saved with
 * a label, added without a label otherwise. It always closes the list.
 */
const withEnd = (milestones: Milestone[]): InputEntry[] => {
  const end = milestones.find((m) => m.value === END);
  return [
    ...milestones.filter((m) => m.value !== END).map(toInput),
    { ...toInput(end ?? { value: END, label: "" }), fixed: true },
  ];
};

/**
 * The preview background, in slices: from 0 to the first milestone, then from
 * milestone to milestone, each slice takes the color of the milestone that closes it —
 * the one a project's bar will have when its progress falls there.
 */
const bands = (bounds: { value: number; color: string }[]): string => {
  let start = 0;
  const stops = bounds.map(({ value, color }) => {
    const colorStop = `${color} ${start}% ${value}%`;
    start = value;
    return colorStop;
  });
  return `linear-gradient(to right, ${stops.join(", ")})`;
};

/**
 * A type's milestones: those its projects show under their progress
 * slider. You add some, remove some, or keep none; the preview
 * shows the slider as a project will see it.
 */
export default function MilestonesModal({
  type,
  onClose,
  onSave,
}: MilestonesModalProps) {
  const [inputs, setInputs] = useState<InputEntry[]>([]);
  const [saving, setSaving] = useState(false);
  // The focused field: it takes the window's background.
  const [input, setInput] = useState<number | null>(null);
  // The milestone just added: its label takes focus.
  const [toName, setToName] = useState<number | null>(null);
  const colors = useLabelColors();
  // The end milestone cannot be checked: it is not deletable. Each opening
  // gives new keys, so nothing stays checked from one type to another.
  const selection = useRowSelection(inputs.filter((s) => !s.fixed).map((s) => s.key));

  useEffect(() => {
    if (!type) return;
    const list = withEnd(type.milestones);
    setInputs(list);
    setInput(null);
    setToName(null);
  }, [type]);

  const updateStatement = (key: number, patch: Partial<InputEntry>) =>
    setInputs((list) =>
      list.map((s) => (s.key === key ? { ...s, ...patch } : s)),
    );

  // Milestones are sorted in slider order: after an add, and when
  // leaving a row's percentage — not while typing, when the row
  // would jump under the cursor.
  const sortBy = () =>
    setInputs((list) =>
      [...list].sort(
        (a, b) => (Number(a.value) || 0) - (Number(b.value) || 0),
      ),
    );

  // The label is optional: the color is enough. The milestone is sorted into
  // place, and its label takes focus.
  const add = () => {
    const newValue = toInput({
      value: halfway(inputs),
      label: "",
      color: DEFAULT_LABEL_COLOR,
    });
    setInputs(
      [...inputs, newValue].sort((a, b) => (Number(a.value) || 0) - (Number(b.value) || 0)),
    );
    setToName(newValue.key);
  };

  // The checked milestones leave the list at once: nothing is saved before
  // "Enregistrer".
  const removeChecked = () => {
    const checked = new Set(selection.checked);
    setInputs((list) => list.filter((s) => !checked.has(s.key)));
    selection.reset();
  };

  // The label is optional: a milestone without a label colors its slice but
  // is not written under the slider. Only the value is required.
  const validEntries = inputs
    .filter((s) => s.value !== "")
    .map((s) => ({
      value: Number(s.value),
      label: s.label.trim(),
      color: s.color,
    }))
    .sort((a, b) => a.value - b.value);
  const values = validEntries.map((s) => s.value);
  const duplicateOf = values.some((v, i) => values.indexOf(v) !== i);
  const isIncomplete = validEntries.length !== inputs.length;

  const bounds = validEntries.map((s) => ({
    value: s.value,
    color: colors(s.color).backgroundColor,
  }));

  const save = async () => {
    setSaving(true);
    try {
      await onSave(validEntries);
      onClose();
    } catch (e) {
      notifyError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      opened={type !== null}
      onClose={onClose}
      title={`Jalons — ${type?.name ?? ""}`}
      centered
      size="lg"
      padding={MODAL_PADDING}
      withCloseButton={false}
      styles={modalHeaderStyles(MODAL_PADDING)}
    >
      <Stack gap="md">

        {/* Milestones are presented like the drawers' lists
            (ColumnFields): one row per milestone — its color, its
            percentage, its label right on the row. Checked milestones are
            removed together — the end, at 100%, has no checkbox and stays;
            "Ajouter" adds one halfway. */}
        <div>
          <Stack gap={1}>
            {inputs.map((s, rank) => (
              <Group
                key={s.key}
                gap="sm"
                wrap="nowrap"
                style={rowStyle(rank, inputs.length, false)}
              >
                {s.fixed ? (
                  // The end cannot be removed: an empty space keeps the
                  // swatches aligned.
                  <RowCheckboxSpace />
                ) : (
                  <RowCheckbox
                    label={`Sélectionner ${s.label || `le jalon à ${s.value}%`}`}
                    checked={selection.isChecked(s.key)}
                    onChange={(on) => selection.toggle(s.key, on)}
                  />
                )}
                {/* The swatch and the percentage follow closely: the percentage
                    field already carries its own inset. */}
                <Group gap={PERCENT_GAP} wrap="nowrap" style={{ flexShrink: 0 }}>
                  <LabelColorPicker
                    color={s.color}
                    onChange={(color) => updateStatement(s.key, { color })}
                    label={s.label || `le jalon à ${s.value}%`}
                  />

                  {s.fixed ? (
                    // The end does not move: its value is read, with no field.
                    <Text
                      size="sm"
                      w={PERCENT_WIDTH}
                      pl={NAME_INSET}
                      style={{ flexShrink: 0 }}
                    >
                      {END}%
                    </Text>
                  ) : (
                    <PercentageField
                      value={s.value}
                      onChange={(value) => updateStatement(s.key, { value })}
                      onBlur={sortBy}
                      label={`Pourcentage de ${s.label || "ce jalon"}`}
                    />
                  )}
                </Group>

                <TextInput
                  size="sm"
                  radius={ROUNDING}
                  // Closer to the percentage than the row's gap.
                  style={{
                    flex: 1,
                    minWidth: 0,
                    marginLeft: `calc(${LABEL_GAP}px - var(--mantine-spacing-sm))`,
                  }}
                  styles={{ input: nameFieldStyle(input === s.key) }}
                  placeholder="Libellé (facultatif)"
                  aria-label="Libellé du jalon"
                  value={s.label}
                  onChange={(e) => updateStatement(s.key, { label: e.currentTarget.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur();
                  }}
                  autoFocus={toName === s.key}
                  onFocus={() => setInput(s.key)}
                  onBlur={() => {
                    setInput(null);
                    setToName(null);
                  }}
                />
              </Group>
            ))}
          </Stack>
          {/* As close as possible to the list it extends. */}
          <ListFooter
            addLabel="Ajouter un jalon"
            onAdd={add}
            checkedCount={selection.checked.length}
            onDeleteChecked={removeChecked}
          />
        </div>

        {/* The slider as a project will show it, without touching it: filled
            to the end, each slice in its milestone's color. */}
        <div>
          <Slider
            value={END}
            min={0}
            max={END}
            marks={milestoneMarks(validEntries)}
            disabled
            styles={{
              bar: { background: bands(bounds) },
              thumb: { display: "none" },
            }}
            // 30px between the list and the preview: the stack's 16 gap
            // ("md"), plus these 14.
            mt={14}
          />
          <MilestoneLabels milestones={validEntries} />
        </div>

        {duplicateOf && (
          <Text size="xs" c={RED}>
            Deux jalons ne peuvent pas porter la même valeur.
          </Text>
        )}

        <Group justify="flex-end" mt={MODAL_PADDING - 16}>
          <CloseButton onClick={onClose} />
          <Button
            color="teal"
            onClick={save}
            loading={saving}
            disabled={duplicateOf || isIncomplete}
          >
            Enregistrer
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
