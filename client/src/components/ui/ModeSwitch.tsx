import { SegmentedControl } from "@mantine/core";
import { MODES } from "../../lib/modes";

// Pendant du « ? » des raccourcis : même retrait, dans le coin opposé.
export default function ModeSwitch({ mode, onModeChange }) {
  return (
    <SegmentedControl
      value={mode}
      onChange={onModeChange}
      data={MODES}
      size="sm"
      // Sans traits de séparation entre les modes : seule la pastille du mode
      // courant se voit.
      withItemsBorders={false}
      style={{ position: "fixed", left: 20, bottom: 20, zIndex: 200 }}
    />
  );
}
