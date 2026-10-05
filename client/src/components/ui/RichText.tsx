import { Input } from "@mantine/core";
import { RichTextEditor } from "@mantine/tiptap";
import { Placeholder } from "@tiptap/extensions";
import Image from "@tiptap/extension-image";
import { useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useRef } from "react";
import { RED } from "../../themes/colors";
import type { Editor } from "@tiptap/react";
import type { CSSProperties, ReactNode } from "react";
import classes from "../../assets/styles/RichText.module.css";

// The input area is painted on "--mantine-color-body", a notch darker than
// fields on the dark theme. We give it back the other fields' background: that
// of an "input" of "default" variant. The toolbar takes the same, and a line
// separates it from the input area.
export const FIELD_BG = "var(--mantine-color-default)";

// The trash icon of the button that removes an image: Tabler's icon, copied as
// is. The view below is in DOM and not in React (see why just below): it
// therefore cannot mount an icon component.
const TRASH_ICON = `
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
       fill="none" stroke="currentColor" stroke-width="2"
       stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M4 7l16 0" />
    <path d="M10 11l0 6" />
    <path d="M14 11l0 6" />
    <path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" />
    <path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" />
  </svg>`;

/**
 * The tiptap image, rendered with the button that removes it. The button only
 * shows on hover — a description is read first.
 *
 * The view is written in DOM and not with `ReactNodeViewRenderer`, although the
 * rest of the application is in React: a React view is only mounted if the
 * editor carries its React anchor point (`editor.contentComponent`) at the same
 * moment. When it does not have it, tiptap renders an empty element in its
 * place, silently — the image was in the text, but invisible until the card was
 * closed and reopened. The DOM, for its part, always displays.
 */
const ImageWithRemoval = Image.extend({
  addNodeView() {
    return ({ node, editor, getPos }) => {
      const wrapper = document.createElement("div");
      wrapper.className = classes.image ?? "";

      const image = document.createElement("img");
      image.src = String(node.attrs["src"] ?? "");
      image.alt = String(node.attrs["alt"] ?? "");

      const button = document.createElement("button");
      button.type = "button";
      button.className = classes.imageRemove ?? "";
      button.setAttribute("aria-label", "Supprimer l'image");
      // Le rouge de l'application, tenu en un seul endroit (themes/colors.ts).
      button.style.backgroundColor = RED;
      button.innerHTML = TRASH_ICON;

      // Without this, pressing the button first moves the cursor in the
      // description: the click would land on a selection that has moved.
      button.addEventListener("mousedown", (e) => e.preventDefault());
      button.addEventListener("click", () => {
        const position = getPos();
        if (typeof position !== "number") return;
        editor
          .chain()
          .focus()
          .deleteRange({ from: position, to: position + node.nodeSize })
          .run();
      });

      wrapper.append(image, button);

      return {
        dom: wrapper,
        // An image's address can change without the view being rebuilt.
        update: (newValue) => {
          if (newValue.type.name !== node.type.name) return false;
          image.src = String(newValue.attrs["src"] ?? "");
          image.alt = String(newValue.attrs["alt"] ?? "");
          return true;
        },
        // The button is ours: the editor need not interpret what happens in it,
        // nor worry about what we change in this wrapper.
        stopEvent: (event) => event.target instanceof Node && button.contains(event.target),
        ignoreMutation: () => true,
      };
    };
  },
});

/** The file of each image found in a clipboard. */
const pastedImages = (data: DataTransfer | null): File[] =>
  Array.from(data?.files ?? []).filter((f) => f.type.startsWith("image/"));

interface RichEditorOptions {
  placeholder?: string;
  /**
   * What to do with a pasted image: upload it, and return its address. An empty
   * string — a refused upload, about which the caller already said something —
   * leaves nothing in the description.
   *
   * Without this function, pasting an image does nothing: this is the case for
   * descriptions that come without a place to upload to.
   */
  onPasteImage?: (file: File) => Promise<string>;
}

/**
 * The application's rich text editor, built on tiptap. A single set of
 * extensions for everything written this way — a card's description, a comment
 * — so that both accept exactly the same formatting. "StarterKit" already
 * carries underline and links: adding them by hand would duplicate them.
 */
export function useRichEditor({ placeholder = "", onPasteImage }: RichEditorOptions = {}) {
  // The editor is only built once: what the paste must call therefore goes
  // through refs, otherwise it would always call the first version of the
  // function received.
  const drop = useRef(onPasteImage);
  const current = useRef<Editor | null>(null);

  const editor = useEditor({
    extensions: [StarterKit, Placeholder.configure({ placeholder }), ImageWithRemoval],
    content: "",
    editorProps: {
      // A pasted image is not pasted as is: it goes to the server, and it is
      // its address that enters the description. The clipboard can carry
      // several — they are inserted one after the other.
      handlePaste: (_view, event) => {
        const images = pastedImages(event.clipboardData);
        if (images.length === 0 || !drop.current) return false;

        event.preventDefault();
        void (async () => {
          for (const image of images) {
            try {
              const url = await drop.current?.(image);
              if (url) current.current?.chain().focus().setImage({ src: url }).run();
            } catch {
              // The upload has already said what went wrong: nothing to add
              // here.
            }
          }
        })();
        return true;
      },
    },
  });

  // Both refs follow what the render just produced, and it is the paste — much
  // later — that reads them.
  useEffect(() => {
    drop.current = onPasteImage;
    current.current = editor;
  });

  return editor;
}

/**
 * The field that goes with it: its toolbar and its input area. It fits on one
 * line as long as nothing has been written, grows as lines are added, and
 * starts scrolling past five lines (assets/styles/RichText.module.css).
 *
 * `label` is optional: without it, the field goes without a caption — a comment
 * being written does not need one.
 */
interface RichTextFieldProps {
  editor: Editor | null;
  label?: string;
  /**
   * What goes under the input area, across the full width, without margin,
   * flush with the editor's borders: a reply's "Envoyer" button.
   */
  bottomBar?: ReactNode;
  /** Extra commands, at the end of the toolbar — a reply's "CC" and "CCI". */
  toolbarControls?: ReactNode;
  /** What goes between the toolbar and the input area: a reply's "CC" lines. */
  topSection?: ReactNode;
  /** What goes under the input area, before "bottomBar": a reply's attachments. */
  contentEnd?: ReactNode;
  /** The lines the area shows before scrolling: five by default. */
  maxLines?: number;
  /** The lines the area shows even when empty: just one by default. */
  minLines?: number;
  /**
   * The field takes its parent's full height, square — a template window's
   * pane: the area grows to it, and scrolls beyond. The lines above are then
   * of no use.
   */
  fill?: boolean;
}

export default function RichTextField({
  editor,
  label,
  bottomBar,
  toolbarControls,
  topSection,
  contentEnd,
  maxLines,
  minLines,
  fill = false,
}: RichTextFieldProps) {
  // No tooltip: Mantine gives the toolbar buttons a "title" (their label) that
  // no prop removes for all of them — the link's one even takes precedence. It
  // is erased from the DOM each time it comes back; the "aria-label" stays.
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const treeNode = root.current;
    if (!treeNode) return;
    const clear = () =>
      treeNode.querySelectorAll("[title]").forEach((el) => el.removeAttribute("title"));
    clear();
    const observer = new MutationObserver(clear);
    observer.observe(treeNode, { subtree: true, childList: true, attributeFilter: ["title"] });
    return () => observer.disconnect();
  }, []);

  const field = (
    <RichTextEditor
      ref={root}
      editor={editor}
      variant="subtle"
      classNames={{
        toolbar: classes.toolbar,
        control: classes.control,
        controlsGroup: classes.controlsGroup,
      }}
      // The area nests in two: a wrapper that carries the height, and the
      // content that is only as tall as the text. Both take the background,
      // otherwise it would stop at the last line written.
      styles={{
        // Square and without a frame — the pane is one: Mantine rounds the
        // frame, its toolbar and its area, each on their own.
        ...(fill && {
          root: { height: "100%", display: "flex", flexDirection: "column", borderRadius: 0, border: 0 },
        }),
        content: { backgroundColor: FIELD_BG, ...(fill && { borderRadius: 0 }) },
        toolbar: {
          backgroundColor: FIELD_BG,
          ...(fill && { borderRadius: 0 }),
          borderBottom:
            "1px solid var(--mantine-color-default-border)",
        },
      }}
    >
      <RichTextEditor.Toolbar sticky stickyOffset={0}>
        <RichTextEditor.ControlsGroup>
          <RichTextEditor.Bold />
          <RichTextEditor.Italic />
          <RichTextEditor.Underline />
          <RichTextEditor.Strikethrough />
          <RichTextEditor.ClearFormatting />
        </RichTextEditor.ControlsGroup>
        <RichTextEditor.ControlsGroup>
          <RichTextEditor.BulletList />
          <RichTextEditor.OrderedList />
          <RichTextEditor.Blockquote />
          <RichTextEditor.CodeBlock />
        </RichTextEditor.ControlsGroup>
        <RichTextEditor.ControlsGroup>
          <RichTextEditor.Link />
          <RichTextEditor.Unlink />
        </RichTextEditor.ControlsGroup>
        <RichTextEditor.ControlsGroup>
          <RichTextEditor.Undo />
          <RichTextEditor.Redo />
        </RichTextEditor.ControlsGroup>
        {toolbarControls && (
          <RichTextEditor.ControlsGroup>{toolbarControls}</RichTextEditor.ControlsGroup>
        )}
      </RichTextEditor.Toolbar>
      {topSection}
      <RichTextEditor.Content
        className={
          fill
            ? `${classes.content} ${classes.fill}`
            : minLines
              ? `${classes.content} ${classes.minLines}`
              : classes.content
        }
        style={
          {
            backgroundColor: FIELD_BG,
            ...(maxLines ? { "--milo-rich-lines": maxLines } : {}),
            ...(minLines ? { "--milo-rich-min-lines": minLines } : {}),
          } as CSSProperties
        }
      />
      {contentEnd && <div style={{ backgroundColor: FIELD_BG }}>{contentEnd}</div>}
      {bottomBar && <div style={{ display: "flex" }}>{bottomBar}</div>}
    </RichTextEditor>
  );

  return label ? <Input.Wrapper label={label}>{field}</Input.Wrapper> : field;
}
