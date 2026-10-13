import { Text, TextInput, Textarea } from "@mantine/core";
import { useState } from "react";
import { ORDER_NOTE_MAX, ORDER_SECTION_MAX } from "@milo/shared";
import { INPUT_INSET, nameFieldStyle } from "../ui/DrawerRows";

// The text of an order's section or note, in its line (OrderDrawer): read as
// it is — a section's title in bold across the line, a note's text over its
// lines —, a double click edits it. A section is a field, Enter validates it;
// a note a text area, Ctrl+Enter or leaving it validates it. Escape puts back
// what it held. A line just added opens on its field.

/** A row's field height (nameFieldStyle). */
const FIELD_HEIGHT = 30;

interface LineTextProps {
  kind: "section" | "note";
  value: string;
  onChange: (text: string) => void;
  /** The line just added: its field opens at once. */
  autoFocus: boolean;
  readOnly: boolean;
}

export default function LineText({ kind, value, onChange, autoFocus, readOnly }: LineTextProps) {
  const [editing, setEditing] = useState(autoFocus && !readOnly);
  const [draft, setDraft] = useState(value);

  const open = () => {
    if (readOnly) return;
    setDraft(value);
    setEditing(true);
  };
  const validate = () => {
    setEditing(false);
    if (draft.trim() !== value) onChange(draft.trim());
  };
  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  const placeholder = kind === "section" ? "Libellé de la section" : "Texte de la note";

  if (editing && kind === "section") {
    return (
      <TextInput
        size="sm"
        autoFocus
        placeholder={placeholder}
        aria-label="Libellé de la section"
        value={draft}
        onChange={(e) => setDraft(e.currentTarget.value)}
        onBlur={validate}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            validate();
          } else if (e.key === "Escape") cancel();
        }}
        maxLength={ORDER_SECTION_MAX}
        data-mantine-stop-propagation
        style={{ flex: 1, minWidth: 0 }}
        styles={{ input: { ...nameFieldStyle(true), fontWeight: 600 } }}
      />
    );
  }
  if (editing) {
    return (
      <Textarea
        size="sm"
        autoFocus
        autosize
        minRows={2}
        placeholder={placeholder}
        aria-label="Texte de la note"
        value={draft}
        onChange={(e) => setDraft(e.currentTarget.value)}
        onBlur={validate}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            validate();
          } else if (e.key === "Escape") cancel();
        }}
        maxLength={ORDER_NOTE_MAX}
        data-mantine-stop-propagation
        style={{ flex: 1, minWidth: 0 }}
        styles={{ input: { ...nameFieldStyle(true), height: undefined, paddingTop: 5, paddingBottom: 5 } }}
      />
    );
  }
  return (
    <Text
      size="sm"
      fw={kind === "section" ? 600 : undefined}
      c={value ? undefined : "dimmed"}
      pl={INPUT_INSET}
      py={kind === "note" ? 5 : 0}
      lh={kind === "section" ? `${FIELD_HEIGHT}px` : undefined}
      mih={FIELD_HEIGHT}
      onDoubleClick={open}
      title={readOnly ? undefined : "Double-cliquer pour modifier"}
      style={{
        flex: 1,
        minWidth: 0,
        whiteSpace: kind === "note" ? "pre-wrap" : undefined,
        wordBreak: "break-word",
        cursor: readOnly ? undefined : "text",
      }}
    >
      {value || placeholder}
    </Text>
  );
}
