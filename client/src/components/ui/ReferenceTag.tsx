import { Badge, CopyButton, UnstyledButton } from "@mantine/core";
import { IconCheck, IconCopy } from "@tabler/icons-react";
import { NEUTRAL_TEXT } from "../../themes/colors";

// A reference's label ("PRJ-12", "TSK-12"): green, or a neutral gray — a
// widget's identifier.

// Tag height, like the ticket number in support.
const TAG_HEIGHT = 20;
// The inset on either side of the reference, tighter than Mantine's.
const TAG_PADDING_X = 2;
// A neutral tag's background: a gray lighter than the hover's (NEUTRAL_HOVER),
// untinted — Mantine's leans blue.
const NEUTRAL_BG = "light-dark(#f4f4f4, #3a3a3a)";
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
  /** True for a gray background — Mantine's leans blue, this one is neutral. */
  neutral?: boolean;
}

export function ReferenceTag({ reference, template, copyable, neutral }: ReferenceTagProps) {
  return (
    <Badge
      color="green"
      variant="filled"
      radius="sm"
      h={TAG_HEIGHT}
      px={TAG_PADDING_X}
      style={neutral ? { backgroundColor: NEUTRAL_BG, color: NEUTRAL_TEXT } : undefined}
    >
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
                // The text's color, very transparent — white on green, gray on
                // the neutral gray: the line is visible without competing with
                // the reference.
                backgroundColor: "currentColor",
                opacity: 0.3,
              }}
            />
            <CopyButton value={reference}>
              {({ copied, copy }) => (
                <UnstyledButton
                  onClick={copy}
                  aria-label={`Copier ${reference}`}
                  // The text's color: white on green, gray on the neutral gray.
                  style={{ display: "inline-flex", color: "inherit" }}
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
