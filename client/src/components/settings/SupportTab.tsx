import { Group, NumberInput, Stack, Text } from "@mantine/core";
import { useEffect, useState } from "react";
import { SUPPORT_DUE_DAYS_MAX } from "@milo/shared";
import { api } from "../../api";
import { messageErreur } from "../../lib/errors";
import ErrorAlert from "../ui/ErrorAlert";

// La section « Support » du Paramétrage : l'échéance donnée d'office aux
// demandes qui arrivent par e-mail, en jours ouvrés. Comme à l'onglet
// Développeur, la valeur part au serveur aussitôt — ici en quittant le champ.
interface SupportTabProps {
  canEdit: boolean;
}

export default function SupportTab({ canEdit }: SupportTabProps) {
  const [jours, setJours] = useState<number | null>(null);
  const [enregistres, setEnregistres] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getSupportSettings()
      .then((r) => {
        setJours(r.default_due_days);
        setEnregistres(r.default_due_days);
      })
      .catch((e) => setError(messageErreur(e)));
  }, []);

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
    <Stack gap="sm" maw={420}>
      {error && <ErrorAlert onClose={() => setError(null)}>{error}</ErrorAlert>}
      {/* Le libellé à gauche, la valeur à droite, sur une seule ligne. */}
      <Group justify="space-between" wrap="nowrap">
        <Text size="sm" fw={500} component="label" htmlFor="support-echeance-defaut">
          Échéance par défaut
        </Text>
        <NumberInput
          id="support-echeance-defaut"
          w={120}
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
      </Group>
    </Stack>
  );
}
