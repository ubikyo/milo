import { Drawer, Group, Select, Stack, TextInput } from "@mantine/core";
import { useCallback, useEffect, useMemo, useState } from "react";
import { WAREHOUSE_FIELD_MAX, WAREHOUSE_NAME_MAX } from "@milo/shared";
import type { Id, Label, Warehouse, WarehouseInput } from "@milo/shared";
import { api } from "../../api";
import { listOf } from "../../lib/list-ref";
import { errorMessage, notifyError } from "../../lib/errors";
import { BARE_FIELDSET } from "../../lib/rights";
import DeleteConfirmModal from "../ui/DeleteConfirmModal";
import DrawerFooter from "../ui/DrawerFooter";
import DrawerScrollArea, { DRAWER_PADDING, DRAWER_STYLES } from "../ui/DrawerScroll";
import LabelPicker, { WAREHOUSE_LABELS_API } from "../ui/LabelPicker";

// A warehouse's drawer, laid out like a contact's (ContactDrawer): its labels
// first, then its name, then its address — two lines, its postal code and its
// town side by side, then its country, chosen among its widget's countries
// (WarehouseTablesFields). Everything goes with "Sauvegarder".

// The height of the label chips, as on a contact.
const CHIP_HEIGHT = 30;

/** As wide as a contact's. */
const DRAWER_WIDTH = 560;

const POSTAL_CODE_WIDTH = 120;

/** What the drawer edits: ids as the picker holds them. */
interface Form {
  name: string;
  line1: string;
  line2: string;
  postal_code: string;
  city: string;
  country: string;
  label_ids: string[];
}

const EMPTY: Form = {
  name: "",
  line1: "",
  line2: "",
  postal_code: "",
  city: "",
  country: "",
  label_ids: [],
};

const formOf = (w: Warehouse): Form => ({
  name: w.name,
  line1: w.line1,
  line2: w.line2,
  postal_code: w.postal_code,
  city: w.city,
  country: w.country,
  label_ids: w.labels.map((l) => String(l.id)),
});

const inputOf = (f: Form): WarehouseInput => ({
  name: f.name.trim(),
  line1: f.line1.trim(),
  line2: f.line2.trim(),
  postal_code: f.postal_code.trim(),
  city: f.city.trim(),
  country: f.country,
  label_ids: f.label_ids.map(Number),
});

interface WarehouseDrawerProps {
  opened: boolean;
  onClose: () => void;
  boardId: Id;
  /** The widget it is added from (LIST_KEY). */
  listKey: string;
  /** The warehouse shown; null to add one. */
  warehouse: Warehouse | null;
  /** After a write: the list re-reads. */
  onSaved: () => void;
  canSave: boolean;
  canDelete: boolean;
}

export default function WarehouseDrawer({
  opened,
  onClose,
  boardId,
  listKey,
  warehouse,
  onSaved,
  canSave,
  canDelete,
}: WarehouseDrawerProps) {
  const [form, setForm] = useState<Form>(EMPTY);
  const [labels, setLabels] = useState<Label[]>([]);
  /** The widget's countries: the first is a new warehouse's. */
  const [names, setNames] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const readOnly = !canSave;

  // Its labels are its widget's: the warehouse's own, or the one it is added from.
  const list = useMemo(
    () => (warehouse ? listOf(warehouse) : { board: boardId, list: listKey }),
    [warehouse, boardId, listKey],
  );

  const readLabels = useCallback(async () => {
    try {
      setLabels(await api.getWarehouseLabels(list));
    } catch (e) {
      notifyError(errorMessage(e));
    }
  }, [list]);

  // Each opening starts from the warehouse, and re-reads its labels and its
  // widget's countries — a new warehouse takes the first.
  useEffect(() => {
    if (!opened) return;
    setForm(warehouse ? formOf(warehouse) : EMPTY);
    void readLabels();
    let current = true;
    api
      .getWarehouseSettings(list)
      .then(({ countries }) => {
        if (!current) return;
        const read = countries.map((c) => c.name);
        setNames(read);
        if (!warehouse) setForm((f) => (f.country ? f : { ...f, country: read[0] ?? "" }));
      })
      .catch((e) => notifyError(errorMessage(e)));
    return () => {
      current = false;
    };
  }, [opened, warehouse, list, readLabels]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // A country that has left the list still shows.
  const countries =
    form.country && !names.includes(form.country) ? [...names, form.country] : names;

  const persist = async () => {
    if (!form.name.trim()) {
      notifyError("Le champ « Nom » est requis");
      return;
    }
    setSaving(true);
    try {
      if (warehouse) {
        await api.updateWarehouse(warehouse.id, inputOf(form));
      } else {
        await api.createWarehouse({ ...inputOf(form), board_id: boardId, list_key: listKey });
      }
      onSaved();
      onClose();
    } catch (e) {
      notifyError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!warehouse) return;
    setConfirmDelete(false);
    try {
      await api.deleteWarehouse(warehouse.id);
      onSaved();
      onClose();
    } catch (e) {
      notifyError(errorMessage(e));
    }
  };

  const text = (key: "line1" | "line2" | "postal_code" | "city", label: string) => (
    <TextInput
      label={label}
      placeholder={label}
      value={form[key]}
      onChange={(e) => set(key, e.currentTarget.value)}
      maxLength={WAREHOUSE_FIELD_MAX}
      style={key === "postal_code" ? { width: POSTAL_CODE_WIDTH, flexShrink: 0 } : { flex: 1, minWidth: 0 }}
    />
  );

  return (
    <>
      <Drawer
        opened={opened}
        onClose={onClose}
        position="right"
        size={DRAWER_WIDTH}
        padding={DRAWER_PADDING}
        withCloseButton={false}
        styles={DRAWER_STYLES}
      >
        <DrawerScrollArea>
          {/* Read-only, all the fields are disabled at once. */}
          <fieldset disabled={readOnly} style={BARE_FIELDSET}>
            <Stack gap="xl">
              <LabelPicker
                chipHeight={CHIP_HEIGHT}
                labels={labels}
                value={form.label_ids}
                onChange={(ids) => set("label_ids", ids)}
                list={list}
                onLabelsChanged={readLabels}
                labelsApi={WAREHOUSE_LABELS_API}
              />

              <TextInput
                label="Nom"
                placeholder="Nom"
                value={form.name}
                onChange={(e) => set("name", e.currentTarget.value)}
                maxLength={WAREHOUSE_NAME_MAX}
                required
              />

              {/* Its address, as a contact's. */}
              <Stack gap="md">
                {text("line1", "Adresse 1")}
                {text("line2", "Adresse 2")}
                <Group align="flex-start" gap="md" wrap="nowrap">
                  {text("postal_code", "Code postal")}
                  {text("city", "Ville")}
                </Group>
                <Select
                  label="Pays"
                  placeholder="Choisir un pays"
                  data={countries}
                  value={form.country || null}
                  onChange={(v) => set("country", v ?? "")}
                  nothingFoundMessage="Aucun pays"
                  clearable
                  searchable
                />
              </Stack>
            </Stack>
          </fieldset>
        </DrawerScrollArea>

        <DrawerFooter
          onSave={canSave ? persist : undefined}
          onClose={onClose}
          onDelete={warehouse && canDelete ? () => setConfirmDelete(true) : undefined}
          saving={saving}
        />
      </Drawer>

      <DeleteConfirmModal
        opened={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
        title="Supprimer l'entrepôt"
        message={
          <>
            Voulez-vous vraiment supprimer
            {form.name ? ` « ${form.name} »` : " cet entrepôt"} ? Cette action est irréversible.
          </>
        }
      />
    </>
  );
}
