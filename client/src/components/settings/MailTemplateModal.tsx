import { Button, Group, Modal, Splitter, Stack, Switch } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { useEffect, useRef, useState } from "react";
import type { MailTemplate, MailTemplatePreview } from "@milo/shared";
import { api } from "../../api";
import { errorMessage, notifyError } from "../../lib/errors";
import { MODAL_PADDING, modalHeaderStyles } from "../../themes/modals";
import CloseButton from "../ui/CloseButton";
import MailPreview, {
  HANDLE_COLOR,
  SPLITTER_STYLES,
  PANES_HEIGHT,
  PANE_MINS,
  PANE_SIZES,
  paneStyle,
  usePreviewTheme,
} from "./MailPreview";
import VariablesPane from "./VariablesPane";
import type { PaneVariable } from "./VariablesPane";
import MjmlEditor from "./MjmlEditor";

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
  const source = useRef<HTMLTextAreaElement>(null);

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

  const insert = (text: string) => {
    const field = source.current;
    if (!field) return;
    const start = field.selectionStart;
    const end = field.selectionEnd;
    setMjml(mjml.slice(0, start) + text + mjml.slice(end));
    // The cursor after what was inserted, once React has rendered it.
    requestAnimationFrame(() => {
      field.focus();
      field.setSelectionRange(start + text.length, start + text.length);
    });
  };

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

  // While a handle is dragged, the preview lets the pointer through.
  const [dragging, setDragging] = useState(false);

  return (
    <Modal
      opened={template !== null}
      onClose={onClose}
      title={template ? `Modèle — ${template.label}` : "Modèle"}
      centered
      size={WINDOW_WIDTH}
      padding={MODAL_PADDING}
      withCloseButton={false}
      styles={modalHeaderStyles(MODAL_PADDING)}
    >
      <Stack gap="md">
        <Splitter
          h={PANES_HEIGHT}
          handleColor={HANDLE_COLOR}
          styles={SPLITTER_STYLES}
          onResizeStart={() => setDragging(true)}
          onResizeEnd={() => setDragging(false)}
        >
          <Splitter.Pane defaultSize={PANE_SIZES.variables} min={PANE_MINS.variables} collapsible style={paneStyle("left")}>
            <VariablesPane
              variables={variables}
              onInsert={insert}
              canEdit={canEdit}
              opened={template}
            />
          </Splitter.Pane>

          <Splitter.Pane defaultSize={PANE_SIZES.editor} min={PANE_MINS.editor} collapsible style={paneStyle()}>
            <MjmlEditor
              ref={source}
              value={mjml}
              onChange={setMjml}
              readOnly={!canEdit}
              errors={errors}
              height={PANES_HEIGHT}
            />
          </Splitter.Pane>

          <Splitter.Pane defaultSize={PANE_SIZES.preview} min={PANE_MINS.preview} collapsible style={paneStyle("right")}>
            <MailPreview html={html} dark={dark} scheme={scheme} dragging={dragging} />
          </Splitter.Pane>
        </Splitter>

        <Group justify="space-between" mt={MODAL_PADDING - 16}>
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
