import { Button, Modal, Stack, Text, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconSend } from "@tabler/icons-react";
import { useState } from "react";
import { api } from "../../api";
import { errorMessage, notifyError } from "../../lib/errors";
import { MODAL_PADDING, modalHeaderStyles } from "../../themes/modals";
import CloseButton from "../ui/CloseButton";
import Footer from "../ui/Footer";
import { themeWindow } from "../../lib/themeWindow";

// The send test of the Notifications tab: an address, and the test
// message's template ("Message de test") sent to it.

/**
 * The test message, sent from the saved sending address: the Notifications
 * tab saves it as its field is left, before this window can open.
 */
export default function MailTestModal({
  opened,
  onClose,
  sender,
}: {
  opened: boolean;
  onClose: () => void;
  /** The saved sender address. */
  sender: string;
}) {
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true);
    try {
      const { sent_to } = await api.testMail(address.trim());
      // Reported as the application's other confirmations: a toast, the
      // window closed.
      notifications.show({ color: "teal", message: `Message de test envoyé à ${sent_to}.` });
      onClose();
    } catch (e) {
      notifyError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      attributes={themeWindow("mail-test")}
      opened={opened}
      onClose={onClose}
      title="Envoyer un message de test"
      centered
      padding={MODAL_PADDING}
      withCloseButton={false}
      styles={modalHeaderStyles(MODAL_PADDING)}
    >
      <Stack gap="md">
        <Text size="sm">
          {sender
            ? `Le message part de l'adresse d'envoi, ${sender}.`
            : "Renseignez d'abord l'adresse d'envoi."}
        </Text>

        <TextInput
          label="Adresse de test"
          type="email"
          value={address}
          onChange={(e) => setAddress(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && address.trim() && sender) send();
          }}
        />

        <Footer parentGap="var(--mantine-spacing-md)">
          <CloseButton onClick={onClose} />
          {/* The green of the actions that confirm, that of the accounts' checkmark
              and of a successful send's report. */}
          <Button
            color="teal"
            leftSection={<IconSend size={16} />}
            onClick={send}
            loading={busy}
            disabled={!address.trim() || !sender}
          >
            Envoyer
          </Button>
        </Footer>
      </Stack>
    </Modal>
  );
}
