import { Input, Stack, Switch } from "@mantine/core";
import { useState } from "react";
import { useDisplaySettings } from "../../lib/displaySettings";
import { errorMessage, notifyError } from "../../lib/errors";
import type { DisplaySettings } from "@milo/shared";

// The "Labo" section of Settings ("Paramétrage"): the features still in
// development, each behind its switch, off by default. Like the other tabs,
// each action is sent to the server right away.

interface LabTabProps {
  canEdit: boolean;
}

export default function LabTab({ canEdit }: LabTabProps) {
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
    <Stack gap="xl" data-settings-lists>
      <Input.Wrapper label="Fonctionnalités">
        <Stack gap="sm" mt="xs" data-controls>
          {/* Off: "Affichage" hides the themes and their editor, the profile its theme. */}
          <Switch
            label="Thèmes"
            checked={settings.labThemes}
            onChange={(e) => change({ labThemes: e.currentTarget.checked })}
            disabled={!canEdit || ongoing}
            color="teal"
          />
          {/* Off: the tabs neither list nor manage the sub-views. */}
          <Switch
            label="Sous vue"
            checked={settings.labSubviews}
            onChange={(e) => change({ labSubviews: e.currentTarget.checked })}
            disabled={!canEdit || ongoing}
            color="teal"
          />
        </Stack>
      </Input.Wrapper>
    </Stack>
  );
}
