import { ActionIcon, Button, Group, Modal, Splitter, Stack, Switch } from "@mantine/core";
import { IconMaximize, IconMinimize } from "@tabler/icons-react";
import { useDebouncedValue } from "@mantine/hooks";
import { useEffect, useRef, useState } from "react";
import type { MailTemplate, MailTemplatePreview } from "@milo/shared";
import { api } from "../../api";
import { errorMessage, notifyError } from "../../lib/errors";
import { MODAL_PADDING } from "../../themes/modals";
import CloseButton from "../ui/CloseButton";
import Footer from "../ui/Footer";
import MailPreview, {
  PANE_MINS,
  TEMPLATE_PANES_HEIGHT,
  TEMPLATE_WIDTH,
  templateFooterMargin,
  templateFooterStyle,
  templateHandleColor,
  templateIconColor,
  templateModalStyles,
  templateSplitterStyles,
  templateWindow,
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
      attributes={templateWindow("mail-template")}
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
            c={templateIconColor(full)}
            onClick={toggleFull}
            aria-label={full ? "Réduire la fenêtre" : "Agrandir la fenêtre"}
          >
            {full ? <IconMinimize size={18} /> : <IconMaximize size={18} />}
          </ActionIcon>
        </Group>
      }
      centered
      size={TEMPLATE_WIDTH}
      fullScreen={full}
      padding={MODAL_PADDING}
      withCloseButton={false}
      styles={templateModalStyles(full)}
    >
      <Stack gap={full ? 0 : "md"} style={full ? { flex: 1, minHeight: 0 } : undefined}>
        <Splitter
          h={full ? undefined : TEMPLATE_PANES_HEIGHT}
          style={full ? { flex: 1, minHeight: 0 } : undefined}
          handleColor={templateHandleColor(full)}
          styles={templateSplitterStyles(full)}
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
                height={full ? "100%" : TEMPLATE_PANES_HEIGHT}
              />
            </FoldablePane>
          </Splitter.Pane>

          <Splitter.Pane defaultSize={PANE_SIZES.preview} min={PANE_MINS.preview} collapsible style={paneStyle(full ? undefined : "right", panes.folded(2))}>
            <FoldablePane label="Aperçu" folded={panes.folded(2)} onUnfold={() => panes.unfold(2)}>
              <MailPreview html={html} dark={dark} scheme={scheme} dragging={dragging} />
            </FoldablePane>
          </Splitter.Pane>
        </Splitter>

        <Footer
          justify="space-between"
          parentGap="var(--mantine-spacing-md)"
          mt={templateFooterMargin(full)}
          style={templateFooterStyle(full)}
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
        </Footer>
      </Stack>
    </Modal>
  );
}
