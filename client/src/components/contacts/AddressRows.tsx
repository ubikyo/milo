import { Group, Input, Select, Stack, TextInput } from "@mantine/core";
import { IconMapPin } from "@tabler/icons-react";
import { useState } from "react";
import type { DragEvent } from "react";
import { CONTACT_FIELD_MAX } from "@milo/shared";
import type { ContactAddress } from "@milo/shared";
import DeleteConfirmModal from "../ui/DeleteConfirmModal";
import {
  EmptyList,
  Handle,
  ListFooter,
  NAME_INSET,
  ROUNDING,
  RowCheckbox,
  move,
  nameFieldStyle,
  pluralize,
  rowStyle,
  useRowSelection,
} from "../ui/DrawerRows";

// A contact's addresses, in its drawer (ContactDrawer): the same list as the
// others — a handle to order them, a box to delete them, "Ajouter une
// adresse" under it —, but each address on several lines: its name, its two
// address lines, then its postal code, its town and its country, chosen in
// the board's countries (ContactTablesFields).

const POSTAL_CODE_WIDTH = 60;
const COUNTRY_WIDTH = 140;

/** A field of an address, on the row's gray until it is entered, as a list row's. */
function Field({
  label,
  value,
  onChange,
  autoFocus,
  width,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
  width?: number;
}) {
  const [focus, setFocus] = useState(false);
  return (
    <TextInput
      size="sm"
      radius={ROUNDING}
      placeholder={label}
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.currentTarget.value)}
      maxLength={CONTACT_FIELD_MAX}
      autoFocus={autoFocus}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      // Escape leaves the field alone: the drawer stays open.
      data-mantine-stop-propagation
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      style={width ? { width, flexShrink: 0 } : { flex: 1, minWidth: 0 }}
      styles={{ input: nameFieldStyle(focus) }}
    />
  );
}

export const emptyAddress = (country: string): ContactAddress => ({
  label: "",
  line1: "",
  line2: "",
  postal_code: "",
  city: "",
  country,
});

/** What names an address, to delete it. */
const nameOf = (a: ContactAddress): string =>
  a.label || [a.line1, a.city].filter(Boolean).join(", ") || "cette adresse";

export default function AddressRows({
  value,
  onChange,
  countries,
}: {
  value: ContactAddress[];
  onChange: (addresses: ContactAddress[]) => void;
  /** The board's countries: the first is a new address's. */
  countries: string[];
}) {
  const selection = useRowSelection(value.map((_, rank) => rank));
  const [toDelete, setToDelete] = useState<number[]>([]);
  // The address just added takes focus.
  const [added, setAdded] = useState<number | null>(null);
  // While an address is dragged: the rank of the one held.
  const [held, setHeld] = useState<number | null>(null);

  const change = (rank: number, fields: Partial<ContactAddress>) =>
    onChange(value.map((a, i) => (i === rank ? { ...a, ...fields } : a)));

  const dragHover = (e: DragEvent<HTMLElement>, rank: number) => {
    if (held === null) return;
    e.preventDefault();
    const next = move(value, held, rank);
    if (!next) return;
    setHeld(rank);
    selection.reset();
    onChange(next);
  };

  return (
    <Input.Wrapper label="Adresses">
      {value.length === 0 ? (
        <EmptyList icon={IconMapPin} message="Aucune adresse" />
      ) : (
        <Stack gap={1}>
          {value.map((address, rank) => {
            // A country that has left the board's list still shows.
            const choices =
              address.country && !countries.includes(address.country)
                ? [...countries, address.country]
                : countries;
            return (
              <Group
                key={rank}
                gap="xs"
                wrap="nowrap"
                align="flex-start"
                onDragOver={(e) => dragHover(e, rank)}
                onDrop={(e) => e.preventDefault()}
                style={rowStyle(rank, value.length, held === rank)}
              >
                {/* The handle and the box, against the address's first line. */}
                <Group gap="xs" wrap="nowrap" pt={6}>
                  <Handle
                    label={`Déplacer ${nameOf(address)}`}
                    onDragStart={() => setHeld(rank)}
                    onDragEnd={() => setHeld(null)}
                  />
                  <RowCheckbox
                    label={`Sélectionner ${nameOf(address)}`}
                    checked={selection.isChecked(rank)}
                    onChange={(on) => selection.toggle(rank, on)}
                    afterHandle
                  />
                </Group>
                <Stack gap={2} style={{ flex: 1, minWidth: 0, marginLeft: -NAME_INSET }}>
                  <Field
                    label="Nom"
                    value={address.label}
                    onChange={(label) => change(rank, { label })}
                    autoFocus={added === rank}
                  />
                  <Field label="Adresse 1" value={address.line1} onChange={(line1) => change(rank, { line1 })} />
                  <Field label="Adresse 2" value={address.line2} onChange={(line2) => change(rank, { line2 })} />
                  <Group gap="xs" wrap="nowrap">
                    <Field
                      label="Code postal"
                      value={address.postal_code}
                      onChange={(postal_code) => change(rank, { postal_code })}
                      width={POSTAL_CODE_WIDTH}
                    />
                    <Field label="Ville" value={address.city} onChange={(city) => change(rank, { city })} />
                    <Select
                      size="sm"
                      radius={ROUNDING}
                      placeholder="Pays"
                      aria-label="Pays"
                      data={choices}
                      value={address.country || null}
                      onChange={(country) => change(rank, { country: country ?? "" })}
                      nothingFoundMessage="Aucun pays"
                      searchable
                      data-mantine-stop-propagation
                      w={COUNTRY_WIDTH}
                      style={{ flexShrink: 0 }}
                      styles={{ input: nameFieldStyle(false) }}
                    />
                  </Group>
                </Stack>
              </Group>
            );
          })}
        </Stack>
      )}
      <ListFooter
        addLabel="Ajouter une adresse"
        onAdd={() => {
          setAdded(value.length);
          onChange([...value, emptyAddress(countries[0] ?? "")]);
        }}
        checkedCount={selection.checked.length}
        onDeleteChecked={() => setToDelete(selection.checked)}
      />

      <DeleteConfirmModal
        opened={toDelete.length > 0}
        onClose={() => setToDelete([])}
        onConfirm={() => {
          const ranks = new Set(toDelete);
          setToDelete([]);
          selection.reset();
          onChange(value.filter((_, i) => !ranks.has(i)));
        }}
        title={toDelete.length > 1 ? `Supprimer ${pluralize(toDelete.length, "adresse")}` : "Supprimer l'adresse"}
        message={
          toDelete.length > 1 ? (
            <>
              Voulez-vous vraiment supprimer ces {pluralize(toDelete.length, "adresse")} ? Cette
              action est irréversible.
            </>
          ) : (
            <>
              Voulez-vous vraiment supprimer « {nameOf(value[toDelete[0] ?? -1] ?? emptyAddress(""))} » ?
              Cette action est irréversible.
            </>
          )
        }
      />
    </Input.Wrapper>
  );
}
