import { NumberInput, Stack } from "@mantine/core";
import { useCallback, useEffect, useState } from "react";
import { SUPPORT_DUE_DAYS_MAX } from "@milo/shared";
import type { SupportLabel } from "@milo/shared";
import { api } from "../../api";
import { messageErreur } from "../../lib/errors";
import ErrorAlert from "../ui/ErrorAlert";
import LabelPicker, { SUPPORT_LABELS_API } from "../ui/LabelPicker";

// La section « Support » du Paramétrage : ce que reçoit d'office une demande
// qui arrive par e-mail — une échéance, en jours ouvrés, et des étiquettes.
// Comme à l'onglet Développeur, les valeurs partent au serveur aussitôt :
// l'échéance en quittant le champ, les étiquettes à chaque coche.
interface SupportTabProps {
  canEdit: boolean;
}

export default function SupportTab({ canEdit }: SupportTabProps) {
  const [jours, setJours] = useState<number | null>(null);
  const [enregistres, setEnregistres] = useState<number | null>(null);
  // Les étiquettes du Support, et celles qu'un e-mail reçoit d'office.
  const [etiquettes, setEtiquettes] = useState<SupportLabel[]>([]);
  const [labelIds, setLabelIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const relireEtiquettes = useCallback(async () => {
    try {
      setEtiquettes(await api.getSupportLabels());
    } catch (e) {
      setError(messageErreur(e));
    }
  }, []);

  useEffect(() => {
    api
      .getSupportSettings()
      .then((r) => {
        setJours(r.default_due_days);
        setEnregistres(r.default_due_days);
        setLabelIds(r.default_label_ids.map(String));
      })
      .catch((e) => setError(messageErreur(e)));
    void relireEtiquettes();
  }, [relireEtiquettes]);

  const choisirEtiquettes = async (ids: string[]) => {
    const avant = labelIds;
    setLabelIds(ids);
    setError(null);
    try {
      const r = await api.updateSupportSettings({
        default_label_ids: ids.map(Number),
      });
      setLabelIds(r.default_label_ids.map(String));
    } catch (e) {
      setError(messageErreur(e));
      setLabelIds(avant);
    }
  };

  const enregistrer = async () => {
    const valeur = jours ?? 0;
    if (valeur === enregistres) return;
    setError(null);
    try {
      const r = await api.updateSupportSettings({ default_due_days: valeur });
      setJours(r.default_due_days);
      setEnregistres(r.default_due_days);
    } catch (e) {
      setError(messageErreur(e));
      setJours(enregistres);
    }
  };

  return (
    <Stack gap="xl" maw={420}>
      {error && <ErrorAlert onClose={() => setError(null)}>{error}</ErrorAlert>}
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
        value={jours ?? ""}
        onChange={(v) => setJours(typeof v === "number" ? v : v === "" ? 0 : Number(v))}
        onBlur={() => void enregistrer()}
        onKeyDown={(e) => {
          if (e.key === "Enter") void enregistrer();
        }}
        disabled={!canEdit || jours === null}
      />
      {/* Les étiquettes sont communes à toutes les sociétés, comme dans la
          fiche d'une demande. Sans droit de modifier, le champ se lit
          seulement : le fieldset désactive ses boutons. */}
      <fieldset
        disabled={!canEdit}
        style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
      >
        <LabelPicker
          label="Étiquettes nouveau message"
          labels={etiquettes}
          value={labelIds}
          onChange={(ids) => void choisirEtiquettes(ids)}
          boardId={0}
          onLabelsChanged={relireEtiquettes}
          labelsApi={SUPPORT_LABELS_API}
          emptyText="Aucune étiquette"
        />
      </fieldset>
    </Stack>
  );
}
