import {
  Badge,
  Button,
  Drawer,
  Group,
  Input,
  Menu,
  Paper,
  ScrollArea,
  Select,
  Stack,
  Tabs,
  Text,
  TextInput,
} from "@mantine/core";
import { DateTimePicker } from "@mantine/dates";
import {
  IconCheck,
  IconChevronDown,
  IconEye,
  IconMessage,
  IconSettings,
} from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "../../api";
import {
  ACTIONS_BUTTON_STYLE,
  DRAWER_MENU_OFFSET,
  TAB_MENU_STYLES,
} from "../../themes/menus";
import { tabStyle } from "../../themes/tabs";
import { ACTOR_GAP, PersonAvatar, SenderAvatar } from "../ui/ActorAvatars";
import ActorPicker from "../ui/ActorPicker";
import DeleteConfirmModal from "../ui/DeleteConfirmModal";
import DrawerFooter from "../ui/DrawerFooter";
import DrawerScrollArea, {
  DRAWER_PANEL_STYLE,
  DRAWER_STYLES,
  DRAWER_TABS_STYLES,
} from "../ui/DrawerScroll";
import EmptyPanel from "../ui/EmptyPanel";
import LabelPicker, { SUPPORT_LABELS_API } from "../ui/LabelPicker";
import CommentThread from "../project/CommentThread";
import { FIELDSET_NU, useDroits } from "../../lib/droits";
import SupportMessages, { SupportReply } from "./SupportMessages";
import type { EnvoiReponse, MessageSupport } from "./SupportMessages";
import { messageErreur, notifierErreur } from "../../lib/errors";
import {
  DEFAULT_SUPPORT_STATUS,
  MILO_ACTOR_ID,
  SUPPORT_STATUSES,
  fillSupportTemplate,
  supportReplyValues,
  supportTicketRef,
} from "@milo/shared";
import type { CSSProperties } from "react";
import type {
  Context,
  Id,
  PublicUser,
  SupportContent,
  SupportContentEvent,
  SupportPerson,
  SupportLabel,
  SupportRequest,
  SupportRequestInput,
  SupportStatus,
} from "@milo/shared";

// Deux volets : le ticket et ses échanges avec l'expéditeur, puis les
// commentaires internes de l'équipe — comme sur une carte ou un projet.
const TABS = [
  { value: "settings", label: "Ticket", icon: IconSettings },
  { value: "comments", label: "Commentaires", icon: IconMessage },
];

// Le panneau des messages ne descend pas sous cette hauteur, même quand la
// fiche au-dessus prend de la place : on y lit toujours au moins un message.
const MESSAGES_MIN_HEIGHT = 200;

const DRAWER_PADDING = 40;

/** Une réponse de l'équipe : ni un e-mail reçu, ni un mot de Milo. */
const deLEquipe = (m: MessageSupport): boolean =>
  m.format !== "email" && !m.system && m.author?.id !== MILO_ACTOR_ID;

/**
 * L'évènement que vit la prochaine réponse de l'équipe, d'après le fil : vide,
 * l'expéditeur seul y a écrit, ou l'équipe a déjà répondu.
 */
const evenementDuFil = (echanges: MessageSupport[]): SupportContentEvent =>
  echanges.some(deLEquipe)
    ? "reply"
    : echanges.some((m) => m.format === "email")
      ? "first_reply"
      : "new";

// Bien plus large que les autres tiroirs (560) : une demande tient ses
// acteurs, ses étiquettes et ses échanges côte à côte, et son fil se lit sans
// que chaque commentaire retombe à la ligne.
const DRAWER_WIDTH = 920;

// À la création, 100 px de plus que pour une demande ouverte.
const DRAWER_WIDTH_CREATION = DRAWER_WIDTH + 100;

// La colonne des acteurs, dans l'onglet « Ticket » : de quoi tenir quelques
// bulles et le « + », sans prendre la place des étiquettes.
const ACTEURS_WIDTH = 140;

// Hauteur des étiquettes et du « + » qui les suit, comme sur la fiche d'une
// carte.
const CHIP_HEIGHT = 30;

/**
 * La fiche d'une demande de support. Elle s'ouvre au clic sur une ligne, ou
 * vide depuis « Nouvelle demande de support », et se referme en enregistrant.
 *
 * Ses acteurs et ses étiquettes se posent comme les membres et les étiquettes
 * d'une carte : on en choisit autant qu'il faut, dans la même liste à cocher.
 */
interface SupportRequestDrawerProps {
  opened: boolean;
  onClose: () => void;
  /** « null » à la création, la demande visée sinon. */
  request: SupportRequest | null;
  /**
   * Le contexte proposé à la création : celui qu'on regarde, ou le premier du
   * tableau sous « Tous les contextes ». Une demande déjà ouverte garde le
   * sien, quelle que soit cette valeur.
   */
  contextId: string;
  /** Les contextes du tableau : une demande peut passer de l'un à l'autre. */
  contexts: Context[];
  /** Le tableau ouvert : une demande saisie sans contexte y prend le premier. */
  boardId: Id | null;
  /** À la création : le widget « Demandes de support » d'où on la saisit. */
  listKey?: string;
  /** Le statut de l'onglet ouvert : celui que prend une demande créée là. */
  defaultStatus: SupportStatus;
  /** L'objet proposé à la création : celui de l'élément d'où on la crée. */
  defaultSubject?: string;
  /**
   * Qui crée la demande en est l'acteur d'office — sauf depuis le mode Accès,
   * où l'on signale un problème sans s'en charger.
   */
  assignCurrentUser?: boolean;
  users: PublicUser[];
  currentUser: PublicUser;
  onSaved: () => void | Promise<void>;
  onDeleted: () => void | Promise<void>;
  /** La personne suit cette demande : elle est prévenue de chaque modification. */
  suivi: boolean;
  onToggleFollow: () => void | Promise<void>;
}

export default function SupportRequestDrawer({
  opened,
  onClose,
  request,
  contextId,
  contexts,
  boardId,
  listKey,
  defaultStatus,
  defaultSubject = "",
  assignCurrentUser = true,
  users,
  currentUser,
  onSaved,
  onDeleted,
  suivi,
  onToggleFollow,
}: SupportRequestDrawerProps) {
  const [subject, setSubject] = useState("");
  const [status, setStatus] = useState<SupportStatus>(DEFAULT_SUPPORT_STATUS);
  /**
   * Le contexte de la demande. À la création il est proposé — celui qu'on
   * regarde, ou le premier —, et reste modifiable : c'est ainsi qu'on
   * rattrape une demande ouverte au mauvais endroit.
   */
  const [contexteId, setContexteId] = useState(contextId);
  /** Les étiquettes du support, communes à tous les contextes. */
  const [etiquettes, setEtiquettes] = useState<SupportLabel[]>([]);
  /** Les acteurs retenus, en chaînes : ceux qui s'occupent de la demande. */
  const [actorIds, setActorIds] = useState<string[]>([]);
  const [labelIds, setLabelIds] = useState<string[]>([]);
  /** L'échéance, en ISO ; vide quand la demande n'en a pas. */
  const [echeance, setEcheance] = useState("");
  const [comments, setComments] = useState<MessageSupport[]>([]);
  /** Les contenus par défaut, que la réponse pose dans son éditeur. */
  const [contenus, setContenus] = useState<SupportContent[]>([]);
  /** Les fiches Entra que leurs variables citent : qui écrit, et l'expéditeur. */
  const [personnes, setPersonnes] = useState<{
    utilisateur: SupportPerson | null;
    expediteur: SupportPerson | null;
  }>({ utilisateur: null, expediteur: null });
  const [activeTab, setActiveTab] = useState<string | null>("settings");
  const [confirmDeleteOpened, setConfirmDeleteOpened] = useState(false);
  const [enregistrement, setEnregistrement] = useState(false);

  // Sans le droit de modifier les demandes, la fiche se lit seulement.
  const peut = useDroits();
  const lectureSeule = Boolean(request) && !peut("support", "update");
  const peutSupprimer = Boolean(request) && peut("support", "delete");

  useEffect(() => {
    if (!opened) return;
    // Un tiroir rouvert repart des paramètres, quel que soit l'onglet quitté.
    setActiveTab("settings");

    if (!request) {
      setContexteId(contextId);
      setSubject(defaultSubject);
      setStatus(defaultStatus);
      // Qui crée la demande s'en occupe, jusqu'à ce qu'on en décide autrement.
      setActorIds(assignCurrentUser ? [String(currentUser.id)] : []);
      setLabelIds([]);
      setEcheance("");
      setComments([]);
      return;
    }

    setContexteId(String(request.context_id));
    setSubject(request.subject);
    setStatus(request.status);
    setActorIds(request.actors.map((a) => String(a.id)));
    setLabelIds(request.labels.map((l) => String(l.id)));
    setEcheance(request.due_date || "");
    api
      .getSupportRequest(request.id)
      .then((fiche) => setComments(fiche.comments))
      .catch((e) => notifierErreur(messageErreur(e)));
  }, [
    opened,
    request,
    defaultStatus,
    defaultSubject,
    contextId,
    assignCurrentUser,
    currentUser.id,
  ]);

  /** Les étiquettes du support : communes à toutes les sociétés. */
  const relireEtiquettes = useCallback(async () => {
    try {
      setEtiquettes(await api.getSupportLabels());
    } catch (e) {
      notifierErreur(messageErreur(e));
    }
  }, []);

  useEffect(() => {
    if (opened) void relireEtiquettes();
  }, [opened, relireEtiquettes]);

  useEffect(() => {
    if (!opened) return;
    api
      .getSupportContents()
      .then(setContenus)
      .catch((e) => notifierErreur(messageErreur(e)));
  }, [opened]);

  const demandeId = request?.id;
  useEffect(() => {
    if (!opened) return;
    setPersonnes({ utilisateur: null, expediteur: null });
    api
      .getSupportVariables(demandeId)
      .then(setPersonnes)
      .catch((e) => notifierErreur(messageErreur(e)));
  }, [opened, demandeId]);

  // Un seul fil côté serveur, deux côté fiche : les échanges avec
  // l'expéditeur, et les commentaires internes.
  const echanges = comments.filter((c) => !c.internal);
  const notes = comments.filter((c) => c.internal);

  // Ce que la réponse porte d'office : le contenu du moment du fil, puis celui
  // de tout message — une signature — après une ligne vide ; leurs variables
  // remplies avec la fiche Entra de qui écrit, celle de l'expéditeur, et la
  // demande. Avant création, elle n'a ni numéro ni expéditeur : ces
  // variables restent vides. Le rendu attend les fiches, pour ne pas poser
  // une signature sans téléphone qui se corrigerait sous les yeux.
  const contenuPour = (evenement: SupportContentEvent) =>
    contenus.find((c) => c.event === evenement)?.html ?? "";
  const modeleReponse = (() => {
    const html = [contenuPour(evenementDuFil(echanges)), contenuPour("all")]
      .filter(Boolean)
      .join("<p></p>");
    if (!html || !personnes.utilisateur) return "";
    const valeurs = supportReplyValues({
      ...personnes,
      demande: { number: request?.number ?? 0, subject, status },
    });
    return fillSupportTemplate(html, valeurs);
  })();

  const refreshComments = async () => {
    if (!request) return;
    const fiche = await api.getSupportRequest(request.id);
    setComments(fiche.comments);
  };

  /**
   * Ce que la demande porte. Rien de tout cela n'est obligatoire : une demande
   * sans objet se lit par son fil.
   */
  const saisie = (): SupportRequestInput => ({
    context_id: contexteId ? Number(contexteId) : undefined,
    subject: subject.trim(),
    status,
    actor_ids: actorIds.map(Number),
    due_date: echeance,
    label_ids: labelIds.map(Number),
  });

  /** Cette adresse est-elle celle de qui a écrit à la boîte de support ? */
  const estExpediteur = (email: string): boolean =>
    Boolean(request?.sender_email) &&
    email.toLowerCase() === request!.sender_email.toLowerCase();

  /** L'expéditeur, quand aucun compte choisi ne porte déjà son adresse. */
  const expediteur =
    request?.sender_email &&
    !users.some(
      (u) =>
        actorIds.includes(String(u.id)) &&
        u.email.toLowerCase() === request.sender_email.toLowerCase(),
    )
      ? {
          id: 0,
          name: request.sender_name || request.sender_email,
          email: request.sender_email,
          gravatar_url: "",
        }
      : null;

  /** Vrai dès que la demande dit quelque chose : de quoi valoir d'être créée. */
  // L'acteur posé d'office — qui crée la demande — ne suffit pas à la remplir.
  const remplie = Boolean(
    subject.trim() ||
    actorIds.some((id) => id !== String(currentUser.id)) ||
    labelIds.length ||
    echeance ||
    comments.length,
  );

  // « Sauvegarder » : le seul geste qui écrit. Une demande neuve dont rien
  // n'a été dit n'est pas créée. Si le serveur refuse, le tiroir reste ouvert
  // avec le message plutôt que d'emporter la saisie.
  const sauvegarder = async () => {
    if (!request && !remplie) return onClose();
    setEnregistrement(true);
    try {
      if (request) {
        await api.updateSupportRequest(request.id, saisie());
      } else {
        const creee = await api.createSupportRequest({
          ...saisie(),
          board_id: boardId ?? undefined,
          list_key: listKey || undefined,
        });
        // Les échanges tenus avant la création partent à sa suite.
        for (const comment of comments) {
          await api.addSupportComment(
            creee.id,
            comment.text,
            Boolean(comment.internal),
          );
        }
      }
      await onSaved();
      onClose();
    } catch (e) {
      notifierErreur(messageErreur(e));
    } finally {
      setEnregistrement(false);
    }
  };

  const supprimer = async () => {
    setConfirmDeleteOpened(false);
    if (!request) return;
    try {
      await api.deleteSupportRequest(request.id);
      await onDeleted();
    } catch (e) {
      notifierErreur(messageErreur(e));
    }
  };

  // Avant création, les commentaires vivent en local et partent au serveur une
  // fois la demande enregistrée — comme ceux d'un projet qu'on ouvre.
  const ajouterCommentaire = async (texte: string, envoi?: EnvoiReponse) => {
    // Le bouton d'envoi dit où en est la demande : la fiche le montre aussitôt.
    if (envoi) setStatus(envoi.status);
    if (!request) {
      const instant = new Date().toISOString();
      const moi = String(currentUser.id);
      setActorIds((deja) => (deja.includes(moi) ? deja : [...deja, moi]));
      setComments((fil) => [
        ...fil,
        {
          id: `draft-${instant}-${fil.length}`,
          text: texte,
          author: currentUser,
          created_at: instant,
          updated_at: instant,
        },
      ]);
      return;
    }
    // Les pièces jointes partent d'abord, une à une : la réponse ne porte
    // ensuite que leurs noms de rangement.
    const { files = [], ...reste } = envoi ?? {};
    const deposes = [];
    for (const fichier of files)
      deposes.push(await api.uploadSupportFile(request.id, fichier));
    await api.addSupportComment(request.id, texte, false, {
      ...reste,
      files: deposes,
    });
    // Qui écrit devient acteur : le serveur l'a posé, la fiche le montre — et
    // l'enregistrement de la fiche ne l'en retirera pas.
    const moi = String(currentUser.id);
    setActorIds((deja) => (deja.includes(moi) ? deja : [...deja, moi]));
    await refreshComments();
  };

  // Les commentaires internes : même geste que sur une carte ou un projet.
  // Avant création, ils attendent en local, comme les échanges.
  const ajouterNote = async (texte: string) => {
    if (!request) {
      const instant = new Date().toISOString();
      setComments((fil) => [
        ...fil,
        {
          id: `draft-${instant}-${fil.length}`,
          text: texte,
          internal: true,
          author: currentUser,
          created_at: instant,
          updated_at: instant,
        },
      ]);
      return;
    }
    await api.addSupportComment(request.id, texte, true);
    await refreshComments();
  };

  const modifierNote = async (id: number | string, texte: string) => {
    if (!request || typeof id !== "number") {
      setComments((fil) =>
        fil.map((c) =>
          c.id === id
            ? { ...c, text: texte, updated_at: new Date().toISOString() }
            : c,
        ),
      );
      return;
    }
    await api.updateSupportComment(id, texte);
    await refreshComments();
  };

  const supprimerCommentaire = async (id: number | string) => {
    if (!request || typeof id !== "number") {
      setComments((fil) => fil.filter((c) => c.id !== id));
      return;
    }
    await api.deleteSupportComment(id);
    await refreshComments();
  };

  return (
    <>
      <Drawer
        opened={opened}
        onClose={onClose}
        position="right"
        size={request ? DRAWER_WIDTH : DRAWER_WIDTH_CREATION}
        padding={DRAWER_PADDING}
        withCloseButton={false}
        // Comme les autres tiroirs : seul le panneau de l'onglet défile, les
        // onglets et les boutons du bas restent en place, et la barre court
        // le long du bord droit (components/ui/DrawerScroll.tsx).
        styles={DRAWER_STYLES}
      >
        <Tabs
          value={activeTab}
          onChange={setActiveTab}
          style={DRAWER_PANEL_STYLE}
          styles={DRAWER_TABS_STYLES}
        >
          <Tabs.List mb="md">
            {TABS.map(({ value, label, icon: Icon }) => (
              <Tabs.Tab
                key={value}
                value={value}
                leftSection={<Icon size={16} />}
                style={tabStyle(activeTab === value)}
              >
                {label}
              </Tabs.Tab>
            ))}

            {/* Au bout de la rangée d'onglets, comme sur une carte. Une
                demande en cours de création n'a encore rien à suivre : le
                menu n'y paraît pas. */}
            {request && (
              <Menu
                position="bottom-end"
                withinPortal
                shadow="md"
                offset={DRAWER_MENU_OFFSET}
                styles={TAB_MENU_STYLES}
              >
                <Menu.Target>
                  <Button
                    variant="subtle"
                    color="gray"
                    rightSection={<IconChevronDown size={14} />}
                    ml="auto"
                    mb={4}
                    style={
                      {
                        alignSelf: "center",
                        ...ACTIONS_BUTTON_STYLE,
                      } as CSSProperties
                    }
                  >
                    Actions
                  </Button>
                </Menu.Target>
                <Menu.Dropdown>
                  {/* Le menu ne se referme pas, pour qu'on voie la coche changer. */}
                  <Menu.Item
                    leftSection={<IconEye size={16} />}
                    rightSection={suivi ? <IconCheck size={14} /> : null}
                    onClick={() => void onToggleFollow()}
                    closeMenuOnClick={false}
                  >
                    Suivre
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            )}
          </Tabs.List>

          <Tabs.Panel value="settings" style={DRAWER_PANEL_STYLE}>
            {/* Tout le panneau défile quand la fenêtre est trop basse ; sinon
                le fil des messages prend la hauteur qui reste. */}
            <DrawerScrollArea fill>
              {/* La fiche en haut, les messages dans leur propre panneau qui
                défile, et la réponse tout en bas : seul le fil défile, la
                fiche et l'éditeur restent en place. */}
              <Stack gap="xl" style={{ flex: 1, minHeight: 0 }}>
                {/* En lecture seule, les champs de la fiche sont éteints d'un
                    coup : c'est ce que fait un « fieldset » désactivé. */}
                <fieldset disabled={lectureSeule} style={FIELDSET_NU}>
                  <Stack gap="xl">
                    {/* Comme sur la fiche d'une carte : les deux colonnes s'ouvrent
                      chacune sur leur propre liste à cocher. Les bulles des
                      acteurs tiennent en peu de place : leur colonne a une
                      largeur fixe, les étiquettes prennent le reste. */}
                    <Group align="flex-start" gap="md" wrap="nowrap">
                      <div
                        style={{ flex: `0 0 ${ACTEURS_WIDTH}px`, minWidth: 0 }}
                      >
                        <ActorPicker
                          chipHeight={CHIP_HEIGHT}
                          chipGap={ACTOR_GAP}
                          label="Acteurs"
                          users={users}
                          value={actorIds}
                          onChange={setActorIds}
                          renderChip={(u) => (
                            <span
                              style={{ display: "inline-flex" }}
                              aria-label={u.name}
                            >
                              {estExpediteur(u.email) ? (
                                <SenderAvatar person={u} size={CHIP_HEIGHT} />
                              ) : (
                                <PersonAvatar person={u} size={CHIP_HEIGHT} />
                              )}
                            </span>
                          )}
                          // L'expéditeur de l'e-mail est acteur d'office : il est
                          // montré en tête, sans se retirer. Celui qui a un compte
                          // est déjà parmi les acteurs, il n'est pas redoublé.
                          leadingChips={
                            expediteur && (
                              <span style={{ display: "inline-flex" }}>
                                <SenderAvatar
                                  person={expediteur}
                                  size={CHIP_HEIGHT}
                                />
                              </span>
                            )
                          }
                        />
                      </div>
                      <div style={{ flex: "7 1 0", minWidth: 0 }}>
                        {/* Les étiquettes sont communes à tous les contextes : les
                          renommer ou les recolorer touche toutes les demandes. */}
                        <LabelPicker
                          chipHeight={CHIP_HEIGHT}
                          labels={etiquettes}
                          value={labelIds}
                          onChange={setLabelIds}
                          boardId={contexteId}
                          onLabelsChanged={relireEtiquettes}
                          labelsApi={SUPPORT_LABELS_API}
                          emptyText="Aucune étiquette"
                        />
                      </div>
                      {/* Le numéro du ticket, au bout de la ligne, comme dans la
                        liste : c'est lui qu'on cite à l'expéditeur. */}
                      {request && (
                        <Badge
                          color="green"
                          variant="filled"
                          radius="sm"
                          size="lg"
                          style={{ flexShrink: 0, alignSelf: "center" }}
                        >
                          {supportTicketRef(request.number)}
                        </Badge>
                      )}
                    </Group>

                    {/* L'objet, le contexte, le statut et l'échéance, côte à côte.
                      L'objet porte du texte : il prend deux parts de la largeur,
                      les trois réglages courts une chacun. */}
                    <Group align="flex-start" gap="md" wrap="nowrap">
                      <div style={{ flex: "2 1 0", minWidth: 0 }}>
                        {/* Celui de l'e-mail pour une demande reçue, et qui reste
                          retouchable. */}
                        <TextInput
                          label="Objet"
                          value={subject}
                          onChange={(e) => setSubject(e.currentTarget.value)}
                        />
                      </div>
                      {/* Le contexte auquel appartient la demande. Sous « Tous les
                        contextes », une demande neuve part dans le premier : c'est
                        ici qu'on la remet où il faut. Ses étiquettes, communes à
                        tous les contextes, la suivent. Un tableau sans contexte
                        n'a rien à proposer. */}
                      {contexts.length > 0 && (
                        <div style={{ flex: "1 1 0", minWidth: 0 }}>
                          <Select
                            label="Contexte"
                            data={contexts.map((c) => ({
                              value: String(c.id),
                              label: c.name,
                            }))}
                            value={contexteId || null}
                            onChange={(value) => {
                              if (!value || value === contexteId) return;
                              setContexteId(value);
                            }}
                            allowDeselect={false}
                          />
                        </div>
                      )}
                      <div style={{ flex: "1 1 0", minWidth: 0 }}>
                        {/* Le statut est ce que disent les onglets : le changer ici
                          fait passer la demande de l'un à l'autre. */}
                        <Select
                          label="Statut"
                          data={SUPPORT_STATUSES.map((s) => ({
                            value: s.value,
                            label: s.label,
                          }))}
                          value={status}
                          onChange={(value) =>
                            value && setStatus(value as SupportStatus)
                          }
                          allowDeselect={false}
                        />
                      </div>
                      <div style={{ flex: "1 1 0", minWidth: 0 }}>
                        <DateTimePicker
                          label="Échéance"
                          placeholder="Aucune"
                          value={echeance || null}
                          // Choisir un jour ne suffit pas : il reste l'heure à régler.
                          // C'est la fermeture du calendrier qui rend la main.
                          onChange={(valeur) => {
                            const date = valeur ? new Date(valeur) : null;
                            setEcheance(
                              date && !Number.isNaN(date.getTime())
                                ? date.toISOString()
                                : "",
                            );
                          }}
                          withSeconds={false}
                          clearable
                          popoverProps={{ withinPortal: true }}
                        />
                      </div>
                    </Group>
                  </Stack>
                </fieldset>

                {/* Le libellé « Échanges » au-dessus du panneau, comme celui
                  des autres champs de la fiche. */}
                <div
                  style={{
                    flex: 1,
                    minHeight: MESSAGES_MIN_HEIGHT,
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <Input.Label>Échanges</Input.Label>
                  {/* Le fond des champs de Mantine (variante « default ») :
                    le panneau se lit comme un champ de la fiche. */}
                  <Paper
                    bg="light-dark(var(--mantine-color-white), var(--mantine-color-dark-6))"
                    style={{
                      flex: 1,
                      minHeight: 0,
                      display: "flex",
                      flexDirection: "column",
                      overflow: "hidden",
                    }}
                  >
                    {/* Sans échange, l'invite se centre dans le cadre, comme
                      celle des commentaires. Sinon, le fil défile dans son
                      cadre, sa barre fine contre le bord droit du cadre :
                      celle du tiroir, elle, fait défiler tout le panneau. */}
                    {echanges.length === 0 ? (
                      <EmptyPanel
                        icon={IconMessage}
                        message="Aucun échange pour le moment."
                        size="sm"
                      />
                    ) : (
                      <ScrollArea
                        type="scroll"
                        scrollbars="y"
                        scrollbarSize={4}
                        style={{ flex: 1, minHeight: 0 }}
                      >
                        <Stack gap="md" p={30}>
                          <SupportMessages
                            messages={echanges}
                            senderEmail={request?.sender_email ?? ""}
                            onDelete={
                              lectureSeule
                                ? undefined
                                : async (id) => {
                                    try {
                                      await supprimerCommentaire(id);
                                    } catch (e) {
                                      notifierErreur(messageErreur(e));
                                    }
                                  }
                            }
                          />
                          {/* Avant création, le fil ne part au serveur qu'avec la
                          demande : on le dit plutôt que de le laisser croire
                          enregistré. */}
                          {!request && echanges.length > 0 && (
                            <Text size="xs" c="dimmed">
                              {echanges.length > 1
                                ? `${echanges.length} messages seront enregistrés`
                                : "Ce message sera enregistré"}{" "}
                              avec la demande.
                            </Text>
                          )}
                        </Stack>
                      </ScrollArea>
                    )}
                  </Paper>
                </div>

                {!lectureSeule && (
                  <SupportReply
                    modele={modeleReponse}
                    parEmail={Boolean(request?.sender_email)}
                    avecFichiers={Boolean(request)}
                    // À la création, une réponse n'a de sens que si quelqu'un
                    // s'occupe de la demande.
                    bloque={
                      !request && !actorIds.length
                        ? "Choisir au moins un acteur avant d'envoyer"
                        : undefined
                    }
                    onSend={async (html, envoi) => {
                      try {
                        await ajouterCommentaire(html, envoi);
                      } catch (e) {
                        notifierErreur(messageErreur(e));
                        // Relancée : l'éditeur garde ainsi le texte refusé.
                        throw e;
                      }
                    }}
                  />
                )}
              </Stack>
            </DrawerScrollArea>
          </Tabs.Panel>
          <Tabs.Panel value="comments" style={DRAWER_PANEL_STYLE}>
            <DrawerScrollArea fill>
              <Stack gap="md" style={{ flex: 1, minHeight: 0 }}>
                {/* Entre membres de l'équipe : rien de ce qui s'écrit ici ne
                    part à l'expéditeur. */}
                <CommentThread
                  comments={notes}
                  onAdd={(texte) =>
                    void ajouterNote(texte).catch((e) =>
                      notifierErreur(messageErreur(e)),
                    )
                  }
                  onUpdate={(id, texte) =>
                    void modifierNote(id, texte).catch((e) =>
                      notifierErreur(messageErreur(e)),
                    )
                  }
                  onDelete={(id) =>
                    void supprimerCommentaire(id).catch((e) =>
                      notifierErreur(messageErreur(e)),
                    )
                  }
                  readOnly={lectureSeule}
                />
                {!request && notes.length > 0 && (
                  <Text size="xs" c="dimmed">
                    {notes.length} commentaire{notes.length > 1 ? "s" : ""}{" "}
                    seront enregistrés avec la demande.
                  </Text>
                )}
              </Stack>
            </DrawerScrollArea>
          </Tabs.Panel>
        </Tabs>

        <DrawerFooter
          onSave={lectureSeule ? undefined : sauvegarder}
          onClose={onClose}
          onDelete={
            peutSupprimer ? () => setConfirmDeleteOpened(true) : undefined
          }
          saving={enregistrement}
        />
      </Drawer>

      <DeleteConfirmModal
        opened={confirmDeleteOpened}
        onClose={() => setConfirmDeleteOpened(false)}
        onConfirm={supprimer}
        title="Supprimer la demande"
        message={
          <>
            Voulez-vous vraiment supprimer cette demande ? Ses échanges seront
            supprimés. Cette action est irréversible.
          </>
        }
      />
    </>
  );
}
