import { ActionIcon, Button, Group, Modal, Splitter, Stack, Switch } from "@mantine/core";
import { IconMaximize, IconMinimize } from "@tabler/icons-react";
import { useDebouncedValue } from "@mantine/hooks";
import { useEffect, useRef, useState } from "react";
import type { MailTemplate, MailTemplatePreview } from "@milo/shared";
import { api } from "../../api";
import { errorMessage, notifyError } from "../../lib/errors";
import { MODAL_PADDING, modalHeaderStyles } from "../../themes/modals";
import { STRONG_TEXT } from "../../themes/colors";
import CloseButton from "../ui/CloseButton";
import MailPreview, {
  HANDLE_COLOR,
  SPLITTER_STYLES,
  PANES_HEIGHT,
  PANE_MINS,
  FoldablePane,
  PANE_SIZES,
  paneStyle,
  useFoldingPanes,
  useNoEscape,
  usePreviewTheme,
} from "./MailPreview";
import VariablesPane from "./VariablesPane";
import type { PaneVariable } from "./VariablesPane";
import MjmlEditor from "./MjmlEditor";
import type { MjmlEditorHandle } from "./MjmlEditor";

// An e-mail template in three panes: its variables, as in the support
// templates (SupportReplyModal) — a click drops one into the source, where
// the cursor was —, its MJML, and what it gives, filled with sample data and
// compiled by the server as it will be at sending time.

interface MailTemplateModalProps {
  /** The template being edited; "null" closes the modal. */
  template: MailTemplate | null;
  onClose: () => void;
  onSave: (mjml: string) => Promise<unknown>;
  canEdit: boolean;
}

const WINDOW_WIDTH = 1320;

// The preview waits for typing to pause before asking the server.
const PREVIEW_DELAY_MS = 400;

/** What a click inserts: the variable without the ellipses that stand for the content. */
const insertedText = (name: string): string => name.replace(/…/g, "");

export default function MailTemplateModal({ template, onClose, onSave, canEdit }: MailTemplateModalProps) {
  const [mjml, setMjml] = useState("");
  const [typed] = useDebouncedValue(mjml, PREVIEW_DELAY_MS);
  const [preview, setPreview] = useState<MailTemplatePreview | null>(null);
  const [saving, setSaving] = useState(false);
  // The preview follows the interface's theme on opening.
  const { dark, setDark, scheme } = usePreviewTheme(template);
  const source = useRef<MjmlEditorHandle>(null);

  // Each opening starts again from the saved template.
  useEffect(() => {
    setMjml(template?.mjml ?? "");
    setPreview(null);
  }, [template]);

  useEffect(() => {
    if (!template || !typed) return;
    let current = true;
    api.previewMailTemplate(template.key, typed).then(
      (p) => current && setPreview(p),
      (e) => current && notifyError(errorMessage(e)),
    );
    return () => {
      current = false;
    };
  }, [template, typed]);

  // Where the cursor was, the cursor then after it (MjmlEditor).
  const insert = (text: string) => source.current?.insert(text);

  const save = async (value: string) => {
    setSaving(true);
    try {
      await onSave(value);
      onClose();
    } catch (e) {
      notifyError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const errors = preview?.errors ?? [];
  const variables: PaneVariable[] = (template?.variables ?? []).map((v) => ({
    group: v.group,
    label: v.label,
    token: v.name,
    inserted: insertedText(v.name),
  }));
  const html = preview?.html ?? "";

  // The variables folded at each opening; a folded pane, a column of its name.
  const panes = useFoldingPanes(template);

  // The window over the whole browser window, back to its size at each opening.
  const [full, setFull] = useState(false);
  const [openedOn, setOpenedOn] = useState(template);
  if (template !== openedOn) {
    setOpenedOn(template);
    setFull(false);
  }
  const headerStyles = modalHeaderStyles(MODAL_PADDING);
  // From one size to the other, the variables fold again — in either direction.
  const toggleFull = () => {
    setFull(!full);
    panes.fold(0);
  };

  // Escape closes nothing while the template is open: neither this window,
  // nor the one it opened from — the work in progress would go with them.
  useNoEscape(template !== null);

  // While a handle is dragged, the preview lets the pointer through.
  const [dragging, setDragging] = useState(false);

  return (
    <Modal
      opened={template !== null}
      onClose={onClose}
      // Escape belongs to the code — it closes the completion list —: the
      // window only closes with its button.
      closeOnEscape={false}
      title={
        // The title, and at the end of its line, the switch to the whole
        // browser window.
        // A span: the title is a heading, which holds no block.
        <Group component="span" justify="space-between" wrap="nowrap">
          {template ? `Modèle — ${template.label}` : "Modèle"}
          <ActionIcon
            variant="transparent"
            c={full ? STRONG_TEXT : "#ffffff"}
            onClick={toggleFull}
            aria-label={full ? "Réduire la fenêtre" : "Agrandir la fenêtre"}
          >
            {full ? <IconMinimize size={18} /> : <IconMaximize size={18} />}
          </ActionIcon>
        </Group>
      }
      centered
      size={WINDOW_WIDTH}
      fullScreen={full}
      padding={MODAL_PADDING}
      withCloseButton={false}
      styles={{
        ...headerStyles,
        title: { ...headerStyles.title, flex: 1 },
        // Over the whole window, the panes take the height the rest leaves.
        ...(full && {
          // A thinner banner: the room goes to the panes.
          // Mantine gives the header 60 px at least: dropped, the title and its
          // icon set the height.
          // On the interface's background, not the dark banner: the title in
          // the strong text, white on dark, black on light.
          header: {
            ...headerStyles.header,
            padding: "5px 10px",
            paddingInlineEnd: 10,
            minHeight: 0,
            backgroundColor: "var(--mantine-color-body)",
          },
          title: { ...headerStyles.title, flex: 1, color: STRONG_TEXT },
          content: { display: "flex", flexDirection: "column" },
          // The panes against the edges; the buttons' bar keeps its own inset.
          // Each side by its own name: a "padding" shorthand, removed on the way
          // back, would also take away the top one the normal size keeps.
          body: {
            paddingTop: 0,
            paddingInline: 0,
            paddingBottom: 0,
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
          },
        }),
      }}
    >
      <Stack gap={full ? 0 : "md"} style={full ? { flex: 1, minHeight: 0 } : undefined}>
        <Splitter
          h={full ? undefined : PANES_HEIGHT}
          style={full ? { flex: 1, minHeight: 0 } : undefined}
          handleColor={HANDLE_COLOR}
          // Over the whole window, no frame: the panes run to its edges, a
          // line above and under them sets them apart from the title and the
          // buttons.
          styles={
            full
              ? {
                  ...SPLITTER_STYLES,
                  root: {
                    border: 0,
                    borderTop: `1px solid ${HANDLE_COLOR}`,
                    borderBottom: `1px solid ${HANDLE_COLOR}`,
                    borderRadius: 0,
                  },
                }
              : SPLITTER_STYLES
          }
          {...panes.splitterProps}
          onResizeStart={() => setDragging(true)}
          onResizeEnd={() => setDragging(false)}
        >
          <Splitter.Pane defaultSize={PANE_SIZES.variables} min={PANE_MINS.variables} collapsible style={paneStyle(full ? undefined : "left", panes.folded(0))}>
            <FoldablePane label="Variables" folded={panes.folded(0)} onUnfold={() => panes.unfold(0)}>
              <VariablesPane
                variables={variables}
                onInsert={insert}
                canEdit={canEdit}
                opened={template}
              />
            </FoldablePane>
          </Splitter.Pane>

          <Splitter.Pane defaultSize={PANE_SIZES.editor} min={PANE_MINS.editor} collapsible style={paneStyle(undefined, panes.folded(1))}>
            <FoldablePane label="Code" folded={panes.folded(1)} onUnfold={() => panes.unfold(1)}>
              <MjmlEditor
                ref={source}
                value={mjml}
                variables={template?.variables ?? []}
                onChange={setMjml}
                readOnly={!canEdit}
                errors={errors}
                height={full ? "100%" : PANES_HEIGHT}
              />
            </FoldablePane>
          </Splitter.Pane>

          <Splitter.Pane defaultSize={PANE_SIZES.preview} min={PANE_MINS.preview} collapsible style={paneStyle(full ? undefined : "right", panes.folded(2))}>
            <FoldablePane label="Aperçu" folded={panes.folded(2)} onUnfold={() => panes.unfold(2)}>
              <MailPreview html={html} dark={dark} scheme={scheme} dragging={dragging} />
            </FoldablePane>
          </Splitter.Pane>
        </Splitter>

        {/* Over the whole window, a thin bar: 10 px above and below, 15 px
            on the left, 8 px on the right. */}
        <Group
          justify="space-between"
          mt={full ? 0 : MODAL_PADDING - 16}
          style={full ? { padding: "10px 8px 10px 15px" } : undefined}
        >
          {/* The preview's theme. */}
          <Switch
            size="xs"
            color="teal"
            label="Thème sombre"
            checked={dark}
            onChange={(e) => setDark(e.currentTarget.checked)}
          />
          <Group>
            <CloseButton onClick={onClose} />
            {canEdit && (
              <Button color="teal" onClick={() => void save(mjml)} loading={saving}>
                Enregistrer
              </Button>
            )}
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
