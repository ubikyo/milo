import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Group,
  Input,
  Menu,
  Modal,
  PinInput,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconChevronDown,
  IconMailCheck,
  IconCornerDownLeft,
  IconMail,
  IconMailForward,
  IconTrash,
} from "@tabler/icons-react";
import { useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { KeyboardEvent, RefObject } from "react";
import { api } from "../../api";
import { messageErreur, notifierErreur } from "../../lib/errors";
import {
  signalerConfirmation,
  useConfirmations,
} from "../../lib/confirmations";
import { useReferences } from "../../lib/references";
import { RED } from "../../themes/colors";
import {
  ACTIONS_BUTTON_STYLE,
  ROW_MENU_OFFSET,
  TAB_MENU_STYLES,
} from "../../themes/menus";
import { MODAL_PADDING, modalHeaderStyles } from "../../themes/modals";
import BoutonFermer from "../ui/BoutonFermer";
import { ActionsDuTiroirContext } from "../ui/IndicatorDrawer";
import { avec } from "../../widgets/types";
import ListItems from "../ui/ListItems";
import { receptionsDe } from "../ui/ChampReception";
import { BOITES } from "./SupportRequestsList";
import type { IndicatorConfigProps } from "../../indicators/types";
import { cleDeListe } from "@milo/shared";

// Les boîtes d'où une liste de demandes reçoit ses demandes, dans la liste
// éditable des réglages (ListItems) : une ligne par adresse, avec le contexte
// où vont ses demandes et l'état de sa confirmation. Une adresse neuve reçoit
// un code à quatre chiffres à l'enregistrement du widget, et ne se relève
// qu'une fois ce code saisi par le menu « Actions », qui le renvoie aussi aux
// adresses qui attendent (server, lib/optin.ts).

/** Une boîte : son adresse, et le contexte de ses demandes. */
interface Boite {
  email: string;
  contexte: number | null;
}

/** La clé de la configuration qui dit de supprimer les e-mails relevés (server, receptions.ts). */
const SUPPRESSION = "suppression";

// Les colonnes de la ligne : l'adresse prend le reste.
const LARGEUR_CONTEXTE = 170;
const LARGEUR_ETAT = 76;
const LARGEUR_ENTREE = 22;

// Hauteur d'un champ dans sa ligne : celle du texte.
const HAUTEUR_CHAMP = 22;
const CHAMP_EN_LIGNE = {
  input: {
    height: HAUTEUR_CHAMP,
    minHeight: HAUTEUR_CHAMP,
    lineHeight: `${HAUTEUR_CHAMP}px`,
  },
};
const colonne = (largeur: number) => ({ width: largeur, flexShrink: 0 });

/** Au-delà, la liste défile. */
const BOITES_VISIBLES = 8;

export const ressembleAUneAdresse = (email: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

const boitesDe = (config: unknown): Boite[] =>
  receptionsDe(config, BOITES).map((r) => ({
    email: typeof r.email === "string" ? r.email : "",
    contexte: typeof r.contexte === "number" ? r.contexte : null,
  }));

/** L'état d'une adresse : confirmée, ou en attente — une adresse pas encore enregistrée aussi. */
function Etat({ confirmee }: { confirmee: boolean }) {
  return (
    <Box
      style={{
        ...colonne(LARGEUR_ETAT),
        display: "flex",
        justifyContent: "flex-end",
      }}
    >
      {/* L'étiquette des états de l'application (EntraTab) : pleine, verte ou rouge. */}
      <Badge
        color={confirmee ? "green" : RED}
        variant="filled"
        size="sm"
        radius="sm"
        tt="none"
        fw={600}
      >
        {confirmee ? "Confirmé" : "En attente"}
      </Badge>
    </Box>
  );
}

/** Les champs d'une boîte, en ligne : ceux d'une ligne de la liste comme ceux de l'ajout. */
function ChampsBoite({
  boite,
  onChange,
  contextes,
  onEntree,
  onEchap,
  premierChamp,
}: {
  boite: Boite;
  onChange: (boite: Boite) => void;
  contextes: { value: string; label: string }[];
  onEntree?: () => void;
  onEchap?: () => void;
  premierChamp?: RefObject<HTMLInputElement | null>;
}) {
  const touche = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && onEntree) {
      e.preventDefault();
      onEntree();
    }
    if (e.key === "Escape") onEchap?.();
  };
  return (
    <>
      <TextInput
        ref={premierChamp}
        variant="unstyled"
        size="sm"
        styles={CHAMP_EN_LIGNE}
        placeholder="Adresse e-mail"
        aria-label="Adresse e-mail"
        value={boite.email}
        onChange={(e) =>
          onChange({ ...boite, email: e.currentTarget.value.trim() })
        }
        onKeyDown={touche}
        style={{ flex: 1, minWidth: 0 }}
      />
      {/* Un tableau sans contexte reçoit sans contexte : rien à choisir. */}
      {contextes.length > 0 && (
        <Select
          variant="unstyled"
          size="sm"
          styles={CHAMP_EN_LIGNE}
          aria-label="Contexte"
          placeholder="Contexte"
          data={contextes}
          value={boite.contexte ? String(boite.contexte) : null}
          onChange={(valeur) =>
            onChange({ ...boite, contexte: valeur ? Number(valeur) : null })
          }
          allowDeselect={false}
          rightSectionWidth={20}
          style={colonne(LARGEUR_CONTEXTE)}
        />
      )}
    </>
  );
}

/** Les boîtes de réception d'une liste de demandes, et ce qu'elle fait des e-mails relevés. */
export default function BoitesDeReception({
  config,
  onChange,
}: IndicatorConfigProps) {
  const { contexts } = useReferences();
  const contextes = contexts.map((c) => ({
    value: String(c.id),
    label: c.name,
  }));
  const boites = boitesDe(config);
  // Aucun contexte d'office : on le choisit, s'il y en a à choisir.
  const boiteVide = (): Boite => ({ email: "", contexte: null });
  /** Une adresse lisible, et son contexte quand le tableau en a : de quoi l'ajouter. */
  const complete = (boite: Boite) =>
    ressembleAUneAdresse(boite.email) &&
    (contextes.length === 0 || boite.contexte !== null);
  const [nouvelle, setNouvelle] = useState<Boite>(boiteVide);
  // La liste que le widget désigne : ses confirmations sont les siennes. Un
  // widget pas encore enregistré n'en a pas — tout y attend.
  const liste = cleDeListe(config);
  const premierChamp = useRef<HTMLInputElement | null>(null);
  const [relance, setRelance] = useState(false);
  const [aConfirmer, setAConfirmer] = useState(false);
  const cibleActions = useContext(ActionsDuTiroirContext);

  const ranger = (liste: Boite[]) => onChange(avec(config, BOITES, liste));

  // Les états de confirmation, relus régulièrement : la boîte peut confirmer
  // pendant que le tiroir est ouvert.
  const adresses = boites
    .map((b) => b.email.trim().toLowerCase())
    .filter(ressembleAUneAdresse);
  const { confirmee } = useConfirmations(liste, adresses);

  const enAttente = [...new Set(adresses)].filter((e) => !confirmee(e));

  const relancer = async () => {
    setRelance(true);
    try {
      const { sent } = await api.resendMailboxOptins(liste, enAttente);
      notifications.show({
        color: sent ? "teal" : "gray",
        title: sent ? "Confirmation relancée" : "Rien n'est parti",
        message: sent
          ? `${sent} e-mail${sent > 1 ? "s" : ""} de confirmation envoyé${sent > 1 ? "s" : ""}.`
          : "Enregistrez d'abord les adresses : le code leur est envoyé à l'enregistrement.",
      });
    } catch (e) {
      notifierErreur(messageErreur(e), "La relance a échoué");
    } finally {
      setRelance(false);
    }
  };

  // Sans adresse lisible, ou sans contexte quand le tableau en a, il n'y a
  // rien à relever. Le focus revient au champ, et la ligne repart vide.
  const ajouter = () => {
    if (!complete(nouvelle)) return;
    ranger([...boites, nouvelle]);
    setNouvelle(boiteVide());
    premierChamp.current?.focus();
  };

  return (
    <Stack gap="xs">
      <Input.Label>Adresses de réception</Input.Label>
      <Text size="xs" c="dimmed">
        Une fois une adresse ajoutée, cliquer sur le menu « Actions », puis «
        Confirmer une adresse » et saisir le code reçu sur l'adresse e-mail. En
        cas de non réception du code, relancer la nouvelle confirmation depuis
        le menu « Actions ».
      </Text>
      {/* Le menu « Actions » se pose au bout de la rangée d'onglets du tiroir. */}
      {cibleActions &&
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
                loading={relance}
                // Rien à confirmer ni à relancer sans adresse en attente.
                disabled={enAttente.length === 0}
                style={ACTIONS_BUTTON_STYLE}
              >
                Actions
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                leftSection={<IconMailCheck size={16} />}
                disabled={enAttente.length === 0}
                onClick={() => setAConfirmer(true)}
              >
                Confirmer une adresse
              </Menu.Item>
              <Menu.Item
                leftSection={<IconMailForward size={16} />}
                disabled={enAttente.length === 0}
                onClick={() => void relancer()}
              >
                Relancer confirmation
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>,
          cibleActions,
        )}
      <ListItems
        isEmpty={boites.length === 0}
        emptyIcon={IconMail}
        emptyText="Aucune adresse"
        maxRows={BOITES_VISIBLES}
        add={{
          input: (
            <>
              <ChampsBoite
                boite={nouvelle}
                onChange={setNouvelle}
                contextes={contextes}
                onEntree={ajouter}
                onEchap={() => setNouvelle(boiteVide())}
                premierChamp={premierChamp}
              />
              <Box style={colonne(LARGEUR_ETAT)} />
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                onClick={ajouter}
                // Une adresse qui n'en a pas l'air, ou sans contexte, ne s'ajoute pas.
                disabled={!complete(nouvelle)}
                style={{ flexShrink: 0, opacity: 0.5 }}
                aria-label="Ajouter l'adresse"
              >
                <IconCornerDownLeft size={14} />
              </ActionIcon>
            </>
          ),
        }}
      >
        {boites.map((boite, i) => (
          <ListItems.Row
            key={i}
            actions={[
              {
                label: "Supprimer",
                icon: IconTrash,
                onClick: () => ranger(boites.filter((_, j) => j !== i)),
                danger: true,
              },
            ]}
          >
            <ChampsBoite
              boite={boite}
              contextes={contextes}
              onChange={(modifiee) =>
                ranger(boites.map((b, j) => (j === i ? modifiee : b)))
              }
            />
            <Etat confirmee={confirmee(boite.email)} />
            <Box style={colonne(LARGEUR_ENTREE)} />
          </ListItems.Row>
        ))}
      </ListItems>
      <ConfirmerModal
        liste={liste}
        opened={aConfirmer}
        adresses={enAttente}
        onClose={() => setAConfirmer(false)}
      />
      <Switch
        mt="xs"
        color="teal"
        label="Supprimer les e-mails relevés de la boîte"
        checked={
          (config as Record<string, unknown> | null)?.[SUPPRESSION] === true
        }
        onChange={(e) =>
          onChange(avec(config, SUPPRESSION, e.currentTarget.checked))
        }
      />
    </Stack>
  );
}

/**
 * La saisie du code à quatre chiffres reçu par la boîte.
 * Plusieurs adresses attendent : on choisit d'abord laquelle.
 */
function ConfirmerModal({
  liste,
  opened,
  adresses,
  onClose,
}: {
  liste: string;
  opened: boolean;
  adresses: string[];
  onClose: () => void;
}) {
  const [email, setEmail] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  // Chaque ouverture repart de zéro, sur la première adresse qui attend.
  useEffect(() => {
    if (!opened) return;
    setEmail(adresses[0] ?? null);
    setCode("");
    setErreur(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened]);

  const confirmer = async (saisi = code) => {
    if (!email || saisi.length !== 4) return;
    setEnvoi(true);
    setErreur(null);
    try {
      await api.confirmMailboxOptin(liste, email, saisi);
      notifications.show({
        color: "teal",
        title: "Adresse confirmée",
        message: email,
      });
      signalerConfirmation();
      onClose();
    } catch (e) {
      setErreur(messageErreur(e));
      notifierErreur(messageErreur(e));
      setCode("");
    } finally {
      setEnvoi(false);
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
        {adresses.length > 1 && (
          <Select
            label="Adresse"
            data={adresses}
            value={email}
            onChange={(valeur) => {
              setEmail(valeur);
              setErreur(null);
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
            onComplete={(saisi) => void confirmer(saisi)}
            error={Boolean(erreur)}
            disabled={envoi}
            aria-label="Code de confirmation"
          />
        </Group>
      </Stack>
      <Group justify="flex-end" mt={MODAL_PADDING}>
        <BoutonFermer onClick={onClose}>Annuler</BoutonFermer>
        <Button
          color="teal"
          onClick={() => void confirmer()}
          disabled={code.length !== 4 || !email}
          loading={envoi}
        >
          Confirmer
        </Button>
      </Group>
    </Modal>
  );
}
