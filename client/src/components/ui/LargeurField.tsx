import { Group, NumberInput, Select } from "@mantine/core";
import { IconChevronDown } from "@tabler/icons-react";
import { useState } from "react";
import type { CSSProperties } from "react";
import type { SectionWidthUnit } from "@milo/shared";
import classes from "../../assets/styles/EcartField.module.css";
import { ECART_FIELD_HEIGHT } from "./EcartField";

// La largeur d'une section, réglée au pied de sa colonne : le nombre quand
// l'unité en demande un, puis l'unité. Discrète comme le champ de l'écart, à sa
// hauteur. Choisir « px » ou « % » part aussitôt, avec la largeur que la
// colonne a à l'écran : elle ne saute pas. Le nombre part à la validation —
// Entrée ou perte du focus —, comme l'écart.

const UNITS: { value: SectionWidthUnit; label: string }[] = [
  { value: "auto", label: "auto" },
  { value: "px", label: "px" },
  { value: "percent", label: "%" },
];

/** Le nombre que l'unité admet. */
const bound = (unit: SectionWidthUnit, count: number): number =>
  Math.max(1, unit === "percent" ? Math.min(Math.round(count), 100) : Math.round(count));

/** La largeur d'une section : « width_value » n'a de sens qu'hors « auto ». */
export interface SectionWidth {
  width_unit: SectionWidthUnit;
  width_value: number | null;
}

interface WidthFieldProps {
  value: SectionWidth;
  onChange: (largeur: SectionWidth) => void | Promise<void>;
  /** La largeur que la colonne a à l'écran, dans cette unité. */
  measure: (unit: Exclude<SectionWidthUnit, "auto">) => number;
  style?: CSSProperties;
}

export default function WidthField({ value, onChange, measure, style }: WidthFieldProps) {
  /** Ce qui est tapé ; « null » tant qu'on n'y a pas touché. */
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
    const largeur = bound(value.width_unit, count);
    if (largeur !== value.width_value) {
      void onChange({ width_unit: value.width_unit, width_value: largeur });
    }
  };

  return (
    <Group
      gap={0}
      wrap="nowrap"
      // Ni la poignée ni la rangée ne doivent prendre cet appui pour un glisser.
      onPointerDown={(e) => e.stopPropagation()}
      style={{ position: "absolute", zIndex: 2, height: ECART_FIELD_HEIGHT, ...style }}
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
            value.width_unit === "percent" ? "Largeur de la section en %" : "Largeur de la section en pixels"
          }
          className={`${classes.champ} ${classes.nombre}`}
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
        // Au plus près du nombre : l'air intérieur des deux champs suffit.
        ml={value.width_unit === "auto" ? 0 : -3}
        aria-label="Unité de la largeur de la section"
        title="Largeur de la section"
        className={`${classes.champ} ${classes.unite}`}
      />
    </Group>
  );
}
