import { ActionIcon, Box, Button, Group, Loader, Modal, Splitter, Stack, Text, Tooltip } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconMaximize, IconMinimize, IconPrinter } from "@tabler/icons-react";
import { useDebouncedValue } from "@mantine/hooks";
import { useEffect, useRef, useState } from "react";
import type { LabelTemplate, ListRef, LabelTemplateKind, MailTemplateVariable, PaperFormat } from "@milo/shared";
import { api } from "../../api";
import { errorMessage, notifyError } from "../../lib/errors";
import { MODAL_PADDING } from "../../themes/modals";
import { RED } from "../../themes/colors";
import CloseButton from "../ui/CloseButton";
import Footer from "../ui/Footer";
import {
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
} from "./MailPreview";
import VariablesPane from "./VariablesPane";
import type { PaneVariable } from "./VariablesPane";
import ZplEditor from "./ZplEditor";
import type { MjmlEditorHandle } from "./MjmlEditor";

// A label template in three panes, as an e-mail template
// (MailTemplateModal): its variables — a click drops one where the cursor
// was —, its ZPL, and the label as the format's printer draws it. "Imprimer"
// sends a test label to that printer.

interface LabelTemplateModalProps {
  /** The template being edited; "null" closes the modal. */
  template: LabelTemplate | null;
  kind: LabelTemplateKind;
  list: ListRef;
  variables: MailTemplateVariable[];
  /** Its paper format: the printer that draws and prints it. */
  format: PaperFormat | null;
  onClose: () => void;
  /** Writes the template on the server: the window closes once it is done. */
  onSave: (zpl: string) => Promise<unknown>;
  canEdit: boolean;
}

// The printer draws the label: it is asked once typing has paused a little longer.
const PREVIEW_DELAY_MS = 800;

/** The label, on its paper, against the pane's edges. */
const LABEL_INSET = 20;

export default function LabelTemplateModal({
  template,
  kind,
  list,
  variables,
  format,
  onClose,
  onSave,
  canEdit,
}: LabelTemplateModalProps) {
  const [zpl, setZpl] = useState("");
  const [typed] = useDebouncedValue(zpl, PREVIEW_DELAY_MS);
  const [image, setImage] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [saving, setSaving] = useState(false);
  const source = useRef<MjmlEditorHandle>(null);
  const formatId = format?.id ?? null;

  // Each opening starts again from the template as the drawer holds it.
  useEffect(() => {
    setZpl(template?.zpl ?? "");
    setImage(null);
    setPreviewError(null);
  }, [template]);

  useEffect(() => {
    if (!template || !typed.trim()) return;
    if (formatId === null) {
      setPreviewError("Choisissez d'abord le format d'étiquette du modèle.");
      return;
    }
    let current = true;
    setDrawing(true);
    api.previewLabelTemplate(kind, list, { paper_format_id: formatId, zpl: typed }).then(
      (p) => {
        if (!current) return;
        setImage(p.image);
        setPreviewError(null);
      },
      (e) => current && setPreviewError(errorMessage(e)),
    ).finally(() => current && setDrawing(false));
    return () => {
      current = false;
    };
  }, [template, typed, kind, list, formatId]);

  const print = async () => {
    if (formatId === null) return notifyError("Choisissez d'abord le format d'étiquette du modèle.");
    setPrinting(true);
    try {
      const sent = await api.printLabelTemplate(kind, list, { paper_format_id: formatId, zpl });
      notifications.show({
        color: "teal",
        title: "Étiquette de test envoyée",
        message: `Imprimée sur « ${sent.printer} ».`,
      });
    } catch (e) {
      notifyError(errorMessage(e));
    } finally {
      setPrinting(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await onSave(zpl);
      onClose();
    } catch (e) {
      notifyError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const paneVariables: PaneVariable[] = variables.map((v) => ({
    group: v.group,
    label: v.label,
    token: v.name,
    inserted: v.name,
  }));

  const panes = useFoldingPanes(template);

  // The window over the whole browser window, back to its size at each opening.
  const [full, setFull] = useState(false);
  const [openedOn, setOpenedOn] = useState(template);
  if (template !== openedOn) {
    setOpenedOn(template);
    setFull(false);
  }
  const toggleFull = () => {
    setFull(!full);
    panes.fold(0);
  };

  // Escape closes nothing while the template is open (MailTemplateModal).
  useNoEscape(template !== null);

  return (
    <Modal
      attributes={templateWindow("label-template")}
      opened={template !== null}
      onClose={onClose}
      closeOnEscape={false}
      title={
        <Group component="span" justify="space-between" wrap="nowrap">
          {template ? `Modèle — ${template.name}` : "Modèle"}
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
        >
          <Splitter.Pane defaultSize={PANE_SIZES.variables} min={PANE_MINS.variables} collapsible style={paneStyle(full ? undefined : "left", panes.folded(0))}>
            <FoldablePane label="Variables" folded={panes.folded(0)} onUnfold={() => panes.unfold(0)}>
              <VariablesPane
                variables={paneVariables}
                onInsert={(text) => source.current?.insert(text)}
                canEdit={canEdit}
                opened={template}
              />
            </FoldablePane>
          </Splitter.Pane>

          <Splitter.Pane defaultSize={PANE_SIZES.editor} min={PANE_MINS.editor} collapsible style={paneStyle(undefined, panes.folded(1))}>
            <FoldablePane label="Code" folded={panes.folded(1)} onUnfold={() => panes.unfold(1)}>
              <ZplEditor
                ref={source}
                value={zpl}
                variables={variables}
                onChange={setZpl}
                readOnly={!canEdit}
                height={full ? "100%" : TEMPLATE_PANES_HEIGHT}
              />
            </FoldablePane>
          </Splitter.Pane>

          <Splitter.Pane defaultSize={PANE_SIZES.preview} min={PANE_MINS.preview} collapsible style={paneStyle(full ? undefined : "right", panes.folded(2))}>
            <FoldablePane label="Aperçu" folded={panes.folded(2)} onUnfold={() => panes.unfold(2)}>
              <LabelPreview image={image} error={previewError} drawing={drawing} />
            </FoldablePane>
          </Splitter.Pane>
        </Splitter>

        <Footer
          justify="space-between"
          parentGap="var(--mantine-spacing-md)"
          mt={templateFooterMargin(full)}
          style={templateFooterStyle(full)}
        >
          {/* A test label: a number drawn at random, one label of each group
              the template names. */}
          <Tooltip label="Imprimer une étiquette de test">
            <ActionIcon
              variant="default"
              size="lg"
              aria-label="Imprimer une étiquette de test"
              onClick={() => void print()}
              loading={printing}
              disabled={!zpl.trim() || formatId === null}
            >
              <IconPrinter size={18} />
            </ActionIcon>
          </Tooltip>
          <Group>
            <CloseButton onClick={onClose} />
            {canEdit && (
              <Button color="teal" onClick={() => void save()} loading={saving}>
                Enregistrer
              </Button>
            )}
          </Group>
        </Footer>
      </Stack>
    </Modal>
  );
}

/**
 * The label the printer drew, white as its paper, in the pane's middle; while
 * it draws, a loader over the last one. What went wrong runs along the bottom,
 * white on red, as MJML's errors.
 */
function LabelPreview({
  image,
  error,
  drawing,
}: {
  image: string | null;
  error: string | null;
  drawing: boolean;
}) {
  return (
    <Box h="100%" pos="relative" style={{ backgroundColor: "var(--mantine-color-body)" }}>
      <Box
        pos="absolute"
        inset={0}
        p={LABEL_INSET}
        style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
      >
        {image ? (
          <img
            src={image}
            alt="Aperçu de l'étiquette"
            style={{
              maxWidth: "100%",
              maxHeight: "100%",
              objectFit: "contain",
              backgroundColor: "#ffffff",
              border: "1px solid #d0d0d0",
              borderRadius: 4,
              opacity: drawing ? 0.5 : 1,
            }}
          />
        ) : (
          !drawing && (
            <Text size="sm" c="dimmed" ta="center">
              L'aperçu est dessiné par l'imprimante du format d'étiquette.
            </Text>
          )
        )}
        {drawing && <Loader size="sm" pos="absolute" />}
      </Box>
      {error && (
        <Box pos="absolute" left={0} right={0} bottom={0} p="xs" style={{ backgroundColor: RED }}>
          <Text size="xs" c="#ffffff">
            {error}
          </Text>
        </Box>
      )}
    </Box>
  );
}
