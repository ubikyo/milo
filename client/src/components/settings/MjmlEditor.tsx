import { Anchor, Box, ScrollArea, Stack, Text } from "@mantine/core";
import { IconExternalLink } from "@tabler/icons-react";
import { forwardRef } from "react";
import { RED } from "../../themes/colors";
import { FIELD_BG } from "../ui/RichText";
import { SCROLLBAR_SIZE } from "./MailPreview";

// The MJML source of an e-mail template: line numbers in the margin, the text
// without wrapping — a line of MJML is read whole —, and over the bottom of
// the code, white on red, what the compilation objected to.

/** One line of source, in the gutter and in the text alike. */
const LINE_HEIGHT = 18;
const INSET = 8;
const GUTTER_WIDTH = 40;
const ERRORS_MAX_HEIGHT = 120;
const BUILDER_URL = "https://tools.puida.com/creative/visual/mjml-email-builder/app/";
// The link's distance from the code's right edge.
const LINK_INSET = 2;

// The gutter's line: a neutral gray, as around the preview — Mantine's leans blue.
const BORDER = "light-dark(#dcdcdc, #3d3d3d)";

const MONOSPACE = {
  fontFamily: "var(--mantine-font-family-monospace)",
  fontSize: 12,
  lineHeight: `${LINE_HEIGHT}px`,
};

interface MjmlEditorProps {
  value: string;
  onChange: (value: string) => void;
  readOnly: boolean;
  errors: string[];
  height: number;
}

const MjmlEditor = forwardRef<HTMLTextAreaElement, MjmlEditorProps>(function MjmlEditor(
  { value, onChange, readOnly, errors, height },
  ref,
) {
  const rows = value.split("\n");
  const longest = Math.max(...rows.map((row) => row.length));

  return (
    <Box h={height} style={{ position: "relative", backgroundColor: FIELD_BG }}>
      {/* Mantine's scrollbars, not the browser's: the text takes its full
          size — every line, the longest one's width — and the area scrolls
          it, the numbers along with it. */}
      <ScrollArea h="100%" type="auto" scrollbarSize={SCROLLBAR_SIZE}>
        <Box style={{ display: "flex", minWidth: "100%", width: "max-content" }}>
          <Box
            aria-hidden
            style={{
              ...MONOSPACE,
              width: GUTTER_WIDTH,
              flexShrink: 0,
              padding: `${INSET}px 8px ${INSET}px 0`,
              textAlign: "right",
              color: "var(--mantine-color-dimmed)",
              borderRight: `1px solid ${BORDER}`,
              userSelect: "none",
            }}
          >
            {rows.map((_, i) => (
              <div key={i}>{i + 1}</div>
            ))}
          </Box>
          <textarea
            ref={ref}
            aria-label="MJML"
            value={value}
            onChange={(e) => onChange(e.currentTarget.value)}
            readOnly={readOnly}
            spellCheck={false}
            wrap="off"
            style={{
              ...MONOSPACE,
              flex: 1,
              // As tall as its lines, as wide as the longest: it never scrolls itself.
              height: rows.length * LINE_HEIGHT + 2 * INSET,
              minWidth: `calc(${longest + 2}ch + ${2 * INSET}px)`,
              border: 0,
              outline: 0,
              resize: "none",
              padding: INSET,
              whiteSpace: "pre",
              overflow: "hidden",
              background: "transparent",
              color: "inherit",
            }}
          />
        </Box>
      </ScrollArea>

      {/* Over the code's top right corner: a visual MJML builder, to draft
          a template elsewhere and paste it back here. */}
      <Anchor
        href={BUILDER_URL}
        target="_blank"
        rel="noopener noreferrer"
        size="xs"
        c="dimmed"
        pos="absolute"
        top={INSET}
        right={LINK_INSET}
        px={6}
        style={{ backgroundColor: FIELD_BG, borderRadius: 4, display: "inline-flex", gap: 4, alignItems: "center" }}
      >
        Éditeur MJML visuel
        <IconExternalLink size={12} />
      </Anchor>

      {/* Over the code's bottom. */}
      {errors.length > 0 && (
        <Box pos="absolute" left={0} right={0} bottom={0} style={{ backgroundColor: RED }}>
          <ScrollArea.Autosize mah={ERRORS_MAX_HEIGHT} type="auto" scrollbarSize={SCROLLBAR_SIZE}>
            <Stack gap={4} p="xs">
              {errors.map((error) => (
                <Text key={error} size="xs" c="#ffffff">
                  {error}
                </Text>
              ))}
            </Stack>
          </ScrollArea.Autosize>
        </Box>
      )}
    </Box>
  );
});

export default MjmlEditor;
