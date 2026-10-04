import { ColorSwatch, Popover, SimpleGrid } from "@mantine/core";
import { useState } from "react";
import { LABEL_COLORS, LABEL_HUES } from "@milo/shared";
import { useLabelColors } from "./LabelChip";

// The swatch that opens the color choice of a label. Colors need no caption: a
// color is recognized on sight. "withinPortal" must be turned off when the
// swatch already lives in another floating panel: rendered in a portal, its
// color choice would count as a click outside and close the panel that carries
// it.
/**
 * The current color is recognized by its white border. It is placed as a child
 * of the swatch: Mantine places children above its color layers, which would
 * cover an outline set on the swatch itself.
 */
export function SelectionBorder() {
  return (
    <span
      style={{
        position: "absolute",
        inset: 0,
        borderRadius: "var(--cs-radius)",
        border: "2px solid #fff",
      }}
    />
  );
}

interface LabelColorPickerProps {
  color: string;
  onChange: (color: string) => void;
  label: string;
  withinPortal?: boolean;
  /** The padding around the palette; Mantine's "xs" by default. */
  palettePadding?: number | string;
}

export default function LabelColorPicker({
  color,
  onChange,
  label,
  withinPortal = true,
  palettePadding = "xs",
}: LabelColorPickerProps) {
  const [opened, setOpened] = useState(false);
  const colors = useLabelColors();

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="bottom-start"
      withinPortal={withinPortal}
      // Left in place, the palette would be clipped by the scrolling of the
      // list that carries it: "fixed" takes it out of that clipping without
      // taking it out of the panel, of which it must remain a part.
      floatingStrategy={withinPortal ? undefined : "fixed"}
      shadow="md"
    >
      <Popover.Target>
        <ColorSwatch
          component="button"
          type="button"
          color={colors(color).backgroundColor}
          size={18}
          // The click opens the palette and nothing else: the row that carries
          // the swatch has its own click role.
          onClick={(e) => {
            e.stopPropagation();
            setOpened((o) => !o);
          }}
          style={{ cursor: "pointer", flexShrink: 0, alignSelf: "center" }}
          aria-label={`Couleur de ${label}`}
        />
      </Popover.Target>
      <Popover.Dropdown p={palettePadding}>
        {/* A matrix: each column a hue, each row a shade. */}
        <SimpleGrid cols={LABEL_HUES.length} spacing={4}>
          {LABEL_COLORS.map((c) => (
            <ColorSwatch
              key={c}
              component="button"
              type="button"
              color={colors(c).backgroundColor}
              size={20}
              onClick={() => {
                setOpened(false);
                onChange(c);
              }}
              style={{ cursor: "pointer" }}
              aria-label={c}
              aria-pressed={c === color}
            >
              {c === color && <SelectionBorder />}
            </ColorSwatch>
          ))}
        </SimpleGrid>
      </Popover.Dropdown>
    </Popover>
  );
}
