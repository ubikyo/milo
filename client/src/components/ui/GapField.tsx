import { NumberInput } from "@mantine/core";
import { useState } from "react";
import type { CSSProperties } from "react";
import { SECTIONS_GAP_MAX } from "@milo/shared";
import classes from "../../assets/styles/GapField.module.css";

// L'écart entre deux sections, saisi au-dessus de lui : un petit champ posé en
// absolu dans la bande des poignées, centré sur l'écart. Discret tant qu'on ne
// le survole pas. La valeur part à la validation — Entrée ou perte du focus —,
// pas à chaque chiffre tapé : « 3 » en route vers « 30 » ne doit pas disloquer
// la rangée.

/** La largeur du champ : trois chiffres et leur air. */
export const GAP_FIELD_WIDTH = 36;

/** Sa hauteur, celle que la feuille de style lui donne : il tient dans la bande des poignées. */
export const GAP_FIELD_HEIGHT = 18;

interface GapFieldProps {
  /** L'écart en vigueur, en pixels. */
  value: number;
  onChange: (gap: number) => void | Promise<void>;
  style: CSSProperties;
}

export default function GapField({ value, onChange, style }: GapFieldProps) {
  /** Ce qui est tapé ; « null » tant qu'on n'y a pas touché. */
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
      // Ni la poignée voisine ni la rangée ne doivent prendre cet appui pour
      // un glisser.
      onPointerDown={(e) => e.stopPropagation()}
      aria-label="Écart avec la section suivante, en pixels"
      title="Écart avec la section suivante (px)"
      className={classes.field}
      style={{ position: "absolute", zIndex: 2, ...style }}
    />
  );
}
