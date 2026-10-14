import { Fragment } from "react";
import { ActionIcon, CloseButton, Menu, Popover, ScrollArea, TextInput } from "@mantine/core";
import { IconCheck, IconFilter, IconSearch } from "@tabler/icons-react";

// The funnels of the lists' column headers: a choice list, or a text to
// type. Every list takes them (Support, Projets, Assets, Entrepôts…).

/** A funnel option: "all" means "no filter". */
export interface FilterOption {
  value: string;
  label: string;
  /** A line under the option: it closes a group of its own. */
  divider?: boolean;
}

export const ALL_OPTION = "all";

/**
 * The funnel of a choice list. It is colored as long as it retains something.
 * The declared asset lists take it too (DeclaredAssetsList).
 */
export function ChoiceFilter({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: FilterOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  const active = value !== ALL_OPTION;
  return (
    <Menu position="bottom-end" withinPortal shadow="md">
      <Menu.Target>
        <ActionIcon
          variant={active ? "light" : "subtle"}
          color={active ? "teal" : "gray"}
          size="sm"
          aria-label={`Filtrer par ${label}`}
        >
          <IconFilter size={14} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        {/* The thin bar of the application's other lists, against the
            dropdown's right edge: the scroll area takes in its padding
            (Menu, 4px) and gives it back inside. */}
        <ScrollArea.Autosize mah={360} type="auto" scrollbars="y" scrollbarSize={2} mx={-4}>
          <div style={{ padding: "0 4px" }}>
            {options.map((option) => (
              <Fragment key={option.value}>
              <Menu.Item
                onClick={() => onChange(option.value)}
                leftSection={
                  option.value === value ? <IconCheck size={14} /> : <span style={{ width: 14 }} />
                }
              >
                {option.label}
              </Menu.Item>
              {option.divider && <Menu.Divider />}
              </Fragment>
            ))}
          </div>
        </ScrollArea.Autosize>
      </Menu.Dropdown>
    </Menu>
  );
}

/** The funnel of a text column: you type what you are looking for. */
export function TextFilter({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** In place of "Rechercher un <label>": a feminine noun, an example… */
  placeholder?: string;
}) {
  const active = value.trim() !== "";
  return (
    <Popover position="bottom-end" withinPortal shadow="md" trapFocus radius={0}>
      <Popover.Target>
        <ActionIcon
          variant={active ? "light" : "subtle"}
          color={active ? "teal" : "gray"}
          size="sm"
          aria-label={`Filtrer par ${label}`}
        >
          <IconFilter size={14} />
        </ActionIcon>
      </Popover.Target>
      <Popover.Dropdown>
        <TextInput
          size="xs"
          radius={0}
          leftSection={<IconSearch size={14} />}
          // Only with something typed: it empties the search.
          rightSection={
            value !== "" && (
              <CloseButton size="sm" aria-label="Effacer la recherche" onClick={() => onChange("")} />
            )
          }
          placeholder={placeholder ?? `Rechercher un ${label}`}
          value={value}
          onChange={(e) => onChange(e.currentTarget.value)}
          data-autofocus
          w={220}
        />
      </Popover.Dropdown>
    </Popover>
  );
}
