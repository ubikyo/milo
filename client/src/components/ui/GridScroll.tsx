import { ScrollArea } from "@mantine/core";
import { useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import classes from "../../assets/styles/GridScroll.module.css";

/**
 * The zone that scrolls a grid sideways, when its section is narrower than it:
 * the application's thin bar rather than the browser's, laid on the rule under
 * the header rather than at the bottom of the grid.
 *
 * The zone's content is rendered as a block: as a "table", as Mantine wants, it
 * would hug the grid and its "100 %" would no longer equal the section's width
 * (useResizableColumns).
 */
export default function GridScroll({ children }: { children: ReactNode }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  // The bottom of the header row, from the top of the zone: the rule occupies
  // its last pixel.
  const [rule, setDivider] = useState<number | null>(null);

  // The header changes height with its labels, and the grid itself can be
  // replaced: it is found again on every render, and followed as long as it is
  // there.
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const header = viewport?.querySelector("thead");
    if (!viewport || !header) {
      setDivider(null);
      return;
    }
    const measure = () =>
      setDivider(header.getBoundingClientRect().bottom - viewport.getBoundingClientRect().top);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => observer.disconnect();
  });

  return (
    <ScrollArea
      type="auto"
      scrollbars="x"
      viewportRef={viewportRef}
      classNames={{ scrollbar: classes.scrollbar, thumb: classes.thumb }}
      styles={{ content: { display: "block" } }}
      style={rule === null ? undefined : ({ "--grid-rule": `${rule}px` } as CSSProperties)}
    >
      {children}
    </ScrollArea>
  );
}
