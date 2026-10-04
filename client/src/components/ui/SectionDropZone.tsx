import { Stack, Text, ThemeIcon, UnstyledButton } from "@mantine/core";
import { STRONG_TEXT } from "../../themes/colors";
import { IconPlus } from "@tabler/icons-react";
import { useLayoutEffect, useRef, useState } from "react";

// A section's add zone — in Access mode or in a statistics panel
// (SectionsBoard): a dotted frame, no background, filling the remaining height,
// and the "+" in the center in a green badge, with "Ajouter un widget" below to
// say what it does. The whole zone is clickable — the button is only a visual
// cue, not a target to aim at. It opens the widget drawer.
//
// It is not always shown. A column that already holds something no longer needs
// a prompt: the zone disappears, and only returns if the column empties, or
// while a widget is held above it — it is then the one that receives it. When
// locked, it keeps its place but is no longer visible: the column does not
// change height for that.
interface SectionDropZoneProps {
  onClick: () => void;
  /** True while a widget is held above: the zone welcomes it. */
  accepting?: boolean;
  /** True when the category is locked: the zone takes up space, but is no longer visible. */
  invisible?: boolean;
  /**
   * The column already carries its dotted frame: the zone does not double the
   * line, it only shows it to welcome a drop.
   */
  withoutFrame?: boolean;
  onDragOver?: (event: React.DragEvent) => void;
  onDragLeave?: () => void;
  onDrop?: (event: React.DragEvent) => void;
}

/** The dotted line's gray: the tab row's rule. The columns' frame uses it too. */
export const DOTTED =
  "light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))";

// Minimum height: an empty column must remain a zone, not a line.
const MIN_HEIGHT = 120;

// The room the label leaves on each side before giving way.
const MARGIN_LABEL = 8;

export default function SectionDropZone({
  onClick,
  accepting = false,
  invisible = false,
  withoutFrame = false,
  onDragOver,
  onDragLeave,
  onDrop,
}: SectionDropZoneProps) {
  // The label fits on one line, or is not shown: a narrow column only keeps the
  // "+". It stays rendered, but out of the flow, so its width can always be
  // measured.
  const zone = useRef<HTMLButtonElement>(null);
  const label = useRef<HTMLParagraphElement>(null);
  const [fits, setFits] = useState(true);
  useLayoutEffect(() => {
    const element = zone.current;
    if (!element) return;
    const measure = () =>
      setFits((label.current?.scrollWidth ?? 0) <= element.clientWidth - 2 * MARGIN_LABEL);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <UnstyledButton
      ref={zone}
      onClick={onClick}
      aria-label="Ajouter un widget"
      disabled={invisible}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      style={{
        flex: 1,
        minHeight: MIN_HEIGHT,
        // The label set aside does not overflow the zone.
        position: "relative",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        // The tab row's rule, except while an item is held above: it then turns
        // white, to say that this is where it lands.
        border: accepting
          ? "1px dashed var(--mantine-color-white)"
          : withoutFrame
            ? "1px dashed transparent"
            : `1px dashed ${DOTTED}`,
        borderRadius: "var(--mantine-radius-md)",
        backgroundColor: "transparent",
        // Locked: nothing shows any more, but the space stays held.
        visibility: invisible ? "hidden" : "visible",
      }}
    >
      <Stack gap="xs" align="center">
        <ThemeIcon radius="xl" size={44} color="teal">
          <IconPlus size={24} />
        </ThemeIcon>
        <Text
          ref={label}
          size="sm"
          c={STRONG_TEXT}
          style={{
            whiteSpace: "nowrap",
            ...(fits ? {} : { position: "absolute", left: 0, top: 0, visibility: "hidden" }),
          }}
        >
          Ajouter un widget
        </Text>
      </Stack>
    </UnstyledButton>
  );
}
