import { useEffect, useState } from "react";

// Files dragged over the page, from outside: while they are, the drop zones
// of a drawer's lists show — even under lists that already have rows
// (FileDropzone). Dropped beside the zones, the files are refused rather than
// opened by the browser in place of the page.
//
// Entering a child counts as a new entry: the depth tells when the page is
// left.

const carriesFiles = (e: DragEvent) => Boolean(e.dataTransfer?.types.includes("Files"));

/** True while files are dragged over the page; "active" false, never. */
export function useFileDrag(active: boolean): boolean {
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!active) return;
    let depth = 0;
    const end = () => {
      depth = 0;
      setDragging(false);
    };
    const enter = (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      depth += 1;
      setDragging(true);
    };
    const leave = (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      depth -= 1;
      if (depth <= 0) end();
    };
    const over = (e: DragEvent) => {
      if (carriesFiles(e)) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      e.preventDefault();
      end();
    };
    document.addEventListener("dragenter", enter);
    document.addEventListener("dragleave", leave);
    document.addEventListener("dragover", over);
    document.addEventListener("drop", drop);
    return () => {
      document.removeEventListener("dragenter", enter);
      document.removeEventListener("dragleave", leave);
      document.removeEventListener("dragover", over);
      document.removeEventListener("drop", drop);
      end();
    };
  }, [active]);

  return dragging;
}
