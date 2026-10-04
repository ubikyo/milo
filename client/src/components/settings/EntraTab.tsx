import {
  Badge,
  Button,
  CopyButton,
  Group,
  Menu,
  Modal,
  PasswordInput,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import {
  IconCheck,
  IconChevronDown,
  IconCopy,
  IconMailForward,
  IconPlugConnected,
  IconPlugConnectedX,
  IconSend,
} from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { emptyEntraSettings } from "@milo/shared";
import { api } from "../../api";
import { NEUTRAL_HOVER } from "../../themes/colors";
import { MODAL_PADDING, modalHeaderStyles } from "../../themes/modals";
import { ACTIONS_BUTTON_STYLE } from "../../themes/menus";
import SuccessAlert from "../ui/SuccessAlert";
import { errorMessage, notifyError } from "../../lib/errors";
import type {
  EntraSettings,
  EntraSettingsInput,
  EntraStatus,
} from "@milo/shared";
import type { CSSProperties } from "react";
import CloseButton from "../ui/CloseButton";

/** What the connection status shows, depending on what the server says about it. */
const STATES: Record<
  EntraStatus["state"],
  { label: string; color: string }
> = {
  connected: { label: "Connecté", color: "green" },
  error: { label: "Refusé", color: "red" },
  disconnected: { label: "Déconnecté", color: "gray" },
  unconfigured: { label: "Non configuré", color: "gray" },
};

/**
 * What a saved secret's field shows: the server never sends it back,
 * so its presence is simulated with dots.
 */
const MASK = "********";

/**
 * Input in a field that still shows the mask: only what the person
 * typed is kept. The field selects the mask on focus, so typing
 * usually replaces it; if the cursor landed inside it, the mask's
 * dots left around the typed text are removed, and erasing empties it.
 */
function unmasked(value: string): string {
  if (/^\**$/.test(value) && value.length < MASK.length) return "";
  if (value.length <= MASK.length) return value;
  let rest = MASK.length;
  let typed = "";
  for (const c of value) {
    if (c === "*" && rest > 0) rest -= 1;
    else typed += c;
  }
  return rest === 0 ? typed : value;
}

/**
 * The send test. It applies to the saved settings: the tab
 * sent them just before opening this window, otherwise the test would speak of a
 * configuration the server does not know yet.
 */
function MailTestModal({
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
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setSent(null);
    setBusy(true);
    try {
      const { sent_to } = await api.testMail(address.trim());
      setSent(sent_to);
    } catch (e) {
      notifyError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Tester l'envoi"
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

        {sent && (
          <SuccessAlert>
            <Text size="sm">Message envoyé à {sent}.</Text>
          </SuccessAlert>
        )}

        <Group justify="flex-end" mt="md">
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
        </Group>
      </Stack>
    </Modal>
  );
}

interface EntraTabProps {
  /**
   * Where the tab deposits its save function, called by the window's
   * "Enregistrer" button (SettingsModal). It returns false if the server
   * refused: the message is then shown in the tab.
   */
  saveRef?: { current: (() => Promise<boolean>) | null };
  /**
   * The slot reserved to the right of the "Entra" title, in the panel's
   * header (SettingsModal): the "Actions" menu is rendered there.
   */
  actionsTarget?: HTMLElement | null;
  /**
   * The settings as the server has them, on each read and each
   * save: the window only shows the other tabs once
   * Entra is configured.
   */
  onSettings?: (settings: EntraSettings) => void;
}

/**
 * The Entra application Milo relies on: everyone's sign-in, directory
 * reading, mail.
 *
 * The secret never comes back down from the server: the field shows a mask of
 * dots when it is saved. It is only sent if it is touched, which
 * `secretTouched` tracks: without it, saving the client ID would erase the
 * secret.
 */
export default function EntraTab({
  saveRef,
  actionsTarget,
  onSettings,
}: EntraTabProps) {
  const [settings, setSettings] = useState<EntraSettings>(emptyEntraSettings());
  const [secret, setSecret] = useState("");
  const [secretTouched, setSecretTouched] = useState(false);
  // Nothing has changed: "Enregistrer" then has nothing to send.
  const [modified, setModified] = useState(false);
  // Until the server has responded, the tab shows nothing: displayed
  // with its default values, it would show empty fields that would
  // fill in all at once.
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testOpen, setTestOpened] = useState(false);
  // The state of Milo's connection to Entra: null until it is known.
  const [state, setState] = useState<EntraStatus | null>(null);

  const readState = useCallback(() => {
    setState(null);
    api
      .getEntraStatus()
      .then(setState)
      .catch((e) => notifyError(errorMessage(e)));
  }, []);

  useEffect(() => {
    readState();
  }, [readState]);

  const reload = useCallback(async () => {
    try {
      const readItems = await api.getEntraSettings();
      setSettings(readItems);
      onSettings?.(readItems);
      setModified(false);
    } catch (e) {
      notifyError(errorMessage(e));
    } finally {
      // Even if the read failed: the message is better than an empty tab.
      setLoaded(true);
    }
  }, [onSettings]);

  useEffect(() => {
    reload();
  }, [reload]);

  const updateStatement = (fields: Partial<EntraSettings>) => {
    setSettings((r) => ({ ...r, ...fields }));
    setModified(true);
  };

  /** What goes to the server: the settings, and the secret only if it was touched. */
  const toSend = (): EntraSettingsInput => ({
    client_id: settings.client_id,
    tenant: settings.tenant,
    mail_sender: settings.mail_sender,
    ...(secretTouched ? { secret } : {}),
  });

  /** Saves and returns true if it went through: the actions that follow depend on it. */
  const save = async (): Promise<boolean> => {
    if (!modified) return true;

    setBusy(true);
    try {
      const saved = await api.updateEntraSettings(toSend());
      setSettings(saved);
      onSettings?.(saved);
      setSecretTouched(false);
      setSecret("");
      setModified(false);
      // New credentials change Microsoft's response.
      readState();
      return true;
    } catch (e) {
      notifyError(errorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  // Without a dependency array: `save` closes over the form's state and
  // therefore changes on every render. The window must call the
  // latest one, not that of the first display.
  useEffect(() => {
    if (!saveRef) return undefined;
    saveRef.current = save;
    return () => {
      saveRef.current = null;
    };
  });

  // The checks apply to what the server has in the database: the display
  // goes with it.
  const runTest = async () => {
    if (await save()) setTestOpened(true);
  };

  /** Reconnect with what is typed, or disconnect. */
  const changeConnection = async (connect: boolean) => {
    if (connect && !(await save())) return;
    setBusy(true);
    setState(null);
    try {
      setState(await (connect ? api.connectEntra() : api.disconnectEntra()));
    } catch (e) {
      notifyError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  // Disconnected, Milo no longer goes through Microsoft: the checks
  // would fail outright.
  const disconnected = state?.state === "disconnected";

  /**
   * The sign-in redirect address, to register in Azure: the one
   * Milo is served from, followed by the path the server listens on.
   */
  const redirection = `${window.location.origin}/api/auth/entra/callback`;

  /**
   * What can be done from here. Same menu as the board tabs'
   * (BoardTabs): nothing justifies two ways of opening a menu in the same
   * application.
   */
  const menuActions = (
    <Menu position="bottom-end" withinPortal>
      <Menu.Target>
        <Button
          variant="subtle"
          color="gray"
          rightSection={<IconChevronDown size={14} />}
          disabled={busy}
          style={ACTIONS_BUTTON_STYLE}
        >
          Actions
        </Button>
      </Menu.Target>

      <Menu.Dropdown>
        <Menu.Item
          leftSection={<IconMailForward size={16} />}
          onClick={runTest}
          disabled={disconnected}
        >
          Tester l'envoi
        </Menu.Item>
        <Menu.Divider />
        <Menu.Item
          leftSection={<IconPlugConnected size={16} />}
          onClick={() => void changeConnection(true)}
        >
          Se reconnecter
        </Menu.Item>
        <Menu.Item
          leftSection={<IconPlugConnectedX size={16} />}
          onClick={() => void changeConnection(false)}
          disabled={
            !state ||
            state.state === "disconnected" ||
            state.state === "unconfigured"
          }
        >
          Déconnecter
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );

  /**
   * The connection status, to the left of the "Actions" menu: Microsoft's
   * refusal can be read on hover.
   */
  const statusBadge = state ? (
    <Tooltip
      label={state.error}
      disabled={!state.error}
      multiline
      maw={360}
      withinPortal
    >
      <Badge
        color={STATES[state.state].color}
        variant="filled"
        size="sm"
        radius="sm"
        tt="none"
        fw={600}
      >
        {STATES[state.state].label}
      </Badge>
    </Tooltip>
  ) : (
    <Text size="sm" c="dimmed">
      Vérification…
    </Text>
  );

  /**
   * The secret field. Until it is touched, it shows the mask if
   * a secret is saved — without the eye, which would only show
   * asterisks. Focus selects the mask: typing replaces it.
   */
  const masked = settings.has_secret && !secretTouched;
  const secretField = (
    <PasswordInput
      label="Secret"
      value={masked ? MASK : secret}
      visibilityToggleButtonProps={
        masked ? { style: { display: "none" } } : undefined
      }
      onFocus={(e) => {
        if (masked) e.currentTarget.select();
      }}
      onChange={(e) => {
        const input = e.currentTarget.value;
        setSecret(masked ? unmasked(input) : input);
        setSecretTouched(true);
        setModified(true);
      }}
    />
  );

  if (!loaded) return null;

  return (
    <>
      <Stack gap="lg">
        <Stack gap="sm">
          <Text size="sm" c="dimmed" pb={7}>
            Paramètres de connexion à Entra, veuillez lire l'aide relative à
            l'installation de Milo pour déterminer les valeurs à préciser dans
            les éléments ci-dessous.
          </Text>

          {/* The two Azure portal labels, word for word: that is where
              the values are looked up, so better not rename them along
              the way. The labels above the fields, as in the card
              details, with the same gaps. */}
          <SimpleGrid cols={2} spacing="md" verticalSpacing="xl">
            <TextInput
              label="ID d'application"
              value={settings.client_id}
              onChange={(e) => updateStatement({ client_id: e.currentTarget.value })}
            />
            <TextInput
              label="ID de l'annuaire"
              value={settings.tenant}
              onChange={(e) => updateStatement({ tenant: e.currentTarget.value })}
            />
            {/* The secret and the redirect in the left column, at the
                width of the application ID. */}
            {secretField}
            {/* Where Milo's emails are sent from: notices, assignments,
                replies to the requests entered. A received request replies
                from its own mailbox. */}
            <TextInput
              label="Adresse d'envoi"
              type="email"
              placeholder="milo@…"
              value={settings.mail_sender}
              onChange={(e) => updateStatement({ mail_sender: e.currentTarget.value })}
            />
            {/* The address to copy into Azure, as is: it can be read,
                and copied with a click. Longer than the IDs, it overflows
                by a quarter onto the right column, empty at that height. */}
            <TextInput
              label="Redirection"
              style={{
                gridColumn: "1 / -1",
                width: "calc((100% - var(--mantine-spacing-md)) / 2 * 1.25)",
              }}
              value={redirection}
              readOnly
              rightSection={
                <CopyButton value={redirection}>
                  {({ copied, copy }) => (
                    <Button
                      variant="subtle"
                      color="gray"
                      size="compact-sm"
                      onClick={copy}
                      aria-label="Copier l'adresse de redirection"
                      style={
                        { "--button-hover": NEUTRAL_HOVER } as CSSProperties
                      }
                    >
                      {copied ? (
                        <IconCheck size={14} />
                      ) : (
                        <IconCopy size={14} />
                      )}
                    </Button>
                  )}
                </CopyButton>
              }
            />
          </SimpleGrid>
        </Stack>
      </Stack>

      {actionsTarget &&
        createPortal(
          <Group gap="sm" wrap="nowrap">
            {statusBadge}
            {menuActions}
          </Group>,
          actionsTarget,
        )}

      <MailTestModal
        opened={testOpen}
        onClose={() => setTestOpened(false)}
        sender={settings.mail_sender}
      />
    </>
  );
}
