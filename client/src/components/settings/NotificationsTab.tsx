import { Group, Select, Stack, Switch } from "@mantine/core";
import { useEffect, useState } from "react";
import { NOTIFICATION_EMAIL_DELAYS } from "@milo/shared";
import type { NotificationEmailMode, NotificationSettings } from "@milo/shared";
import { api } from "../../api";
import { errorMessage, notifyError } from "../../lib/errors";

// La section « Notifications » du Paramétrage. Comme les autres onglets,
// chaque geste part aussitôt au serveur.

const MODES: { value: NotificationEmailMode; label: string }[] = [
  { value: "immediate", label: "À chaque évènement" },
  { value: "grouped", label: "De manière groupée" },
];

// Le délai réglé hors de la liste — par MILO_NOTIFY_WINDOW_MINUTES — y
// prend sa place.
const delays = (current: number) =>
  [...new Set([...NOTIFICATION_EMAIL_DELAYS, current])]
    .sort((a, b) => a - b)
    .map((m) => ({ value: String(m), label: `${m} min` }));

interface NotificationsTabProps {
  canEdit: boolean;
}

export default function NotificationsTab({ canEdit }: NotificationsTabProps) {
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [ongoing, setInProgress] = useState(false);

  useEffect(() => {
    api.getNotificationSettings().then(setSettings, (e) => notifyError(errorMessage(e)));
  }, []);

  const change = async (change: Partial<NotificationSettings>) => {
    setInProgress(true);
    try {
      setSettings(await api.updateNotificationSettings(change));
    } catch (e) {
      notifyError(errorMessage(e));
    } finally {
      setInProgress(false);
    }
  };

  if (!settings) return null;
  const frozen = !canEdit || ongoing;

  return (
    <Stack gap="sm">
      <Switch
        label="Notifications à l'écran"
        checked={settings.toasts}
        onChange={(e) => change({ toasts: e.currentTarget.checked })}
        disabled={frozen}
        color="teal"
      />
      <Switch
        label="Notifications par e-mail"
        checked={settings.email}
        onChange={(e) => change({ email: e.currentTarget.checked })}
        disabled={frozen}
        color="teal"
      />
      {settings.email && (
        <Group
          gap="sm"
          // Aligné sur le libellé de l'interrupteur : sa piste (38 px), puis
          // l'écart qui l'en sépare.
          pl="calc(38px + var(--mantine-spacing-sm))"
          align="flex-end"
          wrap="nowrap"
        >
          <Select
            label="Envoi"
            data={MODES}
            value={settings.emailMode}
            onChange={(v) => v && change({ emailMode: v as NotificationEmailMode })}
            allowDeselect={false}
            disabled={frozen}
            w={120}
          />
          {settings.emailMode === "grouped" && (
            <Select
              label="Délai de regroupement"
              data={delays(settings.emailDelayMinutes)}
              value={String(settings.emailDelayMinutes)}
              onChange={(v) => v && change({ emailDelayMinutes: Number(v) })}
              allowDeselect={false}
              disabled={frozen}
              w={100}
              // Le libellé déborde du champ plutôt que de passer à la ligne.
              styles={{ label: { whiteSpace: "nowrap" } }}
            />
          )}
        </Group>
      )}
    </Stack>
  );
}
