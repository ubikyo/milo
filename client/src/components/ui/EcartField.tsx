import { NumberInput } from "@mantine/core";
import { useState } from "react";
import type { CSSProperties } from "react";
import { SECTIONS_GAP_MAX } from "@milo/shared";
import classes from "../../assets/styles/EcartField.module.css";

// L'écart entre deux sections, saisi au-dessus de lui : un petit champ posé en
// absolu dans la bande des poignées, centré sur l'écart. Discret tant qu'on ne
// le survole pas. La valeur part à la validation — Entrée ou perte du focus —,
// pas à chaque chiffre tapé : « 3 » en route vers « 30 » ne doit pas disloquer
// la rangée.

/** La largeur du champ : trois chiffres et leur air. */
export const ECART_FIELD_WIDTH = 36;

/** Sa hauteur, celle que la feuille de style lui donne : il tient dans la bande des poignées. */
export const ECART_FIELD_HEIGHT = 18;

interface EcartFieldProps {
  /** L'écart en vigueur, en pixels. */
  value: number;
  onChange: (gap: number) => void | Promise<void>;
  style: CSSProperties;
}

export default function EcartField({ value, onChange, style }: EcartFieldProps) {
  /** Ce qui est tapé ; « null » tant qu'on n'y a pas touché. */
  const [saisie, setSaisie] = useState<number | string | null>(null);

  const valider = () => {
    if (saisie === null) return;
    const nombre = Number(saisie);
    setSaisie(null);
    if (saisie === "" || !Number.isFinite(nombre)) return;
    const ecart = Math.min(Math.max(Math.round(nombre), 0), SECTIONS_GAP_MAX);
    if (ecart !== value) void onChange(ecart);
  };

  return (
    <NumberInput
      size="xs"
      w={ECART_FIELD_WIDTH}
      min={0}
      max={SECTIONS_GAP_MAX}
      allowDecimal={false}
      allowNegative={false}
      hideControls
      value={saisie ?? value}
      onChange={setSaisie}
      onBlur={valider}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          valider();
          e.currentTarget.blur();
        }
        if (e.key === "Escape") {
          setSaisie(null);
          e.currentTarget.blur();
        }
      }}
      // Ni la poignée voisine ni la rangée ne doivent prendre cet appui pour
      // un glisser.
      onPointerDown={(e) => e.stopPropagation()}
      aria-label="Écart avec la section suivante, en pixels"
      title="Écart avec la section suivante (px)"
      className={classes.champ}
      style={{ position: "absolute", zIndex: 2, ...style }}
    />
  );
}
