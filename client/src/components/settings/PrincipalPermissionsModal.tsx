import { Button, Group, Input, Modal, Select, Stack, Text } from "@mantine/core";
import { useEffect, useState } from "react";
import { MODAL_PADDING, modalHeaderStyles } from "../../themes/modals";
import ListItems from "../ui/ListItems";
import { errorMessage, notifyError } from "../../lib/errors";
import type { EntraPrincipal } from "@milo/shared";
import CloseButton from "../ui/CloseButton";

// The permission choice, at the end of the row: wide enough to read "Modifier".
const CHOICE_WIDTH = 200;

// Field height: that of the text, like renaming a row
// (LookupManager).
const FIELD_HEIGHT = 22;

// The frameless choice, at text height, right-aligned: it fits in
// its row, like renaming a company.
const CHOICE_STYLES = {
  input: {
    height: FIELD_HEIGHT,
    minHeight: FIELD_HEIGHT,
    lineHeight: `${FIELD_HEIGHT}px`,
    textAlign: "right" as const,
  },
};

// "Aucun" cannot be a Select's empty value: it needs its own.
const NONE = "none";

/** A Select's choices, "Aucun" included under its own value. */
const choice = (options: readonly { value: string; label: string }[]) =>
  options.map((o) => ({ value: o.value || NONE, label: o.label }));

/** A permission: its name, and the choice of its value at the end of the row. */
export interface PermissionRow {
  name: string;
  options: readonly { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  /** It can be read but not changed. */
  disabled?: boolean;
  /** Its width when set inline in the row (PrincipalsPermissions). */
  width?: number;
}

/** Permissions that go together, under a label. */
export interface SectionPermissions {
  label: string;
  rows: PermissionRow[];
}

interface PrincipalPermissionsModalProps<T> {
  /** The user or group whose permissions are being set; "null" closes the modal. */
  principal: EntraPrincipal | null;
  /** Their current permissions: none for someone coming from the directory. */
  initial: T;
  /** The modal's sections, for the permissions being chosen. */
  sections: (permissions: T, change: (permissions: T) => void) => SectionPermissions[];
  /** Saves; a refusal keeps the modal open. */
  onSave: (permissions: T) => Promise<void>;
  onClose: () => void;
}

/**
 * The permissions of an Entra user or group: one list per section, one
 * permission per row, its choice at the end. What they are — the widget types
 * of a workspace, the application's administration — is up to the caller
 * (`sections`).
 */
export default function PrincipalPermissionsModal<T>({
  principal,
  initial,
  sections,
  onSave,
  onClose,
}: PrincipalPermissionsModalProps<T>) {
  const [permissions, setPermissions] = useState<T>(initial);
  const [saving, setSaving] = useState(false);

  // The current permissions are only re-read on opening: re-reading the list
  // while choosing would wipe the choices in progress.
  useEffect(() => {
    if (!principal) return;
    setPermissions(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [principal]);

  const save = async () => {
    if (!principal) return;
    setSaving(true);
    try {
      await onSave(permissions);
      onClose();
    } catch (e) {
      notifyError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  /** A row of the list: its name, and the choice of its permission at the end. */
  const row = ({ name, options, value, onChange, disabled }: PermissionRow) => (
    <ListItems.Row key={name}>
      <Text size="sm" truncate style={{ flex: 1, minWidth: 0 }}>
        {name}
      </Text>
      <Select
        aria-label={name}
        data={choice(options)}
        value={value || NONE}
        onChange={(value) => onChange(value === NONE || !value ? "" : value)}
        allowDeselect={false}
        disabled={disabled}
        variant="unstyled"
        size="sm"
        w={CHOICE_WIDTH}
        styles={CHOICE_STYLES}
      />
    </ListItems.Row>
  );

  return (
    <Modal
      opened={principal !== null}
      onClose={onClose}
      title={`Permissions — ${principal?.name ?? ""}`}
      centered
      size="lg"
      padding={MODAL_PADDING}
      withCloseButton={false}
      styles={modalHeaderStyles(MODAL_PADDING)}
    >
      {/* The same spacing as the drawer forms: "xl" between two
          fields, and Mantine's label above each. */}
      <Stack gap="xl">
        {sections(permissions, setPermissions).map((section) => (
          <Input.Wrapper key={section.label} label={section.label}>
            <ListItems maxRows={section.rows.length}>{section.rows.map(row)}</ListItems>
          </Input.Wrapper>
        ))}

        {/* The stack gap ("xl") is enough: the buttons land at the same
            distance as in the other modals (MODAL_PADDING). */}
        <Group justify="flex-end">
          <CloseButton onClick={onClose} />
          <Button color="teal" onClick={save} loading={saving}>
            Enregistrer
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
