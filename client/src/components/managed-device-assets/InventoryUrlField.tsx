import { ActionIcon, CopyButton, TextInput, Tooltip } from "@mantine/core";
import { IconCheck, IconCopy } from "@tabler/icons-react";
import { widgetReference } from "@milo/shared";

// The address a GLPI agent is given to send its inventories to this widget:
// "/api/inventory/<its reference>" — "6WF6", as its drawer shows "#6WF6", the
// "#" left out: a URL would drop what follows it (server,
// routes/managed-device-assets.ts).
// The workstations it sends come here, whatever their tag. Shown read-only,
// with a button that copies it.

export default function InventoryUrlField({ config }: { config: unknown }) {
  const reference = widgetReference("managed_device_asset.list", config).replace(/^#/, "");
  const url = reference ? `${window.location.origin}/api/inventory/${reference}` : "";
  return (
    <TextInput
      label="Adresse du collecteur"
      value={url}
      placeholder="Disponible une fois le widget enregistré"
      readOnly
      onFocus={(e) => e.currentTarget.select()}
      styles={{ input: { fontFamily: "var(--mantine-font-family-monospace)" } }}
      rightSection={
        url ? (
          <CopyButton value={url}>
            {({ copied, copy }) => (
              <Tooltip label={copied ? "Copié" : "Copier"} withArrow>
                <ActionIcon
                  variant="subtle"
                  color={copied ? "teal" : "gray"}
                  onClick={copy}
                  aria-label="Copier l'adresse"
                >
                  {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                </ActionIcon>
              </Tooltip>
            )}
          </CopyButton>
        ) : null
      }
    />
  );
}
