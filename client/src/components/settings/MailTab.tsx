import {
  Badge,
  Button,
  Group,
  Menu,
  Modal,
  NumberInput,
  PasswordInput,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import {
  IconChevronDown,
  IconMailForward,
  IconPlugConnected,
  IconPlugConnectedX,
  IconSend,
} from "@tabler/icons-react";
import dayjs from "dayjs";
import { useCallback, useEffect, useRef, useState } from "react";
import { MAIL_AUTH_MODES, MAIL_ENCRYPTIONS, emptyMailSettings } from "@milo/shared";
import { api } from "../../api";
import { NEUTRAL_HOVER } from "../../themes/colors";
import { MODAL_PADDING, modalHeaderStyles } from "../../themes/modals";
import ErrorAlert from "../ui/ErrorAlert";
import SuccessAlert from "../ui/SuccessAlert";
import { messageErreur } from "../../lib/errors";
import type { MailAuthMode, MailEncryption, MailSettings, MailSettingsInput } from "@milo/shared";
import type { CSSProperties, ReactNode } from "react";

// Même colonne de libellés que les autres onglets des réglages.
const LABEL_WIDTH = 120;

// Cinq chiffres et le retrait du champ : un port n'a pas besoin de plus.
const PORT_WIDTH = 80;

// L'écart entre le dernier champ SMTP et le titre de la section suivante.
const SECTION_GAP = 30;

/** Un libellé à gauche, son champ à droite : la mise en page des réglages. */
const champ = (libelle: string, contenu: ReactNode, apres?: ReactNode) => (
  <Group gap="md" wrap="nowrap" align="center">
    <Text size="sm" fw={500} w={LABEL_WIDTH} style={{ flexShrink: 0 }}>
      {libelle}
    </Text>
    {contenu}
    {apres}
  </Group>
);

/**
 * La mention qui suit un champ de secret vide alors qu'un secret est
 * enregistré. Elle était portée par le texte d'invite du champ ; posée à côté,
 * elle reste lisible une fois le champ rempli de points.
 */
const MENTION_ENREGISTRE = (
  <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
    Enregistré
  </Text>
);

/**
 * L'essai d'envoi. Il porte sur les réglages enregistrés : l'onglet les a
 * envoyés juste avant d'ouvrir cette fenêtre, sinon le test parlerait d'une
 * configuration que le serveur ne connaît pas encore.
 */
function MailTestModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const [adresse, setAdresse] = useState("");
  const [envoye, setEnvoye] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const envoyer = async () => {
    setError(null);
    setEnvoye(null);
    setBusy(true);
    try {
      const { sent_to } = await api.testMail(adresse.trim());
      setEnvoye(sent_to);
    } catch (e) {
      setError(messageErreur(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Tester la messagerie"
      centered
      padding={MODAL_PADDING}
      withCloseButton={false}
      styles={modalHeaderStyles(MODAL_PADDING)}
    >
      <Stack gap="md">
        <Text size="sm">
          Indiquer une adresse e-mail de destination pour réaliser le test.
        </Text>

        <TextInput
          label="Adresse de test"
          type="email"
          value={adresse}
          onChange={(e) => setAdresse(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && adresse.trim()) envoyer();
          }}
          data-autofocus
        />

        {error && <ErrorAlert onClose={() => setError(null)}>{error}</ErrorAlert>}
        {envoye && (
          <SuccessAlert>
            <Text size="sm">Message envoyé à {envoye}.</Text>
          </SuccessAlert>
        )}

        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={onClose}>
            Fermer
          </Button>
          {/* Le vert des actions qui valident, celui de la coche des comptes
              et du compte rendu d'un envoi réussi. */}
          <Button
            color="teal"
            leftSection={<IconSend size={16} />}
            onClick={envoyer}
            loading={busy}
            disabled={!adresse.trim()}
          >
            Envoyer
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

interface MailTabProps {
  /**
   * Là où l'onglet dépose sa fonction d'enregistrement : il n'a pas de bouton
   * à lui, c'est « Fermer » qui enregistre (SettingsModal). Elle rend faux si
   * le serveur a refusé, et la fenêtre reste alors ouverte avec le message.
   */
  saveRef?: { current: (() => Promise<boolean>) | null };
}

/**
 * Les réglages de la messagerie sortante.
 *
 * Les secrets — mot de passe SMTP, secret d'application — ne redescendent
 * jamais du serveur : le champ reste vide et annonce seulement qu'un secret est
 * enregistré. Il n'est envoyé que si l'on y touche, ce que suit `secretsTouches` :
 * sans cela, enregistrer le port effacerait le mot de passe.
 */
export default function MailTab({ saveRef }: MailTabProps) {
  const [reglages, setReglages] = useState<MailSettings>(emptyMailSettings());
  const [motDePasse, setMotDePasse] = useState("");
  const [secretOAuth, setSecretOAuth] = useState("");
  const [secretsTouches, setSecretsTouches] = useState({ password: false, oauth: false });
  const [error, setError] = useState<string | null>(null);
  // Rien n'a bougé : fermer la fenêtre n'a alors rien à envoyer.
  const [modifie, setModifie] = useState(false);
  // Tant que le serveur n'a pas répondu, l'onglet ne montre rien : affiché
  // avec ses valeurs par défaut, il donnerait à voir la configuration par mot
  // de passe avant de se retourner d'un coup sur celle d'Azure.
  const [charge, setCharge] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testOuvert, setTestOuvert] = useState(false);

  // La fenêtre de consentement Microsoft, et la surveillance de sa fermeture.
  const surveillance = useRef<number | null>(null);

  const reload = useCallback(async () => {
    try {
      setReglages(await api.getMailSettings());
      setModifie(false);
    } catch (e) {
      setError(messageErreur(e));
    } finally {
      // Même si la lecture a échoué : le message vaut mieux qu'un onglet vide.
      setCharge(true);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // La surveillance de la fenêtre survivrait à l'onglet refermé.
  useEffect(
    () => () => {
      if (surveillance.current !== null) window.clearInterval(surveillance.current);
    },
    [],
  );

  const modifier = (champs: Partial<MailSettings>) => {
    setReglages((r) => ({ ...r, ...champs }));
    setModifie(true);
  };

  const modifierOAuth = (champs: Partial<MailSettings["oauth"]>) => {
    setReglages((r) => ({ ...r, oauth: { ...r.oauth, ...champs } }));
    setModifie(true);
  };

  /** Ce qui part au serveur : les réglages, et les secrets seulement si on y a touché. */
  const aEnvoyer = (): MailSettingsInput => ({
    auth_mode: reglages.auth_mode,
    encryption: reglages.encryption,
    host: reglages.host,
    port: reglages.port,
    username: reglages.username,
    oauth_client_id: reglages.oauth.client_id,
    oauth_tenant: reglages.oauth.tenant,
    ...(secretsTouches.password ? { password: motDePasse } : {}),
    ...(secretsTouches.oauth ? { oauth_secret: secretOAuth } : {}),
  });

  /** Enregistre et rend vrai si c'est passé : les actions qui suivent en dépendent. */
  const enregistrer = async (): Promise<boolean> => {
    if (!modifie) return true;

    setError(null);
    setBusy(true);
    try {
      setReglages(await api.updateMailSettings(aEnvoyer()));
      setSecretsTouches({ password: false, oauth: false });
      setMotDePasse("");
      setSecretOAuth("");
      setModifie(false);
      return true;
    } catch (e) {
      setError(messageErreur(e));
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
    saveRef.current = enregistrer;
    return () => {
      saveRef.current = null;
    };
  });

  const tester = async () => {
    // Le serveur teste ce qu'il a en base : l'affichage part avec.
    if (await enregistrer()) setTestOuvert(true);
  };

  const connecter = async () => {
    // La fenêtre s'ouvre avant les appels au serveur : ouverte plus tard, elle
    // ne serait plus rattachée au clic et les navigateurs la bloqueraient.
    const fenetre = window.open("", "milo-oauth", "width=520,height=700");
    if (!fenetre) {
      setError("Autorisez les fenêtres surgissantes pour connecter le compte Outlook");
      return;
    }

    if (!(await enregistrer())) {
      fenetre.close();
      return;
    }

    try {
      const { url } = await api.startMailOAuth();
      fenetre.location.href = url;
    } catch (e) {
      fenetre.close();
      setError(messageErreur(e));
      return;
    }

    // Rien ne revient de cette fenêtre : c'est sa fermeture qui dit que
    // l'échange est terminé, d'une façon ou d'une autre. On relit alors l'état
    // depuis le serveur, seul à savoir ce que Microsoft a répondu.
    if (surveillance.current !== null) window.clearInterval(surveillance.current);
    surveillance.current = window.setInterval(() => {
      if (!fenetre.closed) return;
      window.clearInterval(surveillance.current!);
      surveillance.current = null;
      reload();
    }, 500);
  };

  const deconnecter = async () => {
    setError(null);
    setBusy(true);
    try {
      setReglages(await api.disconnectMailOAuth());
    } catch (e) {
      setError(messageErreur(e));
    } finally {
      setBusy(false);
    }
  };

  const { oauth } = reglages;
  const parOAuth = reglages.auth_mode === "oauth-outlook";

  /**
   * Ce qu'on peut faire d'ici. Même menu que celui des onglets de tableau
   * (BoardTabs) : rien ne justifie deux façons d'ouvrir un menu dans la même
   * application. Se connecter n'a de sens qu'en OAuth ; tester, toujours.
   */
  const menuActions = (
    <Menu position="bottom-end" withinPortal>
      <Menu.Target>
        <Button
          variant="subtle"
          color="gray"
          rightSection={<IconChevronDown size={14} />}
          disabled={busy}
          // Le gris de Mantine tire sur le bleu au survol : on pose le nôtre,
          // neutre, sur la variable que Button lit pour son fond.
          style={{ "--button-hover": NEUTRAL_HOVER } as CSSProperties}
        >
          Actions
        </Button>
      </Menu.Target>

      <Menu.Dropdown>
        {parOAuth && (
          <>
            <Menu.Item leftSection={<IconPlugConnected size={16} />} onClick={connecter}>
              {oauth.connected ? "Se reconnecter" : "Se connecter"}
            </Menu.Item>
            {oauth.connected && (
              <Menu.Item leftSection={<IconPlugConnectedX size={16} />} onClick={deconnecter}>
                Déconnecter
              </Menu.Item>
            )}
            <Menu.Divider />
          </>
        )}
        <Menu.Item leftSection={<IconMailForward size={16} />} onClick={tester}>
          Tester
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );

  /**
   * L'entête d'une section : son titre, et le menu au bout de la ligne. Le
   * retrait du haut est porté par la ligne entière et non par le titre, sans
   * quoi le menu remonterait au-dessus de lui.
   */
  const enTete = (titre: string) => (
    <Group justify="space-between" align="center" wrap="nowrap" pt={SECTION_GAP}>
      <Title order={4}>{titre}</Title>
      {menuActions}
    </Group>
  );

  if (!charge) return null;

  return (
    <>
      <Stack gap="lg">
        {error && <ErrorAlert onClose={() => setError(null)}>{error}</ErrorAlert>}

        <Stack gap="sm">
          {champ(
            "Authentification",
            <Select
              aria-label="Authentification"
              data={MAIL_AUTH_MODES.map(({ value, label }) => ({ value, label }))}
              value={reglages.auth_mode}
              onChange={(value) => value && modifier({ auth_mode: value as MailAuthMode })}
              allowDeselect={false}
              style={{ flex: 1 }}
            />,
          )}

          {/* Le reste ne vaut que pour l'authentification par mot de passe : en
              OAuth Outlook, le serveur, le port et le chiffrement sont ceux
              qu'Office 365 impose, et l'expéditeur est le compte connecté.
              Les champs ne sont donc pas seulement inutiles, ils induiraient
              en erreur. Leurs valeurs restent en base pour le jour où l'on
              revient au mot de passe. */}
          {!parOAuth && (
            <>
              {enTete("Paramètres SMTP")}

              {champ(
                "Chiffrement",
                <Select
                  aria-label="Chiffrement de la connexion"
                  data={MAIL_ENCRYPTIONS.map(({ value, label }) => ({ value, label }))}
                  value={reglages.encryption}
                  onChange={(value) => value && modifier({ encryption: value as MailEncryption })}
                  allowDeselect={false}
                  style={{ flex: 1 }}
                />,
              )}

              {champ(
                "Serveur SMTP",
                // Le port ne se lit jamais sans le serveur : les deux champs se
                // touchent et n'en forment qu'un. Celui du port n'a pas de
                // bordure à gauche — c'est le bord droit du serveur qui les
                // sépare.
                <Group gap={0} wrap="nowrap" style={{ flex: 1 }}>
                  <TextInput
                    aria-label="Serveur SMTP"
                    value={reglages.host}
                    onChange={(e) => modifier({ host: e.currentTarget.value })}
                    style={{ flex: 1 }}
                    styles={{ input: { borderTopRightRadius: 0, borderBottomRightRadius: 0 } }}
                  />
                  <NumberInput
                    aria-label="Port SMTP"
                    value={reglages.port}
                    onChange={(value) => modifier({ port: Number(value) || 0 })}
                    min={1}
                    max={65535}
                    allowDecimal={false}
                    hideControls
                    w={PORT_WIDTH}
                    styles={{
                      input: {
                        borderTopLeftRadius: 0,
                        borderBottomLeftRadius: 0,
                        borderLeftWidth: 0,
                      },
                    }}
                  />
                </Group>,
              )}

              {champ(
                "Nom d'utilisateur",
                <TextInput
                  aria-label="Nom d'utilisateur"
                  value={reglages.username}
                  onChange={(e) => modifier({ username: e.currentTarget.value })}
                  style={{ flex: 1 }}
                />,
              )}

              {champ(
                "Mot de passe",
                <PasswordInput
                  aria-label="Mot de passe"
                  value={motDePasse}
                  onChange={(e) => {
                    setMotDePasse(e.currentTarget.value);
                    setSecretsTouches((s) => ({ ...s, password: true }));
                    setModifie(true);
                  }}
                  style={{ flex: 1 }}
                />,
                reglages.has_password && !secretsTouches.password ? MENTION_ENREGISTRE : null,
              )}
            </>
          )}

          {parOAuth && (
            <>
              {/* Même titre que « Messagerie » en tête du panneau : c'est une
                  seconde section, pas un libellé de champ. Elle vit dans la même
                  pile que les réglages SMTP : deux conteneurs différents leur
                  donneraient deux écarts différents au-dessus du titre. */}
              {enTete("Paramètres application Azure")}

              {/* Les deux libellés du portail Azure, mot pour mot : c'est là
                  qu'on va chercher les valeurs, autant ne pas les renommer en
                  chemin. */}
              {champ(
                "ID d'application",
                <TextInput
                  aria-label="ID d'application"
                  value={oauth.client_id}
                  onChange={(e) => modifierOAuth({ client_id: e.currentTarget.value })}
                  style={{ flex: 1 }}
                />,
              )}

              {champ(
                "ID de l'annuaire",
                <TextInput
                  aria-label="ID de l'annuaire"
                  value={oauth.tenant}
                  onChange={(e) => modifierOAuth({ tenant: e.currentTarget.value })}
                  style={{ flex: 1 }}
                />,
              )}

              {champ(
                "Secret",
                <PasswordInput
                  aria-label="Secret d'application"
                  value={secretOAuth}
                  onChange={(e) => {
                    setSecretOAuth(e.currentTarget.value);
                    setSecretsTouches((s) => ({ ...s, oauth: true }));
                    setModifie(true);
                  }}
                  style={{ flex: 1 }}
                />,
                oauth.has_secret && !secretsTouches.oauth ? MENTION_ENREGISTRE : null,
              )}

              {champ(
                "État",
                // Le menu suit l'état plutôt que de gagner le bord droit du
                // panneau : ce qu'il propose porte sur le compte, et la ligne se
                // lit d'un seul tenant. Le groupe se règle donc sur son contenu.
                <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
                  <Badge
                    color={oauth.connected ? "green" : "orange"}
                    variant="filled"
                    size="sm"
                    radius="sm"
                    tt="none"
                    fw={600}
                    style={{ flexShrink: 0 }}
                  >
                    {oauth.connected ? "Connecté" : "Non connecté"}
                  </Badge>

                  {oauth.connected && (
                    <Text size="xs" c="dimmed" truncate>
                      {oauth.account}
                      {oauth.connected_at
                        ? ` — ${dayjs(oauth.connected_at).format("DD/MM/YYYY HH:mm")}`
                        : ""}
                    </Text>
                  )}
                </Group>,
              )}
            </>
          )}
        </Stack>
      </Stack>

      <MailTestModal opened={testOuvert} onClose={() => setTestOuvert(false)} />
    </>
  );
}
