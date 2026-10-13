import { ActionIcon, TextInput } from "@mantine/core";
import { IconSend } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { errorMessage, notifyError } from "../../lib/errors";
import { GREEN } from "../../themes/colors";
import MailTestModal from "./MailTestModal";
import SenderCodeModal from "./SenderCodeModal";

// The sending address of Milo's e-mails, in the Entra tab, under the secret:
// it belongs to the Entra settings. Changed when its field is left, once the
// code Milo sends to the new address is entered (SenderCodeModal); the button
// inside it, on the right, sends a test message. It is required: emptied, it goes back to
// the saved address.

interface SenderFieldProps {
  /** The saved address, once read and after each save: the window requires it. */
  onSaved?: (address: string) => void;
}

export default function SenderField({ onSaved }: SenderFieldProps) {
  const [ongoing, setInProgress] = useState(false);
  // The sending address belongs to the Entra settings: as saved, and as typed.
  const [sender, setSender] = useState("");
  const [typedSender, setTypedSender] = useState("");
  const [testOpen, setTestOpen] = useState(false);
  // The new address a code was sent to, awaiting it.
  const [codeFor, setCodeFor] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api.getEntraSettings().then(
      (r) => {
        setSender(r.mail_sender);
        setTypedSender(r.mail_sender);
        setLoaded(true);
        onSaved?.(r.mail_sender);
      },
      (e) => notifyError(errorMessage(e)),
    );
  }, []);

  const saveSender = async () => {
    const address = typedSender.trim();
    // Required: an emptied field goes back to the saved address.
    if (!address || address === sender) return setTypedSender(sender);
    setInProgress(true);
    try {
      await api.sendSenderCode(address);
      setCodeFor(address);
    } catch (e) {
      // Refused, the field goes back to the saved address.
      notifyError(errorMessage(e));
      setTypedSender(sender);
    } finally {
      setInProgress(false);
    }
  };

  const frozen = ongoing || codeFor !== null;
  const canTest = Boolean(sender) && typedSender.trim() === sender && !ongoing;

  return (
    <>
      {/* Where Milo's emails are sent from: notices, assignments, replies to
          the requests entered. A received request replies from its own
          mailbox. */}
      <TextInput
        label="Adresse d'envoi"
        required
        error={loaded && !sender && !typedSender.trim() ? "L'adresse d'envoi est requise" : undefined}
        type="email"
        placeholder="milo@…"
        value={typedSender}
        onChange={(e) => setTypedSender(e.currentTarget.value)}
        onBlur={() => void saveSender()}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setTypedSender(sender);
        }}
        disabled={frozen}
        w={290}
        // The test, inside the field on the right, like a row's reset
        // button (SettingRows): green when it can go, faded otherwise. It
        // leaves from the saved address — leaving the field saves it.
        rightSection={
          <ActionIcon
            variant="filled"
            radius={3}
            size={26}
            onClick={() => setTestOpen(true)}
            disabled={!canTest}
            aria-label="Envoyer un message de test"
            style={{
              backgroundColor: canTest ? GREEN : "var(--milo-control-bg)",
              color: canTest ? "#ffffff" : "var(--mantine-color-text)",
              opacity: canTest ? 1 : 0.5,
            }}
          >
            <IconSend size={16} />
          </ActionIcon>
        }
        rightSectionPointerEvents="all"
        // 5 px between the address and the button.
        rightSectionWidth={41}
        rightSectionProps={{ style: { paddingLeft: 5 } }}
      />
      <SenderCodeModal
        email={codeFor}
        // Abandoned, the field goes back to the saved address.
        onClose={() => {
          setCodeFor(null);
          setTypedSender(sender);
        }}
        onConfirmed={(saved) => {
          setCodeFor(null);
          setSender(saved.mail_sender);
          setTypedSender(saved.mail_sender);
          onSaved?.(saved.mail_sender);
        }}
      />
      <MailTestModal opened={testOpen} onClose={() => setTestOpen(false)} sender={sender} />
    </>
  );
}
