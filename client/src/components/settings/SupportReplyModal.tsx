import { Button, Group, Modal, Splitter, Stack, Switch } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import { errorMessage, notifyError } from "../../lib/errors";
import { MODAL_PADDING, modalHeaderStyles } from "../../themes/modals";
import CloseButton from "../ui/CloseButton";
import RichTextField, { useRichEditor } from "../ui/RichText";
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
import { SUPPORT_REPLY_VARIABLES, SUPPORT_VARIABLE_GROUPS, fillSupportTemplate } from "@milo/shared";
import type { SupportPerson, SupportVariableGroup } from "@milo/shared";
import { DEFAULT_CONTENT_SUBJECT, inSampleReply, supportSample } from "../../lib/support-sample";

interface SupportReplyModalProps {
  /**
   * What the template is being set for — a default reply, a default
   * content; "null" closes the modal.
   */
  reply: { name: string; html: string; event?: string | null } | null;
  onClose: () => void;
  onSave: (template: { html: string }) => Promise<unknown>;
  canEdit: boolean;
  /** The variable sources offered: all, by default. */
  groups?: readonly SupportVariableGroup[];
  /** The e-mail template the message is previewed in. */
  previewTemplate: "support_reply" | "support_auto_reply";
}

// As wide as the e-mail templates' window (MailTemplateModal).
const WINDOW_WIDTH = 1320;

// The preview waits for typing to pause before asking the server.
const PREVIEW_DELAY_MS = 400;


/**
 * The template of a default reply or content, opened from its row's
 * menu ("Modèle"): HTML, entered in the application's editor.
 * The event that uses it is chosen on its row.
 *
 * A template cites variables: "{{demande.numero}}" becomes "HLP-12"
 * in the message. The pane on the left lists them by source — who writes,
 * the sender, the request — and scrolls within the editor's height; a click
 * on one drops it into the template, where the cursor was. The pane on the
 * right shows the message in its e-mail template, as saved: an automatic
 * reply's, or a team reply's for a default content. Its variables are
 * filled with the signed-in account and a sample sender and request.
 */
export default function SupportReplyModal({
  reply,
  onClose,
  onSave,
  canEdit,
  groups = SUPPORT_VARIABLE_GROUPS,
  previewTemplate,
}: SupportReplyModalProps) {
  // In Settings order, whatever the order received.
  const displayedGroups = SUPPORT_VARIABLE_GROUPS.filter((g) =>
    groups.includes(g),
  );
  const editor = useRichEditor({ placeholder: "Le modèle de la réponse" });
  const [saving, setSaving] = useState(false);

  // Each opening starts again from the saved template.
  useEffect(() => {
    if (!reply) return;
    editor?.commands.setContent(reply.html || "");
  }, [reply, editor]);

  useEffect(() => {
    editor?.setEditable(canEdit);
  }, [editor, canEdit]);

  // The message as typed, laid out by its e-mail template once typing pauses.
  const [content, setContent] = useState("");
  const [typed] = useDebouncedValue(content, PREVIEW_DELAY_MS);
  const [html, setHtml] = useState("");
  const { dark, setDark, scheme } = usePreviewTheme(reply);
  // While a handle is dragged, the preview lets the pointer through.
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!editor) return;
    const follow = () => setContent(editor.getHTML());
    follow();
    editor.on("update", follow);
    return () => {
      editor.off("update", follow);
    };
  }, [editor, reply]);

  // What the variables become in the preview: the signed-in account, then a
  // sender and a request drawn anew at each opening (lib/support-sample.ts).
  const [user, setUser] = useState<SupportPerson | null>(null);
  useEffect(() => {
    if (!reply) return;
    api.getSupportVariables().then(
      (r) => setUser(r.user),
      () => setUser(null),
    );
  }, [reply]);
  // A default content goes into a team reply: a fixed request and text
  // around it (inSampleReply).
  const isContent = previewTemplate === "support_reply";
  const sample = useMemo(
    () => supportSample(user, reply?.event, isContent ? DEFAULT_CONTENT_SUBJECT : undefined),
    [user, reply, isContent],
  );

  useEffect(() => {
    if (!reply) return;
    let current = true;
    api
      .previewReply(previewTemplate, {
        content: isContent
          ? inSampleReply(fillSupportTemplate(typed, sample.values))
          : fillSupportTemplate(typed, sample.values),
        ticket: sample.ticket,
        subject: sample.subject,
        name: reply.name,
      })
      .then(
      (r) => current && setHtml(r.html),
      (e) => current && notifyError(errorMessage(e)),
    );
    return () => {
      current = false;
    };
  }, [reply, typed, previewTemplate, sample, isContent]);

  const insert = (text: string) => editor?.chain().focus().insertContent(text).run();
  const variables: PaneVariable[] = SUPPORT_REPLY_VARIABLES.filter((v) =>
    displayedGroups.includes(v.group),
  ).map((v) => ({ group: v.group, label: v.label, token: `{{${v.key}}}`, inserted: `{{${v.key}}}` }));

  const save = async () => {
    setSaving(true);
    try {
      await onSave({ html: editor?.getHTML() ?? "" });
      onClose();
    } catch (e) {
      notifyError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      opened={reply !== null}
      onClose={onClose}
      title={reply ? `Modèle — ${reply.name}` : "Modèle"}
      centered
      size={WINDOW_WIDTH}
      padding={MODAL_PADDING}
      withCloseButton={false}
      styles={modalHeaderStyles(MODAL_PADDING)}
    >
      <Stack gap="md">
        {/* As the e-mail templates (MailTemplateModal): the variables, the
            message, and what it gives in its e-mail — panes that fold when
            dragged narrow. */}
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
              opened={reply}
            />
          </Splitter.Pane>

          <Splitter.Pane defaultSize={PANE_SIZES.editor} min={PANE_MINS.editor} collapsible style={paneStyle()}>
            <RichTextField editor={editor} fill />
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
              <Button color="teal" onClick={save} loading={saving}>
                Enregistrer
              </Button>
            )}
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
