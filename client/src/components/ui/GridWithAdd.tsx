import { Box, ScrollArea, Stack } from "@mantine/core";
import type { ReactNode } from "react";
import scroll from "../../assets/styles/ListScroll.module.css";
import { isSized } from "../../widgets/height";
import GridScroll from "./GridScroll";

// A list widget's grid with its "Ajouter" under it, as the projects' grid
// (ProjectTable): with a height of its own, the grid fills it and scrolls,
// "Ajouter" stays at the bottom of the widget.

// "Ajouter", under the grid, sits in the height of a row — 28 px and 5 px of
// padding above and below —: that of its "xs" button, plus what the padding
// gives back.
const ROW_HEIGHT = 28 + 2 * 5;
const ADD_BUTTON_HEIGHT = 30;
const ADD_PADDING_Y = (ROW_HEIGHT - ADD_BUTTON_HEIGHT) / 2;

export default function GridWithAdd({
  config,
  add,
  children,
}: {
  config: unknown;
  /** The "Ajouter" button; none without the right to add. */
  add?: ReactNode;
  /** The grid's table. */
  children: ReactNode;
}) {
  // A section narrower than the list makes it scroll sideways.
  const grid = <GridScroll>{children}</GridScroll>;
  // Aligned with the cells' padding, the "+" lines up with the first column.
  const actions = add && (
    <Box px="xs" py={ADD_PADDING_Y} style={{ flexShrink: 0 }}>
      {add}
    </Box>
  );

  if (!isSized(config)) {
    return (
      <>
        {grid}
        {actions}
      </>
    );
  }
  // "data-fill": an aligned place stretches it (Alignment.module.css).
  return (
    <Stack gap={0} style={{ flex: 1, minHeight: 0 }} data-fill>
      <ScrollArea
        type="auto"
        scrollbars="y"
        classNames={{ scrollbar: scroll.scrollbar, thumb: scroll.thumb }}
        style={{ flex: 1, minHeight: 0 }}
      >
        {grid}
      </ScrollArea>
      {actions}
    </Stack>
  );
}
