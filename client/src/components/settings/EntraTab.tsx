import {
  Badge,
  Button,
  CopyButton,
  Group,
  Menu,
  Modal,
  PasswordInput,
  Select,
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
  IconMailSearch,
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
import ErrorAlert from "../ui/ErrorAlert";
import ListItems from "../ui/ListItems";
import SuccessAlert from "../ui/SuccessAlert";
import { messageErreur } from "../../lib/errors";
import type {
  EntraSettings,
  Company,
  EntraSettingsInput,
  EntraStatus,
  MailboxCheck,
} from "@milo/shared";
import type { CSSProperties } from "react";
import BoutonFermer from "../ui/BoutonFermer";

/** Ce que montre l'état de la connexion, selon ce que le serveur en dit. */
const ETATS: Record<EntraStatus["state"], { libelle: string; couleur: string }> = {
  connected: { libelle: "Connecté", couleur: "green" },
  error: { libelle: "Refusé", couleur: "red" },
  disconnected: { libelle: "Déconnecté", couleur: "gray" },
  unconfigured: { libelle: "Non configuré", couleur: "gray" },
};

/**
 * Ce que montre le champ d'un secret enregistré : le serveur ne le renvoie
 * jamais, on simule donc sa présence par des points.
 */
const MASQUE = "********";

/**
 * La saisie dans un champ qui montre encore le masque : on n'en garde que ce
 * que la personne a tapé. Le champ sélectionne le masque au focus, la frappe
 * le remplace donc d'ordinaire ; si le curseur s'est posé dedans, on retire
 * les points du masque restés autour du texte tapé, et un effacement le vide.
 */
function sansMasque(valeur: string): string {
  if (/^\**$/.test(valeur) && valeur.length < MASQUE.length) return "";
  if (valeur.length <= MASQUE.length) return valeur;
  let reste = MASQUE.length;
  let tape = "";
  for (const c of valeur) {
    if (c === "*" && reste > 0) reste -= 1;
    else tape += c;
  }
  return reste === 0 ? tape : valeur;
}

/**
 * L'essai d'envoi. Il porte sur les réglages enregistrés : l'onglet les a
 * envoyés juste avant d'ouvrir cette fenêtre, sinon le test parlerait d'une
 * configuration que le serveur ne connaît pas encore.
 */
function MailTestModal({
  opened,
  onClose,
  companies,
}: {
  opened: boolean;
  onClose: () => void;
  companies: Company[];
}) {
  // Seules les sociétés qui ont une boîte de support peuvent expédier.
  const expeditrices = companies.filter((c) => c.support_email);
  const [societe, setSociete] = useState<string | null>(null);
  const [adresse, setAdresse] = useState("");
  const [envoye, setEnvoye] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const envoyer = async () => {
    setError(null);
    setEnvoye(null);
    setBusy(true);
    try {
      const { sent_to } = await api.testMail(adresse.trim(), Number(societe));
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
      title="Tester l'envoi"
      centered
      padding={MODAL_PADDING}
      withCloseButton={false}
      styles={modalHeaderStyles(MODAL_PADDING)}
    >
      <Stack gap="md">
        <Text size="sm">
          Le message part de la boîte de support de la société choisie.
        </Text>

        <Select
          label="Société"
          placeholder={
            expeditrices.length
              ? "Choisir"
              : "Aucune société n'a d'e-mail de support"
          }
          data={expeditrices.map((c) => ({
            value: String(c.id),
            label: c.name,
          }))}
          value={societe}
          onChange={setSociete}
          allowDeselect={false}
          disabled={!expeditrices.length}
        />

        <TextInput
          label="Adresse de test"
          type="email"
          value={adresse}
          onChange={(e) => setAdresse(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && adresse.trim() && societe) envoyer();
          }}
        />

        {error && (
          <ErrorAlert onClose={() => setError(null)}>{error}</ErrorAlert>
        )}
        {envoye && (
          <SuccessAlert>
            <Text size="sm">Message envoyé à {envoye}.</Text>
          </SuccessAlert>
        )}

        <Group justify="flex-end" mt="md">
          <BoutonFermer onClick={onClose} />
          {/* Le vert des actions qui valident, celui de la coche des comptes
              et du compte rendu d'un envoi réussi. */}
          <Button
            color="teal"
            leftSection={<IconSend size={16} />}
            onClick={envoyer}
            loading={busy}
            disabled={!adresse.trim() || !societe}
          >
            Envoyer
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

/**
 * L'accès de Milo aux boîtes de support des sociétés : une ligne par société
 * qui en a une, et ce que Microsoft a répondu à la lecture d'un message.
 */
function MailboxesModal({
  opened,
  onClose,
}: {
  opened: boolean;
  onClose: () => void;
}) {
  const [resultats, setResultats] = useState<MailboxCheck[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!opened) return;
    setResultats(null);
    setError(null);
    api
      .checkMailboxes()
      .then(setResultats)
      .catch((e) => setError(messageErreur(e)));
  }, [opened]);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Boîtes de support"
      centered
      size="lg"
      padding={MODAL_PADDING}
      withCloseButton={false}
      styles={modalHeaderStyles(MODAL_PADDING)}
    >
      <Stack gap="md">
        {error && <ErrorAlert>{error}</ErrorAlert>}
        {!resultats && !error && (
          <Text size="sm" c="dimmed">
            Vérification en cours…
          </Text>
        )}
        {resultats && resultats.length === 0 && (
          <Text size="sm" c="dimmed">
            Aucune société n'a d'e-mail de support.
          </Text>
        )}
        {resultats && resultats.length > 0 && (
          <ListItems maxRows={8} rowHeight={ROW_BOITE}>
            {resultats.map((r) => (
              <ListItems.Row key={r.company_id} height={ROW_BOITE}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Text size="sm" truncate>
                    {r.company_name}
                  </Text>
                  <Text
                    size="xs"
                    c="dimmed"
                    truncate
                  >
                    {r.ok ? r.email : `${r.email} — ${r.error}`}
                  </Text>
                </div>
                <Badge
                  color={r.ok ? "green" : "red"}
                  variant="filled"
                  size="sm"
                  radius="sm"
                  tt="none"
                  fw={600}
                  style={{ flexShrink: 0 }}
                >
                  {r.ok ? "Accessible" : "Refusée"}
                </Badge>
              </ListItems.Row>
            ))}
          </ListItems>
        )}
        <Group justify="flex-end" mt="md">
          <BoutonFermer onClick={onClose} />
        </Group>
      </Stack>
    </Modal>
  );
}

// Une boîte tient sur deux lignes : la société, puis l'adresse.
const ROW_BOITE = 52;

interface EntraTabProps {
  /** Les sociétés : le message d'essai part de la boîte de support de l'une d'elles. */
  companies: Company[];
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
  onSettings?: (reglages: EntraSettings) => void;
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
  companies,
}: EntraTabProps) {
  const [reglages, setReglages] = useState<EntraSettings>(emptyEntraSettings());
  const [secret, setSecret] = useState("");
  const [secretTouche, setSecretTouche] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Rien n'a bougé : « Enregistrer » n'a alors rien à envoyer.
  const [modifie, setModifie] = useState(false);
  // Tant que le serveur n'a pas répondu, l'onglet ne montre rien : affiché
  // avec ses valeurs par défaut, il montrerait des champs vides qui se
  // rempliraient d'un coup.
  const [charge, setCharge] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testOuvert, setTestOuvert] = useState(false);
  const [boitesOuvert, setBoitesOuvert] = useState(false);
  // L'état de la connexion de Milo à Entra : nul tant qu'il n'est pas connu.
  const [etat, setEtat] = useState<EntraStatus | null>(null);

  const lireEtat = useCallback(() => {
    setEtat(null);
    api
      .getEntraStatus()
      .then(setEtat)
      .catch((e) => setError(messageErreur(e)));
  }, []);

  useEffect(() => {
    lireEtat();
  }, [lireEtat]);

  const reload = useCallback(async () => {
    try {
      const lus = await api.getEntraSettings();
      setReglages(lus);
      onSettings?.(lus);
      setModifie(false);
    } catch (e) {
      setError(messageErreur(e));
    } finally {
      // Même si la lecture a échoué : le message vaut mieux qu'un onglet vide.
      setCharge(true);
    }
  }, [onSettings]);

  useEffect(() => {
    reload();
  }, [reload]);

  const modifier = (champs: Partial<EntraSettings>) => {
    setReglages((r) => ({ ...r, ...champs }));
    setModifie(true);
  };

  /** Ce qui part au serveur : les réglages, et le secret seulement si on y a touché. */
  const aEnvoyer = (): EntraSettingsInput => ({
    client_id: reglages.client_id,
    tenant: reglages.tenant,
    ...(secretTouche ? { secret } : {}),
  });

  /** Enregistre et rend vrai si c'est passé : les actions qui suivent en dépendent. */
  const enregistrer = async (): Promise<boolean> => {
    if (!modifie) return true;

    setError(null);
    setBusy(true);
    try {
      const enregistres = await api.updateEntraSettings(aEnvoyer());
      setReglages(enregistres);
      onSettings?.(enregistres);
      setSecretTouche(false);
      setSecret("");
      setModifie(false);
      // De nouveaux identifiants changent la réponse de Microsoft.
      lireEtat();
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

  // Les vérifications portent sur ce que le serveur a en base : l'affichage
  // part avec.
  const tester = async () => {
    if (await enregistrer()) setTestOuvert(true);
  };
  const verifierBoites = async () => {
    if (await enregistrer()) setBoitesOuvert(true);
  };

  /** Se reconnecter avec ce qui est saisi, ou se déconnecter. */
  const changerConnexion = async (connecter: boolean) => {
    if (connecter && !(await enregistrer())) return;
    setError(null);
    setBusy(true);
    setEtat(null);
    try {
      setEtat(await (connecter ? api.connectEntra() : api.disconnectEntra()));
    } catch (e) {
      setError(messageErreur(e));
    } finally {
      setBusy(false);
    }
  };

  // Déconnecté, Milo ne passe plus par Microsoft : les vérifications
  // échoueraient d'office.
  const deconnecte = etat?.state === "disconnected";

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
          // Le gris de Mantine tire sur le bleu au survol : on pose le nôtre,
          // neutre, sur la variable que Button lit pour son fond.
          style={{ "--button-hover": NEUTRAL_HOVER } as CSSProperties}
        >
          Actions
        </Button>
      </Menu.Target>

      <Menu.Dropdown>
        <Menu.Item
          leftSection={<IconMailForward size={16} />}
          onClick={tester}
          disabled={deconnecte}
        >
          Tester l'envoi
        </Menu.Item>
        <Menu.Item
          leftSection={<IconMailSearch size={16} />}
          onClick={verifierBoites}
          disabled={deconnecte}
        >
          Vérifier les boîtes de support
        </Menu.Item>
        <Menu.Divider />
        <Menu.Item
          leftSection={<IconPlugConnected size={16} />}
          onClick={() => void changerConnexion(true)}
        >
          Se reconnecter
        </Menu.Item>
        <Menu.Item
          leftSection={<IconPlugConnectedX size={16} />}
          onClick={() => void changerConnexion(false)}
          disabled={
            !etat ||
            etat.state === "disconnected" ||
            etat.state === "unconfigured"
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
  const badgeEtat = etat ? (
    <Tooltip
      label={etat.error}
      disabled={!etat.error}
      multiline
      maw={360}
      withinPortal
    >
      <Badge
        color={ETATS[etat.state].couleur}
        variant="filled"
        size="sm"
        radius="sm"
        tt="none"
        fw={600}
      >
        {ETATS[etat.state].libelle}
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
  const masque = reglages.has_secret && !secretTouche;
  const champSecret = (
    <PasswordInput
      label="Secret"
      value={masque ? MASQUE : secret}
      visibilityToggleButtonProps={
        masque ? { style: { display: "none" } } : undefined
      }
      onFocus={(e) => {
        if (masque) e.currentTarget.select();
      }}
      onChange={(e) => {
        const saisie = e.currentTarget.value;
        setSecret(masque ? sansMasque(saisie) : saisie);
        setSecretTouche(true);
        setModifie(true);
      }}
    />
  );

  if (!charge) return null;

  return (
    <>
      <Stack gap="lg">
        {error && (
          <ErrorAlert onClose={() => setError(null)}>{error}</ErrorAlert>
        )}

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
              value={reglages.client_id}
              onChange={(e) => modifier({ client_id: e.currentTarget.value })}
            />
            <TextInput
              label="ID de l'annuaire"
              value={reglages.tenant}
              onChange={(e) => modifier({ tenant: e.currentTarget.value })}
            />
            {/* Le secret et la redirection dans la colonne de gauche, à la
                largeur de l'ID d'application. */}
            {champSecret}
            <div />
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
            {badgeEtat}
            {menuActions}
          </Group>,
          actionsTarget,
        )}

      <MailTestModal
        opened={testOuvert}
        onClose={() => setTestOuvert(false)}
        companies={companies}
      />
      <MailboxesModal
        opened={boitesOuvert}
        onClose={() => setBoitesOuvert(false)}
      />
    </>
  );
}
