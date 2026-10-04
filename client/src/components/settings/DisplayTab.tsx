import { Stack, Switch } from "@mantine/core";
import { useState } from "react";
import { useDisplaySettings } from "../../lib/displaySettings";
import { errorMessage, notifyError } from "../../lib/errors";
import type { DisplaySettings } from "@milo/shared";

// The "Affichage" section of Settings ("Paramétrage"). Like the other tabs,
// each action is sent to the server right away.

interface DisplayTabProps {
  canEdit: boolean;
}

export default function DisplayTab({ canEdit }: DisplayTabProps) {
  const { settings, update } = useDisplaySettings();
  const [ongoing, setInProgress] = useState(false);

  const change = async (change: Partial<DisplaySettings>) => {
    setInProgress(true);
    try {
      await update(change);
    } catch (e) {
      notifyError(errorMessage(e));
    } finally {
      setInProgress(false);
    }
  };

  return (
    <Stack gap="sm">
      <Switch
        label="Masquer le logo dans la barre d'onglets"
        checked={settings.hideLogo}
        onChange={(e) => change({ hideLogo: e.currentTarget.checked })}
        disabled={!canEdit || ongoing}
        color="teal"
      />
    </Stack>
  );
}
