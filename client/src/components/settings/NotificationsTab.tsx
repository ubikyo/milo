import { Group, Select, Stack, Switch, TextInput } from "@mantine/core";
import { useEffect, useState } from "react";
import { NOTIFICATION_EMAIL_DELAYS } from "@milo/shared";
import type { NotificationEmailMode, NotificationSettings } from "@milo/shared";
import { api } from "../../api";
import { errorMessage, notifyError } from "../../lib/errors";

// The "Notifications" section of Settings ("Paramétrage"). Like the other
// tabs, each action is sent to the server right away; the sending address
// when its field is left.

const MODES: { value: NotificationEmailMode; label: string }[] = [
  { value: "immediate", label: "À chaque évènement" },
  { value: "grouped", label: "De manière groupée" },
];

// The delay set outside the list — by MILO_NOTIFY_WINDOW_MINUTES — takes its
// place there.
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
  // The sending address belongs to the Entra settings: as saved, and as typed.
  const [sender, setSender] = useState("");
  const [typedSender, setTypedSender] = useState("");

  useEffect(() => {
    api.getNotificationSettings().then(setSettings, (e) => notifyError(errorMessage(e)));
    api.getEntraSettings().then(
      (r) => {
        setSender(r.mail_sender);
        setTypedSender(r.mail_sender);
      },
      (e) => notifyError(errorMessage(e)),
    );
  }, []);

  const saveSender = async () => {
    const address = typedSender.trim();
    if (address === sender) return setTypedSender(address);
    setInProgress(true);
    try {
      const saved = await api.updateEntraSettings({ mail_sender: address });
      setSender(saved.mail_sender);
      setTypedSender(saved.mail_sender);
    } catch (e) {
      // Refused, the field goes back to the saved address.
      notifyError(errorMessage(e));
      setTypedSender(sender);
    } finally {
      setInProgress(false);
    }
  };

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
      {/* The e-mail settings spaced like the Entra tab's fields. */}
      <Stack gap="xl">
        <Switch
          label="Notifications par e-mail"
          checked={settings.email}
          onChange={(e) => change({ email: e.currentTarget.checked })}
          disabled={frozen}
          color="teal"
        />
        {/* Where Milo's emails are sent from: notices, assignments, replies to
            the requests entered. A received request replies from its own
            mailbox. Shown even without e-mail notifications, for those. */}
        <TextInput
          label="Adresse d'envoi"
          type="email"
          placeholder="milo@…"
          value={typedSender}
          onChange={(e) => setTypedSender(e.currentTarget.value)}
          onBlur={() => void saveSender()}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") setTypedSender(sender);
          }}
          disabled={frozen}
          // Aligned with the switch label, like the settings below.
          pl="calc(38px + var(--mantine-spacing-sm))"
          w="calc(38px + var(--mantine-spacing-sm) + 240px)"
        />
        {settings.email && (
          <Group
            gap="md"
            // Aligned with the switch label: its track (38 px), then the gap
            // separating it from the label.
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
                // The label overflows the field instead of wrapping.
                styles={{ label: { whiteSpace: "nowrap" } }}
              />
            )}
          </Group>
        )}
      </Stack>
    </Stack>
  );
}
