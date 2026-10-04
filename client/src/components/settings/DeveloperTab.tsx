import { Stack, Switch } from "@mantine/core";
import { useState } from "react";
import { api } from "../../api";
import { errorMessage, notifyError } from "../../lib/errors";

// La section « Développeur » du Paramétrage. Comme les autres onglets, chaque
// geste part aussitôt au serveur.
interface DeveloperTabProps {
  debug: boolean;
  onDebugChange: (debug: boolean) => void;
  canEdit: boolean;
}

export default function DeveloperTab({ debug, onDebugChange, canEdit }: DeveloperTabProps) {
  const [ongoing, setInProgress] = useState(false);

  const toggle = async (value: boolean) => {
    setInProgress(true);
    try {
      const settings = await api.updateDeveloperSettings({ debug: value });
      onDebugChange(settings.debug);
    } catch (e) {
      notifyError(errorMessage(e));
    } finally {
      setInProgress(false);
    }
  };

  return (
    <Stack gap="sm">
      <Switch
        label="Debug"
        checked={debug}
        onChange={(e) => toggle(e.currentTarget.checked)}
        disabled={!canEdit || ongoing}
        color="teal"
      />
    </Stack>
  );
}
