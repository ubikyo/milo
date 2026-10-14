import { Stack, Switch } from "@mantine/core";
import { useState } from "react";
import { useDisplaySettings } from "../../lib/displaySettings";
import { setThemeEditor, useThemeEditor } from "../../lib/themeEditor";
import ThemeList from "./ThemeList";
import { errorMessage, notifyError } from "../../lib/errors";
import type { DisplaySettings } from "@milo/shared";

// The "Affichage" section of Settings ("Paramétrage"). Like the other tabs,
// each action is sent to the server right away.

interface DisplayTabProps {
  canEdit: boolean;
  /** The "Thèmes" right, on top of "Modifier": the theme editor's switch. */
  canEditThemes: boolean;
}

export default function DisplayTab({ canEdit, canEditThemes }: DisplayTabProps) {
  const { settings, update } = useDisplaySettings();
  const themeEditor = useThemeEditor();
  // "Labo" > "Thèmes" off: neither the themes' list nor their editor.
  const themes = canEditThemes && settings.labThemes;
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
    // The space between its lists is the themes' ("Formulaire" > "Liste" > "Marge basse").
    <Stack gap="xl" data-settings-lists>
      {themes && <ThemeList />}

      <Stack gap="sm" data-controls>
        {/* This browser's alone: no saving, the panels open and close at once. */}
        {themes && (
          <Switch
            label="Activer l'éditeur de thèmes"
            checked={themeEditor}
            onChange={(e) => setThemeEditor(e.currentTarget.checked)}
            color="teal"
          />
        )}
        <Switch
          label="Afficher les gravatars"
          checked={settings.showGravatars}
          onChange={(e) => change({ showGravatars: e.currentTarget.checked })}
          disabled={!canEdit || ongoing}
          color="teal"
        />
      </Stack>
    </Stack>
  );
}
