import { Anchor, Box, ScrollArea, Stack, Text } from "@mantine/core";
import { IconExternalLink } from "@tabler/icons-react";
import {
  autocompletion,
  completionKeymap,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { xml, xmlLanguage, type ElementSpec } from "@codemirror/lang-xml";
import {
  HighlightStyle,
  codeFolding,
  foldGutter,
  foldKeymap,
  syntaxHighlighting,
} from "@codemirror/language";
import { Compartment, EditorState, Transaction } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  MatchDecorator,
  ViewPlugin,
  keymap,
  lineNumbers,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { MJML_ELEMENTS } from "../../lib/mjml-schema";
import { BLUE, GREEN, ORANGE, RED } from "../../themes/colors";
import { SCROLLBAR_SIZE } from "./MailPreview";

// The MJML source of an e-mail template, in CodeMirror: line numbers in the
// margin, the text without wrapping — a line of MJML is read whole —, its
// syntax colored, and over the bottom of the code, white on red, what the
// compilation objected to.

/** One line of source, in the gutter and in the text alike. */
const LINE_HEIGHT = 18;
const INSET = 8;
const GUTTER_WIDTH = 40;
const ERRORS_MAX_HEIGHT = 120;
const BUILDER_URL = "https://tools.puida.com/creative/visual/mjml-email-builder/app/";
// The link's distance from the code's right edge.
const LINK_INSET = 2;

/** The code's background: the page's. */
const CODE_BG = "var(--mantine-color-body)";

// The gutter's line: a neutral gray, as around the preview — Mantine's leans blue.
const BORDER = "var(--milo-header-bg)";
const DIMMED = "var(--mantine-color-dimmed)";

/**
 * The look of the former editor — on the page's background —: the dimmed numbers
 * against a gray line, the monospace text — and thin scrollbars, as in every
 * pane.
 */
export const THEME = EditorView.theme({
  "&": { height: "100%", backgroundColor: CODE_BG, color: "var(--mantine-color-text)" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: "var(--mantine-font-family-monospace)",
    fontSize: "12px",
    lineHeight: `${LINE_HEIGHT}px`,
    scrollbarWidth: "thin",
    scrollbarColor: "var(--milo-scrollbar) transparent",
  },
  ".cm-scroller::-webkit-scrollbar": { width: `${SCROLLBAR_SIZE}px`, height: `${SCROLLBAR_SIZE}px` },
  ".cm-scroller::-webkit-scrollbar-thumb": { backgroundColor: "var(--milo-scrollbar)" },
  ".cm-content": { padding: `${INSET}px 0`, caretColor: "var(--mantine-color-text)" },
  ".cm-line": { padding: `0 ${INSET}px` },
  ".cm-cursor": { borderLeftColor: "var(--mantine-color-text)" },
  ".cm-gutters": {
    backgroundColor: CODE_BG,
    color: DIMMED,
    border: "none",
    borderRight: `1px solid ${BORDER}`,
  },
  ".cm-lineNumbers .cm-gutterElement": { minWidth: `${GUTTER_WIDTH - 8}px`, padding: "0 8px 0 0" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": {
    backgroundColor: "var(--milo-subtle-bg) !important",
  },
  // A template's variables: the green of the application, in bold.
  ".cm-mustache": { color: GREEN, fontWeight: 600 },
  // The folding arrows, dimmed like the numbers; a folded block, a gray chip.
  ".cm-foldGutter .cm-gutterElement": { padding: "0 4px", cursor: "pointer" },
  ".cm-foldPlaceholder": {
    backgroundColor: "var(--milo-subtle-bg)",
    border: "none",
    color: DIMMED,
    padding: "0 4px",
  },
  // The completion list, as the application's menus: their background, their
  // hover gray, the text of the interface.
  ".cm-tooltip": {
    backgroundColor: "var(--mantine-color-body)",
    border: `1px solid var(--mantine-color-default-border)`,
    borderRadius: "4px",
  },
  ".cm-tooltip.cm-tooltip-autocomplete > ul": {
    fontFamily: "var(--mantine-font-family-monospace)",
    fontSize: "12px",
  },
  ".cm-tooltip.cm-tooltip-autocomplete > ul > li": { color: "var(--mantine-color-text)", padding: "2px 8px" },
  ".cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]": {
    backgroundColor: "var(--milo-menu-hover)",
    color: "var(--mantine-color-text)",
  },
  ".cm-completionDetail": { color: DIMMED, fontStyle: "normal", marginLeft: "8px" },
  ".cm-completionMatchedText": { textDecoration: "none", fontWeight: 700 },
  ".cm-completionSection": { color: DIMMED, borderBottom: `1px solid ${BORDER}`, paddingLeft: "8px" },
});

/**
 * The fold's marker: the application's chevron (Tabler's "chevron-down"),
 * pointing down on an open block, turned to the right on a folded one.
 */
const chevron = (open: boolean): HTMLElement => {
  const marker = document.createElement("span");
  marker.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M6 9l6 6l6 -6" /></svg>';
  marker.style.display = "inline-flex";
  marker.style.height = `${LINE_HEIGHT}px`;
  marker.style.alignItems = "center";
  if (!open) marker.style.transform = "rotate(-90deg)";
  return marker;
};

/**
 * MJML's elements and attributes, for the completion: "<mj-" offers the
 * elements the parent accepts, a space in a tag its attributes, and the
 * values of those that take a list ("align": left, center, right).
 */
const MJML_SCHEMA: ElementSpec[] = Object.entries(MJML_ELEMENTS).map(([name, element]) => ({
  name,
  top: name === "mjml",
  children: element.children,
  attributes: Object.entries(element.attributes).map(([attribute, values]) =>
    values ? { name: attribute, values } : attribute,
  ),
}));
// Accepted by every element.
const MJML_GLOBAL_ATTRIBUTES = [
  { name: "mj-class", global: true },
  { name: "css-class", global: true },
];

/**
 * MJML is XML: its tags in blue, its attributes dimmed, their values in
 * orange, the comments dimmed in italics. The four colors of the palette,
 * the same on both themes.
 */
const HIGHLIGHT = HighlightStyle.define([
  { tag: tags.tagName, color: BLUE },
  { tag: tags.attributeName, color: DIMMED },
  { tag: tags.attributeValue, color: ORANGE },
  { tag: [tags.angleBracket, tags.definitionOperator], color: DIMMED },
  { tag: tags.comment, color: DIMMED, fontStyle: "italic" },
  { tag: [tags.character, tags.processingInstruction, tags.documentMeta], color: DIMMED },
  { tag: tags.invalid, color: RED },
]);

/** The variables — "{{milo.url}}", "{{#updates.items}}" —, wherever they are. */
const mustache = new MatchDecorator({
  regexp: /\{\{\{?[^{}]*\}?\}\}/g,
  decoration: Decoration.mark({ class: "cm-mustache" }),
});
export const MUSTACHE = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = mustache.createDeco(view);
    }
    update(update: ViewUpdate) {
      this.decorations = mustache.updateDeco(update, this.decorations);
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

/** A variable the completion offers: what it inserts, what it is, its source. */
export interface EditorVariable {
  /** As written in the template: "{{element.name}}", "{{#updates.items}}…{{/updates.items}}". */
  name: string;
  label: string;
  group: string;
}

/**
 * The template's variables, once "{{" is typed — a block inserts its opening
 * and its closing, the cursor between the two.
 */
const variableCompletions =
  (variables: () => EditorVariable[]) =>
  (context: CompletionContext): CompletionResult | null => {
    const typed = context.matchBefore(/\{\{[#/]?[\w.]*/);
    if (!typed) return null;
    const options: Completion[] = variables().map((v) => {
      const [open, close] = v.name.split("…");
      return {
        label: open!,
        detail: v.label,
        section: v.group,
        type: "variable",
        apply:
          close === undefined
            ? open!
            : (view, _completion, from, to) =>
                view.dispatch({
                  changes: { from, to, insert: open! + close },
                  selection: { anchor: from + open!.length },
                }),
      };
    });
    return { from: typed.from, options, validFor: /^\{\{[#/]?[\w.]*$/ };
  };

/** What the template window does in the code: drop a variable where the cursor is. */
export interface MjmlEditorHandle {
  insert: (text: string) => void;
}

interface MjmlEditorProps {
  value: string;
  /** The template's variables, which "{{" completes. */
  variables: EditorVariable[];
  onChange: (value: string) => void;
  readOnly: boolean;
  errors: string[];
  /** In pixels, or "100%" of the window's panes when it fills the screen. */
  height: number | string;
}

const MjmlEditor = forwardRef<MjmlEditorHandle, MjmlEditorProps>(function MjmlEditor(
  { value, variables, onChange, readOnly, errors, height },
  ref,
) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  // The latest callback: the editor is built once, and calls it.
  const changed = useRef(onChange);
  changed.current = onChange;
  // Those of the template opened: the completion reads them at each request.
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
          codeFolding(),
          foldGutter({ markerDOM: chevron }),
          history(),
          keymap.of([...completionKeymap, ...foldKeymap, ...defaultKeymap, ...historyKeymap, indentWithTab]),
          xml({ elements: MJML_SCHEMA, attributes: MJML_GLOBAL_ATTRIBUTES }),
          xmlLanguage.data.of({ autocomplete: variableCompletions(() => offered.current) }),
          autocompletion({ icons: false }),
          syntaxHighlighting(HIGHLIGHT),
          MUSTACHE,
          THEME,
          editable.current.of([EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)]),
          EditorView.contentAttributes.of({ "aria-label": "MJML", spellcheck: "false" }),
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
        style={{ backgroundColor: CODE_BG, borderRadius: 4, display: "inline-flex", gap: 4, alignItems: "center" }}
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
