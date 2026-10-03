import {
  Badge,
  Button,
  Drawer,
  Group,
  Input,
  Menu,
  ScrollArea,
  Select,
  Stack,
  Tabs,
  Text,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import { DateTimePicker } from "@mantine/dates";
import {
  IconCalendarEvent,
  IconCheck,
  IconChecklist,
  IconChevronDown,
  IconClock,
  IconEye,
  IconMessage,
  IconPaperclip,
  IconPencil,
  IconSettings,
  IconTrash,
  IconUpload,
} from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../api";
import { RED } from "../../themes/colors";
import {
  COULEUR_ECHEANCE,
  MOT_ECHEANCE,
  dateLongue,
  formatChampEcheance,
  etatEcheance,
} from "../../lib/echeance";
import {
  ACTIONS_BUTTON_STYLE,
  DRAWER_MENU_OFFSET,
  TAB_MENU_STYLES,
} from "../../themes/menus";
import { tabStyle } from "../../themes/tabs";
import DrawerFooter from "../ui/DrawerFooter";
import { ACTOR_GAP } from "../ui/ActorAvatars";
import ActorPicker from "../ui/ActorPicker";
import RichTextField, { useRichEditor } from "../ui/RichText";
import CardAttachments from "./CardAttachments";
import CardChecklists from "./CardChecklists";
import TaskDestination, { descriptionDe } from "./TaskDestination";
import type { Destination, TacheSource } from "./TaskDestination";
import LabelPicker from "../ui/LabelPicker";
import CommentThread from "../project/CommentThread";
import { FIELDSET_NU } from "../../lib/droits";
import { ReferenceTag } from "../ui/ReferenceTag";
import classes from "../../assets/styles/CardDrawer.module.css";
import { messageErreur, notifierErreur } from "../../lib/errors";
import type { CSSProperties, DragEvent as ReactDragEvent } from "react";
import { taskReference } from "@milo/shared";
import type {
  Attachment,
  CardComment,
  Context,
  Checklist,
  Id,
  Label,
  PublicUser,
  TaskCard,
} from "@milo/shared";

// Les deux volets du tiroir, comme pour un projet : la fiche de la carte, puis
// ses échanges.
const TABS = [
  { value: "settings", label: "Paramètres", icon: IconSettings },
  { value: "comments", label: "Commentaires", icon: IconMessage },
];

// Retrait du tiroir. Il sert à trois choses : le retrait lui-même, l'entête
// commun, et le décalage de la barre de défilement vers la bordure gauche.
const DRAWER_PADDING = 40;

// Hauteur des bulles de membres et des étiquettes : la même pour les deux, et
// pour le « + » qui les suit, afin que les deux colonnes s'alignent.
const CHIP_HEIGHT = 30;

/**
 * L'échéance telle qu'elle se lit au-dessus du titre : la date en toutes
 * lettres, et la bulle qui dit où on en est. Cliquer ouvre le choix — la
 * modifier, ou la retirer —, comme une étiquette qu'on rouvre là où elle se
 * montre.
 */
interface DueDateProps {
  value: string;
  onEdit: () => void;
  onRemove: () => void;
}

function DueDate({ value, onEdit, onRemove }: DueDateProps) {
  const etat = etatEcheance(value);

  return (
    <Input.Wrapper label="Échéance">
      <Group gap="xs" wrap="nowrap">
        <Menu position="bottom-start" withinPortal shadow="md">
          <Menu.Target>
            <UnstyledButton
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
              aria-label="Modifier ou retirer l'échéance"
            >
              <Text span c="dimmed" style={{ display: "inline-flex" }}>
                <IconClock size={16} />
              </Text>
              <Text size="sm">{dateLongue(value)}</Text>
            </UnstyledButton>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item leftSection={<IconPencil size={16} />} onClick={onEdit}>
              Modifier
            </Menu.Item>
            <Menu.Item
              color={RED}
              leftSection={<IconTrash size={16} />}
              onClick={onRemove}
            >
              Supprimer
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>

        {/* Rien à dire quand l'échéance est encore loin : la date seule
            suffit, et une bulle neutre ne dirait rien de plus. */}
        {etat !== "aucun" && (
          <Badge color={COULEUR_ECHEANCE[etat]} variant="filled" radius="sm">
            {MOT_ECHEANCE[etat]}
          </Badge>
        )}
      </Group>
    </Input.Wrapper>
  );
}

/**
 * La fiche d'une carte. Elle s'ouvre au clic sur la carte et se referme en
 * enregistrant. Un séparateur n'en a pas : il n'a qu'un texte, qui se modifie
 * sur le tableau.
 *
 * Sans carte mais avec une « source », la fiche crée la tâche : « Créer une
 * tâche » depuis un autre mode. La société, le tableau et la liste se
 * choisissent alors au-dessus du titre ; ce qui demande une carte déjà écrite
 * — commentaires, checklists, pièces jointes, suivi — attend qu'elle le soit.
 */
interface CardDrawerProps {
  opened: boolean;
  onClose: () => void;
  /** La carte du tableau ; sa fiche complète est lue à l'ouverture. */
  card: TaskCard | null;
  labels: Label[];
  users: PublicUser[];
  boardId: string | null;
  /** Les contextes du tableau : la carte appartient à l'un d'eux. */
  contexts?: Context[];
  onLabelsChanged: (patch?: {
    id: number;
    data: Partial<Label>;
  }) => void | Promise<void>;
  onSaved: () => void | Promise<void>;
  /** Suivie : on est prévenu de chaque modification de cette carte. */
  suivie: boolean;
  onToggleFollow: () => void;
  /** L'élément d'où la tâche est créée, quand la fiche la crée. */
  source?: TacheSource | null;
  /** La carte vient d'être créée. */
  onCreated?: (cardId: Id) => void;
  /** Qui crée la tâche : il en est membre d'office. */
  currentUserId?: Id;
  /**
   * Sans le droit de modifier les tâches de la société, la fiche se lit
   * seulement : ni saisie, ni ajout, ni enregistrement.
   */
  readOnly?: boolean;
}

export default function CardDrawer({
  opened,
  onClose,
  card,
  labels,
  users,
  boardId,
  contexts = [],
  onLabelsChanged,
  onSaved,
  suivie,
  onToggleFollow,
  source = null,
  onCreated,
  currentUserId,
  readOnly = false,
}: CardDrawerProps) {
  const creation = !card && source !== null;
  /** Où la tâche créée ira. */
  const [destination, setDestination] = useState<Destination>({
    boardId: null,
    listId: null,
  });
  /** Les étiquettes du tableau choisi : elles ne sont propres qu'à lui. */
  const [labelsDestination, setLabelsDestination] = useState<Label[]>([]);
  const [text, setText] = useState("");
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [labelIds, setLabelIds] = useState<string[]>([]);
  /** Le contexte de la carte ; vide tant qu'elle n'est pas lue. */
  const [contexte, setContexte] = useState("");
  const [comments, setComments] = useState<CardComment[]>([]);
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  /** Vrai tant que des fichiers survolent le tiroir : l'invite de dépôt se montre. */
  const [survolFichier, setSurvolFichier] = useState(false);
  const [numero, setNumero] = useState<number | null>(null);
  /** L'échéance de la carte, en ISO ; vide quand elle n'en a pas. */
  const [echeance, setEcheance] = useState("");
  /** Vrai quand le sélecteur est ouvert : par le menu, ou pour la modifier. */
  const [choisitDate, setChoisitDate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<string | null>("settings");

  /** Le sélecteur de fichiers, ouvert par le menu « Actions » et par l'encart. */
  const champFichier = useRef<HTMLInputElement>(null);
  /**
   * Combien d'éléments du tiroir le glisser a franchis. Un simple booléen
   * clignoterait : passer d'un enfant à l'autre déclenche une sortie avant
   * l'entrée suivante, et l'invite s'éteindrait entre les deux.
   */
  const profondeur = useRef(0);

  /**
   * Une image collée dans la description : elle part au serveur, et c'est son
   * adresse qui entre dans le texte. Un refus se dit dans le bandeau d'erreur
   * et ne laisse rien derrière lui.
   */
  const collerImage = async (fichier: File): Promise<string> => {
    if (!card) return "";
    try {
      const { url } = await api.uploadCardImage(card.id, fichier);
      return url;
    } catch (e) {
      notifierErreur(messageErreur(e));
      return "";
    }
  };

  // L'éditeur de la description : il vit tant que le tiroir vit, son contenu
  // est remplacé à chaque carte ouverte.
  const editor = useRichEditor({
    placeholder: "Description de la carte",
    onPasteImage: collerImage,
  });
  useEffect(() => {
    editor?.setEditable(!readOnly);
  }, [editor, readOnly]);

  useEffect(() => {
    if (!opened || !card) return;
    // Un tiroir rouvert repart des paramètres, quel que soit l'onglet quitté.
    setActiveTab("settings");
    setLoading(true);
    api
      .getTaskCard(card.id)
      .then((fiche) => {
        setText(fiche.text);
        setNumero(fiche.number);
        setContexte(fiche.context_id ? String(fiche.context_id) : "");
        setEcheance(fiche.due_date || "");
        setChoisitDate(false);
        setMemberIds((fiche.members || []).map((m) => String(m.id)));
        setLabelIds((fiche.labels || []).map((l) => String(l.id)));
        setComments(fiche.comments || []);
        setChecklists(fiche.checklists || []);
        setAttachments(fiche.attachments || []);
        editor?.commands.setContent(fiche.description || "");
      })
      .catch((e) => notifierErreur(messageErreur(e)))
      .finally(() => setLoading(false));
  }, [opened, card, editor]);

  // Une fiche qui crée part de l'élément d'origine : son nom, et le lien qui y
  // ramène.
  useEffect(() => {
    if (!opened || !source || card) return;
    setActiveTab("settings");
    setLoading(false);
    setText(source.title);
    setNumero(null);
    setEcheance("");
    setChoisitDate(false);
    setMemberIds(currentUserId === undefined ? [] : [String(currentUserId)]);
    setLabelIds([]);
    setComments([]);
    setChecklists([]);
    setAttachments([]);
    editor?.commands.setContent(descriptionDe(source));
  }, [opened, source, card, editor, currentUserId]);

  const lireLabelsDestination = async () => {
    if (!destination.boardId) return setLabelsDestination([]);
    setLabelsDestination(await api.getLabels(destination.boardId));
  };

  // Changer de tableau retire les étiquettes choisies : elles étaient celles
  // de l'autre.
  useEffect(() => {
    if (!creation) return;
    setLabelIds([]);
    setLabelsDestination([]);
    lireLabelsDestination().catch((e) => notifierErreur(messageErreur(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creation, destination.boardId]);

  // Une checklist vient de changer : on relit la fiche pour ne montrer que ce
  // que le serveur a retenu. Le tableau, lui, se relira à la fermeture.
  const refreshChecklists = async () => {
    if (!card) return;
    const fiche = await api.getTaskCard(card.id);
    setChecklists(fiche.checklists || []);
  };

  const ajouterChecklist = async () => {
    if (!card) return;
    try {
      await api.createChecklist(card.id, "Checklist");
      await refreshChecklists();
    } catch (e) {
      notifierErreur(messageErreur(e));
    }
  };

  /**
   * Les fichiers déposés — glissés sur le tiroir, ou choisis dans le
   * sélecteur. Ils partent l'un après l'autre, et chacun paraît dans l'encart
   * dès que le serveur l'a pris : c'est la pièce qu'il renvoie qu'on ajoute,
   * sans relire la fiche. Un fichier refusé laisse les précédents en place.
   *
   * La plus récente se range en tête, comme le serveur les donne.
   */
  const deposerFichiers = async (fichiers: File[]) => {
    if (!card || readOnly || fichiers.length === 0) return;
    for (const fichier of fichiers) {
      try {
        const piece = await api.uploadAttachment(card.id, fichier);
        setAttachments((deja) => [piece, ...deja]);
      } catch (e) {
        notifierErreur(messageErreur(e));
      }
    }
  };

  const supprimerPiece = async (piece: Attachment) => {
    try {
      await api.deleteAttachment(piece.id);
      setAttachments((deja) => deja.filter((p) => p.id !== piece.id));
    } catch (e) {
      notifierErreur(messageErreur(e));
    }
  };

  // --- Glisser-déposer sur le tiroir ----------------------------------------
  // Seuls les fichiers venus du dehors comptent : glisser une checklist ou du
  // texte à l'intérieur du tiroir ne doit rien déclencher.
  const desFichiers = (e: ReactDragEvent) =>
    e.dataTransfer.types.includes("Files");

  const finDuSurvol = () => {
    profondeur.current = 0;
    setSurvolFichier(false);
  };

  const survol = {
    onDragEnter: (e: ReactDragEvent) => {
      if (!desFichiers(e)) return;
      profondeur.current += 1;
      setSurvolFichier(true);
    },
    onDragLeave: (e: ReactDragEvent) => {
      if (!desFichiers(e)) return;
      profondeur.current -= 1;
      if (profondeur.current <= 0) finDuSurvol();
    },
    onDragOver: (e: ReactDragEvent) => {
      if (!desFichiers(e)) return;
      // Sans cela, le navigateur ouvrirait le fichier à la place de la page.
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    },
    onDrop: (e: ReactDragEvent) => {
      if (!desFichiers(e)) return;
      e.preventDefault();
      finDuSurvol();
      void deposerFichiers(Array.from(e.dataTransfer.files));
    },
    // Un glisser abandonné en chemin laisserait l'invite allumée.
    onDragEnd: finDuSurvol,
  };

  // « Sauvegarder » : le seul geste qui écrit. Si le serveur refuse, le
  // tiroir reste ouvert avec le message : la saisie n'est jamais perdue.
  const sauvegarder = async () => {
    if (creation) return creer();
    if (!card || loading) return onClose();
    setSaving(true);
    try {
      await api.updateTaskCardDetails(card.id, {
        // Un titre vidé par mégarde ne s'enregistre pas : la carte garde le
        // sien, le serveur le refuserait de toute façon.
        text: text.trim() || card.text,
        description: editor?.getHTML() ?? "",
        member_ids: memberIds.map(Number),
        label_ids: labelIds.map(Number),
        due_date: echeance,
        ...(contexte ? { context_id: Number(contexte) } : {}),
      });
      await onSaved();
      onClose();
    } catch (e) {
      notifierErreur(messageErreur(e));
    } finally {
      setSaving(false);
    }
  };

  // La création écrit en deux temps : la carte, avec son titre et sa
  // description, dans la liste choisie ; puis ce que la fiche y ajoute.
  const creer = async () => {
    const texte = text.trim();
    if (!destination.listId)
      return notifierErreur("Choisir la liste où créer la tâche.");
    if (!texte) return notifierErreur("La tâche doit avoir un titre.");
    setSaving(true);
    try {
      const description = editor?.getHTML() ?? "";
      const carte = await api.createTaskCard(
        Number(destination.listId),
        texte,
        "card",
        description,
      );
      if (memberIds.length || labelIds.length || echeance) {
        await api.updateTaskCardDetails(carte.id, {
          text: texte,
          description,
          member_ids: memberIds.map(Number),
          label_ids: labelIds.map(Number),
          due_date: echeance,
        });
      }
      onClose();
      onCreated?.(carte.id);
    } catch (e) {
      notifierErreur(messageErreur(e));
    } finally {
      setSaving(false);
    }
  };

  const refreshComments = async () => {
    if (!card) return;
    const fiche = await api.getTaskCard(card.id);
    setComments(fiche.comments || []);
  };

  const addComment = async (texte: string) => {
    if (!card) return;
    await api.addTaskCardComment(card.id, texte);
    await refreshComments();
  };

  // Le fil d'une carte n'a pas de brouillon : la carte existe déjà quand sa
  // fiche s'ouvre, l'identifiant est toujours celui d'une ligne.
  const updateComment = async (id: number | string, texte: string) => {
    if (typeof id !== "number") return;
    await api.updateTaskCardComment(id, texte);
    await refreshComments();
  };

  const deleteComment = async (id: number | string) => {
    if (typeof id !== "number") return;
    await api.deleteTaskCardComment(id);
    await refreshComments();
  };

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size={610}
      padding={DRAWER_PADDING}
      withCloseButton={false}
      styles={{
        content: {
          display: "flex",
          flexDirection: "column",
          // Lue par la barre de défilement des panneaux (assets/styles/CardDrawer.module.css).
          "--milo-drawer-padding": `${DRAWER_PADDING}px`,
        } as CSSProperties,
        // Le corps ne défile plus : seul le panneau de l'onglet ouvert le
        // fait, par sa propre zone de défilement. Le titre, les onglets et les
        // actions du bas restent en place.
        body: {
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        },
      }}
    >
      {/* Tout le tiroir est une zone de dépôt : un fichier lâché n'importe où
          sur la fiche s'y attache. L'invite se pose par-dessus, sans prendre
          le pointeur — ce sont les éléments en dessous qui continuent de voir
          passer le glisser. */}
      <div
        {...(creation ? {} : survol)}
        style={{
          position: "relative",
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {survolFichier && (
          <div className={classes.dropZone}>
            <Group gap="xs" wrap="nowrap">
              <IconUpload size={22} />
              <Text fw={600}>Glisser ici</Text>
            </Group>
          </div>
        )}

        <Tabs
          value={activeTab}
          onChange={setActiveTab}
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
          }}
          styles={{ panel: { paddingTop: 20 } }}
        >
          <Tabs.List mb="md">
            {/* Une tâche encore à créer n'a pas de fil : il attendra qu'elle existe. */}
            {TABS.filter(({ value }) => !creation || value === "settings").map(
              ({ value, label, icon: Icon }) => (
                <Tabs.Tab
                  key={value}
                  value={value}
                  leftSection={<Icon size={16} />}
                  style={tabStyle(activeTab === value)}
                >
                  {label}
                </Tabs.Tab>
              ),
            )}

            {/* Ce qui s'ajoute à la fiche se choisit ici, au bout de la rangée
                d'onglets : ce ne sont pas des volets à ouvrir, mais des blocs à
                poser sur la carte. Poussé à droite, le menu ne se confond pas
                avec les onglets. */}
            <Menu
              position="bottom-end"
              withinPortal
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
                  style={{ alignSelf: "center", ...ACTIONS_BUTTON_STYLE }}
                >
                  Actions
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                {/* Suivre vient en tête : c'est ce qui porte sur la carte
                    entière, là où le reste y ajoute un bloc. Le menu ne se
                    referme pas, pour qu'on voie la coche changer. */}
                {!creation && (
                  <>
                    <Menu.Item
                      leftSection={<IconEye size={16} />}
                      rightSection={suivie ? <IconCheck size={14} /> : null}
                      onClick={() => onToggleFollow()}
                      closeMenuOnClick={false}
                    >
                      Suivre
                    </Menu.Item>

                    {!readOnly && (
                      <>
                        <Menu.Divider />

                        <Menu.Item
                          leftSection={<IconChecklist size={16} />}
                          onClick={ajouterChecklist}
                        >
                          Checklist
                        </Menu.Item>
                      </>
                    )}
                  </>
                )}
                {/* L'échéance se pose comme une checklist : par le même menu,
                    puisque c'est un bloc de plus sur la carte. Le sélecteur
                    s'ouvre au-dessus du titre, là où la date se lira. */}
                {!readOnly && (
                  <Menu.Item
                    leftSection={<IconCalendarEvent size={16} />}
                    onClick={() => setChoisitDate(true)}
                  >
                    Date
                  </Menu.Item>
                )}
                {/* Les fichiers se glissent sur le tiroir ; ceci est l'autre
                    chemin, pour qui préfère les choisir. */}
                {!creation && !readOnly && (
                  <Menu.Item
                    leftSection={<IconPaperclip size={16} />}
                    onClick={() => champFichier.current?.click()}
                  >
                    Pièce jointe
                  </Menu.Item>
                )}
              </Menu.Dropdown>
            </Menu>
          </Tabs.List>

          <Tabs.Panel
            value="settings"
            style={{
              flex: 1,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* La barre ne se montre que pendant le défilement, comme sur le
                tableau ; le style la déporte sur la bordure gauche du tiroir. */}
            <ScrollArea
              type="scroll"
              scrollbars="y"
              classNames={{
                scrollbar: classes.scrollbar,
                thumb: classes.thumb,
              }}
              style={{ flex: 1, minHeight: 0 }}
            >
              {/* En lecture seule, tous les champs de la fiche sont éteints
                  d'un coup : c'est ce que fait un « fieldset » désactivé. */}
              <fieldset disabled={readOnly} style={FIELDSET_NU}>
                <Stack gap="xl">
                  {/* Ce qui range la carte vient avant ce qui la nomme : les deux
                    colonnes s'ouvrent chacune sur leur propre liste. Les bulles
                    des membres tiennent en peu de place, les étiquettes portent du
                    texte : la largeur se partage en 30 / 70. Ce partage se dit en
                    proportions et non en pourcentages : « 30% + 70% » aurait
                    ignoré l'écart entre les deux colonnes, et la seconde aurait
                    débordé d'autant. */}
                  <Group align="flex-start" gap="md" wrap="nowrap">
                    <div style={{ flex: "3 1 0", minWidth: 0 }}>
                      <ActorPicker
                        chipHeight={CHIP_HEIGHT}
                        // Les bulles se suivent avec le même filet d'air que sur une
                        // carte du tableau ou dans celui des projets.
                        chipGap={ACTOR_GAP}
                        label="Acteurs"
                        users={users}
                        value={memberIds}
                        onChange={setMemberIds}
                      />
                    </div>
                    <div style={{ flex: "7 1 0", minWidth: 0 }}>
                      <LabelPicker
                        chipHeight={CHIP_HEIGHT}
                        labels={creation ? labelsDestination : labels}
                        value={labelIds}
                        onChange={setLabelIds}
                        boardId={
                          (creation ? destination.boardId : boardId) ?? ""
                        }
                        onLabelsChanged={
                          creation
                            ? () =>
                                lireLabelsDestination().catch((e) =>
                                  notifierErreur(messageErreur(e)),
                                )
                            : onLabelsChanged
                        }
                      />
                    </div>
                    {/* La référence suit les étiquettes, au bout de la ligne :
                        elle est attribuée à la création et ne bouge plus, elle
                        se montre sans se modifier. Le tag se lit seul : son
                        libellé est tu, mais garde sa place pour que le tag
                        s'aligne sur le haut des étiquettes, sous leur libellé.
                        Le même tag que dans la liste des projets. */}
                    {!creation && (
                      <Input.Wrapper
                        label="Référence"
                        style={{ flexShrink: 0 }}
                        styles={{ label: { visibility: "hidden" } }}
                      >
                        {/* Remonté de quatre pixels : sans quoi le tag tombe juste
                            sous le haut des étiquettes. */}
                        <div style={{ marginTop: -4 }}>
                          {numero ? (
                            <ReferenceTag
                              reference={taskReference(numero)}
                              gabarit={taskReference(9999)}
                            />
                          ) : (
                            <Text size="sm" c="dimmed">
                              —
                            </Text>
                          )}
                        </div>
                      </Input.Wrapper>
                    )}
                  </Group>

                  {/* L'échéance coiffe le titre : c'est la première chose qu'on
                      veut savoir en ouvrant une carte, avant même son intitulé.
                      Tant qu'il n'y en a pas, rien ne s'affiche — la fiche ne
                      porte pas un champ vide de plus. */}
                  {choisitDate ? (
                    <DateTimePicker
                      label="Échéance"
                      placeholder="Choisir une date, et une heure si besoin"
                      value={echeance || null}
                      // L'heure est facultative : laissée vide, l'échéance tient
                      // à la date seule, et le champ comme la fiche n'en montrent
                      // que la date (lib/echeance.ts). Le calendrier ne se referme
                      // pas au premier clic, pour laisser le temps de régler
                      // l'heure si on en veut une : c'est sa fermeture, et elle
                      // seule, qui rend la main.
                      valueFormat={formatChampEcheance}
                      // L'heure se vide comme elle se règle : l'effacer ramène
                      // l'échéance à la date seule.
                      timePickerProps={{ clearable: true }}
                      onChange={(valeur) => {
                        const date = valeur ? new Date(valeur) : null;
                        setEcheance(
                          date && !Number.isNaN(date.getTime())
                            ? date.toISOString()
                            : "",
                        );
                      }}
                      onDropdownClose={() => setChoisitDate(false)}
                      withSeconds={false}
                      clearable
                      autoFocus
                      popoverProps={{ withinPortal: true }}
                    />
                  ) : (
                    echeance && (
                      <DueDate
                        value={echeance}
                        onEdit={() => setChoisitDate(true)}
                        onRemove={() => setEcheance("")}
                      />
                    )
                  )}

                  {/* Où la tâche ira, avant ce qui la nomme. Une carte ouverte
                      depuis son tableau sait déjà où elle est. */}
                  {creation && source && (
                    <TaskDestination
                      key={`${source.kind}-${source.id}`}
                      source={source}
                      onChange={setDestination}
                      onError={notifierErreur}
                    />
                  )}

                  {/* Le titre, et le contexte de la carte à côté : deux parts
                      pour le titre, une pour le contexte. */}
                  <Group align="flex-start" gap="md" wrap="nowrap">
                    <TextInput
                      label="Titre"
                      placeholder="Titre de la carte"
                      value={text}
                      onChange={(e) => setText(e.currentTarget.value)}
                      required
                      style={{ flex: "2 1 0", minWidth: 0 }}
                    />
                    {card && contexts.length > 0 && (
                      <Select
                        label="Contexte"
                        data={contexts.map((c) => ({
                          value: String(c.id),
                          label: c.name,
                        }))}
                        value={contexte || null}
                        onChange={(valeur) => valeur && setContexte(valeur)}
                        allowDeselect={false}
                        style={{ flex: "1 1 0", minWidth: 0 }}
                      />
                    )}
                  </Group>

                  <RichTextField editor={editor} label="Description" />

                  {/* Les checklists ferment la fiche : elles s'ajoutent par le menu
                    « Actions » et s'enregistrent d'elles-mêmes. */}
                  {card && (
                    <CardChecklists
                      cardId={card.id}
                      checklists={checklists}
                      users={users}
                      onChanged={refreshChecklists}
                      onError={notifierErreur}
                    />
                  )}

                  {/* Les pièces jointes ferment la fiche. Comme les checklists,
                      l'encart ne paraît que lorsqu'il y a quelque chose dedans. */}
                  <CardAttachments
                    attachments={attachments}
                    onPick={() => champFichier.current?.click()}
                    onDelete={supprimerPiece}
                  />
                </Stack>
              </fieldset>
            </ScrollArea>
          </Tabs.Panel>

          <Tabs.Panel
            value="comments"
            style={{
              flex: 1,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <ScrollArea
              type="scroll"
              scrollbars="y"
              classNames={{
                scrollbar: classes.scrollbar,
                thumb: classes.thumb,
                viewport: classes.viewport,
              }}
              style={{ flex: 1, minHeight: 0 }}
            >
              <Stack gap="md" style={{ flex: 1, minHeight: 0 }}>
                <CommentThread
                  comments={comments}
                  onAdd={addComment}
                  onUpdate={updateComment}
                  onDelete={deleteComment}
                  readOnly={readOnly}
                />
              </Stack>
            </ScrollArea>
          </Tabs.Panel>
        </Tabs>
      </div>

      {/* La carte se supprime depuis son menu « Actions », pas d'ici : le pied
          ne porte donc que les deux gestes communs à tous les tiroirs. */}
      <DrawerFooter
        onSave={readOnly ? undefined : sauvegarder}
        onClose={onClose}
        saving={saving}
      />

      {/* Le sélecteur de fichiers, ouvert par le menu « Actions » comme par le
          bouton de l'encart. Il est remis à zéro après coup : sans cela,
          redéposer le même fichier ne déclencherait rien — le navigateur ne
          signale que les changements. */}
      <input
        ref={champFichier}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          const fichiers = Array.from(e.currentTarget.files ?? []);
          e.currentTarget.value = "";
          void deposerFichiers(fichiers);
        }}
      />
    </Drawer>
  );
}
