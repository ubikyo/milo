import { Box, Group, Input, NumberInput, Select, Stack } from "@mantine/core";
import { IconRuler2 } from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { PaperFormat, PaperFormatInput, Printer } from "@milo/shared";
import { api } from "../../api";
import { errorMessage, notifyError } from "../../lib/errors";
import { RED } from "../../themes/colors";
import DeleteConfirmModal from "../ui/DeleteConfirmModal";
import {
  EmptyList,
  INPUT_STYLE,
  ListFooter,
  NAME_INSET,
  ROUNDING,
  RowCheckbox,
  RowCheckboxSpace,
  RowField,
  editKeys,
  pickKeys,
  pluralize,
  rowStyle,
  useRowSelection,
} from "../ui/DrawerRows";
import listClasses from "../../assets/styles/SettingsList.module.css";

// The "Formats de papier" list of "Paramétrage" > "Impression", under the
// printers (PrintersTab): a row per format — its name, its printer, its width
// and height in millimeters. The resolution is the printer's own: it gives it
// itself (lib/zebra.ts). Each change is sent right away. A format is never
// incomplete: the added row is only created once it has its name, its width
// and its height, and a size cannot be emptied afterwards.

/** The added row, while it waits for its name and sizes. */
type Draft = Omit<PaperFormat, "id" | "width" | "height"> & {
  width: number | null;
  height: number | null;
};

const EMPTY_DRAFT: Draft = { name: "", printer_id: null, width: null, height: null };

const SIZE_WIDTH = 96;
/**
 * The printers' columns (PrintersTab: type 100 + IP address 150 + model 120)
 * less the two sizes, so the names are as wide as the printers' above.
 */
const PRINTER_WIDTH = 100 + 150 + 120 - 2 * SIZE_WIDTH;

const onError = (e: unknown) => notifyError(errorMessage(e));

/** A row's field: transparent over its gray, the window's background once entered. */
const fieldStyles = (entered: boolean) => ({
  input: entered ? INPUT_STYLE : { backgroundColor: "transparent", borderWidth: 0 },
});

/**
 * A size in millimeters, to the hundredth, sent when the field is left. It
 * cannot be emptied: left empty, it goes back to its size.
 */
function SizeField({
  value: saved,
  placeholder,
  label,
  onChange,
  missing = false,
}: {
  value: number | null;
  placeholder: string;
  label: string;
  onChange: (size: number) => void;
  /** Still to be entered before the format can be created: framed in red. */
  missing?: boolean;
}) {
  const [value, setValue] = useState<number | "">(saved ?? "");
  const [entered, setEntered] = useState(false);
  useEffect(() => setValue(saved ?? ""), [saved]);
  return (
    <NumberInput
      size="xs"
      radius={ROUNDING}
      w={SIZE_WIDTH}
      style={{ flexShrink: 0 }}
      placeholder={placeholder}
      suffix=" mm"
      min={0}
      max={2000}
      decimalScale={2}
      allowNegative={false}
      hideControls
      aria-label={label}
      value={value}
      onChange={(v) => setValue(v === "" ? "" : Number(v))}
      // Escape puts back the number, its decimals included.
      {...editKeys((text) => {
        const digits = text.replace(/[^\d.]/g, "");
        setValue(digits === "" ? "" : Number(digits));
      })}
      onFocus={() => setEntered(true)}
      onBlur={() => {
        setEntered(false);
        if (value === "" || value <= 0) setValue(saved ?? "");
        else if (value !== saved) onChange(value);
      }}
      styles={
        missing && !entered
          ? { input: { backgroundColor: "transparent", border: `1px solid ${RED}` } }
          : fieldStyles(entered)
      }
    />
  );
}

/** A pick among a list, in a row. */
function RowSelect({
  data,
  value,
  onChange,
  width,
  placeholder,
  label,
  clearable = false,
}: {
  data: { value: string; label: string }[];
  value: string | null;
  onChange: (value: string | null) => void;
  width: number;
  placeholder: string;
  label: string;
  clearable?: boolean;
}) {
  const [entered, setEntered] = useState(false);
  return (
    <Select
      size="xs"
      radius={ROUNDING}
      w={width}
      style={{ flexShrink: 0 }}
      data={data}
      value={value}
      onChange={(v) => v !== value && onChange(v)}
      placeholder={placeholder}
      allowDeselect={clearable}
      clearable={clearable}
      {...pickKeys}
      comboboxProps={{ withinPortal: true }}
      classNames={{ dropdown: listClasses.dropdown, option: listClasses.option }}
      onFocus={() => setEntered(true)}
      onBlur={() => setEntered(false)}
      styles={fieldStyles(entered)}
      aria-label={label}
    />
  );
}

interface PaperFormatsProps {
  printers: Printer[];
  canEdit: boolean;
}

export default function PaperFormats({ printers, canEdit }: PaperFormatsProps) {
  const [formats, setFormats] = useState<PaperFormat[]>([]);
  // The added row, waiting for its name and sizes.
  const [draft, setDraft] = useState<Draft | null>(null);
  const selection = useRowSelection(formats.map((f) => f.id));
  const [toDelete, setToDelete] = useState<PaperFormat[]>([]);

  const reload = useCallback(async () => {
    try {
      setFormats(await api.getPaperFormats());
    } catch (e) {
      onError(e);
    }
  }, []);

  // Read again with the printers: deleting one leaves its formats without.
  useEffect(() => {
    void reload();
  }, [reload, printers]);

  /** An API call, followed by re-reading the formats. */
  const write = async (action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (e) {
      onError(e);
    }
    await reload();
  };

  const change = (format: PaperFormat, data: PaperFormatInput) =>
    void write(() => api.updatePaperFormat(format.id, data));

  const printerChoices = printers.map((p) => ({ value: String(p.id), label: p.name }));

  /**
   * The added row, changed: created once complete — kept as it is if the
   * server refuses it —, gone once emptied.
   */
  const changeDraft = async (change: Partial<Draft>) => {
    if (!draft) return;
    const next = { ...draft, ...change };
    const { name, width, height } = next;
    if (!name && width === null && height === null && next.printer_id === null) {
      setDraft(null);
      return;
    }
    setDraft(next);
    if (!name || width === null || height === null) return;
    try {
      await api.createPaperFormat({ ...next, name, width, height });
      setDraft(null);
    } catch (e) {
      onError(e);
    }
    await reload();
  };

  const total = formats.length + (draft ? 1 : 0);

  /** A row's style: without its checkbox, read only, a simple list's. */
  const formatRowStyle = (rank: number) => rowStyle(rank, total, false, canEdit ? "checkbox" : "simple");

  /** The name field: behind a checkbox, it moves back to align with it. */
  const nameSlot = (field: ReactNode) =>
    canEdit ? (
      <Box style={{ flex: 1, minWidth: 0, display: "flex", marginLeft: -NAME_INSET }}>{field}</Box>
    ) : (
      field
    );

  return (
    // An editable list of the Settings: their look ("Formulaire" > "Liste").
    <Input.Wrapper label="Formats de papier" className={listClasses.list} data-settings-list>
      {total === 0 ? (
        <EmptyList icon={IconRuler2} message="Aucun format de papier" />
      ) : (
        <Stack gap={1}>
          {formats.map((format, rank) => (
            <Group key={format.id} gap="sm" wrap="nowrap" style={formatRowStyle(rank)}>
              {canEdit && (
                <RowCheckbox
                  label={`Sélectionner ${format.name}`}
                  checked={selection.isChecked(format.id)}
                  onChange={(on) => selection.toggle(format.id, on)}
                />
              )}
              {nameSlot(
                <RowField
                  name={format.name}
                  placeholder="Nom du format"
                  label={`Nom de ${format.name}`}
                  readOnly={!canEdit}
                  onValidate={(name) => {
                    if (name && name !== format.name) change(format, { name });
                  }}
                />,
              )}
              <RowSelect
                data={printerChoices}
                value={format.printer_id === null ? null : String(format.printer_id)}
                onChange={(id) => change(format, { printer_id: id === null ? null : Number(id) })}
                width={PRINTER_WIDTH}
                placeholder="Imprimante"
                label={`Imprimante de ${format.name}`}
                clearable
              />
              <SizeField
                value={format.width}
                placeholder="Largeur"
                label={`Largeur de ${format.name}`}
                onChange={(width) => change(format, { width })}
              />
              <SizeField
                value={format.height}
                placeholder="Hauteur"
                label={`Hauteur de ${format.name}`}
                onChange={(height) => change(format, { height })}
              />
            </Group>
          ))}
          {draft && (
            <Group gap="sm" wrap="nowrap" style={formatRowStyle(total - 1)}>
              {/* Not created yet: nothing to delete. */}
              <RowCheckboxSpace />
              {nameSlot(
                <RowField
                  name={draft.name}
                  placeholder="Nom du format"
                  label="Nom du format à ajouter"
                  autoFocus
                  // Left empty with nothing else entered, the row disappears.
                  onValidate={(name) => void changeDraft({ name })}
                />,
              )}
              <RowSelect
                data={printerChoices}
                value={draft.printer_id === null ? null : String(draft.printer_id)}
                onChange={(id) => void changeDraft({ printer_id: id === null ? null : Number(id) })}
                width={PRINTER_WIDTH}
                placeholder="Imprimante"
                label="Imprimante du format à ajouter"
                clearable
              />
              {/* Named, the sizes still missing show in red. */}
              <SizeField
                value={draft.width}
                placeholder="Largeur"
                label="Largeur du format à ajouter"
                onChange={(width) => void changeDraft({ width })}
                missing={Boolean(draft.name) && draft.width === null}
              />
              <SizeField
                value={draft.height}
                placeholder="Hauteur"
                label="Hauteur du format à ajouter"
                onChange={(height) => void changeDraft({ height })}
                missing={Boolean(draft.name) && draft.height === null}
              />
            </Group>
          )}
        </Stack>
      )}
      {canEdit && (
        <ListFooter
          addLabel="Ajouter un format de papier"
          onAdd={() => setDraft(EMPTY_DRAFT)}
          checkedCount={selection.checked.length}
          onDeleteChecked={() => setToDelete(formats.filter((f) => selection.isChecked(f.id)))}
        />
      )}

      <DeleteConfirmModal
        opened={toDelete.length > 0}
        onClose={() => setToDelete([])}
        onConfirm={async () => {
          const list = toDelete;
          setToDelete([]);
          selection.reset();
          await write(() => Promise.all(list.map((f) => api.deletePaperFormat(f.id))));
        }}
        title={
          toDelete.length > 1
            ? `Supprimer ${pluralize(toDelete.length, "format")}`
            : "Supprimer le format de papier"
        }
        message={
          toDelete.length > 1 ? (
            <>
              Voulez-vous vraiment supprimer ces {pluralize(toDelete.length, "format")} de papier ?
              Cette action est irréversible.
            </>
          ) : (
            <>
              Voulez-vous vraiment supprimer « {toDelete[0]?.name} » ? Cette action est
              irréversible.
            </>
          )
        }
      />
    </Input.Wrapper>
  );
}
