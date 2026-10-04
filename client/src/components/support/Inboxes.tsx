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
import type { IndicatorConfigProps } from "../../indicators/types";
import { listKey } from "@milo/shared";

// Les boîtes d'où une liste de tickets reçoit ses tickets, en lignes comme les
// tags de l'agent GLPI (ChampReception) : une ligne par adresse, avec le
// contexte où vont ses tickets et l'état de sa confirmation. Une adresse neuve reçoit
// un code à quatre chiffres à l'enregistrement du widget, et ne se relève
// qu'une fois ce code saisi par le menu « Actions », qui le renvoie aussi aux
// adresses qui attendent (server, lib/optin.ts).

/** Une boîte : son adresse, et le contexte de ses demandes. */
interface Mailbox {
  email: string;
  context_id: number | null;
}

/** La clé de la configuration qui dit de supprimer les e-mails relevés (server, receptions.ts). */
const DELETION = "delete_after_import";

/** La place de l'état, au bout de la ligne : les badges s'alignent. */
const STATE_WIDTH = 76;

export const looksLikeAddress = (email: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

const mailboxesOf = (config: unknown): Mailbox[] =>
  inboxesOf(config, MAILBOXES).map((r) => ({
    email: typeof r.email === "string" ? r.email : "",
    context_id: typeof r.context_id === "number" ? r.context_id : null,
  }));

/** L'état d'une adresse : confirmée, ou en attente — une adresse pas encore enregistrée aussi. */
function State({ confirmed }: { confirmed: boolean }) {
  return (
    <Box
      style={{
        width: STATE_WIDTH,
        flexShrink: 0,
        display: "flex",
        justifyContent: "flex-end",
        // Le bout de la ligne n'est qu'à RETRAIT_LIGNE : l'étiquette, plus
        // basse qu'un champ, s'en écarte jusqu'à RETRAIT_NOM, l'air qu'a la
        // valeur à gauche.
        paddingRight: NAME_INSET - ROW_INSET,
      }}
    >
      {/* L'étiquette des états de l'application (EntraTab) : pleine, verte ou rouge. */}
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

/** Les boîtes de réception d'une liste de demandes, et ce qu'elle fait des e-mails relevés. */
export default function Inboxes({
  config,
  onChange,
}: IndicatorConfigProps) {
  const mailboxes = mailboxesOf(config);
  // La liste que le widget désigne : ses confirmations sont les siennes. Un
  // widget pas encore enregistré n'en a pas — tout y attend.
  const list = listKey(config);
  const [retrying, setRetry] = useState(false);
  const [toConfirm, setToConfirm] = useState(false);
  const targetActions = useContext(DrawerActionsContext);

  // Les états de confirmation, relus régulièrement : la boîte peut confirmer
  // pendant que le tiroir est ouvert.
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
      {/* Le menu « Actions » se pose au bout de la rangée d'onglets du tiroir. */}
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
                // Rien à confirmer ni à relancer sans adresse en attente.
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
        // Une adresse pas encore lisible n'a pas d'état à montrer.
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
 * La saisie du code à quatre chiffres reçu par la boîte.
 * Plusieurs adresses attendent : on choisit d'abord laquelle.
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

  // Chaque ouverture repart de zéro, sur la première adresse qui attend.
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
            // Le quatrième chiffre posé, la confirmation part d'elle-même.
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
