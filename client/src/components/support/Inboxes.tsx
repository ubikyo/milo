import {
  Badge,
  Box,
  Button,
  Group,
  Menu,
  Modal,
  PinInput,
  Select,
  Stack,
  Switch,
  Text,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconChevronDown,
  IconMailCheck,
  IconMail,
  IconMailForward,
} from "@tabler/icons-react";
import { useContext, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../../api";
import { errorMessage, notifyError } from "../../lib/errors";
import {
  signalConfirmation,
  useConfirmations,
} from "../../lib/confirmations";
import { RED } from "../../themes/colors";
import {
  ACTIONS_BUTTON_STYLE,
  ROW_MENU_OFFSET,
  TAB_MENU_STYLES,
} from "../../themes/menus";
import { MODAL_PADDING, modalHeaderStyles } from "../../themes/modals";
import CloseButton from "../ui/CloseButton";
import { DrawerActionsContext } from "../ui/IndicatorDrawer";
import { ROW_INSET, NAME_INSET } from "../ui/DrawerRows";
import { withField } from "../../widgets/types";
import ReceptionField, { inboxesOf } from "../ui/ReceptionField";
import { MAILBOXES } from "./SupportRequestsList";
import type { IndicatorConfigProps } from "../../widgets/support/types";
import { listKey } from "@milo/shared";

// The inboxes from which a ticket list receives its tickets, in rows like the
// GLPI agent's tags (ReceptionField): one row per address, with the
// context where its tickets go and its confirmation state. A new address
// receives a four-digit code when the widget is saved, and is only polled
// once that code is entered via the "Actions" menu, which also resends it to
// the addresses that are waiting (server, lib/optin.ts).

/** An inbox: its address, and the context of its requests. */
interface Mailbox {
  email: string;
  context_id: number | null;
}

/** The config key telling whether to delete the polled e-mails (server, inboxes.ts). */
const DELETION = "delete_after_import";

/** The state's slot, at the end of the row: the badges line up. */
const STATE_WIDTH = 76;

export const looksLikeAddress = (email: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

const mailboxesOf = (config: unknown): Mailbox[] =>
  inboxesOf(config, MAILBOXES).map((r) => ({
    email: typeof r.email === "string" ? r.email : "",
    context_id: typeof r.context_id === "number" ? r.context_id : null,
  }));

/** An address's state: confirmed, or pending — an address not yet saved too. */
function State({ confirmed }: { confirmed: boolean }) {
  return (
    <Box
      style={{
        width: STATE_WIDTH,
        flexShrink: 0,
        display: "flex",
        justifyContent: "flex-end",
        // The row's end is only at ROW_INSET: the label, lower
        // than a field, moves away from it up to NAME_INSET, the air the
        // value has on the left.
        paddingRight: NAME_INSET - ROW_INSET,
      }}
    >
      {/* The label of the application's states (EntraTab): filled, green or red. */}
      <Badge
        color={confirmed ? "green" : RED}
        variant="filled"
        size="sm"
        radius="sm"
        tt="none"
        fw={600}
      >
        {confirmed ? "Confirmé" : "En attente"}
      </Badge>
    </Box>
  );
}

/** The inboxes of a request list, and what it does with the polled e-mails. */
export default function Inboxes({
  config,
  onChange,
}: IndicatorConfigProps) {
  const mailboxes = mailboxesOf(config);
  // The list the widget designates: its confirmations are its own. A
  // widget not yet saved has none — everything waits there.
  const list = listKey(config);
  const [retrying, setRetry] = useState(false);
  const [toConfirm, setToConfirm] = useState(false);
  const targetActions = useContext(DrawerActionsContext);

  // The confirmation states, re-read regularly: the inbox may confirm
  // while the drawer is open.
  const addresses = mailboxes
    .map((b) => b.email.trim().toLowerCase())
    .filter(looksLikeAddress);
  const { confirmed } = useConfirmations(list, addresses);

  const pending = [...new Set(addresses)].filter((e) => !confirmed(e));

  const retry = async () => {
    setRetry(true);
    try {
      const { sent } = await api.resendMailboxOptins(list, pending);
      notifications.show({
        color: sent ? "teal" : "gray",
        title: sent ? "Confirmation relancée" : "Rien n'est parti",
        message: sent
          ? `${sent} e-mail${sent > 1 ? "s" : ""} de confirmation envoyé${sent > 1 ? "s" : ""}.`
          : "Enregistrez d'abord les adresses : le code leur est envoyé à l'enregistrement.",
      });
    } catch (e) {
      notifyError(errorMessage(e), "La relance a échoué");
    } finally {
      setRetry(false);
    }
  };

  return (
    <Stack gap="xs">
      {/* The "Actions" menu sits at the end of the drawer's tab row. */}
      {targetActions &&
        createPortal(
          <Menu
            position="bottom-end"
            withinPortal
            offset={ROW_MENU_OFFSET}
            styles={TAB_MENU_STYLES}
          >
            <Menu.Target>
              <Button
                variant="subtle"
                color="gray"
                size="xs"
                rightSection={<IconChevronDown size={14} />}
                loading={retrying}
                // Nothing to confirm or resend without a pending address.
                disabled={pending.length === 0}
                style={ACTIONS_BUTTON_STYLE}
              >
                Actions
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                leftSection={<IconMailCheck size={16} />}
                disabled={pending.length === 0}
                onClick={() => setToConfirm(true)}
              >
                Confirmer une adresse
              </Menu.Item>
              <Menu.Item
                leftSection={<IconMailForward size={16} />}
                disabled={pending.length === 0}
                onClick={() => void retry()}
              >
                Relancer confirmation
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>,
          targetActions,
        )}
      <ReceptionField
        key={MAILBOXES}
        field="email"
        label="Adresses de réception"
        description={
          <>
            Une fois une adresse ajoutée, cliquer sur le menu « Actions », puis «
            Confirmer une adresse » et saisir le code reçu sur l'adresse e-mail.
            En cas de non réception du code, relancer la nouvelle confirmation
            depuis le menu « Actions ».
          </>
        }
        placeholder="Adresse e-mail"
        add="Ajouter une adresse e-mail"
        icon={IconMail}
        empty="Aucune adresse e-mail"
        normalizeValue={(value) => value.trim()}
        // An address not yet readable has no state to show.
        state={(email) => (email.trim() ? <State confirmed={confirmed(email)} /> : null)}
        config={config}
        onChange={onChange}
      />
      <ConfirmModal
        list={list}
        opened={toConfirm}
        addresses={pending}
        onClose={() => setToConfirm(false)}
      />
      <Switch
        mt="xs"
        color="teal"
        label="Supprimer les e-mails relevés de la boîte"
        checked={
          (config as Record<string, unknown> | null)?.[DELETION] === true
        }
        onChange={(e) =>
          onChange(withField(config, DELETION, e.currentTarget.checked))
        }
      />
    </Stack>
  );
}

/**
 * Entering the four-digit code received by the inbox.
 * Several addresses are waiting: first choose which one.
 */
function ConfirmModal({
  list,
  opened,
  addresses,
  onClose,
}: {
  list: string;
  opened: boolean;
  addresses: string[];
  onClose: () => void;
}) {
  const [email, setEmail] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  // Each opening starts from scratch, on the first address that is waiting.
  useEffect(() => {
    if (!opened) return;
    setEmail(addresses[0] ?? null);
    setCode("");
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened]);

  const confirm = async (entered = code) => {
    if (!email || entered.length !== 4) return;
    setSending(true);
    setError(null);
    try {
      await api.confirmMailboxOptin(list, email, entered);
      notifications.show({
        color: "teal",
        title: "Adresse confirmée",
        message: email,
      });
      signalConfirmation();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
      notifyError(errorMessage(e));
      setCode("");
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Confirmer l'adresse"
      centered
      padding={MODAL_PADDING}
      withCloseButton={false}
      styles={modalHeaderStyles(MODAL_PADDING)}
    >
      <Stack gap="md">
        <Text size="sm">
          Saisissez le code à quatre chiffres reçu dans l'e-mail de
          confirmation.
        </Text>
        {addresses.length > 1 && (
          <Select
            label="Adresse"
            data={addresses}
            value={email}
            onChange={(value) => {
              setEmail(value);
              setError(null);
            }}
            allowDeselect={false}
          />
        )}
        <Group justify="center">
          <PinInput
            length={4}
            type="number"
            oneTimeCode
            autoFocus
            value={code}
            onChange={setCode}
            // Once the fourth digit is entered, the confirmation is sent by itself.
            onComplete={(entered) => void confirm(entered)}
            error={Boolean(error)}
            disabled={sending}
            aria-label="Code de confirmation"
          />
        </Group>
      </Stack>
      <Group justify="flex-end" mt={MODAL_PADDING}>
        <CloseButton onClick={onClose}>Annuler</CloseButton>
        <Button
          color="teal"
          onClick={() => void confirm()}
          disabled={code.length !== 4 || !email}
          loading={sending}
        >
          Confirmer
        </Button>
      </Group>
    </Modal>
  );
}
