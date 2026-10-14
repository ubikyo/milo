import {
  Badge,
  Box,
  Group,
  Input,
  Select,
  Stack,
  TextInput,
} from "@mantine/core";
import { IconPrinter } from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";
import type { FocusEvent, ReactNode } from "react";
import type { Id, MiloProxy, Printer, PrinterInfo, PrinterInfos, PrinterInput } from "@milo/shared";
import { api } from "../../api";
import { useProxies } from "../../lib/proxies";
import { errorMessage, notifyError } from "../../lib/errors";
import { GREEN, RED } from "../../themes/colors";
import DeleteConfirmModal from "../ui/DeleteConfirmModal";
import PaperFormats from "./PaperFormats";
import {
  EmptyList,
  INPUT_INSET,
  INPUT_STYLE,
  ListFooter,
  ListHeader,
  FIRST_FIELD_MARGIN,
  NAME_INSET,
  NAME_MIN_WIDTH,
  ROUNDING,
  RowCheckbox,
  RowField,
  editKeys,
  pickKeys,
  pluralize,
  rowStyle,
  useRowSelection,
} from "../ui/DrawerRows";
import listClasses from "../../assets/styles/SettingsList.module.css";

// The "Impression" section of Settings ("Paramétrage"): the printers, for the
// whole application, drawn like the other editable lists (DrawerRows). A row
// per printer: its name, its IP address, edited in place, then the
// model it gives — in red "Hors ligne" when its port 9100 does not answer.
// Each is reached directly by Milo, or through one of the proxies ("Proxies"
// tab): its "Connexion", against the row's end. Their type is Zebra only, for
// now: it is not shown.
// "Ajouter une imprimante" adds a row, created only once it has its name and
// its IP address; an address cannot be emptied afterwards. Under them,
// the paper formats (PaperFormats). Like the other tabs, each change is sent
// right away.

/** How often the printers are asked again while the tab is open. */
const INFO_INTERVAL = 30_000;

/** The names' share of a row, the same as the paper formats' (PaperFormats). */
const NAME_SHARE = "25%";
/** Wide enough for "192.168.100.100". */
const HOST_WIDTH = 120;
const CONNECTION_WIDTH = 140;
/** Wide enough for "ZD421 203dpi", so the rows' ends stay aligned. */
const MODEL_WIDTH = 120;
/** The room of a select's arrow, at its end: its text stops before it. */
const CHEVRON_WIDTH = 30;

const onError = (e: unknown) => notifyError(errorMessage(e));

/** The added row, while it waits for its name and address. */
type Draft = Omit<Printer, "id">;

const EMPTY_DRAFT: Draft = { type: "zebra", name: "", host: "", proxy_id: null };

/** The "Connexion" picker's value for a printer Milo reaches itself. */
const DIRECT = "direct";

/** A row's field: transparent over its gray, the window's background once entered. */
const fieldStyles = (entered: boolean) => ({
  input: entered ? INPUT_STYLE : { backgroundColor: "transparent", borderWidth: 0 },
});

/** A row's field, framed in red while it is required and still empty. */
const missingStyles = { input: { backgroundColor: "transparent", border: `1px solid ${RED}` } };

interface FieldProps<T> {
  value: T;
  onChange: (value: T) => void;
  /** Its row's name, for screen readers: "Adresse IP de …". */
  of: string;
}

/**
 * The IP address, sent when the field is left. It cannot be emptied: left
 * empty, it goes back to its address.
 */
function HostField({ value: saved, onChange, of, missing = false }: FieldProps<string> & {
  /** Still to be entered before the printer can be created: framed in red. */
  missing?: boolean;
}) {
  const [value, setValue] = useState(saved);
  const [entered, setEntered] = useState(false);
  useEffect(() => setValue(saved), [saved]);
  return (
    <TextInput
      size="xs"
      radius={ROUNDING}
      w={HOST_WIDTH}
      style={{ flexShrink: 0 }}
      placeholder="Adresse IP"
      aria-label={`Adresse IP ${of}`}
      value={value}
      onChange={(e) => setValue(e.currentTarget.value)}
      {...editKeys(setValue)}
      onFocus={() => setEntered(true)}
      onBlur={(e) => {
        setEntered(false);
        const host = e.currentTarget.value.trim();
        if (!host) setValue(saved);
        else if (host !== saved) onChange(host);
      }}
      styles={missing && !entered ? missingStyles : fieldStyles(entered)}
    />
  );
}

/** How Milo reaches it: "Directe", or one of the proxies. */
function ConnectionField({ value, onChange, of, proxies }: FieldProps<Id | null> & { proxies: MiloProxy[] }) {
  const [entered, setEntered] = useState(false);
  const data = [
    { value: DIRECT, label: "Directe" },
    ...proxies.map((p) => ({ value: String(p.id), label: p.name })),
  ];
  return (
    <Select
      size="xs"
      radius={ROUNDING}
      w={CONNECTION_WIDTH}
      // Against the row's end, its text too.
      ml="auto"
      style={{ flexShrink: 0 }}
      data={data}
      value={value === null ? DIRECT : String(value)}
      onChange={(v) => {
        const next = !v || v === DIRECT ? null : Number(v);
        if (next !== value) onChange(next);
      }}
      allowDeselect={false}
      {...pickKeys}
      // Its list as wide as its longest name, under the field's end.
      comboboxProps={{ withinPortal: true, width: "max-content", position: "bottom-end" }}
      classNames={{ dropdown: listClasses.dropdown, option: listClasses.option }}
      onFocus={() => setEntered(true)}
      onBlur={() => setEntered(false)}
      styles={{ input: { ...fieldStyles(entered).input, textAlign: "right" } }}
      aria-label={`Connexion ${of}`}
    />
  );
}

/** "ZD421-203dpi", as the printer gives it, read "ZD421 203dpi". */
const modelLabel = (model: string) => model.replace(/-(\d{3}dpi)$/i, " $1");

/**
 * The model the printer gives, in green; in red "Hors ligne" when it does not
 * answer ("null"), gray while it is asked ("undefined").
 */
function ModelTag({ info }: { info: PrinterInfo | null | undefined }) {
  const label =
    info === undefined ? "…" : info === null ? "Hors ligne" : modelLabel(info.model) || "En ligne";
  return (
    // Against the row's end, its column's width keeping the rows aligned.
    <Box w={MODEL_WIDTH} style={{ flexShrink: 0, display: "flex", justifyContent: "flex-end", minWidth: 0 }}>
      <Badge
        color={info === undefined ? "gray" : info ? GREEN : RED}
        variant="filled"
        size="sm"
        radius="sm"
        tt="none"
        fw={600}
        maw={MODEL_WIDTH}
        title={label}
        // In the Settings, their tags' look; online, its background too.
        data-list-tag={info ? "filled" : ""}
      >
        {label}
      </Badge>
    </Box>
  );
}

export default function PrintersTab({ canEdit }: { canEdit: boolean }) {
  const [printers, setPrinters] = useState<Printer[]>([]);
  // What each printer says of itself; missing while it is asked.
  const [infos, setInfos] = useState<PrinterInfos>({});
  // The added row, waiting for its name and address.
  const [draft, setDraft] = useState<Draft | null>(null);
  const selection = useRowSelection(printers.map((p) => p.id));
  const { proxies } = useProxies();
  const [toDelete, setToDelete] = useState<Printer[]>([]);

  const reload = useCallback(async () => {
    try {
      setPrinters(await api.getPrinters());
    } catch (e) {
      onError(e);
    }
  }, []);

  const askInfos = useCallback(async () => {
    try {
      setInfos(await api.getPrinterInfos());
    } catch {
      // Asked again at the next round: a model is not worth an error.
    }
  }, []);

  useEffect(() => {
    void reload();
    void askInfos();
    const timer = setInterval(() => void askInfos(), INFO_INTERVAL);
    return () => clearInterval(timer);
  }, [reload, askInfos]);

  /** An API call, followed by re-reading the printers. */
  const write = async (action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (e) {
      onError(e);
    }
    await reload();
  };

  /** A change of where to reach it: it is asked again. */
  const change = (printer: Printer, data: PrinterInput) => {
    if (data.host !== undefined || data.proxy_id !== undefined) {
      setInfos(({ [printer.id]: _, ...others }) => others);
    }
    void write(() => api.updatePrinter(printer.id, data)).then(askInfos);
  };

  /**
   * The added row, changed: created once complete — kept as it is if the
   * server refuses it.
   */
  const changeDraft = async (change: Partial<Draft>) => {
    if (!draft) return;
    const next = { ...draft, ...change };
    setDraft(next);
    if (!next.name || !next.host) return;
    try {
      await api.createPrinter(next);
      setDraft(null);
    } catch (e) {
      onError(e);
    }
    await reload();
    void askInfos();
  };

  /**
   * The focus leaving the added row, not one of its fields for another: still
   * without a name or an address, the row disappears. Asked once the field
   * left has given its value (changeDraft) and the next one has the focus.
   */
  const leaveDraft = (e: FocusEvent<HTMLElement>) => {
    const row = e.currentTarget;
    setTimeout(() => {
      if (row.contains(document.activeElement)) return;
      setDraft((d) => (d && !d.name && !d.host ? null : d));
    });
  };

  const total = printers.length + (draft ? 1 : 0);

  /**
   * A row's style: without its checkbox, read only, a simple list's. The
   * columns' header opens the stack (ListHeader).
   */
  const printerRowStyle = (rank: number) => rowStyle(rank + 1, total + 1, false, canEdit ? "checkbox" : "simple");

  /**
   * The name field, a quarter of the row: behind a checkbox, it moves back to
   * align with it.
   */
  const nameSlot = (field: ReactNode, added = false) => (
    <Box
      style={{
        // Shrinking first, so the state's tag stays against the row's end.
        flex: `0 1 ${NAME_SHARE}`,
        minWidth: NAME_MIN_WIDTH,
        display: "flex",
        // Added, without a checkbox before it: it opens the row.
        marginLeft: !canEdit ? 0 : added ? FIRST_FIELD_MARGIN : -NAME_INSET,
      }}
    >
      {field}
    </Box>
  );

  /** The columns' titles, over the fields of the rows. */
  const columns = [
    {
      label: "Nom",
      style: { flex: `0 1 ${NAME_SHARE}`, minWidth: NAME_MIN_WIDTH, marginLeft: canEdit ? -NAME_INSET : 0 },
      inset: INPUT_INSET,
    },
    { label: "Adresse IP", style: { width: HOST_WIDTH } },
    { label: "Connexion", style: { width: CONNECTION_WIDTH, marginLeft: "auto" }, end: true, inset: CHEVRON_WIDTH },
    { label: "État", style: { width: MODEL_WIDTH }, end: true, inset: 0 },
  ];

  return (
    <fieldset disabled={!canEdit} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      {/* The space between its lists is the themes' ("Formulaire" > "Liste" > "Marge basse"). */}
      <Stack gap="xl" data-settings-lists>
        {/* Its select, with the Settings' look ("Formulaire" > "Liste" > "Select"). */}
        <Input.Wrapper label="Imprimantes" className={listClasses.list} data-settings-list>
          {total === 0 ? (
            <EmptyList icon={IconPrinter} message="Aucune imprimante" />
          ) : (
            <Stack gap={1}>
              <ListHeader columns={columns} kind={canEdit ? "checkbox" : "simple"} />
              {printers.map((printer, rank) => (
                <Group key={printer.id} gap="sm" wrap="nowrap" style={printerRowStyle(rank)}>
                  {canEdit && (
                    <RowCheckbox
                      label={`Sélectionner ${printer.name}`}
                      checked={selection.isChecked(printer.id)}
                      onChange={(on) => selection.toggle(printer.id, on)}
                    />
                  )}
                  {nameSlot(
                    <RowField
                      name={printer.name}
                      placeholder="Nom de l'imprimante"
                      label={`Nom de ${printer.name}`}
                      readOnly={!canEdit}
                      onValidate={(name) => {
                        if (name && name !== printer.name) change(printer, { name });
                      }}
                    />,
                  )}
                  <HostField value={printer.host} of={`de ${printer.name}`} onChange={(host) => change(printer, { host })} />
                  <ConnectionField
                    value={printer.proxy_id}
                    proxies={proxies}
                    of={`de ${printer.name}`}
                    onChange={(proxy_id) => change(printer, { proxy_id })}
                  />
                  <ModelTag info={infos[printer.id]} />
                </Group>
              ))}
              {draft && (
                <Group gap="sm" wrap="nowrap" style={printerRowStyle(total - 1)} onBlur={leaveDraft}>
                  {nameSlot(
                    <RowField
                      name={draft.name}
                      placeholder="Nom de l'imprimante"
                      label="Nom de l'imprimante à ajouter"
                      autoFocus
                      // Left empty with no address, the row disappears (leaveDraft).
                      onValidate={(name) => void changeDraft({ name })}
                    />,
                    true,
                  )}
                  {/* Named, the missing address shows in red. */}
                  <HostField
                    value={draft.host}
                    of="de l'imprimante à ajouter"
                    onChange={(host) => void changeDraft({ host })}
                    missing={Boolean(draft.name) && !draft.host}
                  />
                  <ConnectionField
                    value={draft.proxy_id}
                    proxies={proxies}
                    of="de l'imprimante à ajouter"
                    onChange={(proxy_id) => void changeDraft({ proxy_id })}
                  />
                  {/* Not asked yet: an empty space keeps the rows' ends aligned. */}
                  <Box w={MODEL_WIDTH} style={{ flexShrink: 0 }} />
                </Group>
              )}
            </Stack>
          )}
          {canEdit && (
            <ListFooter
              addLabel="Ajouter une imprimante"
              onAdd={() => setDraft(EMPTY_DRAFT)}
              checkedCount={selection.checked.length}
              onDeleteChecked={() => setToDelete(printers.filter((p) => selection.isChecked(p.id)))}
            />
          )}
        </Input.Wrapper>

        <PaperFormats printers={printers} canEdit={canEdit} />
      </Stack>

      <DeleteConfirmModal
        opened={toDelete.length > 0}
        onClose={() => setToDelete([])}
        onConfirm={async () => {
          const list = toDelete;
          setToDelete([]);
          selection.reset();
          await write(() => Promise.all(list.map((p) => api.deletePrinter(p.id))));
        }}
        title={
          toDelete.length > 1
            ? `Supprimer ${pluralize(toDelete.length, "imprimante")}`
            : "Supprimer l'imprimante"
        }
        message={
          toDelete.length > 1 ? (
            <>
              Voulez-vous vraiment supprimer ces {pluralize(toDelete.length, "imprimante")} ? Cette
              action est irréversible.
            </>
          ) : (
            <>
              Voulez-vous vraiment supprimer « {toDelete[0]?.name} » ? Cette action est
              irréversible.
            </>
          )
        }
      />
    </fieldset>
  );
}
