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
import NewMessageLabels from "./EtiquettesNouveauMessage";
import SupportTemplates from "./SupportTemplates";

// La section « Support » du Paramétrage : ce que reçoit d'office une demande
// qui arrive par e-mail — une échéance, en jours ouvrés, et des étiquettes.
// Comme à l'onglet Développeur, les valeurs partent au serveur aussitôt :
// l'échéance en quittant le champ, les étiquettes à chaque coche.
//
// Suivent les notifications automatiques — les réponses qu'un évènement
// envoie d'office à l'expéditeur —, puis les contenus par défaut, qui se
// posent dans l'éditeur d'une réponse de l'équipe : une signature…
interface SupportTabProps {
  canEdit: boolean;
}

export default function SupportTab({ canEdit }: SupportTabProps) {
  const [days, setDays] = useState<number | null>(null);
  const [saved, setSaved] = useState<number | null>(null);
  // Les étiquettes du Support, et celles qu'un e-mail reçoit d'office.
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
      {/* Les réglages d'une valeur côte à côte, chacun à sa largeur ; les
          notifications, plus bas, prennent toute celle du panneau. */}
      <Group gap="xl" align="flex-start" wrap="nowrap">
        {/* Le libellé au-dessus du champ, comme dans les fiches. */}
        <NumberInput
          label="Échéance par défaut"
          // La largeur porte sur la saisie seule : le libellé garde la sienne.
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
      {/* Les étiquettes qu'un ticket arrivé par e-mail reçoit d'office, à la
          ligne et sur toute la largeur, comme les listes qui suivent. */}
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
        // Partie d'office, une notification n'a personne qui l'écrit.
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
