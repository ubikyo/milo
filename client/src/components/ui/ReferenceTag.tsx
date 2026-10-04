import { Badge, CopyButton, UnstyledButton } from "@mantine/core";
import { IconCheck, IconCopy } from "@tabler/icons-react";

// A reference's green label ("PRJ-12", "TSK-12").

// Tag height, like the ticket number in support.
const TAG_HEIGHT = 20;
// The inset on either side of the reference, tighter than Mantine's.
const TAG_PADDING_X = 2;
// The gap on either side of the separator, when the label is copyable.
const SEPARATOR_GAP = 4;

interface ReferenceTagProps {
  /** The reference displayed. */
  reference: string;
  /**
   * The longest reference expected: all labels in a list take its width.
   */
  template: string;
  /**
   * True to add, at the end of the label and behind a line, a button that
   * copies the reference.
   */
  copyable?: boolean;
}

export function ReferenceTag({ reference, template, copyable }: ReferenceTagProps) {
  return (
    <Badge color="green" variant="filled" radius="sm" h={TAG_HEIGHT} px={TAG_PADDING_X}>
      <span style={{ display: "inline-flex", alignItems: "center", height: "100%" }}>
        {/* The reference and its invisible template are stacked in the same
            cell: the label takes the width of the longest. */}
        <span style={{ display: "inline-grid", justifyItems: "center" }}>
          <span style={{ gridArea: "1 / 1" }}>{reference}</span>
          <span style={{ gridArea: "1 / 1", visibility: "hidden" }} aria-hidden>
            {template}
          </span>
        </span>
        {copyable && (
          <>
            <span
              aria-hidden
              // The label's full height, edge to edge.
              style={{
                width: 1,
                height: TAG_HEIGHT,
                marginInline: SEPARATOR_GAP,
                // A very transparent white: the line is visible without
                // competing with the reference.
                backgroundColor: "rgba(255, 255, 255, 0.3)",
              }}
            />
            <CopyButton value={reference}>
              {({ copied, copy }) => (
                <UnstyledButton
                  onClick={copy}
                  aria-label={`Copier ${reference}`}
                  style={{ display: "inline-flex", color: "white" }}
                >
                  {copied ? <IconCheck size={12} /> : <IconCopy size={12} />}
                </UnstyledButton>
              )}
            </CopyButton>
          </>
        )}
      </span>
    </Badge>
  );
}
