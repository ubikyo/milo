import { ActionIcon, Group, Switch, Text } from "@mantine/core";
import { IconRestore } from "@tabler/icons-react";
import { useState } from "react";
import type { ReactNode } from "react";
import classes from "../../assets/styles/ResetDefaults.module.css";
import DeleteConfirmModal from "./DeleteConfirmModal";

// The button at the right of a drawer section's title — "Colonnes",
// "Étiquettes", "Types de périphérique"… — that brings back the values Milo
// gives a new widget. Its window asks first whether the existing values are
// replaced: then what differs from the defaults goes; otherwise it stays, and
// only the defaults missing or changed are put back. Nothing is sent: the
// section's draft changes, and goes with "Sauvegarder".

interface ResetDefaultsProps {
  /** What is reset, as the window names it: "les colonnes". */
  what: string;
  /** Applies the defaults to the draft; "replace": the existing values that differ go. */
  onReset: (replace: boolean) => void;
}

export function ResetDefaults({ what, onReset }: ResetDefaultsProps) {
  const [opened, setOpened] = useState(false);
  const [replace, setReplace] = useState(false);
  const label = `Réinitialiser ${what}`;
  const close = () => {
    setOpened(false);
    setReplace(false);
  };

  return (
    <>
      <ActionIcon variant="transparent" className={classes.button} size={20} onClick={() => setOpened(true)} aria-label={label}>
        <IconRestore size={16} />
      </ActionIcon>
      <DeleteConfirmModal
        opened={opened}
        onClose={close}
        onConfirm={() => {
          onReset(replace);
          close();
        }}
        title={label}
        message={`Les valeurs par défaut de Milo seront remises. Rien n'est enregistré avant « Sauvegarder ».`}
        confirmLabel="Réinitialiser"
      >
        <Switch
          mt="md"
          label="Remplacer les valeurs existantes ?"          checked={replace}
          onChange={(e) => setReplace(e.currentTarget.checked)}
        />
      </DeleteConfirmModal>
    </>
  );
}

/**
 * A section's title with its reset button at the right: an Input.Wrapper's
 * label, with labelElement "div" and RESET_LABEL_STYLE so that it spans the
 * width. Without "reset", the title alone.
 */
export function ResetTitle({ title, reset }: { title: ReactNode; reset?: ResetDefaultsProps }) {
  if (!reset) return <>{title}</>;
  return (
    <Group justify="space-between" wrap="nowrap" gap="xs">
      <Text inherit span>
        {title}
      </Text>
      <ResetDefaults {...reset} />
    </Group>
  );
}

/** The label style that lets ResetTitle span the section. */
export const RESET_LABEL_STYLE = { display: "block", width: "100%" } as const;

export type { ResetDefaultsProps };
