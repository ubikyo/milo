import { ActionIcon, Box, Button, Group, Modal, ScrollArea, Splitter, Stack, Text, Tooltip } from "@mantine/core";
import { IconMaximize, IconMinimize, IconPlayerPlay } from "@tabler/icons-react";
import { useDebouncedValue } from "@mantine/hooks";
import { useEffect, useRef, useState } from "react";
import { ASSET_NUMBER_FUNCTION } from "@milo/shared";
import type { AssetNumberTemplate, AssetNumberVariable } from "@milo/shared";
import { errorMessage, notifyError } from "../../lib/errors";
import { runAssetNumberCode } from "../../lib/assetNumber";
import type { AssetNumberRun } from "../../lib/assetNumber";
import { MODAL_PADDING } from "../../themes/modals";
import { GREEN, RED } from "../../themes/colors";
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
  SCROLLBAR_SIZE,
  paneStyle,
  useFoldingPanes,
  useNoEscape,
} from "./MailPreview";
import VariablesPane from "./VariablesPane";
import type { PaneVariable } from "./VariablesPane";
import TypeScriptEditor from "./TypeScriptEditor";
import type { MjmlEditorHandle } from "./MjmlEditor";

// An asset number template in three panes, as a label template
// (LabelTemplateModal): its variables — a click drops one where the cursor
// was —, its TypeScript, and a console: what the code wrote, and the number
// it returned, run in the browser with a label drawn at random in each group.
// "Exécuter" runs it again, with other labels. An order's numbering format
// opens in it too (OrderNumberTemplateFields): its title, its function and
// how it runs are given.

interface AssetNumberTemplateModalProps {
  /** The template being edited; "null" closes the modal. */
  template: AssetNumberTemplate | null;
  variables: AssetNumberVariable[];
  onClose: () => void;
  /** Writes the template on the server: the window closes once it is done. */
  onSave: (code: string) => Promise<unknown>;
  canEdit: boolean;
  /** The window's title, before the template's name. */
  title?: string;
  /** The function the code declares. */
  functionName?: string;
  /** Runs the code with the values drawn — by variable, in lower case. */
  run?: (code: string, values: Map<string, string>) => Promise<AssetNumberRun>;
}

// The code runs once typing has paused.
const RUN_DELAY_MS = 500;

const CONSOLE_INSET = 12;

/** Each group's value for a run: one of its labels, at random; none, empty. */
const drawValues = (variables: AssetNumberVariable[]): Map<string, string> =>
  new Map(
    variables.map((v) => [
      v.label.trim().toLowerCase(),
      v.samples[Math.floor(Math.random() * v.samples.length)] ?? "",
    ]),
  );

/** A run, and the values it was given. */
interface ConsoleRun extends AssetNumberRun {
  values: { label: string; value: string }[];
}

export default function AssetNumberTemplateModal({
  template,
  variables,
  onClose,
  onSave,
  canEdit,
  title = "Format de numéro d'asset",
  functionName = ASSET_NUMBER_FUNCTION,
  run: runCode = runAssetNumberCode,
}: AssetNumberTemplateModalProps) {
  const [code, setCode] = useState("");
  const [typed] = useDebouncedValue(code, RUN_DELAY_MS);
  const [run, setRun] = useState<ConsoleRun | null>(null);
  const [running, setRunning] = useState(false);
  /** Bumped by "Exécuter": the same code, run again. */
  const [runs, setRuns] = useState(0);
  const [saving, setSaving] = useState(false);
  const source = useRef<MjmlEditorHandle>(null);

  // Each opening starts again from the template as the drawer holds it.
  useEffect(() => {
    setCode(template?.code ?? "");
    setRun(null);
  }, [template]);

  useEffect(() => {
    if (!template || !typed.trim()) return;
    let current = true;
    const values = drawValues(variables);
    setRunning(true);
    runCode(typed, values)
      .then((outcome) => {
        if (!current) return;
        setRun({
          ...outcome,
          values: variables.map((v) => ({
            label: v.label,
            value: values.get(v.label.trim().toLowerCase()) ?? "",
          })),
        });
      })
      .catch((e: unknown) => current && notifyError(errorMessage(e)))
      .finally(() => current && setRunning(false));
    return () => {
      current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template, typed, runs, variables]);

  const save = async () => {
    setSaving(true);
    try {
      await onSave(code);
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
      attributes={templateWindow("asset-number-template")}
      opened={template !== null}
      onClose={onClose}
      closeOnEscape={false}
      title={
        <Group component="span" justify="space-between" wrap="nowrap">
          {template ? `${title} — ${template.name}` : title}
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
              <TypeScriptEditor
                ref={source}
                value={code}
                variables={variables}
                onChange={setCode}
                readOnly={!canEdit}
                height={full ? "100%" : TEMPLATE_PANES_HEIGHT}
              />
            </FoldablePane>
          </Splitter.Pane>

          <Splitter.Pane defaultSize={PANE_SIZES.preview} min={PANE_MINS.preview} collapsible style={paneStyle(full ? undefined : "right", panes.folded(2))}>
            <FoldablePane label="Console" folded={panes.folded(2)} onUnfold={() => panes.unfold(2)}>
              <Console run={run} running={running} functionName={functionName} />
            </FoldablePane>
          </Splitter.Pane>
        </Splitter>

        <Footer
          justify="space-between"
          parentGap="var(--mantine-spacing-md)"
          mt={templateFooterMargin(full)}
          style={templateFooterStyle(full)}
        >
          {/* The same code again, with other labels drawn. */}
          <Tooltip label="Exécuter à nouveau">
            <ActionIcon
              variant="default"
              size="lg"
              aria-label="Exécuter à nouveau"
              onClick={() => setRuns((n) => n + 1)}
              loading={running}
              disabled={!code.trim()}
            >
              <IconPlayerPlay size={18} />
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

/** A heading of the console: what follows it. */
function ConsoleHeading({ children }: { children: string }) {
  return (
    <Text ff="monospace" fz={12} c="dimmed" mt={CONSOLE_INSET / 2}>
      {`› ${children}`}
    </Text>
  );
}

function ConsoleLine({ children, color }: { children: string; color?: string }) {
  return (
    <Text ff="monospace" fz={12} c={color} pl={CONSOLE_INSET} style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
      {children}
    </Text>
  );
}

/**
 * The console, on the page's background: the values the run was given, what
 * the code wrote, then the number it returned, in green — or what went wrong,
 * in red.
 */
function Console({
  run,
  running,
  functionName,
}: {
  run: ConsoleRun | null;
  running: boolean;
  functionName: string;
}) {
  return (
    <Box h="100%" style={{ backgroundColor: "var(--mantine-color-body)" }}>
      <ScrollArea h="100%" scrollbarSize={SCROLLBAR_SIZE} p={CONSOLE_INSET} style={{ opacity: running ? 0.5 : 1 }}>
        {!run ? (
          <Text size="sm" c="dimmed">
            {`Le résultat de ${functionName}() s'affiche ici.`}
          </Text>
        ) : (
          <Stack gap={2}>
            {run.values.length > 0 && (
              <>
                <ConsoleHeading>Valeurs de test</ConsoleHeading>
                {run.values.map((v) => (
                  <ConsoleLine key={v.label}>{`${v.label} = ${JSON.stringify(v.value)}`}</ConsoleLine>
                ))}
              </>
            )}
            {run.logs.length > 0 && (
              <>
                <ConsoleHeading>console</ConsoleHeading>
                {run.logs.map((line, i) => (
                  <ConsoleLine key={i}>{line}</ConsoleLine>
                ))}
              </>
            )}
            <ConsoleHeading>{`${functionName}()`}</ConsoleHeading>
            {run.error !== null ? (
              <ConsoleLine color={RED}>{run.error}</ConsoleLine>
            ) : (
              <ConsoleLine color={GREEN}>{JSON.stringify(run.result)}</ConsoleLine>
            )}
          </Stack>
        )}
      </ScrollArea>
    </Box>
  );
}
