import { Group, NumberInput, Select } from "@mantine/core";
import { IconChevronDown } from "@tabler/icons-react";
import { useState } from "react";
import type { CSSProperties } from "react";
import type { SectionWidthUnit } from "@milo/shared";
import classes from "../../assets/styles/GapField.module.css";
import { GAP_FIELD_HEIGHT } from "./GapField";

// A section's width — or, in edit mode, a grid column's (useResizableColumns) —,
// set at the foot of its column: the number when
// the unit requires one, then the unit. Discreet like the gap field, at its
// height. Choosing "px" or "%" takes effect at once, with the width the
// column has on screen: it does not jump. The number is sent on validation —
// Enter or loss of focus —, like the gap.

const UNITS: { value: SectionWidthUnit; label: string }[] = [
  { value: "auto", label: "auto" },
  { value: "px", label: "px" },
  { value: "percent", label: "%" },
];

/** The number the unit admits. */
const bound = (unit: SectionWidthUnit, count: number): number =>
  Math.max(1, unit === "percent" ? Math.min(Math.round(count), 100) : Math.round(count));

/** A section's width: "width_value" only makes sense outside "auto". */
export interface SectionWidth {
  width_unit: SectionWidthUnit;
  width_value: number | null;
}

interface WidthFieldProps {
  value: SectionWidth;
  onChange: (width: SectionWidth) => void | Promise<void>;
  /** The width the column has on screen, in this unit. */
  measure: (unit: Exclude<SectionWidthUnit, "auto">) => number;
  style?: CSSProperties;
  /** What it sizes, in its labels: "de la section" by default — or "de la colonne". */
  subject?: string;
}

export default function WidthField({
  value,
  onChange,
  measure,
  style,
  subject = "de la section",
}: WidthFieldProps) {
  /** What is typed; "null" until it has been touched. */
  const [input, setInput] = useState<number | string | null>(null);

  const select = (unit: SectionWidthUnit) => {
    if (unit === value.width_unit) return;
    setInput(null);
    void onChange({
      width_unit: unit,
      width_value: unit === "auto" ? null : bound(unit, measure(unit)),
    });
  };

  const validate = () => {
    if (input === null || value.width_unit === "auto") return;
    const count = Number(input);
    setInput(null);
    if (input === "" || !Number.isFinite(count)) return;
    const width = bound(value.width_unit, count);
    if (width !== value.width_value) {
      void onChange({ width_unit: value.width_unit, width_value: width });
    }
  };

  return (
    <Group
      gap={0}
      wrap="nowrap"
      // Neither the handle nor the row must take this press for a drag.
      onPointerDown={(e) => e.stopPropagation()}
      style={{ position: "absolute", zIndex: 2, height: GAP_FIELD_HEIGHT, ...style }}
    >
      {value.width_unit !== "auto" && (
        <NumberInput
          size="xs"
          w={34}
          min={1}
          max={value.width_unit === "percent" ? 100 : undefined}
          allowDecimal={false}
          allowNegative={false}
          hideControls
          value={input ?? value.width_value ?? ""}
          onChange={setInput}
          onBlur={validate}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              validate();
              e.currentTarget.blur();
            }
            if (e.key === "Escape") {
              setInput(null);
              e.currentTarget.blur();
            }
          }}
          aria-label={
            value.width_unit === "percent" ? `Largeur ${subject} en %` : `Largeur ${subject} en pixels`
          }
          className={`${classes.field} ${classes.number}`}
        />
      )}
      <Select
        size="xs"
        w={value.width_unit === "auto" ? 44 : 32}
        data={UNITS}
        value={value.width_unit}
        onChange={(unit) => unit && select(unit as SectionWidthUnit)}
        allowDeselect={false}
        withCheckIcon={false}
        rightSection={<IconChevronDown size={10} />}
        rightSectionWidth={12}
        comboboxProps={{ width: 72, position: "bottom" }}
        // As close as possible to the number: the fields' inner space is enough.
        ml={value.width_unit === "auto" ? 0 : -3}
        aria-label={`Unité de la largeur ${subject}`}
        title={`Largeur ${subject}`}
        className={`${classes.field} ${classes.unit}`}
      />
    </Group>
  );
}
