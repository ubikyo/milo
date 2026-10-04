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
import CloseButton from "../ui/BoutonFermer";

/** Ce que montre l'état de la connexion, selon ce que le serveur en dit. */
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
 * Ce que montre le champ d'un secret enregistré : le serveur ne le renvoie
 * jamais, on simule donc sa présence par des points.
 */
const MASK = "********";

/**
 * La saisie dans un champ qui montre encore le masque : on n'en garde que ce
 * que la personne a tapé. Le champ sélectionne le masque au focus, la frappe
 * le remplace donc d'ordinaire ; si le curseur s'est posé dedans, on retire
 * les points du masque restés autour du texte tapé, et un effacement le vide.
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
 * L'essai d'envoi. Il porte sur les réglages enregistrés : l'onglet les a
 * envoyés juste avant d'ouvrir cette fenêtre, sinon le test parlerait d'une
 * configuration que le serveur ne connaît pas encore.
 */
function MailTestModal({
  opened,
  onClose,
  sender,
}: {
  opened: boolean;
  onClose: () => void;
  /** L'adresse d'envoi enregistrée. */
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
          {/* Le vert des actions qui valident, celui de la coche des comptes
              et du compte rendu d'un envoi réussi. */}
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
   * Là où l'onglet dépose sa fonction d'enregistrement, appelée par le bouton
   * « Enregistrer » de la fenêtre (SettingsModal). Elle rend faux si le serveur
   * a refusé : le message s'affiche alors dans l'onglet.
   */
  saveRef?: { current: (() => Promise<boolean>) | null };
  /**
   * L'emplacement réservé à droite du titre « Entra », dans l'entête du
   * panneau (SettingsModal) : le menu « Actions » y est rendu.
   */
  actionsTarget?: HTMLElement | null;
  /**
   * Les réglages tels que le serveur les a, à chaque lecture et à chaque
   * enregistrement : la fenêtre ne montre les autres onglets qu'une fois
   * Entra configuré.
   */
  onSettings?: (settings: EntraSettings) => void;
}

/**
 * L'application Entra sur laquelle Milo repose : la connexion de chacun, la
 * lecture de l'annuaire, le courrier.
 *
 * Le secret ne redescend jamais du serveur : le champ montre un masque de
 * points quand il est enregistré. Il n'est envoyé que si l'on y touche, ce
 * que suit `secretTouche` : sans cela, enregistrer l'identifiant effacerait le
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
  // Rien n'a bougé : « Enregistrer » n'a alors rien à envoyer.
  const [modified, setModified] = useState(false);
  // Tant que le serveur n'a pas répondu, l'onglet ne montre rien : affiché
  // avec ses valeurs par défaut, il montrerait des champs vides qui se
  // rempliraient d'un coup.
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testOpen, setTestOpened] = useState(false);
  // L'état de la connexion de Milo à Entra : nul tant qu'il n'est pas connu.
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
      // Même si la lecture a échoué : le message vaut mieux qu'un onglet vide.
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

  /** Ce qui part au serveur : les réglages, et le secret seulement si on y a touché. */
  const toSend = (): EntraSettingsInput => ({
    client_id: settings.client_id,
    tenant: settings.tenant,
    mail_sender: settings.mail_sender,
    ...(secretTouched ? { secret } : {}),
  });

  /** Enregistre et rend vrai si c'est passé : les actions qui suivent en dépendent. */
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
      // De nouveaux identifiants changent la réponse de Microsoft.
      readState();
      return true;
    } catch (e) {
      notifyError(errorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  // Sans tableau de dépendances : `enregistrer` se referme sur l'état du
  // formulaire et change donc à chaque rendu. La fenêtre doit appeler la
  // dernière, pas celle du premier affichage.
  useEffect(() => {
    if (!saveRef) return undefined;
    saveRef.current = save;
    return () => {
      saveRef.current = null;
    };
  });

  // Les vérifications portent sur ce que le serveur a en base : l'affichage
  // part avec.
  const runTest = async () => {
    if (await save()) setTestOpened(true);
  };

  /** Se reconnecter avec ce qui est saisi, ou se déconnecter. */
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

  // Déconnecté, Milo ne passe plus par Microsoft : les vérifications
  // échoueraient d'office.
  const disconnected = state?.state === "disconnected";

  /**
   * L'adresse de retour de la connexion, à inscrire dans Azure : celle par
   * laquelle on sert Milo, suivie du chemin que le serveur écoute.
   */
  const redirection = `${window.location.origin}/api/auth/entra/callback`;

  /**
   * Ce qu'on peut faire d'ici. Même menu que celui des onglets de tableau
   * (BoardTabs) : rien ne justifie deux façons d'ouvrir un menu dans la même
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
   * L'état de la connexion, à gauche du menu « Actions » : le refus de
   * Microsoft se lit au survol.
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
   * Le champ du secret. Tant qu'on n'y a pas touché, il montre le masque si
   * un secret est enregistré — sans l'œil, qui n'afficherait que des
   * astérisques. Le focus sélectionne le masque : la frappe le remplace.
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

          {/* Les deux libellés du portail Azure, mot pour mot : c'est là
              qu'on va chercher les valeurs, autant ne pas les renommer en
              chemin. Les libellés au-dessus des champs, comme dans les
              fiches, avec les mêmes écarts. */}
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
            {/* Le secret et la redirection dans la colonne de gauche, à la
                largeur de l'ID d'application. */}
            {secretField}
            {/* D'où partent les e-mails de Milo : les avis, les assignations,
                les réponses aux demandes saisies. Une demande reçue répond
                de sa propre boîte. */}
            <TextInput
              label="Adresse d'envoi"
              type="email"
              placeholder="milo@…"
              value={settings.mail_sender}
              onChange={(e) => updateStatement({ mail_sender: e.currentTarget.value })}
            />
            {/* L'adresse à reporter dans Azure, telle quelle : elle se lit,
                et se copie d'un clic. Plus longue que les ID, elle déborde
                d'un quart sur la colonne de droite, vide à cette hauteur. */}
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
