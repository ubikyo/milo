import { Group, Select, Stack, Switch } from "@mantine/core";
import { useEffect, useState } from "react";
import { NOTIFICATION_EMAIL_DELAYS } from "@milo/shared";
import type { NotificationEmailMode, NotificationSettings } from "@milo/shared";
import { api } from "../../api";
import { messageErreur, notifierErreur } from "../../lib/errors";

// La section « Notifications » du Paramétrage. Comme les autres onglets,
// chaque geste part aussitôt au serveur.

const MODES: { value: NotificationEmailMode; label: string }[] = [
  { value: "immediate", label: "À chaque évènement" },
  { value: "grouped", label: "De manière groupée" },
];

// Le délai réglé hors de la liste — par MILO_NOTIFY_WINDOW_MINUTES — y
// prend sa place.
const delais = (actuel: number) =>
  [...new Set([...NOTIFICATION_EMAIL_DELAYS, actuel])]
    .sort((a, b) => a - b)
    .map((m) => ({ value: String(m), label: `${m} min` }));

interface NotificationsTabProps {
  canEdit: boolean;
}

export default function NotificationsTab({ canEdit }: NotificationsTabProps) {
  const [reglages, setReglages] = useState<NotificationSettings | null>(null);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    api.getNotificationSettings().then(setReglages, (e) => notifierErreur(messageErreur(e)));
  }, []);

  const changer = async (modif: Partial<NotificationSettings>) => {
    setEnCours(true);
    try {
      setReglages(await api.updateNotificationSettings(modif));
    } catch (e) {
      notifierErreur(messageErreur(e));
    } finally {
      setEnCours(false);
    }
  };

  if (!reglages) return null;
  const fige = !canEdit || enCours;

  return (
    <Stack gap="sm">
      <Switch
        label="Notifications à l'écran"
        checked={reglages.toasts}
        onChange={(e) => changer({ toasts: e.currentTarget.checked })}
        disabled={fige}
        color="teal"
      />
      <Switch
        label="Notifications par e-mail"
        checked={reglages.email}
        onChange={(e) => changer({ email: e.currentTarget.checked })}
        disabled={fige}
        color="teal"
      />
      {reglages.email && (
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
            value={reglages.emailMode}
            onChange={(v) => v && changer({ emailMode: v as NotificationEmailMode })}
            allowDeselect={false}
            disabled={fige}
            w={120}
          />
          {reglages.emailMode === "grouped" && (
            <Select
              label="Délai de regroupement"
              data={delais(reglages.emailDelayMinutes)}
              value={String(reglages.emailDelayMinutes)}
              onChange={(v) => v && changer({ emailDelayMinutes: Number(v) })}
              allowDeselect={false}
              disabled={fige}
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
