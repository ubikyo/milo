import { useEffect, useRef } from "react";

// Files pasted into the page — a screenshot, a document copied from the file
// explorer: they join the open drawer's attachments, as if dropped on its
// drop zone (useFileDrag). A paste already taken — an image the description
// inserts in its text (RichText), files a reply attaches (SupportReply) —
// is left to whoever took it; a paste without files stays a text paste.

/** The files the clipboard carries; none for a text paste. */
export const pastedFiles = (data: DataTransfer | null): File[] => Array.from(data?.files ?? []);

/** Hands the files pasted into the page to "onFiles"; "active" false, never. */
export function useFilePaste(active: boolean, onFiles: (files: File[]) => void) {
  // The paste reads the latest function, without re-registering at each render.
  const handler = useRef(onFiles);
  useEffect(() => {
    handler.current = onFiles;
  });

  useEffect(() => {
    if (!active) return;
    const paste = (e: ClipboardEvent) => {
      if (e.defaultPrevented) return;
      const files = pastedFiles(e.clipboardData);
      if (files.length === 0) return;
      e.preventDefault();
      handler.current(files);
    };
    document.addEventListener("paste", paste);
    return () => document.removeEventListener("paste", paste);
  }, [active]);
}
