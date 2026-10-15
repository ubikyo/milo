import { Stack, Text, UnstyledButton } from "@mantine/core";

// What a choice offers when what is typed is not found — a supplier, a
// product —: "Créer « … »" and "Créer et modifier « … »". Its dropdown may
// widen beyond its field to show them (wideDropdown).

/** The widest a choice's dropdown grows to show what it lists. */
const DROPDOWN_MAX = 300;

/**
 * A choice's dropdown as wide as what it lists — never narrower than its
 * field ("fieldWidth"), and up to DROPDOWN_MAX beyond it —, at its start.
 */
export const wideDropdown = (fieldWidth = 0) => ({
  comboboxProps: { width: "max-content" as const, position: "bottom-start" as const },
  styles: { dropdown: { minWidth: fieldWidth, maxWidth: Math.max(fieldWidth, DROPDOWN_MAX) } },
});

/**
 * A choice's dropdown when what is typed is not found: "Créer « … »" and
 * "Créer et modifier « … »", "edit" true for the second.
 */
export default function CreateFromSearch({
  typed,
  onCreate,
}: {
  typed: string;
  onCreate: (edit: boolean) => void;
}) {
  return (
    <Stack gap={0} align="stretch" ta="left">
      {[false, true].map((edit) => (
        <UnstyledButton
          key={String(edit)}
          // The field keeps its focus: the dropdown stays until the choice.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onCreate(edit)}
          px={10}
          py={6}
          data-row
        >
          <Text size="sm" c="var(--mantine-color-text)">
            {edit ? `Créer et modifier « ${typed} »` : `Créer « ${typed} »`}
          </Text>
        </UnstyledButton>
      ))}
    </Stack>
  );
}
