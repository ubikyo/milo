import {
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
} from "@mantine/core";
import {
  IconCalendarEvent,
  IconCheck,
  IconChecklist,
  IconChevronDown,
  IconEye,
  IconLink,
  IconMessage,
  IconPaperclip,
  IconPhoto,
  IconSettings,
  IconUpload,
} from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../api";
import { shrinkImage } from "../../lib/reduireImage";
import CardCovers from "./CardCovers";
import CardDueDate, { EMPTY_DUE, type Due } from "./CardEcheance";
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
import CardDependencies, {
  newDraft,
  type DraftDependency,
} from "./CardDependances";
import TaskDestination, { descriptionOf } from "./TaskDestination";
import type { Destination, SourceTask } from "./TaskDestination";
import LabelPicker from "../ui/LabelPicker";
import CommentThread from "../project/CommentThread";
import { BARE_FIELDSET } from "../../lib/droits";
import { ReferenceTag } from "../ui/ReferenceTag";
import classes from "../../assets/styles/CardDrawer.module.css";
import { errorMessage, notifyError } from "../../lib/errors";
import type { CSSProperties, DragEvent as ReactDragEvent } from "react";
import { taskReference } from "@milo/shared";
import type {
  Attachment,
  CardCover,
  CardComment,
  CardLink,
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
  followed: boolean;
  onToggleFollow: () => void;
  /** L'élément d'où la tâche est créée, quand la fiche la crée. */
  source?: SourceTask | null;
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
  followed,
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
  const [labelsDestination, setDestinationLabels] = useState<Label[]>([]);
  const [text, setText] = useState("");
  const [memberIds, setMemberIds] = useState<string[]>([]);
  /**
   * Les acteurs retirés depuis l'ouverture : le serveur les retirera des
   * checklists à « Sauvegarder », la fiche les y cache déjà.
   */
  const [removedActors, setRemovedActors] = useState<string[]>([]);
  const [labelIds, setLabelIds] = useState<string[]>([]);
  /** Le contexte de la carte ; vide tant qu'elle n'est pas lue. */
  const [context, setContext] = useState("");
  const [comments, setComments] = useState<CardComment[]>([]);
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [covers, setCovers] = useState<CardCover[]>([]);
  const [links, setLinks] = useState<CardLink[]>([]);
  /** Les dépendances ajoutées dont l'autre carte n'est pas encore choisie. */
  const [drafts, setDrafts] = useState<DraftDependency[]>([]);
  /** Les secondes entre deux couvertures sur le tableau ; s'enregistre avec la fiche. */
  const [rotation, setRotation] = useState(0);
  /** Vrai tant que les fichiers survolent le bloc des couvertures : ils en deviendront. */
  const [overCovers, setOverCovers] = useState(false);
  /** Vrai tant que des fichiers survolent le tiroir : l'invite de dépôt se montre. */
  const [fileHover, setFileHover] = useState(false);
  const [phoneNumber, setNumber] = useState<number | null>(null);
  /** L'échéance de la carte : son début, sa fin, sa récurrence, son rappel. */
  const [due, setDue] = useState<Due>(EMPTY_DUE);
  /** Vrai quand le bloc se montre : la carte a une échéance, ou on l'ajoute. */
  const [withDue, setWithDueDate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<string | null>("settings");

  /**
   * Le bloc qu'on vient d'ajouter à la fiche, à amener sous les yeux : son
   * sélecteur, dont on vise la dernière occurrence — une checklist ou une
   * dépendance s'ajoute au bout des autres. Il attend que le bloc paraisse :
   * une checklist ne s'affiche qu'au retour du serveur.
   */
  const [toShow, setToShow] = useState<string | null>(null);
  const recordZone = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!toShow) return;
    const targets = recordZone.current?.querySelectorAll(toShow);
    const target = targets?.[targets.length - 1];
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "nearest" });
    setToShow(null);
    // Se relance quand un bloc peut paraître.
  }, [toShow, withDue, checklists, drafts, attachments, covers]);

  /** Le sélecteur de fichiers, ouvert par le menu « Actions » et par l'encart. */
  const fileField = useRef<HTMLInputElement>(null);
  /** Le sélecteur des images de couverture : des images seules, une ou plusieurs. */
  const coverField = useRef<HTMLInputElement>(null);
  /**
   * Combien d'éléments du tiroir le glisser a franchis. Un simple booléen
   * clignoterait : passer d'un enfant à l'autre déclenche une sortie avant
   * l'entrée suivante, et l'invite s'éteindrait entre les deux.
   */
  const depth = useRef(0);

  /**
   * Une image collée dans la description : elle part au serveur, et c'est son
   * adresse qui entre dans le texte. Un refus se dit dans le bandeau d'erreur
   * et ne laisse rien derrière lui.
   */
  const pasteImage = async (file: File): Promise<string> => {
    if (!card) return "";
    try {
      const { url } = await api.uploadCardImage(card.id, file);
      return url;
    } catch (e) {
      notifyError(errorMessage(e));
      return "";
    }
  };

  // L'éditeur de la description : il vit tant que le tiroir vit, son contenu
  // est remplacé à chaque carte ouverte.
  const editor = useRichEditor({
    placeholder: "Description de la carte",
    onPasteImage: pasteImage,
  });
  useEffect(() => {
    editor?.setEditable(!readOnly);
  }, [editor, readOnly]);

  useEffect(() => {
    if (!opened || !card) return;
    // Un tiroir rouvert repart des paramètres, quel que soit l'onglet quitté.
    setActiveTab("settings");
    setToShow(null);
    setLoading(true);
    api
      .getTaskCard(card.id)
      .then((record) => {
        setText(record.text);
        setNumber(record.number);
        setContext(record.context_id ? String(record.context_id) : "");
        setDue({
          shape: record.due_form || "date",
          start: record.start_date || "",
          end: record.due_date || "",
          recurrence: record.recurrence || "",
          reminder: record.reminder || "",
        });
        setWithDueDate(Boolean(record.due_date));
        setMemberIds((record.members || []).map((m) => String(m.id)));
        setRemovedActors([]);
        setLabelIds((record.labels || []).map((l) => String(l.id)));
        setComments(record.comments || []);
        setChecklists(record.checklists || []);
        setAttachments(record.attachments || []);
        setCovers(record.covers || []);
        setLinks(record.links || []);
        setDrafts([]);
        setRotation(record.cover_interval || 0);
        editor?.commands.setContent(record.description || "");
      })
      .catch((e) => notifyError(errorMessage(e)))
      .finally(() => setLoading(false));
  }, [opened, card, editor]);

  // Une fiche qui crée part de l'élément d'origine : son nom, et le lien qui y
  // ramène.
  useEffect(() => {
    if (!opened || !source || card) return;
    setActiveTab("settings");
    setLoading(false);
    setText(source.title);
    setNumber(null);
    setDue(EMPTY_DUE);
    setWithDueDate(false);
    setMemberIds(currentUserId === undefined ? [] : [String(currentUserId)]);
    setLabelIds([]);
    setComments([]);
    setChecklists([]);
    setAttachments([]);
    setCovers([]);
    setLinks([]);
    setDrafts([]);
    setRotation(0);
    editor?.commands.setContent(descriptionOf(source));
  }, [opened, source, card, editor, currentUserId]);

  const readTargetLabels = async () => {
    if (!destination.boardId) return setDestinationLabels([]);
    setDestinationLabels(await api.getLabels(destination.boardId));
  };

  // Changer de tableau retire les étiquettes choisies : elles étaient celles
  // de l'autre.
  useEffect(() => {
    if (!creation) return;
    setLabelIds([]);
    setDestinationLabels([]);
    readTargetLabels().catch((e) => notifyError(errorMessage(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creation, destination.boardId]);

  // Une checklist vient de changer : on relit la fiche pour ne montrer que ce
  // que le serveur a retenu. Le tableau, lui, se relira à la fermeture.
  const refreshChecklists = async () => {
    if (!card) return;
    const record = await api.getTaskCard(card.id);
    setChecklists(record.checklists || []);
  };

  const addChecklist = async () => {
    if (!card) return;
    try {
      await api.createChecklist(card.id, "Checklist");
      await refreshChecklists();
      setToShow("[data-checklist]");
    } catch (e) {
      notifyError(errorMessage(e));
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
  const dropFiles = async (files: File[]) => {
    if (!card || readOnly || files.length === 0) return;
    for (const file of files) {
      try {
        const attachment = await api.uploadAttachment(card.id, file);
        setAttachments((already) => [attachment, ...already]);
        setToShow("[data-zone='pieces']");
      } catch (e) {
        notifyError(errorMessage(e));
      }
    }
  };

  /**
   * Les images de couverture déposées — glissées sur leur bloc, ou choisies.
   * Elles partent l'une après l'autre et se rangent au bout, comme le serveur
   * les place. Ce qui n'est pas une image est refusé par le serveur, et le dit.
   */
  const dropCovers = async (files: File[]) => {
    if (!card || readOnly || files.length === 0) return;
    for (const file of files) {
      try {
        const cover = await api.uploadCover(card.id, await shrinkImage(file));
        setCovers((already) => [...already, cover]);
        setToShow("[data-couvertures]");
      } catch (e) {
        notifyError(errorMessage(e));
      }
    }
  };

  const arrangeCovers = async (ids: Id[]) => {
    if (!card) return;
    // L'ordre se montre tout de suite ; le serveur rend celui qu'il a retenu.
    setCovers((already) => ids.map((id) => already.find((c) => c.id === id)!).filter(Boolean));
    try {
      setCovers(await api.reorderCovers(card.id, ids));
    } catch (e) {
      notifyError(errorMessage(e));
    }
  };

  const deleteCover = async (cover: CardCover) => {
    try {
      await api.deleteCover(cover.id);
      setCovers((already) => already.filter((c) => c.id !== cover.id));
    } catch (e) {
      notifyError(errorMessage(e));
    }
  };

  const arrangeAttachments = async (ids: Id[]) => {
    if (!card) return;
    // L'ordre se montre tout de suite ; le serveur rend celui qu'il a retenu.
    setAttachments((already) => ids.map((id) => already.find((p) => p.id === id)!).filter(Boolean));
    try {
      setAttachments(await api.reorderAttachments(card.id, ids));
    } catch (e) {
      notifyError(errorMessage(e));
    }
  };

  const deleteAttachment = async (attachment: Attachment) => {
    try {
      await api.deleteAttachment(attachment.id);
      setAttachments((already) => already.filter((p) => p.id !== attachment.id));
    } catch (e) {
      notifyError(errorMessage(e));
    }
  };

  // --- Glisser-déposer sur le tiroir ----------------------------------------
  // Seuls les fichiers venus du dehors comptent : glisser une checklist ou du
  // texte à l'intérieur du tiroir ne doit rien déclencher.
  const hasFiles = (e: ReactDragEvent) =>
    e.dataTransfer.types.includes("Files");

  const hoverEnd = () => {
    depth.current = 0;
    setFileHover(false);
    setOverCovers(false);
  };

  /** Vrai quand le glisser passe sur le bloc des couvertures (CardCovers). */
  const toCovers = (e: ReactDragEvent) =>
    e.target instanceof Element && e.target.closest("[data-couvertures]") !== null;

  const hover = {
    onDragEnter: (e: ReactDragEvent) => {
      if (!hasFiles(e)) return;
      depth.current += 1;
      setFileHover(true);
    },
    onDragLeave: (e: ReactDragEvent) => {
      if (!hasFiles(e)) return;
      depth.current -= 1;
      if (depth.current <= 0) hoverEnd();
    },
    onDragOver: (e: ReactDragEvent) => {
      if (!hasFiles(e)) return;
      // Sans cela, le navigateur ouvrirait le fichier à la place de la page.
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      setOverCovers(toCovers(e));
    },
    onDrop: (e: ReactDragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      hoverEnd();
      const files = Array.from(e.dataTransfer.files);
      // Lâchés sur le bloc des couvertures, les fichiers en deviennent ;
      // partout ailleurs, ce sont des pièces jointes.
      if (toCovers(e)) void dropCovers(files);
      else void dropFiles(files);
    },
    // Un glisser abandonné en chemin laisserait l'invite allumée.
    onDragEnd: hoverEnd,
  };

  // L'échéance telle que le serveur la reçoit. Sans fin, rien ne tient : ni
  // début, ni récurrence, ni rappel.
  const dueFields = {
    due_date: due.end,
    due_form: due.end ? due.shape : "date",
    start_date: due.end && due.shape === "periode" ? due.start : "",
    recurrence: due.end ? due.recurrence : "",
    reminder: due.end ? due.reminder : "",
  } as const;

  // « Sauvegarder » : le seul geste qui écrit. Si le serveur refuse, le
  // tiroir reste ouvert avec le message : la saisie n'est jamais perdue.
  const persist = async () => {
    if (creation) return create();
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
        ...dueFields,
        cover_interval: rotation,
        ...(context ? { context_id: Number(context) } : {}),
      });
      await onSaved();
      onClose();
    } catch (e) {
      notifyError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  // La création écrit en deux temps : la carte, avec son titre et sa
  // description, dans la liste choisie ; puis ce que la fiche y ajoute.
  const create = async () => {
    const content = text.trim();
    if (!destination.listId)
      return notifyError("Choisir la liste où créer la tâche.");
    if (!content) return notifyError("La tâche doit avoir un titre.");
    setSaving(true);
    try {
      const description = editor?.getHTML() ?? "";
      const card = await api.createTaskCard(
        Number(destination.listId),
        content,
        "card",
        description,
      );
      if (memberIds.length || labelIds.length || due.end) {
        await api.updateTaskCardDetails(card.id, {
          text: content,
          description,
          member_ids: memberIds.map(Number),
          label_ids: labelIds.map(Number),
          ...dueFields,
        });
      }
      onClose();
      onCreated?.(card.id);
    } catch (e) {
      notifyError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const refreshComments = async () => {
    if (!card) return;
    const record = await api.getTaskCard(card.id);
    setComments(record.comments || []);
  };

  const addComment = async (content: string) => {
    if (!card) return;
    await api.addTaskCardComment(card.id, content);
    await refreshComments();
  };

  // Le fil d'une carte n'a pas de brouillon : la carte existe déjà quand sa
  // fiche s'ouvre, l'identifiant est toujours celui d'une ligne.
  const updateComment = async (id: number | string, content: string) => {
    if (typeof id !== "number") return;
    await api.updateTaskCardComment(id, content);
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
        {...(creation ? {} : hover)}
        style={{
          position: "relative",
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {fileHover && (
          <div className={classes.dropZone}>
            <Group gap="xs" wrap="nowrap">
              <IconUpload size={22} />
              <Text fw={600}>
                {overCovers ? "Déposer en image de couverture" : "Glisser ici"}
              </Text>
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
                      rightSection={followed ? <IconCheck size={14} /> : null}
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
                          onClick={addChecklist}
                        >
                          Ajouter checklist
                        </Menu.Item>
                        {/* La ligne s'ouvre vide : elle s'enregistre quand
                            l'autre carte est choisie. */}
                        <Menu.Item
                          leftSection={<IconLink size={16} />}
                          onClick={() => {
                            setDrafts((already) => [...already, newDraft()]);
                            setToShow("[data-dependance]");
                          }}
                        >
                          Ajouter une dépendance
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
                    onClick={() => {
                      setWithDueDate(true);
                      setToShow("[data-zone='echeance']");
                    }}
                  >
                    Ajouter échéance
                  </Menu.Item>
                )}
                {/* Les fichiers se glissent sur le tiroir ; ceci est l'autre
                    chemin, pour qui préfère les choisir. */}
                {!creation && !readOnly && (
                  <Menu.Item
                    leftSection={<IconPaperclip size={16} />}
                    onClick={() => fileField.current?.click()}
                  >
                    Ajouter pièce jointe
                  </Menu.Item>
                )}
                {!creation && !readOnly && (
                  <Menu.Item
                    leftSection={<IconPhoto size={16} />}
                    onClick={() => coverField.current?.click()}
                  >
                    Ajouter image de couverture
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
              <fieldset disabled={readOnly} style={BARE_FIELDSET}>
                <Stack gap="xl" ref={recordZone}>
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
                        onChange={(ids) => {
                          setRemovedActors((already) => [
                            ...already.filter((id) => !ids.includes(id)),
                            ...memberIds.filter((id) => !ids.includes(id) && !already.includes(id)),
                          ]);
                          setMemberIds(ids);
                        }}
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
                                readTargetLabels().catch((e) =>
                                  notifyError(errorMessage(e)),
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
                          {phoneNumber ? (
                            <ReferenceTag
                              reference={taskReference(phoneNumber)}
                              template={taskReference(9999)}
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

                  {/* Où la tâche ira, avant ce qui la nomme. Une carte ouverte
                      depuis son tableau sait déjà où elle est. */}
                  {creation && source && (
                    <TaskDestination
                      key={`${source.kind}-${source.id}`}
                      source={source}
                      onChange={setDestination}
                      onError={notifyError}
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
                        value={context || null}
                        onChange={(value) => value && setContext(value)}
                        allowDeselect={false}
                        style={{ flex: "1 1 0", minWidth: 0 }}
                      />
                    )}
                  </Group>

                  {/* L'échéance suit ce qui nomme la carte. Tant qu'il n'y en a
                      pas, rien ne s'affiche — la fiche ne porte pas un champ
                      vide de plus. */}
                  {withDue && (
                    <div data-zone="echeance">
                      <CardDueDate
                        value={due}
                        onChange={setDue}
                        onRemove={() => {
                          setDue(EMPTY_DUE);
                          setWithDueDate(false);
                        }}
                        readOnly={readOnly}
                      />
                    </div>
                  )}

                  {/* Les couvertures suivent l'échéance. */}
                  {card && (
                    <CardCovers
                      covers={covers}
                      interval={rotation}
                      onInterval={setRotation}
                      onPick={() => coverField.current?.click()}
                      onReorder={arrangeCovers}
                      onDelete={deleteCover}
                      readOnly={readOnly}
                    />
                  )}

                  <RichTextField editor={editor} label="Description" />

                  {/* Les checklists ferment la fiche : elles s'ajoutent par le menu
                    « Actions » et s'enregistrent d'elles-mêmes. */}
                  {card && (
                    <CardChecklists
                      cardId={card.id}
                      checklists={checklists}
                      users={users}
                      onChanged={refreshChecklists}
                      onError={notifyError}
                      // Qui reçoit un élément devient acteur de la carte. Il
                      // rejoint les acteurs de la fiche, et s'enregistre avec
                      // eux à « Sauvegarder ».
                      onMembers={(ids) => {
                        const placed = ids.map(String);
                        setMemberIds((already) => [
                          ...already,
                          ...placed.filter((id) => !already.includes(id)),
                        ]);
                        setRemovedActors((already) => already.filter((id) => !placed.includes(id)));
                      }}
                      hidden={removedActors}
                    />
                  )}

                  {/* Les dépendances suivent les checklists : elles aussi
                      s'ajoutent par le menu « Actions » et s'enregistrent
                      d'elles-mêmes. */}
                  {card && (
                    <CardDependencies
                      cardId={card.id}
                      links={links}
                      onLinks={setLinks}
                      drafts={drafts}
                      onDrafts={setDrafts}
                      boardId={boardId}
                      onError={notifyError}
                      readOnly={readOnly}
                    />
                  )}

                  {/* Les pièces jointes ferment la fiche. Comme les checklists,
                      l'encart ne paraît que lorsqu'il y a quelque chose dedans. */}
                  <div data-zone="pieces">
                    <CardAttachments
                      attachments={attachments}
                      onPick={() => fileField.current?.click()}
                      onReorder={arrangeAttachments}
                      onDelete={deleteAttachment}
                    />
                  </div>
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
        onSave={readOnly ? undefined : persist}
        onClose={onClose}
        saving={saving}
      />

      {/* Le sélecteur de fichiers, ouvert par le menu « Actions » comme par le
          bouton de l'encart. Il est remis à zéro après coup : sans cela,
          redéposer le même fichier ne déclencherait rien — le navigateur ne
          signale que les changements. */}
      <input
        ref={fileField}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.currentTarget.files ?? []);
          e.currentTarget.value = "";
          void dropFiles(files);
        }}
      />
      <input
        ref={coverField}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.currentTarget.files ?? []);
          e.currentTarget.value = "";
          void dropCovers(files);
        }}
      />
    </Drawer>
  );
}
