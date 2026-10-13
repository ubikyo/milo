import { Group, Input, Stack, Text } from "@mantine/core";
import { IconCode } from "@tabler/icons-react";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ORDER_NUMBER_FORMATS, ORDER_NUMBER_FUNCTION, isCustomOrderNumberCode } from "@milo/shared";
import type { OrderNumberFormat, OrderNumberTemplates } from "@milo/shared";
import { api } from "../../api";
import { runOrderNumberCode } from "../../lib/assetNumber";
import { errorMessage, notifyError } from "../../lib/errors";
import { useListRef } from "../../lib/list-ref";
import AssetNumberTemplateModal from "../settings/AssetNumberTemplateModal";
import { CopyPasteContext } from "../ui/CopyPasteActions";
import DeleteConfirmModal from "../ui/DeleteConfirmModal";
import { NAME_INSET, ROW_INSET, RowButton, rowStyle } from "../ui/DrawerRows";
import { Reset } from "../ui/SettingRows";

// A "Commandes" widget's numbering formats, in its drawer: its two — "Devis",
// "Commande" —, no more, each with the TypeScript its "Modèle" button opens,
// as an asset number format's (AssetNumberTemplateFields). Its code is
// written as soon as its window's "Enregistrer" is clicked; the button at the
// start of the row takes it back to Milo's.

const NOTHING: OrderNumberTemplates = { templates: [], variables: [] };

const labelOf = (format: OrderNumberFormat) => ORDER_NUMBER_FORMATS.find((f) => f.value === format)!.label;

export default function OrderNumberTemplateFields() {
  const board = useContext(CopyPasteContext);
  const list = useListRef();
  // A paste from the "Actions" menu may change the board: it is re-read.
  const pastes = board?.pastes ?? 0;

  const [numbers, setNumbers] = useState<OrderNumberTemplates>(NOTHING);
  /** The format whose code is open. */
  const [edited, setEdited] = useState<OrderNumberFormat | null>(null);
  /** The format whose code is about to go back to Milo's. */
  const [toReset, setToReset] = useState<OrderNumberFormat | null>(null);

  const reload = useCallback(async () => {
    if (list === null) return;
    try {
      setNumbers(await api.getOrderNumberTemplates(list));
    } catch (e) {
      notifyError(errorMessage(e));
    }
  }, [list]);

  useEffect(() => {
    void reload();
  }, [reload, pastes]);

  // The window restarts from its template whenever it changes: one object per opening.
  const code = numbers.templates.find((t) => t.format === edited)?.code;
  const template = useMemo(
    () => (edited && code !== undefined ? { name: labelOf(edited), code } : null),
    [edited, code],
  );

  if (list === null) return null;

  /** A format's code, written at once; empty, it goes back to Milo's. */
  const writeCode = async (format: OrderNumberFormat, code: string) => {
    setNumbers(await api.updateOrderNumberTemplates(list, [{ format, code }]));
  };

  const reset = async (format: OrderNumberFormat) => {
    setToReset(null);
    try {
      await writeCode(format, "");
    } catch (e) {
      notifyError(errorMessage(e));
    }
  };

  return (
    <>
      <Input.Wrapper label="Formats de numérotation">
        <Stack gap={1}>
          {numbers.templates.map((t, rank) => (
            <Group
              key={t.format}
              gap="xs"
              wrap="nowrap"
              style={rowStyle(rank, numbers.templates.length, false, "simple")}
            >
              <Reset
                active={isCustomOrderNumberCode(t.format, t.code)}
                what="du format"
                onClick={() => setToReset(t.format)}
              />
              <Text size="sm" pl={NAME_INSET - ROW_INSET} style={{ flex: 1, minWidth: 0 }} truncate>
                {labelOf(t.format)}
              </Text>
              <RowButton icon={IconCode} onClick={() => setEdited(t.format)} rightMargin={5 - ROW_INSET}>
                Modèle
              </RowButton>
            </Group>
          ))}
        </Stack>
      </Input.Wrapper>
      <AssetNumberTemplateModal
        template={template}
        variables={numbers.variables}
        onClose={() => setEdited(null)}
        onSave={(code) => (edited === null ? Promise.resolve() : writeCode(edited, code))}
        canEdit
        title="Format de numérotation"
        functionName={ORDER_NUMBER_FUNCTION}
        run={(code, values) => runOrderNumberCode(code, Number(values.get("index")) || 1)}
      />
      <DeleteConfirmModal
        opened={toReset !== null}
        onClose={() => setToReset(null)}
        onConfirm={() => toReset !== null && void reset(toReset)}
        title="Réinitialiser le format"
        message={`Le format « ${toReset === null ? "" : labelOf(toReset)} » reprendra sa version d'origine. Ses modifications seront perdues.`}
        confirmLabel="Réinitialiser"
      />
    </>
  );
}
