import type { InputHTMLAttributes } from "react";

// The field for a name typed in place — a board tab, a view —,
// exactly at the width of the text. A width in "ch" left a blank on the
// right: a "ch" is the width of the zero, wider than most
// letters. Here, an invisible duplicate of the text, placed in the same grid
// cell, gives the field its width.

type AdjustedInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value"> & {
  value: string;
};

export default function AdjustedInput({ value, style, ...props }: AdjustedInputProps) {
  const common = { gridArea: "1 / 1", font: "inherit", padding: 0, margin: 0 } as const;
  return (
    <span style={{ display: "inline-grid", verticalAlign: "top" }}>
      <span aria-hidden style={{ ...common, visibility: "hidden", whiteSpace: "pre" }}>
        {value || " "}
      </span>
      {/* "size" at 1: without it, the field claims room for
          twenty characters by default, and the cell widens accordingly. */}
      <input
        {...props}
        size={1}
        value={value}
        style={{
          ...common,
          width: "100%",
          minWidth: 0,
          color: "inherit",
          background: "transparent",
          border: "none",
          outline: "none",
          ...style,
        }}
      />
    </span>
  );
}
