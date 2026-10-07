import { Group, Slider, Stack, Switch } from "@mantine/core";
import { useEffect, useState } from "react";
import { useDisplaySettings } from "../../lib/displaySettings";
import { errorMessage, notifyError } from "../../lib/errors";
import type { DisplaySettings } from "@milo/shared";

// The "Affichage" section of Settings ("Paramétrage"). Like the other tabs,
// each action is sent to the server right away.

/**
 * The search's tolerance, from exact to anything: the marks name the steps
 * that change what is found (SearchBox, Fuse.js).
 */
const SEARCH_MARKS = [
  { value: 0, label: "Exact" },
  { value: 0.25, label: "Strict" },
  { value: 0.45, label: "Défaut" },
  { value: 0.7, label: "Large" },
  { value: 1, label: "Tout" },
];

interface DisplayTabProps {
  canEdit: boolean;
}

export default function DisplayTab({ canEdit }: DisplayTabProps) {
  const { settings, update } = useDisplaySettings();
  const [ongoing, setInProgress] = useState(false);
  // The slider moves freely; the value is sent when it is let go.
  const [threshold, setThreshold] = useState(settings.searchThreshold);
  useEffect(() => setThreshold(settings.searchThreshold), [settings.searchThreshold]);

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
        label="Afficher les gravatars"
        checked={settings.showGravatars}
        onChange={(e) => change({ showGravatars: e.currentTarget.checked })}
        disabled={!canEdit || ongoing}
        color="teal"
      />

      {/* The tolerance only matters once typing mistakes are forgiven: it
          sits beside the switch, and only shows with it. */}
      <Group gap="xl" align="flex-start" wrap="nowrap" pb="lg">
        <Switch
          label="Activer la recherche approximative"
          checked={settings.fuzzySearch}
          onChange={(e) => change({ fuzzySearch: e.currentTarget.checked })}
          disabled={!canEdit || ongoing}
          color="teal"
        />
        {/* The marks' labels are centered on their step: the inset leaves
            room for half of "Exact" and "Tout" at both ends. */}
        {settings.fuzzySearch && (
          <Slider
            flex={1}
            mx="md"
            maw={420}
            min={0}
            max={1}
            step={0.05}
            marks={SEARCH_MARKS}
            value={threshold}
            onChange={setThreshold}
            onChangeEnd={(value) => void change({ searchThreshold: value })}
            label={(value) => value.toFixed(2)}
            disabled={!canEdit || ongoing}
            color="teal"
          />
        )}
      </Group>
    </Stack>
  );
}
