import {
  Button,
  Drawer,
  Group,
  Input,
  Menu,
  ScrollArea,
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
} from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../api";
import { shrinkImage } from "../../lib/shrinkImage";
import CardCovers from "./CardCovers";
import CardDueDate, { EMPTY_DUE, type Due } from "./CardDueDate";
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
} from "./CardDependencies";
import TaskDestination, { descriptionOf } from "./TaskDestination";
import type { Destination, SourceTask } from "./TaskDestination";
import LabelPicker from "../ui/LabelPicker";
import CommentThread from "../project/CommentThread";
import { BARE_FIELDSET } from "../../lib/rights";
import { ReferenceTag } from "../ui/ReferenceTag";
import classes from "../../assets/styles/CardDrawer.module.css";
import { errorMessage, notifyError } from "../../lib/errors";
import type { CSSProperties } from "react";
import { IMAGE_MIME_TYPE } from "@mantine/dropzone";
import { useFileDrag } from "../../lib/useFileDrag";
import { taskReference } from "@milo/shared";
import type {
  Attachment,
  CardCover,
  CardComment,
  CardLink,
  Checklist,
  Id,
  Label,
  PublicUser,
  TaskCard,
} from "@milo/shared";

// The drawer's two panes, as for a project: the card details, then its
// discussion.
const TABS = [
  { value: "settings", label: "Paramètres", icon: IconSettings },
  { value: "comments", label: "Commentaires", icon: IconMessage },
];

// Drawer inset. It serves three purposes: the inset itself, the shared
// header, and shifting the scrollbar to the left edge.
const DRAWER_PADDING = 40;

// Height of the member avatars and labels: the same for both, and for
// the "+" that follows them, so the two columns line up.
const CHIP_HEIGHT = 30;

/**
 * A card's details. It opens on click on the card and closes while
 * saving. A separator has none: it only has a text, edited on the board.
 *
 * Without a card but with a "source", the form creates the task: "Créer une
 * tâche" from another mode. The company, board and list are then chosen
 * above the title; whatever needs an existing card — comments, checklists,
 * attachments, follow — waits until it is written.
 */
interface CardDrawerProps {
  opened: boolean;
  onClose: () => void;
  /** The board card; its full details are read on open. */
  card: TaskCard | null;
  labels: Label[];
  users: PublicUser[];
  boardId: string | null;
  onLabelsChanged: (patch?: {
    id: number;
    data: Partial<Label>;
  }) => void | Promise<void>;
  onSaved: () => void | Promise<void>;
  /** Followed: you are notified of every change to this card. */
  followed: boolean;
  onToggleFollow: () => void;
  /** The item the task is created from, when the form creates it. */
  source?: SourceTask | null;
  /** The card has just been created. */
  onCreated?: (cardId: Id) => void;
  /** Who creates the task: they are a member by default. */
  currentUserId?: Id;
  /**
   * Without the right to edit the company's tasks, the form is
   * read-only: no input, no adding, no saving.
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
  /** Where the created task will go. */
  const [destination, setDestination] = useState<Destination>({
    boardId: null,
    listId: null,
  });
  /** The chosen board's labels: they belong only to it. */
  const [labelsDestination, setDestinationLabels] = useState<Label[]>([]);
  const [text, setText] = useState("");
  const [memberIds, setMemberIds] = useState<string[]>([]);
  /**
   * Actors removed since opening: the server will remove them from the
   * checklists on "Sauvegarder", the form already hides them there.
   */
  const [removedActors, setRemovedActors] = useState<string[]>([]);
  const [labelIds, setLabelIds] = useState<string[]>([]);
  const [comments, setComments] = useState<CardComment[]>([]);
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [covers, setCovers] = useState<CardCover[]>([]);
  const [links, setLinks] = useState<CardLink[]>([]);
  /** Added dependencies whose other card is not yet chosen. */
  const [drafts, setDrafts] = useState<DraftDependency[]>([]);
  /** Seconds between two covers on the board; saved with the form. */
  const [rotation, setRotation] = useState(0);
  const [phoneNumber, setNumber] = useState<number | null>(null);
  /** The card's due date: its start, end, recurrence, reminder. */
  const [due, setDue] = useState<Due>(EMPTY_DUE);
  /** True when the block is shown: the card has a due date, or one is being added. */
  const [withDue, setWithDueDate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<string | null>("settings");

  /**
   * The block just added to the form, to bring into view: its
   * selector, targeting the last occurrence — a checklist or a
   * dependency is added after the others. It waits for the block to appear:
   * a checklist only shows once the server responds.
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
    // Reruns when a block may appear.
  }, [toShow, withDue, checklists, drafts, attachments, covers]);

  /** The file picker, opened by the "Actions" menu and by the panel. */
  const fileField = useRef<HTMLInputElement>(null);
  /** The cover image picker: images only, one or several. */
  const coverField = useRef<HTMLInputElement>(null);
  /**
   * Files dragged over the page: the covers' and attachments' drop zones
   * show, even under blocks that already have rows (as a declared
   * equipment's photos and documents).
   */
  const dragging = useFileDrag(opened && !creation && !readOnly);

  /**
   * An image pasted into the description: it is sent to the server, and
   * its address is what goes into the text. A refusal is reported in the
   * error banner and leaves nothing behind.
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

  // The description editor: it lives as long as the drawer, its content
  // is replaced each time a card is opened.
  const editor = useRichEditor({
    placeholder: "Description de la carte",
    onPasteImage: pasteImage,
  });
  useEffect(() => {
    editor?.setEditable(!readOnly);
  }, [editor, readOnly]);

  useEffect(() => {
    if (!opened || !card) return;
    // A reopened drawer restarts from the settings, whichever tab was left.
    setActiveTab("settings");
    setToShow(null);
    setLoading(true);
    api
      .getTaskCard(card.id)
      .then((record) => {
        setText(record.text);
        setNumber(record.number);
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

  // A form that creates starts from the source item: its name, and the
  // link that leads back to it.
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

  // Changing board removes the chosen labels: they belonged to the
  // other one.
  useEffect(() => {
    if (!creation) return;
    setLabelIds([]);
    setDestinationLabels([]);
    readTargetLabels().catch((e) => notifyError(errorMessage(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creation, destination.boardId]);

  // A checklist has just changed: the form is reread to show only what
  // the server kept. The board will reread on close.
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
   * The dropped files — dragged onto the drawer, or chosen in the
   * picker. They are sent one after the other, and each appears in the
   * panel as soon as the server has taken it: the attachment it returns is
   * the one added, without rereading the form. A refused file leaves the
   * previous ones in place.
   *
   * The most recent goes first, as the server returns them.
   */
  const dropFiles = async (files: File[]) => {
    if (!card || readOnly || files.length === 0) return;
    for (const file of files) {
      try {
        const attachment = await api.uploadAttachment(card.id, file);
        setAttachments((already) => [attachment, ...already]);
        setToShow("[data-zone='attachments']");
      } catch (e) {
        notifyError(errorMessage(e));
      }
    }
  };

  /**
   * The dropped cover images — dragged onto their block, or chosen.
   * They are sent one after the other and placed at the end, as the server
   * places them. What is not an image is refused by the server, which says so.
   */
  const dropCovers = async (files: File[]) => {
    if (!card || readOnly || files.length === 0) return;
    for (const file of files) {
      try {
        const cover = await api.uploadCover(card.id, await shrinkImage(file));
        setCovers((already) => [...already, cover]);
        setToShow("[data-covers]");
      } catch (e) {
        notifyError(errorMessage(e));
      }
    }
  };

  const arrangeCovers = async (ids: Id[]) => {
    if (!card) return;
    // The order shows immediately; the server returns the one it kept.
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
    // The order shows immediately; the server returns the one it kept.
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

  // The due date as the server receives it. Without an end, nothing holds: no
  // start, no recurrence, no reminder.
  const dueFields = {
    due_date: due.end,
    due_form: due.end ? due.shape : "date",
    start_date: due.end && due.shape === "period" ? due.start : "",
    recurrence: due.end ? due.recurrence : "",
    reminder: due.end ? due.reminder : "",
  } as const;

  // "Sauvegarder": the only gesture that writes. If the server refuses, the
  // drawer stays open with the message: input is never lost.
  const persist = async () => {
    if (creation) return create();
    if (!card || loading) return onClose();
    setSaving(true);
    try {
      await api.updateTaskCardDetails(card.id, {
        // A title emptied by mistake is not saved: the card keeps its
        // own, the server would refuse it anyway.
        text: text.trim() || card.text,
        description: editor?.getHTML() ?? "",
        member_ids: memberIds.map(Number),
        label_ids: labelIds.map(Number),
        ...dueFields,
        cover_interval: rotation,
      });
      await onSaved();
      onClose();
    } catch (e) {
      notifyError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  // Creation writes in two steps: the card, with its title and
  // description, in the chosen list; then what the form adds to it.
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

  // A card's thread has no draft: the card already exists when its
  // form opens, the identifier is always that of a row.
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
          // Read by the panels' scrollbar (assets/styles/CardDrawer.module.css).
          "--milo-drawer-padding": `${DRAWER_PADDING}px`,
        } as CSSProperties,
        // The body no longer scrolls: only the open tab's panel does,
        // through its own scroll area. The title, tabs and bottom actions
        // stay in place.
        body: {
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        },
      }}
    >
      <div
        style={{
          position: "relative",
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
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
            {/* A task yet to be created has no thread: it will wait until it exists. */}
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

            {/* What is added to the form is chosen here, at the end of the row
                of tabs: these are not panes to open, but blocks to
                place on the card. Pushed right, the menu is not confused
                with the tabs. */}
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
                {/* Follow comes first: it applies to the whole card, where the rest
                    adds a block to it. The menu does not
                    close, so the checkmark can be seen changing. */}
                {!creation && (
                  <Menu.Item
                    leftSection={<IconEye size={16} />}
                    rightSection={followed ? <IconCheck size={14} /> : null}
                    onClick={() => onToggleFollow()}
                    closeMenuOnClick={false}
                  >
                    Suivre
                  </Menu.Item>
                )}
                {!creation && !readOnly && <Menu.Divider />}
                {/* The blocks follow one another as on the card: due date,
                    dependencies, checklists, covers, attachments. */}
                {/* The due date is placed like a checklist: through the same menu,
                    since it is one more block on the card. The selector
                    opens above the title, where the date will be read. */}
                {!readOnly && (
                  <Menu.Item
                    leftSection={<IconCalendarEvent size={16} />}
                    onClick={() => {
                      setWithDueDate(true);
                      setToShow("[data-zone='due-date']");
                    }}
                  >
                    Ajouter échéance
                  </Menu.Item>
                )}
                {!creation && !readOnly && (
                  <>
                    {/* The row opens empty: it is saved once
                        the other card is chosen. */}
                    <Menu.Item
                      leftSection={<IconLink size={16} />}
                      onClick={() => {
                        setDrafts((already) => [...already, newDraft()]);
                        setToShow("[data-dependency]");
                      }}
                    >
                      Ajouter une dépendance
                    </Menu.Item>
                    <Menu.Item
                      leftSection={<IconChecklist size={16} />}
                      onClick={addChecklist}
                    >
                      Ajouter checklist
                    </Menu.Item>
                    <Menu.Item
                      leftSection={<IconPhoto size={16} />}
                      onClick={() => coverField.current?.click()}
                    >
                      Ajouter image de couverture
                    </Menu.Item>
                    {/* Files are dragged onto the drawer; this is the other
                        path, for those who prefer to choose them. */}
                    <Menu.Item
                      leftSection={<IconPaperclip size={16} />}
                      onClick={() => fileField.current?.click()}
                    >
                      Ajouter pièce jointe
                    </Menu.Item>
                  </>
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
            {/* The bar only shows while scrolling, as on the
                board; the style moves it to the drawer's left edge. */}
            <ScrollArea
              type="scroll"
              scrollbars="y"
              classNames={{
                scrollbar: classes.scrollbar,
                thumb: classes.thumb,
              }}
              style={{ flex: 1, minHeight: 0 }}
            >
              {/* In read-only mode, all the form's fields are disabled
                  at once: that is what a disabled "fieldset" does. */}
              <fieldset disabled={readOnly} style={BARE_FIELDSET}>
                <Stack gap="xl" ref={recordZone}>
                  {/* What categorizes the card comes before what names it: the two
                      columns each open on their own list. Member avatars
                      take little room, labels carry
                      text: the width is split 30 / 70. The split is expressed in
                      proportions and not percentages: "30% + 70%" would have
                      ignored the gap between the two columns, and the second would have
                      overflowed by that much. */}
                  <Group align="flex-start" gap="md" wrap="nowrap">
                    <div style={{ flex: "3 1 0", minWidth: 0 }}>
                      <ActorPicker
                        kind="task"
                        chipHeight={CHIP_HEIGHT}
                        // The avatars follow one another with the same thin gap as on a
                        // board card or in the projects one.
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
                    {/* The reference follows the labels, at the end of the row:
                        it is assigned on creation and no longer changes, it is
                        shown without being edited. The tag reads on its own: its
                        label is silent, but keeps its place so that the tag
                        lines up with the top of the labels, under their label.
                        The same tag as in the project list. */}
                    {!creation && (
                      <Input.Wrapper
                        label="Référence"
                        style={{ flexShrink: 0 }}
                        styles={{ label: { visibility: "hidden" } }}
                      >
                        {/* Raised by four pixels: otherwise the tag falls right
                            under the top of the labels. */}
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

                  {/* Where the task will go, before what names it. A card opened
                      from its board already knows where it is. */}
                  {creation && source && (
                    <TaskDestination
                      key={`${source.kind}-${source.id}`}
                      source={source}
                      onChange={setDestination}
                      onError={notifyError}
                    />
                  )}

                  <TextInput
                    label="Titre"
                    placeholder="Titre de la carte"
                    value={text}
                    onChange={(e) => setText(e.currentTarget.value)}
                    required
                  />

                  {/* The description, right under the title it details. */}
                  <RichTextField editor={editor} label="Description" />

                  {/* The due date follows what describes the card. As long as there is none,
                      nothing is shown — the form does not carry one more empty
                      field. */}
                  {withDue && (
                    <div data-zone="due-date">
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

                  {/* The dependencies follow the due date: they are added
                      from the "Actions" menu and save themselves. */}
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

                  {/* The checklists follow the dependencies: they too are added from
                      the "Actions" menu and save themselves. */}
                  {card && (
                    <CardChecklists
                      cardId={card.id}
                      checklists={checklists}
                      users={users}
                      onChanged={refreshChecklists}
                      onError={notifyError}
                      // Whoever receives an item becomes an actor of the card. They
                      // join the form's actors, and are saved with
                      // them on "Sauvegarder".
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

                  {/* The covers follow the checklists. */}
                  {card && (
                    <CardCovers
                      covers={covers}
                      interval={rotation}
                      onInterval={setRotation}
                      onPick={() => coverField.current?.click()}
                      onReorder={arrangeCovers}
                      onDelete={deleteCover}
                      readOnly={readOnly}
                      drop={
                        readOnly
                          ? undefined
                          : {
                              icon: IconPhoto,
                              message: "Déposez des images de couverture ici",
                              onDrop: (files) => void dropCovers(files),
                              accept: IMAGE_MIME_TYPE,
                              rejected: "Seules les images peuvent servir de couverture",
                              shown: dragging,
                            }
                      }
                    />
                  )}

                  {/* The attachments close the form. Empty, a drop zone stands
                      in for them; read-only, the block only shows with rows. */}
                  <div data-zone="attachments">
                    <CardAttachments
                      attachments={attachments}
                      onPick={() => fileField.current?.click()}
                      onReorder={arrangeAttachments}
                      onDelete={deleteAttachment}
                      drop={
                        card && !readOnly
                          ? {
                              icon: IconPaperclip,
                              message: "Déposez des fichiers ici",
                              onDrop: (files) => void dropFiles(files),
                              shown: dragging,
                            }
                          : undefined
                      }
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

      {/* The card is deleted from its "Actions" menu, not from here: the footer
          therefore only carries the two gestures common to all drawers. */}
      <DrawerFooter
        onSave={readOnly ? undefined : persist}
        onClose={onClose}
        saving={saving}
      />

      {/* The file picker, opened by the "Actions" menu as by the
          panel's button. It is reset afterwards: without that,
          dropping the same file again would trigger nothing — the browser only
          signals changes. */}
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
