import { Button, Group, Modal, Stack, TextInput } from "@mantine/core";
import { useCallback, useEffect, useState } from "react";
import { MODAL_PADDING, modalHeaderStyles } from "../../themes/modals";
import ErrorAlert from "../ui/ErrorAlert";
import { messageErreur } from "../../lib/errors";
import type { Company } from "@milo/shared";
import type { KeyboardEvent } from "react";
import BoutonFermer from "../ui/BoutonFermer";

const PREFIXE = "https://";

// Le retrait gauche d'un champ « sm » de Mantine (calc(36px / 3)) : le
// préfixe s'y pose, comme le texte d'un champ sans section.
const RETRAIT_CHAMP = 12;

// L'écart entre « https:// » et la saisie : tout juste de quoi ne pas coller
// les deux, sans casser l'impression d'une adresse d'un seul tenant.
const ECART_PREFIXE = 1;

/** Ce que le champ montre : l'adresse sans son préfixe, qui est imposé. */
const sansPrefixe = (url: string) => url.replace(/^https?:\/\//i, "");

interface CompanySupportModalProps {
  /** La société dont on règle le support ; « null » ferme la fenêtre. */
  company: Company | null;
  onClose: () => void;
  onSave: (
    data: Pick<Company, "support_email" | "support_url">,
  ) => Promise<unknown>;
}

/**
 * Le support d'une société : l'adresse à laquelle lui écrire et celle de son
 * site. Le site est toujours en https : le préfixe est posé dans le champ, on
 * ne tape que la suite — et s'il est collé avec, il est retiré.
 */
export default function CompanySupportModal({
  company,
  onClose,
  onSave,
}: CompanySupportModalProps) {
  const [email, setEmail] = useState("");
  const [site, setSite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // La largeur du préfixe, mesurée une fois affiché : la section la prend
  // tout juste, et la saisie commence au ras du « // », comme une adresse
  // tapée d'un seul tenant.
  const [largeurPrefixe, setLargeurPrefixe] = useState(0);
  const mesurerPrefixe = useCallback((el: HTMLSpanElement | null) => {
    if (el) setLargeurPrefixe(el.offsetWidth);
  }, []);

  useEffect(() => {
    if (!company) return;
    setEmail(company.support_email);
    setSite(sansPrefixe(company.support_url));
    setError(null);
  }, [company]);

  const enregistrer = async () => {
    setError(null);
    setSaving(true);
    try {
      const reste = sansPrefixe(site.trim());
      await onSave({
        support_email: email.trim(),
        support_url: reste ? `${PREFIXE}${reste}` : "",
      });
      onClose();
    } catch (e) {
      setError(messageErreur(e));
    } finally {
      setSaving(false);
    }
  };

  const valider = (e: KeyboardEvent) => {
    if (e.key === "Enter") enregistrer();
  };

  return (
    <Modal
      opened={company !== null}
      onClose={onClose}
      title={`Support — ${company?.name ?? ""}`}
      centered
      padding={MODAL_PADDING}
      withCloseButton={false}
      styles={modalHeaderStyles(MODAL_PADDING)}
    >
      <Stack gap="md">
        {error && (
          <ErrorAlert onClose={() => setError(null)}>{error}</ErrorAlert>
        )}

        <TextInput
          label="Email"
          type="email"
          placeholder="support@exemple.fr"
          value={email}
          onChange={(e) => setEmail(e.currentTarget.value)}
          onKeyDown={valider}
          data-autofocus
        />

        <TextInput
          label="Portail"
          placeholder="support.exemple.fr"
          value={site}
          onChange={(e) => setSite(sansPrefixe(e.currentTarget.value))}
          onKeyDown={valider}
          leftSection={<span ref={mesurerPrefixe}>{PREFIXE}</span>}
          leftSectionWidth={RETRAIT_CHAMP + largeurPrefixe + ECART_PREFIXE}
          leftSectionPointerEvents="none"
          styles={{
            section: {
              justifyContent: "flex-end",
              paddingRight: ECART_PREFIXE,
              fontSize: "var(--mantine-font-size-sm)",
              color: "var(--mantine-color-text)",
            },
          }}
        />

        <Group justify="flex-end" mt={MODAL_PADDING - 16}>
          <BoutonFermer onClick={onClose} />
          <Button color="teal" onClick={enregistrer} loading={saving}>
            Enregistrer
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
