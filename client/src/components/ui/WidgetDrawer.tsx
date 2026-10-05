import { Drawer, Group, ScrollArea, Stack, Text, Title } from "@mantine/core";
import { IconGripVertical } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import inset from "../../assets/styles/AccessNumber.module.css";
import type { ComponentType, DragEvent } from "react";
import { kindLabel, type WidgetKind } from "../../widgets/kinds";
import { H2_GAP } from "../../widgets/common/h2";

// What a section can receive, one widget per row: its handle, its
// icon, its name, in the widgets inset. The drawer opens on the left, and
// each row is dragged to where the widget should land — between two widgets,
// or into an empty column. As soon as the pointer leaves the drawer for
// the interface, the drawer closes, revealing where one drops.
//
// The list comes from the mode's registry: the drawer knows no widget in
// particular. It arranges it by kind (widgets/kinds.ts), in the order in which the
// registry presents the first widget of each, under an "H2" title.

/** What the drawer shows of a widget. */
export interface WidgetChoice {
  type: string;
  /** The group it belongs to in the drawer. */
  kind: WidgetKind;
  label: string;
  icon: ComponentType<{ size?: number }>;
}

interface WidgetDrawerProps<P extends WidgetChoice> {
  opened: boolean;
  onClose: () => void;
  widgets: P[];
  /** A row picked up: the sections row now holds this widget. */
  onDragStart: (widget: P) => void;
  /** The drag finished, dropped or not. */
  onDragEnd: () => void;
}

const WIDTH = 320;

/** The space above a kind's title, when other widgets precede it. */
const GROUPS_GAP = 40;

export default function WidgetDrawer<P extends WidgetChoice>({
  opened,
  onClose,
  widgets,
  onDragStart,
  onDragEnd,
}: WidgetDrawerProps<P>) {
  /** True while a widget is held. */
  const [held, setHeld] = useState(false);

  // The pointer leaving the drawer, over the interface, closes it. Read on
  // the whole page: it is the drawer's overlay that receives the hover first.
  useEffect(() => {
    if (!held || !opened) return;
    const dragHover = (e: globalThis.DragEvent) => {
      if (e.clientX > WIDTH) onClose();
    };
    window.addEventListener("dragover", dragHover);
    return () => window.removeEventListener("dragover", dragHover);
  }, [held, opened, onClose]);

  const grab = (e: DragEvent<HTMLElement>, widget: P) => {
    // Some browsers do not start the drag without a payload.
    e.dataTransfer.setData("text/plain", widget.type);
    e.dataTransfer.effectAllowed = "copy";
    setHeld(true);
    onDragStart(widget);
  };

  const release = () => {
    setHeld(false);
    onDragEnd();
  };

  // Widgets by kind, each group at the place of its first widget.
  const groups: { kind: WidgetKind; widgets: P[] }[] = [];
  for (const widget of widgets) {
    const group = groups.find((g) => g.kind === widget.kind);
    if (group) group.widgets.push(widget);
    else groups.push({ kind: widget.kind, widgets: [widget] });
  }

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="left"
      size={WIDTH}
      padding={30}
      withCloseButton={false}
      // Closed mid-drag, the drawer stays in the page, hidden: the
      // picked row must still receive the end of the drag, otherwise the
      // row would think it still holds the widget.
      keepMounted
      // Mantine's scrollbar, along the drawer's right edge.
      scrollAreaComponent={ScrollArea.Autosize}
    >
      {/* An "H1" title (widgets/common/title.tsx): its size, its
          color, and 20 px of space before the list. */}
      <Title order={1} size={18} c="var(--mantine-color-white)" mb={20}>
        Widgets
      </Title>
      {groups.map((group, rank) => (
        <div key={group.kind}>
          {/* An "H2" title (widgets/common/h2.tsx): its
              size, its weight, the space under it; 40 px above when
              other widgets precede it. */}
          <Title
            order={2}
            size={16}
            fw={400}
            c="var(--mantine-color-white)"
            mb={H2_GAP}
            pt={rank > 0 ? GROUPS_GAP : 0}
          >
            {kindLabel(group.kind)}
          </Title>
          <Stack gap={4}>
            {group.widgets.map((widget) => (
              // The widgets inset, without its line: the background is enough to set off
              // each row.
              <Group
                key={widget.type}
                draggable
                onDragStart={(e) => grab(e, widget)}
                onDragEnd={release}
                aria-label={`Glisser le widget ${widget.label}`}
                gap="sm"
                wrap="nowrap"
                className={inset.inset}
                style={{ padding: 10, border: "none", cursor: "grab" }}
              >
                <Text c="dimmed" component="span" style={{ display: "flex" }}>
                  <IconGripVertical size={16} />
                </Text>
                <widget.icon size={20} />
                <Text size="sm" truncate>
                  {widget.label}
                </Text>
              </Group>
            ))}
          </Stack>
        </div>
      ))}
    </Drawer>
  );
}
