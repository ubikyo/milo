import { IconFlag } from "@tabler/icons-react";
import { CONTACT_FIELD_MAX } from "@milo/shared";
import type { ContactCountry } from "@milo/shared";
import { ListRows } from "../ui/EditableRows";
import type { Column } from "../ui/EditableRows";

// The countries an address picks from, in a widget's drawer: a Contact
// widget's (ContactTablesFields), an Entrepôts widget's
// (WarehouseTablesFields). In their order, dragged by their rows' handles:
// the first is a new address's.

const COLUMNS: Column[] = [{ label: "Libellé", maxLength: CONTACT_FIELD_MAX }];

export default function CountryRows({
  value,
  onChange,
}: {
  value: ContactCountry[];
  onChange: (countries: ContactCountry[]) => void;
}) {
  return (
    <ListRows
      title="Pays"
      columns={COLUMNS}
      rows={value.map((c) => [c.name])}
      save={async (rows) => {
        onChange(rows.map(([name = ""]) => ({ name })));
        return true;
      }}
      emptyIcon={IconFlag}
      emptyText="Aucun pays"
      addLabel="Ajouter un pays"
      deleteTitle="Supprimer le pays"
      several={(n) => `${n} pays`}
      reorderable
    />
  );
}
