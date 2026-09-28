import { SegmentedControl } from "@mantine/core";
import type { Mode } from "@milo/shared";
import { MODES } from "@milo/shared";

// Pendant du « ? » des raccourcis : même retrait, dans le coin opposé.
interface ModeSwitchProps {
  mode: Mode;
  onModeChange: (mode: Mode) => void;
}

export default function ModeSwitch({ mode, onModeChange }: ModeSwitchProps) {
  return (
    <SegmentedControl
      value={mode}
      onChange={(value) => onModeChange(value as Mode)}
      data={MODES.map((m) => ({ value: m.value, label: m.label }))}
      size="sm"
      // Sans traits de séparation entre les modes : seule la pastille du mode
      // courant se voit.
      withItemsBorders={false}
      style={{ position: "fixed", left: 20, bottom: 20, zIndex: 200 }}
    />
  );
}
