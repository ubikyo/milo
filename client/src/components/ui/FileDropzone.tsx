import { Stack, Text } from "@mantine/core";
import { Dropzone } from "@mantine/dropzone";
import { IconUpload, IconX } from "@tabler/icons-react";
import { useLayoutEffect, useRef } from "react";
import type { ComponentType } from "react";
import { notifyError } from "../../lib/errors";
import classes from "../../assets/styles/FileDropzone.module.css";

// A drawer list's drop zone, in place of its empty state (EmptyList) — the
// photos and documents of a declared equipment: files dropped on it, or
// chosen with a click, join the list. Mantine's Dropzone, on the rows'
// background: while files hover over it, its border says whether it takes
// them — green — or not — red.

const RADIUS = 8;

/** Within this much of the end, a scrolled list counts as scrolled to the bottom. */
const BOTTOM_SLACK = 40;

interface FileDropzoneProps {
  icon: ComponentType<{ size?: number; stroke?: number }>;
  /** What it takes: "Déposez des photos ici". */
  message: string;
  onDrop: (files: File[]) => void;
  /** The types it takes; any file when absent. */
  accept?: string[];
  /** What it says of a file it refuses. */
  rejected?: string;
  /**
   * Appearing under a list during a drag: if the drawer was scrolled to the
   * bottom, it scrolls further to show the zone, which would otherwise land
   * out of sight — a card's attachments close its drawer.
   */
  reveal?: boolean;
}

export default function FileDropzone({
  icon: Icon,
  message,
  onDrop,
  accept,
  rejected = "Ce fichier n'est pas accepté ici",
  reveal = false,
}: FileDropzoneProps) {
  const zone = useRef<HTMLDivElement>(null);

  // Before the page is painted: the drawer never shows a frame without it.
  useLayoutEffect(() => {
    const element = zone.current;
    if (!reveal || !element) return;
    const viewport = element.closest<HTMLElement>(".mantine-ScrollArea-viewport");
    if (!viewport) return;
    // Where the bottom was before the zone came: the zone's height is new.
    const left = viewport.scrollHeight - element.offsetHeight - viewport.scrollTop;
    if (left - viewport.clientHeight <= BOTTOM_SLACK) {
      viewport.scrollTop = viewport.scrollHeight - viewport.clientHeight;
    }
  }, [reveal]);

  return (
    <Dropzone
      ref={zone}
      onDrop={onDrop}
      onReject={(rejections) =>
        notifyError(`${rejected} : ${rejections.map((r) => r.file.name).join(", ")}`)
      }
      accept={accept}
      radius={RADIUS}
      classNames={{ root: classes.root }}
    >
      <Stack align="center" gap={6} py="md" style={{ pointerEvents: "none" }}>
        <Dropzone.Accept>
          <IconUpload size={22} stroke={1.5} color="var(--mantine-color-teal-6)" />
        </Dropzone.Accept>
        <Dropzone.Reject>
          <IconX size={22} stroke={1.5} color="var(--mantine-color-red-6)" />
        </Dropzone.Reject>
        <Dropzone.Idle>
          <Icon size={22} stroke={1.5} />
        </Dropzone.Idle>
        <Text size="sm" c="dimmed" ta="center">
          {message}
        </Text>
      </Stack>
    </Dropzone>
  );
}
