import { Anchor, Box } from "@mantine/core";
import { IconExternalLink } from "@tabler/icons-react";
import {
  autocompletion,
  completionKeymap,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { HighlightStyle, StreamLanguage, syntaxHighlighting } from "@codemirror/language";
import { Compartment, EditorState, Transaction } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { BLUE, ORANGE } from "../../themes/colors";
import { MUSTACHE, THEME } from "./MjmlEditor";
import type { EditorVariable, MjmlEditorHandle } from "./MjmlEditor";

// The ZPL of a label template, in CodeMirror, as the MJML of the e-mail
// templates (MjmlEditor): line numbers, the same look, the variables in
// green. Its commands in blue, a field's data in orange, the "^FX" comments
// dimmed.

const DIMMED = "var(--mantine-color-dimmed)";
const CODE_BG = "var(--mantine-color-body)";
const BUILDER_URL = "https://app.zplab.org/";
// As MjmlEditor's link: its distance from the code's top and right edges.
const INSET = 8;
const LINK_INSET = 2;

/** Inside "^FD … ^FS": a field's data. */
interface ZplState {
  data: boolean;
}

const ZPL = StreamLanguage.define<ZplState>({
  name: "zpl",
  startState: () => ({ data: false }),
  token(stream, state) {
    if (stream.match(/\{\{[^{}]*\}\}/)) return "variableName";
    if (stream.match(/\^FX[^^~]*/i)) return "comment";
    const command = stream.match(/[\^~][A-Z0-9@]{2}/i) as RegExpMatchArray | null;
    if (command) {
      const name = command[0].slice(1).toUpperCase();
      if (name === "FD" || name === "FV") state.data = true;
      else if (name === "FS") state.data = false;
      return "keyword";
    }
    if (state.data) {
      // Up to the next command or variable.
      if (!stream.match(/[^^~{]+/)) stream.next();
      return "string";
    }
    if (stream.match(/\d+/)) return "number";
    stream.next();
    return null;
  },
});

const HIGHLIGHT = HighlightStyle.define([
  { tag: tags.keyword, color: BLUE, fontWeight: 600 },
  { tag: tags.string, color: ORANGE },
  { tag: tags.number, color: DIMMED },
  { tag: tags.comment, color: DIMMED, fontStyle: "italic" },
]);

/** The template's variables, once "{{" is typed: a group's name may hold spaces. */
const variableCompletions =
  (variables: () => EditorVariable[]) =>
  (context: CompletionContext): CompletionResult | null => {
    const typed = context.matchBefore(/\{\{[^{}\n]*/);
    if (!typed) return null;
    return {
      from: typed.from,
      options: variables().map((v) => ({
        label: v.name,
        detail: v.label,
        section: v.group,
        type: "variable",
      })),
      validFor: /^\{\{[^{}\n]*$/,
    };
  };

interface ZplEditorProps {
  value: string;
  variables: EditorVariable[];
  onChange: (value: string) => void;
  readOnly: boolean;
  /** In pixels, or "100%" of the window's panes when it fills the screen. */
  height: number | string;
}

const ZplEditor = forwardRef<MjmlEditorHandle, ZplEditorProps>(function ZplEditor(
  { value, variables, onChange, readOnly, height },
  ref,
) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  // The latest callback and variables: the editor is built once, and reads them.
  const changed = useRef(onChange);
  changed.current = onChange;
  const offered = useRef(variables);
  offered.current = variables;
  const editable = useRef(new Compartment());

  useEffect(() => {
    if (!host.current) return undefined;
    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          history(),
          keymap.of([...completionKeymap, ...defaultKeymap, ...historyKeymap, indentWithTab]),
          ZPL,
          ZPL.data.of({ autocomplete: variableCompletions(() => offered.current) }),
          autocompletion({ icons: false }),
          syntaxHighlighting(HIGHLIGHT),
          MUSTACHE,
          THEME,
          editable.current.of([EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)]),
          EditorView.contentAttributes.of({ "aria-label": "ZPL", spellcheck: "false" }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) changed.current(update.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = editor;
    return () => {
      editor.destroy();
      view.current = null;
    };
    // Built once; the value and the mode follow below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A value from outside — another template opened — replaces the text,
  // without the undo going back to the previous template.
  useEffect(() => {
    const editor = view.current;
    if (!editor) return;
    const current = editor.state.doc.toString();
    if (current === value) return;
    editor.dispatch({
      changes: { from: 0, to: current.length, insert: value },
      annotations: Transaction.addToHistory.of(false),
    });
  }, [value]);

  useEffect(() => {
    view.current?.dispatch({
      effects: editable.current.reconfigure([
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
      ]),
    });
  }, [readOnly]);

  useImperativeHandle(ref, () => ({
    insert: (text: string) => {
      const editor = view.current;
      if (!editor) return;
      editor.dispatch(editor.state.replaceSelection(text));
      editor.focus();
    },
  }));

  return (
    <Box h={height} style={{ position: "relative", backgroundColor: CODE_BG }}>
      <Box ref={host} h="100%" />

      {/* Over the code's top right corner: a visual ZPL editor, to draw a
          label elsewhere and paste it back here. */}
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
        style={{ backgroundColor: CODE_BG, borderRadius: 4, display: "inline-flex", gap: 4, alignItems: "center" }}
      >
        Éditeur ZPL visuel
        <IconExternalLink size={12} />
      </Anchor>
    </Box>
  );
});

export default ZplEditor;
