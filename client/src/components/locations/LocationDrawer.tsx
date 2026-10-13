import { Box, Drawer, Group, Select, Stack, TextInput } from "@mantine/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_LOCATION_PLACE_TYPE,
  LOCATION_CODE_MAX,
  LOCATION_PLACE_TYPES,
  LOCATION_WAREHOUSE_SOURCES,
  isLocationPlaceType,
  locationTypesUnder,
  misplacedLocationPlaces,
} from "@milo/shared";
import type { Id, Label, LabelTemplate, Location, LocationInput, LocationPlace, LocationPlaceType } from "@milo/shared";
import { api } from "../../api";
import { listOf } from "../../lib/list-ref";
import { errorMessage, notifyError } from "../../lib/errors";
import { BARE_FIELDSET } from "../../lib/rights";
import { useSourceItems, useSources } from "../../lib/sources";
import DeleteConfirmModal from "../ui/DeleteConfirmModal";
import DrawerFooter from "../ui/DrawerFooter";
import DrawerScrollArea, { DRAWER_PADDING, DRAWER_STYLES } from "../ui/DrawerScroll";
import EditableTree from "../ui/EditableTree";
import LabelPicker, { LOCATION_LABELS_API } from "../ui/LabelPicker";
import PrintLabelButton from "../ui/PrintLabelButton";
import { ReferenceTag } from "../ui/ReferenceTag";

// A location record's drawer, laid out like a warehouse's (WarehouseDrawer):
// its labels first, then its warehouse — one of those of the Entrepôts
// widgets the widget's drawer names; a record has no name of its own —,
// then its places, a tree: each with its code — typed by hand, required, given
// once among the places of the same level —, its type, and once saved, the button that prints its
// label. Everything goes with "Sauvegarder".

// The height of the label chips, as on a warehouse.
const CHIP_HEIGHT = 30;

/** Wider than a warehouse's: a place's row holds its code and its type. */
const DRAWER_WIDTH = 720;

const TYPE_WIDTH = 120;
/** A code's place before the name: its longest typed in the field. */
const CODE_WIDTH = 140;
/** The print button, as high as the type's field. */
const PRINT_SIZE = 30;

/** What the drawer edits: ids as the pickers hold them. */
interface Form {
  warehouse_id: string | null;
  places: LocationPlace[];
  label_ids: string[];
}

const EMPTY: Form = { warehouse_id: null, places: [], label_ids: [] };

const formOf = (l: Location): Form => ({
  warehouse_id: l.warehouse_id === null ? null : String(l.warehouse_id),
  places: l.places,
  label_ids: l.labels.map((x) => String(x.id)),
});

const inputOf = (f: Form): LocationInput => ({
  warehouse_id: f.warehouse_id === null ? null : Number(f.warehouse_id),
  places: f.places,
  label_ids: f.label_ids.map(Number),
});

/**
 * A place's code: a green tag, which a double click edits; a field while it
 * has none. Red when it is missing or already given.
 */
function CodeField({
  code,
  invalid,
  readOnly,
  onChange,
}: {
  code: string;
  invalid: boolean;
  readOnly: boolean;
  onChange: (code: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  // Escape leaves the field without keeping what was typed.
  const cancelled = useRef(false);
  if (code && !editing && !invalid) {
    return (
      <Box
        style={{ flexShrink: 0, display: "flex" }}
        onDoubleClick={() => !readOnly && setEditing(true)}
        title={readOnly ? undefined : "Double-cliquer pour modifier le code"}
      >
        <ReferenceTag reference={code} template={code} />
      </Box>
    );
  }
  return (
    <TextInput
      size="xs"
      placeholder="Code"
      aria-label="Code"
      defaultValue={code}
      maxLength={LOCATION_CODE_MAX}
      autoFocus={editing}
      error={invalid}
      disabled={readOnly}
      w={CODE_WIDTH}
      style={{ flexShrink: 0 }}
      // The tree forbids selecting its text: the field gets it back.
      styles={{ input: { userSelect: "text" } }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onBlur={(e) => {
        const typed = cancelled.current ? code : e.currentTarget.value.trim();
        cancelled.current = false;
        setEditing(false);
        if (typed !== code) onChange(typed);
      }}
      onKeyDown={(e) => {
        // The keys are the field's: the Tree would take Space and the arrows.
        e.stopPropagation();
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
        if (e.key === "Escape") {
          e.preventDefault();
          cancelled.current = true;
          e.currentTarget.blur();
        }
      }}
      data-mantine-stop-propagation
    />
  );
}

interface LocationDrawerProps {
  opened: boolean;
  onClose: () => void;
  boardId: Id;
  /** The widget it is added from (LIST_KEY). */
  listKey: string;
  /** The widget's configuration: the Entrepôts widgets it reads. */
  config: unknown;
  /** The record shown; null to add one. */
  location: Location | null;
  /** After a write: the list re-reads. */
  onSaved: () => void;
  canSave: boolean;
  canDelete: boolean;
}

export default function LocationDrawer({
  opened,
  onClose,
  boardId,
  listKey,
  config,
  location,
  onSaved,
  canSave,
  canDelete,
}: LocationDrawerProps) {
  const [form, setForm] = useState<Form>(EMPTY);
  const [labels, setLabels] = useState<Label[]>([]);
  const [templates, setTemplates] = useState<LabelTemplate[]>([]);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const readOnly = !canSave;

  // Its labels and its formats are its widget's: the record's own, or the one it is added from.
  const list = useMemo(
    () => (location ? listOf(location) : { board: boardId, list: listKey }),
    [location, boardId, listKey],
  );

  // The warehouses: those of the Entrepôts widgets its widget names.
  const sources = useSources("warehouse.list", config, LOCATION_WAREHOUSE_SOURCES);
  const warehouses = useSourceItems("warehouse", opened ? sources : []);

  const readLabels = useCallback(async () => {
    try {
      setLabels(await api.getLocationLabels(list));
    } catch (e) {
      notifyError(errorMessage(e));
    }
  }, [list]);

  // Each opening starts from the record, and re-reads its widget's labels and
  // label templates.
  useEffect(() => {
    if (!opened) return;
    setForm(location ? formOf(location) : EMPTY);
    void readLabels();
    let current = true;
    api
      .getLabelTemplates("location", list)
      .then((read) => current && setTemplates(read.templates))
      .catch((e) => notifyError(errorMessage(e)));
    return () => {
      current = false;
    };
  }, [opened, location, list, readLabels]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));

  // The warehouses offered, by name; the record's still shows once it has left them.
  const warehouseData = useMemo(() => {
    const data = (warehouses ?? [])
      .map((w) => ({ value: String(w.id), label: w.name }))
      .sort((a, b) => a.label.localeCompare(b.label, "fr", { numeric: true }));
    const own = location?.warehouse_id;
    if (own != null && !data.some((d) => d.value === String(own))) {
      data.push({
        value: String(own),
        label: location?.warehouse_name || "Entrepôt",
      });
    }
    return data;
  }, [warehouses, location]);

  // The places whose type their parent's refuses: moved under another one.
  const misplaced = misplacedLocationPlaces(form.places);

  /** A place's parent's type: null at the root. */
  const parentTypeOf = (place: Pick<LocationPlace, "parent">): LocationPlaceType | null =>
    form.places.find((p) => p.id === place.parent)?.type ?? null;

  /**
   * The types a place may take: those its parent allows, among those that
   * allow every type already under it.
   */
  const typesOf = (place: LocationPlace) => {
    const under = form.places.filter((p) => p.parent === place.id).map((p) => p.type);
    return locationTypesUnder(parentTypeOf(place)).filter(
      (type) => type === place.type || under.every((u) => locationTypesUnder(type).includes(u)),
    );
  };

  // The places whose code a place of the same level already has — under the
  // same parent: elsewhere, a code may come back.
  const repeated = useMemo(() => {
    const seen = new Set<string>();
    const twice = new Set<string>();
    for (const { id, parent, code } of form.places) {
      const key = `${parent ?? ""}\n${code}`;
      if (code && seen.has(key)) twice.add(id);
      seen.add(key);
    }
    return twice;
  }, [form.places]);
  // Once a save has been tried, the places without a code show in red.
  const [tried, setTried] = useState(false);
  useEffect(() => setTried(false), [opened, location]);

  const persist = async () => {
    setTried(true);
    if (form.places.some((p) => !p.name.trim())) {
      notifyError("Chaque emplacement doit avoir un nom");
      return;
    }
    if (form.places.some((p) => !p.code)) {
      notifyError("Chaque emplacement doit avoir un code");
      return;
    }
    if (repeated.size) {
      const place = form.places.find((p) => repeated.has(p.id));
      notifyError(`Le code « ${place?.code ?? ""} » est déjà donné à un emplacement du même niveau`);
      return;
    }
    if (misplaced.size) {
      notifyError("Un emplacement a un type que celui qui le contient n'accepte pas : changez-le");
      return;
    }
    setSaving(true);
    try {
      if (location) {
        await api.updateLocation(location.id, inputOf(form));
      } else {
        await api.createLocation({
          ...inputOf(form),
          board_id: boardId,
          list_key: listKey,
        });
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
    if (!location) return;
    setConfirmDelete(false);
    try {
      await api.deleteLocation(location.id);
      onSaved();
      onClose();
    } catch (e) {
      notifyError(errorMessage(e));
    }
  };

  /** A place saved with its record: its label prints. */
  const saved = (place: LocationPlace) =>
    location?.places.some((p) => p.id === place.id && p.code === place.code) ?? false;

  /** Before a place's name: its code. */
  const placeCode = (place: LocationPlace, change: (next: LocationPlace) => void) => (
    <CodeField
      // A code changed elsewhere (the record re-read) starts the field over.
      key={place.code}
      code={place.code}
      invalid={repeated.has(place.id) || (tried && !place.code)}
      readOnly={readOnly}
      onChange={(code) => change({ ...place, code })}
    />
  );

  /** At the end of a place's row: its type, its label. */
  const placeFields = (place: LocationPlace, change: (next: LocationPlace) => void) => (
    <Group gap={6} wrap="nowrap" style={{ flexShrink: 0 }}>
      <Select
        size="xs"
        aria-label="Type"
        data={LOCATION_PLACE_TYPES.filter((t) => typesOf(place).includes(t.value)).map((t) => ({
          value: t.value,
          label: t.label,
        }))}
        // Moved under a place that refuses it: its type is to change.
        error={misplaced.has(place.id)}
        value={place.type}
        onChange={(v) => isLocationPlaceType(v) && change({ ...place, type: v })}
        allowDeselect={false}
        disabled={readOnly}
        // The keys are the field's: the Tree would take Space and the arrows.
        onKeyDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        data-mantine-stop-propagation
        w={TYPE_WIDTH}
      />
      {location && saved(place) && templates.length > 0 ? (
        <PrintLabelButton
          kind="location"
          list={list}
          assetId={location.id}
          size={PRINT_SIZE}
          templates={templates}
          print={(name) => api.printLocationLabel(location.id, place.id, name)}
        />
      ) : (
        templates.length > 0 && <div style={{ width: PRINT_SIZE }} />
      )}
    </Group>
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
                labelsApi={LOCATION_LABELS_API}
              />

              <Select
                label="Entrepôt"
                placeholder={warehouses === null && opened ? "Lecture…" : "Choisir un entrepôt"}
                data={warehouseData}
                value={form.warehouse_id}
                onChange={(v) => set("warehouse_id", v)}
                nothingFoundMessage={
                  sources.length ? "Aucun entrepôt" : "Choisissez le widget entrepôt associé dans le widget"
                }
                clearable
                searchable
              />

              <EditableTree<LocationPlace>
                title="Emplacements"
                nodes={form.places}
                onChange={(places) => set("places", places)}
                // At the root, an internal place; under another, the first type it allows.
                make={(base) => ({
                  ...base,
                  type:
                    (base.parent === null ? undefined : locationTypesUnder(parentTypeOf(base))[0]) ??
                    DEFAULT_LOCATION_PLACE_TYPE,
                  code: "",
                })}
                leading={placeCode}
                leadingWidth={CODE_WIDTH}
                // Next to the original, the copy's code is to type.
                copied={(place) => ({ ...place, code: "" })}
                trailing={placeFields}
              />
            </Stack>
          </fieldset>
        </DrawerScrollArea>

        <DrawerFooter
          onSave={canSave ? persist : undefined}
          onClose={onClose}
          onDelete={location && canDelete ? () => setConfirmDelete(true) : undefined}
          saving={saving}
        />
      </Drawer>

      <DeleteConfirmModal
        opened={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
        title="Supprimer la fiche"
        message={
          <>
            Voulez-vous vraiment supprimer cette fiche
            {location?.warehouse_name ? ` de « ${location.warehouse_name} »` : ""} et tous ses emplacements ? Cette
            action est irréversible.
          </>
        }
      />
    </>
  );
}
