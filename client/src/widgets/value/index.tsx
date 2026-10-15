// The "Liste" widget, in the "Objets" group (shared, value-lists.ts): a
// grid of the items added from it — a name each, in their order, under an id
// that never changes: a compatible widget offers them (lib/value-lists.ts).
// Its drawer names the list, what it holds and its gender: "Aucun {type}" or
// "Aucune {type}", "Ajouter {type}". Its type is "objects", with its own
// permissions.

import { Group, Select, TextInput } from "@mantine/core";
import { IconList } from "@tabler/icons-react";
import {
  VALUE_LIST_NAME,
  VALUE_TYPE_DEFAULT,
  VALUE_TYPE_GENDER,
  VALUE_TYPE_GENDERS,
  VALUE_TYPE_NAME,
  valueTypeGender,
} from "@milo/shared";
import ValuesList from "../../components/value-lists/ValuesList";
import { insertRow } from "../../components/ui/SettingRows";
import type { ContactWidget } from "../contact";
import { PERCENT_HEIGHT } from "../height";
import type { IndicatorConfigProps } from "../support/types";

const text = (config: unknown, key: string): string => {
  const value = (config as Record<string, unknown> | null)?.[key];
  return typeof value === "string" ? value : "";
};

/**
 * The list settings, on one line: its name, the name of what it holds, and
 * its gender. Its items are entered in the grid; it has one column, the name.
 */
function ListFields({ config, onChange }: IndicatorConfigProps) {
  return (
    <Group grow align="flex-start">
      <TextInput
        label="Nom de la liste"
        placeholder="Liste"
        value={text(config, VALUE_LIST_NAME)}
        onChange={(e) => onChange(insertRow(config, { [VALUE_LIST_NAME]: e.currentTarget.value }))}
      />
      <TextInput
        label="Nom du type"
        placeholder={VALUE_TYPE_DEFAULT}
        value={text(config, VALUE_TYPE_NAME)}
        onChange={(e) => onChange(insertRow(config, { [VALUE_TYPE_NAME]: e.currentTarget.value }))}
      />
      <Select
        label="Genre"
        data={VALUE_TYPE_GENDERS}
        value={valueTypeGender(config)}
        onChange={(v) => v && onChange(insertRow(config, { [VALUE_TYPE_GENDER]: v }))}
        allowDeselect={false}
      />
    </Group>
  );
}

export const valueListWidget: ContactWidget = {
  type: "list",
  kind: "objects",
  label: "Liste",
  icon: IconList,
  defaultConfig: { ...PERCENT_HEIGHT },
  ownClicks: true,
  fill: true,
  Display: ({ config }) => <ValuesList config={config} />,
  Config: ListFields,
};
