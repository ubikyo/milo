import {
  Button,
  Checkbox,
  Combobox,
  Divider,
  Group,
  Input,
  InputBase,
  useCombobox,
} from "@mantine/core";
import { IconChevronDown } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

// Several sections picked at once, for the row being added (SectionRights):
// a box each — and "all" above them, apart —, then "Ajouter". Closing the list
// also adds what is checked; left with nothing checked, the row goes away.

/** The "all" entry's value: no section's. */
const ALL = "\u0000all";

interface SectionsPickerProps {
  /** Those that can still be added, in their order. */
  choices: { value: string; label: string }[];
  /** "Tous les tableaux". */
  allLabel: string;
  /** How many are checked, in the field: "2 tableaux". */
  countLabel: (n: number) => string;
  /** The checked sections, once done; none: the row is left. */
  onDone: (values: string[]) => void;
  style?: CSSProperties;
  inputStyle?: CSSProperties;
  "aria-label"?: string;
}

export default function SectionsPicker({
  choices,
  allLabel,
  countLabel,
  onDone,
  style,
  inputStyle,
  "aria-label": ariaLabel,
}: SectionsPickerProps) {
  const [checked, setChecked] = useState<string[]>([]);
  // Read by the list's closing, whichever render it closes in.
  const current = useRef(checked);
  useEffect(() => {
    current.current = checked;
  }, [checked]);
  // Done once: closing the list after "Ajouter" adds nothing more.
  const done = useRef(false);

  const finish = (values: string[]) => {
    if (done.current) return;
    done.current = true;
    onDone(values);
  };

  const combobox = useCombobox({
    onDropdownClose: () => finish(current.current),
  });

  const allChecked = choices.length > 0 && checked.length === choices.length;
  const toggle = (value: string) =>
    setChecked((before) =>
      value === ALL
        ? allChecked
          ? []
          : choices.map((c) => c.value)
        : before.includes(value)
          ? before.filter((v) => v !== value)
          : // In the order of the choices.
            choices.map((c) => c.value).filter((v) => v === value || before.includes(v)),
    );

  /** An entry: its box, then its label — the click toggles both. */
  const option = (value: string, label: string, isChecked: boolean, indeterminate = false) => (
    <Combobox.Option value={value} key={value}>
      <Group gap="sm" wrap="nowrap">
        <Checkbox
          size="xs"
          color="teal"
          checked={isChecked}
          indeterminate={indeterminate}
          readOnly
          tabIndex={-1}
          aria-hidden
          style={{ pointerEvents: "none" }}
        />
        <span>{label}</span>
      </Group>
    </Combobox.Option>
  );

  return (
    <Combobox
      store={combobox}
      onOptionSubmit={toggle}
      withinPortal
      shadow="md"
      width={280}
      position="bottom-start"
    >
      <Combobox.Target>
        <InputBase
          component="button"
          type="button"
          size="sm"
          pointer
          autoFocus
          aria-label={ariaLabel}
          style={style}
          styles={{ input: { ...inputStyle, cursor: "pointer" } }}
          rightSection={<IconChevronDown size={14} />}
          rightSectionPointerEvents="none"
          onClick={() => combobox.toggleDropdown()}
          // Left without opening the list: the row goes away.
          onBlur={() => !combobox.dropdownOpened && finish([])}
        >
          {checked.length > 0 ? (
            countLabel(checked.length)
          ) : (
            <Input.Placeholder>Choisir</Input.Placeholder>
          )}
        </InputBase>
      </Combobox.Target>

      <Combobox.Dropdown>
        <Combobox.Options>
          {option(ALL, allLabel, allChecked, checked.length > 0 && !allChecked)}
          <Divider my={4} />
          {choices.map((c) => option(c.value, c.label, checked.includes(c.value)))}
        </Combobox.Options>
        <Combobox.Footer>
          <Group justify="flex-end">
            <Button
              size="xs"
              color="teal"
              disabled={checked.length === 0}
              // The press would take the focus from the field, before the click.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                finish(checked);
                combobox.closeDropdown();
              }}
            >
              Ajouter
            </Button>
          </Group>
        </Combobox.Footer>
      </Combobox.Dropdown>
    </Combobox>
  );
}
