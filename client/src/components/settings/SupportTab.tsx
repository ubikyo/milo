import { Group, NumberInput, Stack } from "@mantine/core";
import { IconMessageReply, IconSignature } from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";
import {
  SUPPORT_CONTENT_EVENTS,
  SUPPORT_DUE_DAYS_MAX,
  SUPPORT_REPLY_EVENTS,
} from "@milo/shared";
import type { SupportLabel } from "@milo/shared";
import { api } from "../../api";
import { errorMessage, notifyError } from "../../lib/errors";
import NewMessageLabels from "./NewMessageLabels";
import SupportTemplates from "./SupportTemplates";

// The "Support" section of Settings ("Paramétrage"): what a request arriving
// by e-mail receives automatically — a due date, in business days, and labels.
// As in the Developer tab, values are sent to the server right away:
// the due date on leaving the field, the labels on each checkbox.
//
// Next come the automatic notifications — the replies an event
// sends automatically to the sender —, then the default contents, which are
// dropped into the editor of a team reply: a signature…
interface SupportTabProps {
  canEdit: boolean;
}

export default function SupportTab({ canEdit }: SupportTabProps) {
  const [days, setDays] = useState<number | null>(null);
  const [saved, setSaved] = useState<number | null>(null);
  // The Support labels, and those an e-mail receives automatically.
  const [labels, setLabels] = useState<SupportLabel[]>([]);
  const [labelIds, setLabelIds] = useState<string[]>([]);

  const reloadLabels = useCallback(async () => {
    try {
      setLabels(await api.getSupportLabels());
    } catch (e) {
      notifyError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    api
      .getSupportSettings()
      .then((r) => {
        setDays(r.default_due_days);
        setSaved(r.default_due_days);
        setLabelIds(r.default_label_ids.map(String));
      })
      .catch((e) => notifyError(errorMessage(e)));
    void reloadLabels();
  }, [reloadLabels]);

  const selectLabels = async (ids: string[]) => {
    const before = labelIds;
    setLabelIds(ids);
    try {
      const r = await api.updateSupportSettings({
        default_label_ids: ids.map(Number),
      });
      setLabelIds(r.default_label_ids.map(String));
    } catch (e) {
      notifyError(errorMessage(e));
      setLabelIds(before);
    }
  };

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
      {/* The labels a ticket received by e-mail gets automatically, on its
          own row and full width, like the lists that follow. */}
      <NewMessageLabels
        labels={labels}
        value={labelIds}
        onChange={(ids) => void selectLabels(ids)}
        canEdit={canEdit}
      />
      <SupportTemplates
        label="Notifications automatiques"
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
      />
    </Stack>
  );
}
