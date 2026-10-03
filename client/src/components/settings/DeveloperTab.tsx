import { Stack, Switch } from "@mantine/core";
import { useState } from "react";
import { api } from "../../api";
import { messageErreur, notifierErreur } from "../../lib/errors";

// La section « Développeur » du Paramétrage. Comme les autres onglets, chaque
// geste part aussitôt au serveur.
interface DeveloperTabProps {
  debug: boolean;
  onDebugChange: (debug: boolean) => void;
  canEdit: boolean;
}

export default function DeveloperTab({ debug, onDebugChange, canEdit }: DeveloperTabProps) {
  const [enCours, setEnCours] = useState(false);

  const basculer = async (valeur: boolean) => {
    setEnCours(true);
    try {
      const reglages = await api.updateDeveloperSettings({ debug: valeur });
      onDebugChange(reglages.debug);
    } catch (e) {
      notifierErreur(messageErreur(e));
    } finally {
      setEnCours(false);
    }
  };

  return (
    <Stack gap="sm">
      <Switch
        label="Debug"
        checked={debug}
        onChange={(e) => basculer(e.currentTarget.checked)}
        disabled={!canEdit || enCours}
        color="teal"
      />
    </Stack>
  );
}
