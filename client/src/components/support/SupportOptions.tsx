import { Group, NumberInput, Stack } from "@mantine/core";
import { IconMessageReply, IconSignature } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import {
  SUPPORT_CONTENT_EVENTS,
  SUPPORT_DUE_DAYS_MAX,
  SUPPORT_REPLY_EVENTS,
} from "@milo/shared";
import { api } from "../../api";
import { errorMessage, notifyError } from "../../lib/errors";
import SupportTemplates from "../settings/SupportTemplates";

// Support's options, in the Tickets widget's drawer — they fall under the
// Paramétrage, and apply to every list: the due date a request arriving by
// e-mail receives automatically, in business days. Its labels are the list's
// own (NewMessageFields, widgets/support/list.tsx). Unlike the rest of the
// drawer, the due date is sent to the server right away, on leaving the field.
//
// Next come the automatic replies — the replies an event
// sends automatically to the sender —, then the default contents, which are
// dropped into the editor of a team reply: a signature…
interface SupportOptionsProps {
  canEdit: boolean;
}

export default function SupportOptions({ canEdit }: SupportOptionsProps) {
  const [days, setDays] = useState<number | null>(null);
  const [saved, setSaved] = useState<number | null>(null);
  useEffect(() => {
    api
      .getSupportSettings()
      .then((r) => {
        setDays(r.default_due_days);
        setSaved(r.default_due_days);
      })
      .catch((e) => notifyError(errorMessage(e)));
  }, []);

  const save = async () => {
    const value = days ?? 0;
    if (value === saved) return;
    try {
      const r = await api.updateSupportSettings({ default_due_days: value });
      setDays(r.default_due_days);
      setSaved(r.default_due_days);
    } catch (e) {
      notifyError(errorMessage(e));
      setDays(saved);
    }
  };

  return (
    <Stack gap="xl">
      {/* The settings of a value side by side, each at its own width; the
          notifications, further down, take the panel's full width. */}
      <Group gap="xl" align="flex-start" wrap="nowrap">
        {/* The label above the field, as in the forms. */}
        <NumberInput
          label="Échéance par défaut"
          // The width applies to the input alone: the label keeps its own.
          styles={{ wrapper: { width: 120 } }}
          suffix=" j"
          min={0}
          max={SUPPORT_DUE_DAYS_MAX}
          allowDecimal={false}
          allowNegative={false}
          clampBehavior="strict"
          value={days ?? ""}
          onChange={(v) =>
            setDays(typeof v === "number" ? v : v === "" ? 0 : Number(v))
          }
          onBlur={() => void save()}
          onKeyDown={(e) => {
            if (e.key === "Enter") void save();
          }}
          disabled={!canEdit || days === null}
        />
      </Group>
      <SupportTemplates
        label="Réponses automatiques"
        events={SUPPORT_REPLY_EVENTS}
        load={api.getSupportReplies}
        create={api.createSupportReply}
        updateStatement={api.updateSupportReply}
        remove={api.deleteSupportReply}
        addTitle="Ajouter une réponse"
        entityLabel="la réponse"
        emptyIcon={IconMessageReply}
        emptyText="Aucune réponse pour le moment"
        canEdit={canEdit}
        onError={notifyError}
        // Sent automatically, a notification has no one who writes it.
        variableGroups={["Expéditeur", "Demande"]}
        // Sent as the request's automatic reply.
        previewTemplate="support_auto_reply"
      />
      <SupportTemplates
        label="Contenus par défaut"
        events={SUPPORT_CONTENT_EVENTS}
        load={api.getSupportContents}
        create={api.createSupportContent}
        updateStatement={api.updateSupportContent}
        remove={api.deleteSupportContent}
        addTitle="Ajouter un contenu"
        entityLabel="le contenu"
        emptyIcon={IconSignature}
        emptyText="Aucun contenu pour le moment"
        canEdit={canEdit}
        onError={notifyError}
        // Dropped into a team reply.
        previewTemplate="support_reply"
      />
    </Stack>
  );
}
