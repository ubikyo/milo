import { Alert, Group, Select, Stack, Switch, Text } from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import { NOTIFICATION_EMAIL_DELAYS, NOTIFICATION_SCOPES } from "@milo/shared";
import type {
  NotificationEmailMode,
  NotificationRights,
  NotificationScope,
  NotificationSettings,
  OwnActionsChannel,
} from "@milo/shared";

// The "Notifications" tab of the preferences: how this person is notified.
// Like the rest of the preferences, nothing is saved before "Enregistrer".

const MODES: { value: NotificationEmailMode; label: string }[] = [
  { value: "immediate", label: "directe" },
  { value: "grouped", label: "groupée" },
];

const CHANNELS: { value: OwnActionsChannel; label: string }[] = [
  { value: "screen", label: "à l'écran" },
  { value: "email", label: "par e-mail" },
  { value: "both", label: "à l'écran et par e-mail" },
];

// The selects on a switch's line are a little lower than Mantine's: two such
// lines in a row, at the switches' spacing, would make them overlap.
const INLINE_SELECT = { input: { height: 28, minHeight: 28 } };

/**
 * The extended notifications add those of the edit mode and of Paramétrage
 * to those of production, which everyone receives.
 */
const EXTENDED_SCOPES: NotificationScope[] = NOTIFICATION_SCOPES.map((s) => s.value);
const BASIC_SCOPES: NotificationScope[] = ["production"];

// The delay set outside the list — by MILO_NOTIFY_WINDOW_MINUTES — takes its
// place there.
const delays = (current: number) =>
  [...new Set([...NOTIFICATION_EMAIL_DELAYS, current])]
    .sort((a, b) => a - b)
    .map((m) => ({ value: String(m), label: `${m} min` }));

interface NotificationPreferencesProps {
  value: NotificationSettings;
  onChange: (change: Partial<NotificationSettings>) => void;
  /** What their workspace grants them (Accès): a switch without the right is not shown. */
  rights: NotificationRights;
}

export default function NotificationPreferences({
  value,
  onChange,
  rights,
}: NotificationPreferencesProps) {
  // Only the channels their workspace grants them; a stored one they no
  // longer have shows the first remaining.
  const channels = CHANNELS.filter((c) =>
    c.value === "both" ? rights.screen && rights.email : rights[c.value],
  );
  const channel = channels.find((c) => c.value === value.ownActionsChannel) ?? channels[0];
  // Extended: more than production is received.
  const extended = value.scopes.some((s) => s !== "production");

  return (
    <Stack gap="sm" data-controls>
      {rights.screen && (
        <Switch
          label="Notifications à l'écran"
          checked={value.toasts}
          onChange={(e) => onChange({ toasts: e.currentTarget.checked })}
          color="teal"
        />
      )}
      {/* The sending mode and the grouping delay on the switch's line, read
          as a sentence: "Notifications par e-mail [groupée] sous [10 min]".
          They sit in a zero-height row, centred on the switch and
          overflowing it: the line keeps the switch's height. */}
      {rights.email && (
        <Group gap="sm" wrap="nowrap">
          <Switch
            label="Notifications par e-mail"
            checked={value.email}
            onChange={(e) => onChange({ email: e.currentTarget.checked })}
            color="teal"
          />
          {value.email && (
            <Group h={0} gap="sm" wrap="nowrap">
              <Select
                aria-label="Envoi"
                data={MODES}
                value={value.emailMode}
                onChange={(v) => v && onChange({ emailMode: v as NotificationEmailMode })}
                allowDeselect={false}
                w={110}
                styles={INLINE_SELECT}
              />
              {value.emailMode === "grouped" && (
                <>
                  <Text size="sm">sous</Text>
                  <Select
                    aria-label="Délai de regroupement"
                    data={delays(value.emailDelayMinutes)}
                    value={String(value.emailDelayMinutes)}
                    onChange={(v) => v && onChange({ emailDelayMinutes: Number(v) })}
                    allowDeselect={false}
                    w={100}
                    styles={INLINE_SELECT}
                  />
                </>
              )}
            </Group>
          )}
        </Group>
      )}
      {/* Read as a sentence too: "Notifier mes propres actions [à l'écran]". */}
      {channel && (
        <Group gap="sm" wrap="nowrap">
          <Switch
            label="Notifier mes propres actions"
            checked={value.ownActions}
            onChange={(e) => onChange({ ownActions: e.currentTarget.checked })}
            color="teal"
            // The switch and its select stay on one line.
            style={{ flexShrink: 0 }}
            styles={{ label: { whiteSpace: "nowrap" } }}
          />
          {value.ownActions && (
            <Group h={0} wrap="nowrap">
              <Select
                aria-label="Canal de mes propres actions"
                data={channels}
                value={channel.value}
                onChange={(v) => v && onChange({ ownActionsChannel: v as OwnActionsChannel })}
                allowDeselect={false}
                w={200}
                styles={INLINE_SELECT}
              />
            </Group>
          )}
        </Group>
      )}
      {/* The kinds of notifications received — the others are neither shown
          nor sent: production only, or, extended, the edit mode and
          Paramétrage too. */}
      {(rights.screen || rights.email) && (
        <Switch
          label="Activer les notifications étendues"
          checked={extended}
          onChange={(e) =>
            onChange({ scopes: e.currentTarget.checked ? EXTENDED_SCOPES : BASIC_SCOPES })
          }
          color="teal"
        />
      )}
      {rights.email && (
        <Alert
          mt={40}
          variant="default"
          color="blue"
          title="Notifications groupées"
          icon={<IconInfoCircle size={18} />}
        >
          Les notifications groupées concernent uniquement les ajouts ou modifications
          réalisés dans les widgets de Milo. Les ajouts d’utilisateurs ou de partages,
          ainsi que les autres modifications administratives, les alertes et les
          échéances, sont envoyés directement.
        </Alert>
      )}
    </Stack>
  );
}
