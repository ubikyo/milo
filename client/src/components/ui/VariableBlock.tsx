import { useComputedColorScheme } from "@mantine/core";
import { Node, NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { useContext, useSyncExternalStore } from "react";
import classes from "../../assets/styles/VariableBlock.module.css";
import { MailFramed } from "./MailFrame";

// A variable that stands for a table — an order's "{{order.lines}}" —, in the
// editor: the variable stays in the text — it is what goes, filled on sending
// for each recipient —, the editor shows the table in its place, as the
// recipient will read it — in the dark theme, as the dark preview shows it:
// the interface's, or the template's around it (MailFrame), which the block
// steps out of to color itself — its frame keeps the editor's colors.
// The editor knows no tables: given one, it would keep only its text, and
// the e-mail would lose its layout.
//
// A paragraph holding the variable alone becomes the block (withVariableBlocks);
// the block writes itself back as that paragraph.

/** What each variable shows: its table, kept up to date by the editor's owner. */
export interface BlockStore {
  set: (blocks: Record<string, string>) => void;
  get: (key: string) => string;
  keys: () => string[];
  subscribe: (listener: () => void) => () => void;
}

export const createBlockStore = (): BlockStore => {
  let blocks: Record<string, string> = {};
  const listeners = new Set<() => void>();
  return {
    set: (next) => {
      blocks = next;
      for (const listener of listeners) listener();
    },
    get: (key) => blocks[key] ?? "",
    keys: () => Object.keys(blocks),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};

const escaped = (key: string) => key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The paragraphs holding a table's variable alone, as the editor reads them: its blocks. */
export const withVariableBlocks = (html: string, keys: string[]): string =>
  keys.reduce(
    (text, key) =>
      text.replace(
        new RegExp(`<p(?:\\s[^>]*)?>\\s*\\{\\{\\s*${escaped(key)}\\s*\\}\\}\\s*</p>`, "g"),
        `<div data-variable-block="${key}"></div>`,
      ),
    html,
  );

function BlockView({ node, extension, selected }: NodeViewProps) {
  const store = (extension.options as { store: BlockStore }).store;
  const key = String(node.attrs.key);
  const html = useSyncExternalStore(store.subscribe, () => store.get(key));
  const frameDark = useContext(MailFramed);
  const scheme = useComputedColorScheme("light");
  const dark = frameDark ?? scheme === "dark";
  return (
    <NodeViewWrapper
      contentEditable={false}
      data-drag-handle
      data-variable-block-view
      style={{
        margin: "4px 0",
        borderRadius: 4,
        // Dashed: white over a dark e-mail, the borders' gray over a light one.
        outline: selected
          ? "2px solid var(--mantine-color-teal-filled)"
          : `1px dashed ${dark ? "#ffffff" : "var(--mantine-color-default-border)"}`,
        outlineOffset: 2,
      }}
    >
      {html ? (
        <div
          className={dark ? `${classes.block} ${classes.dark}` : classes.block}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <p>{`{{${key}}}`}</p>
      )}
    </NodeViewWrapper>
  );
}

export const VariableBlock = Node.create<{ store: BlockStore }>({
  name: "variableBlock",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addOptions() {
    return { store: createBlockStore() };
  },

  addAttributes() {
    return {
      key: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-variable-block") ?? "",
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-variable-block]" }];
  },

  // Written back as the variable alone in its paragraph: filled on sending.
  renderHTML({ node }) {
    return ["p", {}, `{{${String(node.attrs.key)}}}`];
  },

  addNodeView() {
    return ReactNodeViewRenderer(BlockView);
  },
});
