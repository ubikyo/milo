import { Group, NumberInput, Stack } from "@mantine/core";
import { IconMessageReply, IconSignature } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import {
  CURSOR_VARIABLE,
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
/** A predefined reply's variable beyond Support's: where the cursor goes. */
const CONTENT_VARIABLES = [CURSOR_VARIABLE];

interface SupportOptionsProps {
  canEdit: boolean;
  /**
   * What it shows: the due date ("settings"), or the replies — automatic and
   * predefined ("replies") —, which the drawer places after the templates.
   */
  part: "settings" | "replies";
}

export default function SupportOptions({ canEdit, part }: SupportOptionsProps) {
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

  if (part === "replies") {
    return (
      <Stack gap="xl">
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
          variableGroups={["Demandeur", "Ticket"]}
          // Sent as the request's automatic reply.
          previewTemplate="support_auto_reply"
        />
        <SupportTemplates
          label="Réponses pré-définies"
          events={SUPPORT_CONTENT_EVENTS}
          load={api.getSupportContents}
          create={api.createSupportContent}
          updateStatement={api.updateSupportContent}
          remove={api.deleteSupportContent}
          addTitle="Ajouter une réponse pré-définie"
          entityLabel="la réponse"
          emptyIcon={IconSignature}
          emptyText="Aucune réponse pré-définie pour le moment"
          canEdit={canEdit}
          onError={notifyError}
          // Dropped into a team reply.
          previewTemplate="support_reply"
          // Where the cursor goes, once dropped in.
          extraVariables={CONTENT_VARIABLES}
          // Several contents per reply, placed in the list's order.
          uniqueEvents={false}
          reorder={api.reorderSupportContents}
        />
      </Stack>
    );
  }

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
    </Stack>
  );
}
