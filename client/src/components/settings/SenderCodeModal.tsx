import { Anchor, Button, Group, Modal, PinInput, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { errorMessage, notifyError } from "../../lib/errors";
import { themeWindow } from "../../lib/themeWindow";
import { MODAL_PADDING, modalHeaderStyles } from "../../themes/modals";
import type { EntraSettings } from "@milo/shared";
import CloseButton from "../ui/CloseButton";
import Footer from "../ui/Footer";

// A new sending address, as on the first setup (FirstSetup): Milo has sent a
// four-digit code from the mailbox to itself, and the address only becomes
// the sending address once the code is entered.

export default function SenderCodeModal({
  email,
  onClose,
  onConfirmed,
}: {
  /** The address the code was sent to; null closes the window. */
  email: string | null;
  /** Abandoned: the sending address stays as it was. */
  onClose: () => void;
  /** The right code: the settings as saved, with the new address. */
  onConfirmed: (saved: EntraSettings) => void;
}) {
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState(false);
  const [busy, setBusy] = useState(false);

  // A fresh field for each address.
  useEffect(() => {
    setCode("");
    setCodeError(false);
  }, [email]);

  const confirm = async (value = code) => {
    if (!email) return;
    setBusy(true);
    try {
      onConfirmed(await api.confirmSender(email, value));
      notifications.show({ color: "teal", message: "Adresse d'envoi confirmée." });
    } catch (e) {
      setCodeError(true);
      notifyError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  /** A new code: the previous one is no longer valid. */
  const resend = async () => {
    if (!email) return;
    setBusy(true);
    try {
      await api.sendSenderCode(email);
      setCode("");
      setCodeError(false);
      notifications.show({ color: "teal", message: `Code envoyé à ${email}.` });
    } catch (e) {
      notifyError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      attributes={themeWindow("sender-code")}
      opened={email !== null}
      onClose={onClose}
      title="Confirmer l'adresse d'envoi"
      centered
      padding={MODAL_PADDING}
      withCloseButton={false}
      styles={modalHeaderStyles(MODAL_PADDING)}
    >
      <Stack gap="md">
        <Text size="sm">
          Un code a été envoyé à {email}. Saisissez-le pour valider l'adresse d'envoi.
        </Text>

        <Group justify="center">
          <PinInput
            length={4}
            type="number"
            oneTimeCode
            size="lg"
            gap={15}
            autoFocus
            value={code}
            error={codeError}
            disabled={busy}
            onChange={(value) => {
              setCode(value);
              setCodeError(false);
            }}
            onComplete={(value) => void confirm(value)}
          />
        </Group>

        <Text size="sm" ta="center">
          <Anchor component="button" type="button" onClick={() => void resend()} disabled={busy}>
            Renvoyer un code
          </Anchor>
        </Text>

        <Footer parentGap="var(--mantine-spacing-md)">
          <CloseButton onClick={onClose}>Annuler</CloseButton>
          <Button
            color="teal"
            onClick={() => void confirm()}
            loading={busy}
            disabled={code.length < 4}
          >
            Valider
          </Button>
        </Footer>
      </Stack>
    </Modal>
  );
}
