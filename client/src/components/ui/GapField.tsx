import { NumberInput } from "@mantine/core";
import { useState } from "react";
import type { CSSProperties } from "react";
import { SECTIONS_GAP_MAX } from "@milo/shared";
import classes from "../../assets/styles/GapField.module.css";

// The gap between two sections, entered above it: a small field placed
// absolutely in the handle strip, centered on the gap. Discreet until hovered.
// The value is sent on validation — Enter or loss of focus —, not on every
// digit typed: "3" on the way to "30" must not wreck the row.

/** The field's width: three digits and some breathing room. */
export const GAP_FIELD_WIDTH = 36;

/** Its height, the one the stylesheet gives it: it fits in the handle strip. */
export const GAP_FIELD_HEIGHT = 18;

interface GapFieldProps {
  /** The gap currently in effect, in pixels. */
  value: number;
  onChange: (gap: number) => void | Promise<void>;
  style: CSSProperties;
}

export default function GapField({ value, onChange, style }: GapFieldProps) {
  /** What is typed; "null" as long as it has not been touched. */
  const [input, setInput] = useState<number | string | null>(null);

  const validate = () => {
    if (input === null) return;
    const count = Number(input);
    setInput(null);
    if (input === "" || !Number.isFinite(count)) return;
    const gap = Math.min(Math.max(Math.round(count), 0), SECTIONS_GAP_MAX);
    if (gap !== value) void onChange(gap);
  };

  return (
    <NumberInput
      size="xs"
      w={GAP_FIELD_WIDTH}
      min={0}
      max={SECTIONS_GAP_MAX}
      allowDecimal={false}
      allowNegative={false}
      hideControls
      value={input ?? value}
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
      // Neither the neighboring handle nor the row must take this press for a
      // drag.
      onPointerDown={(e) => e.stopPropagation()}
      aria-label="Écart avec la section suivante, en pixels"
      title="Écart avec la section suivante (px)"
      className={classes.field}
      style={{ position: "absolute", zIndex: 2, ...style }}
    />
  );
}
