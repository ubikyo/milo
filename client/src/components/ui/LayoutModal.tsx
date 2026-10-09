import {
  Alert,
  Button,
  Modal,
  Stack,
  Text,
  Textarea,
} from "@mantine/core";
import { IconAlertTriangle, IconCheck, IconCopy } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { boardWidget } from "../../widgets";
import { useWidgetAccess } from "../../lib/rights";
import {
  preview,
  decode,
  layoutOf,
  encoder,
  type ImportPreview,
} from "../../lib/layout";
import { errorMessage, notifyError } from "../../lib/errors";
import { RED } from "../../themes/colors";
import { MODAL_PADDING, modalHeaderStyles } from "../../themes/modals";
import CloseButton from "./CloseButton";
import Footer from "./Footer";
import { canUse } from "@milo/shared";
import type {
  BoardWidget,
  ExportedLayout,
  IndicatorSection,
} from "@milo/shared";
import { themeWindow } from "../../lib/themeWindow";

interface LayoutModalProps {
  /** "export" shows the text to hand over, "import" waits for the one received. */
  mode: "export" | "import" | null;
  onClose: () => void;
  /** The structure being viewed: what is exported, what the import replaces. */
  sections: IndicatorSection[];
  widgets: BoardWidget[];
  onImport: (layout: ExportedLayout) => Promise<void>;
}

/** Export and import of the open board's layout. */
export default function LayoutModal({
  mode,
  onClose,
  sections,
  widgets,
  onImport,
}: LayoutModalProps) {
  return (
    <Modal
      attributes={themeWindow("layout")}
      opened={mode !== null}
      onClose={onClose}
      title={
        mode === "import"
          ? "Importer la disposition"
          : "Exporter la disposition"
      }
      centered
      size="lg"
      padding={MODAL_PADDING}
      withCloseButton={false}
      styles={modalHeaderStyles(MODAL_PADDING)}
    >
      {mode === "export" && (
        <Export sections={sections} widgets={widgets} onClose={onClose} />
      )}
      {mode === "import" && (
        <Import widgets={widgets} onImport={onImport} onClose={onClose} />
      )}
    </Modal>
  );
}

function Export({
  sections,
  widgets,
  onClose,
}: {
  sections: IndicatorSection[];
  widgets: BoardWidget[];
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [copy, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    void encoder(layoutOf(sections, widgets)).then(
      (t) => active && setText(t),
    );
    return () => {
      active = false;
    };
  }, [sections, widgets]);

  const copyLayout = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
  };

  return (
    <>
      <Stack gap="md">
        <Text size="sm">
          Le code suivant contient la disposition du tableau courant, composée
          de {sections.length} section{sections.length > 1 ? "s" : ""} et{" "}
          {widgets.length} widget
          {widgets.length > 1 ? "s" : ""}.
        </Text>
        <Textarea
          value={text}
          readOnly
          // The same height for export and import: the window does not change
          // size from one action to the other.
          rows={10}
          styles={{
            input: {
              fontFamily: "var(--mantine-font-family-monospace)",
              fontSize: 12,
            },
          }}
          onFocus={(e) => e.currentTarget.select()}
        />
      </Stack>
      {/* The same gap before the buttons as in the other windows. */}
      <Footer>
        <CloseButton onClick={onClose} />
        <Button
          color="teal"
          leftSection={copy ? <IconCheck size={16} /> : <IconCopy size={16} />}
          onClick={() => void copyLayout()}
          disabled={!text}
        >
          {copy ? "Copié" : "Copier"}
        </Button>
      </Footer>
    </>
  );
}

function Import({
  widgets,
  onImport,
  onClose,
}: {
  widgets: BoardWidget[];
  onImport: (layout: ExportedLayout) => Promise<void>;
  onClose: () => void;
}) {
  const access = useWidgetAccess();
  const [text, setText] = useState("");
  const [readValue, setRead] = useState<
    { preview: ImportPreview } | { error: string } | null
  >(null);
  const [sending, setSending] = useState(false);

  // The pasted text is read right away: what the import will do is stated
  // beforehand.
  useEffect(() => {
    if (!text.trim()) return setRead(null);
    let active = true;
    decode(text)
      .then((d) => {
        if (active) {
          setRead({
            preview: preview(
              d,
              widgets,
              boardWidget,
              (w) => canUse(access(w.kind)),
            ),
          });
        }
      })
      .catch((e: unknown) => active && setRead({ error: errorMessage(e) }));
    return () => {
      active = false;
    };
    // "access" changes on every render; the rights, however, do not change here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, widgets]);

  const result = readValue && "preview" in readValue ? readValue.preview : null;

  const importSections = async () => {
    if (!result) return;
    setSending(true);
    try {
      await onImport(result.layout);
      onClose();
    } catch (e) {
      notifyError(errorMessage(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Stack gap="md">
        <Text size="sm">
          Coller le code de la disposition à importer. Les sections et widgets
          seront remplacés par cette nouvelle configuration.
        </Text>
        <Textarea
          value={text}
          onChange={(e) => setText(e.currentTarget.value)}
          // The same height for export and import: the window does not change
          // size from one action to the other.
          rows={10}
          placeholder="Disposition exportée"
          data-autofocus
          styles={{
            input: {
              fontFamily: "var(--mantine-font-family-monospace)",
              fontSize: 12,
            },
          }}
          error={readValue && "error" in readValue ? readValue.error : undefined}
        />
        {result && (
          <Text size="sm">
            {result.sections} section{result.sections > 1 ? "s" : ""} et{" "}
            {result.widgets} widget{result.widgets > 1 ? "s" : ""} seront
            posés.
            {result.discarded > 0 &&
              ` ${result.discarded} widget${result.discarded > 1 ? "s" : ""} de la disposition ne ${
                result.discarded > 1 ? "seront" : "sera"
              } pas repris : inconnu${result.discarded > 1 ? "s" : ""} de cette version, ou hors de vos droits.`}
          </Text>
        )}
        {result && result.lostLists.length > 0 && (
          <Alert color={RED} icon={<IconAlertTriangle size={18} />} p="sm">
            <Text size="sm">
              {result.lostLists.length} liste
              {result.lostLists.length > 1 ? "s" : ""} de ce tableau (
              {[
                ...new Set(
                  result.lostLists.map(
                    (w) => boardWidget(w.type)?.label,
                  ),
                ),
              ]
                .filter(Boolean)
                .join(", ")}
              ) disparaîtr{result.lostLists.length > 1 ? "ont" : "a"} :
              les éléments qu'
              {result.lostLists.length > 1
                ? "elles montrent"
                : "elle montre"}{" "}
              seront supprimés s'ils ne paraissent dans aucune autre structure
              de ce tableau. Cette action est irréversible.
            </Text>
          </Alert>
        )}
      </Stack>
      {/* The same gap before the buttons as in the other windows. */}
      <Footer>
        <CloseButton onClick={onClose}>Annuler</CloseButton>
        <Button
          color={result?.lostLists.length ? RED : "teal"}
          onClick={() => void importSections()}
          disabled={!result}
          loading={sending}
        >
          Importer
        </Button>
      </Footer>
    </>
  );
}
