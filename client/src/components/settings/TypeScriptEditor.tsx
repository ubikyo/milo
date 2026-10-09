import { Box } from "@mantine/core";
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import { HighlightStyle, bracketMatching, indentOnInput, syntaxHighlighting } from "@codemirror/language";
import { Compartment, EditorState, Transaction } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { BLUE, ORANGE, RED } from "../../themes/colors";
import { MUSTACHE, THEME } from "./MjmlEditor";
import type { EditorVariable, MjmlEditorHandle } from "./MjmlEditor";

// The TypeScript of an asset number template, in CodeMirror, as the ZPL of
// the label templates (ZplEditor): line numbers, the same look, the variables
// in green. Its keywords in blue, its strings in orange, its comments dimmed —
// the palette's colors, the same on both themes.

const DIMMED = "var(--mantine-color-dimmed)";
const CODE_BG = "var(--mantine-color-body)";

const HIGHLIGHT = HighlightStyle.define([
  { tag: [tags.keyword, tags.controlKeyword, tags.definitionKeyword, tags.moduleKeyword], color: BLUE, fontWeight: 600 },
  { tag: [tags.string, tags.special(tags.string), tags.regexp], color: ORANGE },
  { tag: [tags.number, tags.bool, tags.null], color: BLUE },
  { tag: [tags.typeName, tags.className], color: BLUE },
  { tag: [tags.lineComment, tags.blockComment, tags.comment], color: DIMMED, fontStyle: "italic" },
  { tag: tags.invalid, color: RED },
]);

/** The template's variables, once "{{" is typed: a group's name may hold spaces, accents. */
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

interface TypeScriptEditorProps {
  value: string;
  variables: EditorVariable[];
  onChange: (value: string) => void;
  readOnly: boolean;
  /** In pixels, or "100%" of the window's panes when it fills the screen. */
  height: number | string;
}

const TypeScriptEditor = forwardRef<MjmlEditorHandle, TypeScriptEditorProps>(function TypeScriptEditor(
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
          indentOnInput(),
          bracketMatching(),
          closeBrackets(),
          keymap.of([
            ...closeBracketsKeymap,
            ...completionKeymap,
            ...defaultKeymap,
            ...historyKeymap,
            indentWithTab,
          ]),
          javascript({ typescript: true }),
          // The variables alone: the language's own completion offers nothing
          // the template needs.
          autocompletion({ icons: false, override: [variableCompletions(() => offered.current)] }),
          syntaxHighlighting(HIGHLIGHT),
          MUSTACHE,
          THEME,
          editable.current.of([EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)]),
          EditorView.contentAttributes.of({ "aria-label": "TypeScript", spellcheck: "false" }),
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

  // A value from outside — the template read again — replaces the text,
  // without the undo going back to the previous one.
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
    <Box h={height} style={{ backgroundColor: CODE_BG }}>
      <Box ref={host} h="100%" />
    </Box>
  );
});

export default TypeScriptEditor;
