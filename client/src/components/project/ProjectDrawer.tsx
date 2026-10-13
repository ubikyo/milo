import {
  Badge,
  Button,
  Cascader,
  Drawer,
  Group,
  Input,
  Menu,
  Notification,
  NumberInput,
  Select,
  Slider,
  Stack,
  Tabs,
  TextInput,
} from "@mantine/core";
import {
  IconCheck,
  IconChevronDown,
  IconCopy,
  IconEye,
  IconFolderSymlink,
  IconMessage,
  IconPaperclip,
  IconSettings,
} from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { api } from "../../api";
import { errorMessage, notifyError } from "../../lib/errors";
import { useFileDrag } from "../../lib/useFileDrag";
import { progressColor } from "../../themes/colors";
import {
  ACTIONS_BUTTON_STYLE,
  DRAWER_MENU_OFFSET,
  TAB_MENU_STYLES,
} from "../../themes/menus";
import { tabStyle } from "../../themes/tabs";
import fields from "../../assets/styles/GapField.module.css";
import { fieldWidth } from "../../lib/fieldWidth";
import { DEFAULT_MILESTONE_TYPE, projectReference } from "@milo/shared";
import CardAttachments from "../board/CardAttachments";
import { ordered, pendingOf } from "../products/ProductDrawer";
import type { Pending } from "../products/ProductDrawer";
import CommentThread from "./CommentThread";
import { MilestoneLabels, milestoneMarks } from "./milestoneMarks";
import MoveOrCopyProjectModal from "./MoveOrCopyProjectModal";
import ProjectCategoriesModal from "./ProjectCategoriesModal";
import type { ProjectAction } from "./MoveOrCopyProjectModal";
import { ACTOR_GAP } from "../ui/ActorAvatars";
import ActorPicker from "../ui/ActorPicker";
import AddButton from "../ui/AddButton";
import RichTextField, { useRichEditor } from "../ui/RichText";
import DeleteConfirmModal from "../ui/DeleteConfirmModal";
import DrawerFooter from "../ui/DrawerFooter";
import DrawerScrollArea, {
  DRAWER_PADDING,
  DRAWER_PANEL_STYLE,
  DRAWER_STYLES,
  DRAWER_TABS_STYLES,
} from "../ui/DrawerScroll";
import { BARE_FIELDSET, useRights } from "../../lib/rights";
import LabelPicker, { PROJECT_LABELS_API } from "../ui/LabelPicker";
import { categoryNodes } from "../../lib/categories";
import { TREE_CASCADER, locationTreeData, treePath } from "../ui/EditableTree";
import type {
  Category,
  Id,
  MilestoneType,
  ProjectAttachment,
  ProjectBoard,
  ProjectInput,
  ProjectLabel,
  PublicUser,
} from "@milo/shared";
import type { ThreadItem } from "./CommentThread";

/** The form being edited. Everything is strings: they are fields. */

interface Form {
  name: string;
  category_id: string;
  /** The slider's milestone type; empty, the slider stays bare. */
  milestone_type_id: string;
  status: number;
  actor_ids: string[];
  label_ids: string[];
}

// The drawer's two panes: the project's details, then its discussion.
const TABS = [
  { value: "settings", label: "Paramètres", icon: IconSettings },
  { value: "comments", label: "Commentaires", icon: IconMessage },
] as const;

const DOCUMENT_WORDS = { title: "Documents", one: "le document", many: "documents" };

// Height of the actor avatars and labels: the same for both, and
// for the "+" that follows them, so the two columns line up. The same
// measure as on a card's details: the two drawers read the same.
const CHIP_HEIGHT = 30;

const emptyForm: Form = {
  name: "",
  category_id: "",
  milestone_type_id: "",
  status: 0,
  actor_ids: [],
  label_ids: [],
};

interface ProjectDrawerProps {
  opened: boolean;
  onClose: () => void;
  /** "null" for a new project. */
  projectId: number | null;
  boardId: string | null;
  categories: Category[];
  /** The context being viewed: a new project receives its label. */
  context: string | null;
  /** On creation: the "Projets" widget it is added from. */
  listKey?: string;
  /** The milestone types from the settings: the slider picks one. */
  milestoneTypes: MilestoneType[];
  users: PublicUser[];
  labels: ProjectLabel[];
  /** The boards the project can be moved to, via the "Actions" menu. */
  boards: ProjectBoard[];
  currentUser: PublicUser | null;
  onLabelsChanged: (patch?: {
    id: number;
    data: Partial<ProjectLabel>;
  }) => void | Promise<void>;
  /** The widget's categories changed from this drawer: the board re-reads them. */
  onCategoriesChanged: () => void | Promise<void>;
  onSaved: () => void;
  onDeleted: () => void;
  /** Followed: you are notified of every change to this project. */
  following: boolean;
  onToggleFollow: () => void | Promise<void>;
}

export default function ProjectDrawer({
  opened,
  onClose,
  projectId,
  boardId,
  categories: boardCategories,
  context,
  listKey,
  milestoneTypes: boardMilestoneTypes,
  users,
  labels: boardLabels,
  boards,
  currentUser,
  onLabelsChanged,
  onCategoriesChanged,
  onSaved,
  onDeleted,
  following,
  onToggleFollow,
}: ProjectDrawerProps) {
  const [form, setForm] = useState<Form>(emptyForm);
  const [comments, setComments] = useState<ThreadItem[]>([]);
  /**
   * Its documents: an existing project's go out on upload; a new one's wait
   * for it to be created, then follow.
   */
  const [attachments, setAttachments] = useState<(ProjectAttachment | Pending)[]>([]);
  const fileField = useRef<HTMLInputElement>(null);
  const [confirmDeleteOpened, setConfirmDeleteOpened] = useState(false);
  const [saving, setSaving] = useState(false);
  /**
   * The gesture in progress in the destination dialog — move or copy —, or
   * "null" when it is closed. Both ask the same question, and a
   * single dialog answers it.
   */
  const [movement, setMove] = useState<ProjectAction | null>(null);
  const [activeTab, setActiveTab] = useState<string | null>("settings");
  /** The window that edits the widget's categories tree. */
  const [categoriesOpened, setCategoriesOpened] = useState(false);
  /** The project's number, read with it: "0" until then, and for a new project. */
  const [number, setNumber] = useState(0);

  const isEditing = Boolean(projectId);

  // Its categories, milestone types and labels are its "Projets" widget's:
  // the project's own, read with it, or the one it is added from.
  const [readKey, setReadKey] = useState<string | null>(null);
  const ownKey = projectId ? readKey : (listKey ?? null);
  const ownList = useMemo(
    () => (boardId && ownKey ? { board: Number(boardId), list: ownKey } : null),
    [boardId, ownKey],
  );
  const categories = useMemo(
    () => boardCategories.filter((c) => c.list_key === ownKey),
    [boardCategories, ownKey],
  );
  const milestoneTypes = useMemo(
    () => boardMilestoneTypes.filter((t) => t.list_key === ownKey),
    [boardMilestoneTypes, ownKey],
  );
  const labels = useMemo(
    () => boardLabels.filter((l) => l.list_key === ownKey),
    [boardLabels, ownKey],
  );

  // Without the right to edit projects, the details are read-only.
  const can = useRights();
  const readOnly = isEditing && !can("projects", "update");
  // Editing the tree adds, renames, moves: the server asks for both rights.
  const canEditCategories = can("projects", "create") && can("projects", "update");
  // Files dragged over the page: the drop zone shows, even under a full list.
  const dragging = useFileDrag(opened && !readOnly);

  // The milestones under the progress slider are those of the chosen type: they
  // change with it, and are missing if there are none.
  const milestones =
    milestoneTypes.find((t) => String(t.id) === form.milestone_type_id)
      ?.milestones ?? [];

  // The description editor, as in a card's details: it lives as long
  // as the drawer, its content is replaced each time a project is opened.
  const editor = useRichEditor({ placeholder: "Description du projet" });
  useEffect(() => {
    editor?.setEditable(!readOnly);
  }, [editor, readOnly]);

  // The lists only serve to compute default values: they are read
  // via a ref so that their reload (creating a category from this
  // drawer, for example) does not reset the input in progress.
  const lookupsRef = useRef({ categories, milestoneTypes });
  useEffect(() => {
    lookupsRef.current = { categories, milestoneTypes };
  }, [categories, milestoneTypes]);

  useEffect(() => {
    if (!opened) return;
    // A reopened drawer restarts from the settings, whichever tab was left.
    setActiveTab("settings");
    setMove(null);

    if (!projectId) {
      const { categories: cats, milestoneTypes: types } = lookupsRef.current;
      // A new project takes the "Défaut" type, set with the widget.
      const defaultValue = types.find((t) => t.name === DEFAULT_MILESTONE_TYPE);
      setForm({
        ...emptyForm,
        category_id: categoryNodes(cats)[0]?.id ?? "",
        milestone_type_id: defaultValue ? String(defaultValue.id) : "",
      });
      setComments([]);
      setAttachments([]);
      setNumber(0);
      editor?.commands.setContent("");
      return;
    }

    setReadKey(null);
    setNumber(0);
    setAttachments([]);
    api.getProject(projectId).then((project) => {
      setReadKey(project.list_key);
      setNumber(project.number);
      setForm({
        name: project.name,
        category_id: String(project.category_id),
        milestone_type_id: project.milestone_type_id
          ? String(project.milestone_type_id)
          : "",
        status: project.status,
        actor_ids: (project.actors || []).map((a) => String(a.id)),
        label_ids: (project.labels || []).map((l) => String(l.id)),
      });
      setComments(project.comments);
      setAttachments(project.attachments);
      editor?.commands.setContent(project.description || "");
    });
  }, [opened, projectId, editor]);

  const refreshComments = async () => {
    if (!projectId) return;
    const project = await api.getProject(projectId);
    setComments(project.comments);
  };

  // "Sauvegarder": the only gesture that writes. A project without a name or category
  // is not created — the drawer stays open, input is never lost.
  const persist = async () => {
    if (!form.name.trim() || !form.category_id) return;
    setSaving(true);
    const payload: ProjectInput = {
      name: form.name.trim(),
      description: editor?.getHTML() ?? "",
      board_id: Number(boardId),
      category_id: Number(form.category_id),
      // Created in a context, it receives its label (server).
      context: isEditing ? undefined : (context ?? undefined),
      milestone_type_id: form.milestone_type_id
        ? Number(form.milestone_type_id)
        : null,
      actor_ids: form.actor_ids.map(Number),
      label_ids: form.label_ids.map(Number),
      status: Number(form.status),
    };
    if (projectId) {
      await api.updateProject(projectId, payload);
    } else {
      const created = await api.createProject({
        ...payload,
        list_key: listKey || undefined,
      });
      for (const comment of comments) {
        await api.addComment(created.id, comment.text);
      }
      // From the last, each placed first: they keep their order.
      for (const attachment of [...attachments].reverse()) {
        if (!("upload" in attachment)) continue;
        await api.uploadProjectAttachment(created.id, attachment.upload);
        URL.revokeObjectURL(attachment.url);
      }
    }
    setSaving(false);
    onSaved();
  };

  /**
   * The gesture is done. Moved, the project is no longer where the form thinks:
   * the drawer closes without saving, otherwise closing it as
   * usual would immediately bring it back to its original board. Copied, the
   * project has not moved: the drawer stays open, and the copy appears by itself
   * in the list — the server signals the write to all clients.
   */
  const handleMoved = (action: ProjectAction) => () => {
    setMove(null);
    if (action === "move") onSaved();
  };

  // --- Documents -------------------------------------------------------------

  /** Chosen documents: the most recent first, as the server places them. */
  const addAttachments = async (files: File[]) => {
    for (const file of files) {
      if (!projectId) {
        setAttachments((already) => [pendingOf(file), ...already]);
        continue;
      }
      try {
        const attachment = await api.uploadProjectAttachment(projectId, file);
        setAttachments((already) => [attachment, ...already]);
      } catch (e) {
        notifyError(errorMessage(e));
      }
    }
  };

  const arrangeAttachments = async (ids: Id[]) => {
    setAttachments((already) => ordered(already, ids));
    if (!projectId) return;
    try {
      setAttachments(await api.reorderProjectAttachments(projectId, ids));
    } catch (e) {
      notifyError(errorMessage(e));
    }
  };

  const deleteAttachment = async (attachment: ProjectAttachment | Pending) => {
    try {
      if ("upload" in attachment) URL.revokeObjectURL(attachment.url);
      else await api.deleteProjectAttachment(attachment.id);
      setAttachments((already) => already.filter((a) => a.id !== attachment.id));
    } catch (e) {
      notifyError(errorMessage(e));
    }
  };

  const handleDelete = async () => {
    if (!projectId) return;
    await api.deleteProject(projectId);
    setConfirmDeleteOpened(false);
    onDeleted();
  };

  // Before creation, comments live locally and are sent to the
  // server once the project is saved.
  const handleAddComment = async (text: string) => {
    if (!projectId) {
      const now = new Date().toISOString();
      setComments((list) => [
        ...list,
        {
          id: `draft-${now}-${list.length}`,
          text,
          author: currentUser ?? null,
          created_at: now,
          updated_at: now,
        },
      ]);
      return;
    }
    await api.addComment(projectId, text);
    await refreshComments();
  };

  const handleUpdateComment = async (
    commentId: number | string,
    text: string,
  ) => {
    if (!projectId || typeof commentId !== "number") {
      setComments((list) =>
        list.map((c) =>
          c.id === commentId
            ? { ...c, text, updated_at: new Date().toISOString() }
            : c,
        ),
      );
      return;
    }
    await api.updateComment(commentId, text);
    await refreshComments();
  };

  const handleDeleteComment = async (commentId: number | string) => {
    if (!projectId || typeof commentId !== "number") {
      setComments((list) => list.filter((c) => c.id !== commentId));
      return;
    }
    await api.deleteComment(commentId);
    await refreshComments();
  };

  // The board's tree, to pick the project's category in, level after level.
  const categoryNodesList = categoryNodes(categories);
  const categoryData = locationTreeData(categoryNodesList);

  return (
    <>
      <Drawer
        opened={opened}
        onClose={onClose}
        position="right"
        size={560}
        padding={DRAWER_PADDING}
        withCloseButton={false}
        // Only the open tab's panel scrolls: the tabs and the bottom buttons
        // stay in place (components/ui/DrawerScroll.tsx).
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

            {/* What is done with the project itself, rather than its form, goes
                at the end of the row of tabs — as in a card's or a board's
                drawer. A project not yet created has nothing to
                move. */}
            {isEditing && (
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
                  {/* Follow comes first: it applies to the whole project, where the rest
                      moves it. The menu does not close,
                      so the checkmark can be seen changing. */}
                  <Menu.Item
                    leftSection={<IconEye size={16} />}
                    rightSection={following ? <IconCheck size={14} /> : null}
                    onClick={() => onToggleFollow()}
                    closeMenuOnClick={false}
                  >
                    Suivre
                  </Menu.Item>

                  {!readOnly && (
                    <>
                      <Menu.Divider />

                      <Menu.Item
                        leftSection={<IconFolderSymlink size={16} />}
                        onClick={() => setMove("move")}
                      >
                        Déplacer
                      </Menu.Item>
                    </>
                  )}
                  {can("projects", "create") && (
                    <Menu.Item
                      leftSection={<IconCopy size={16} />}
                      onClick={() => setMove("copy")}
                    >
                      Copier
                    </Menu.Item>
                  )}
                </Menu.Dropdown>
              </Menu>
            )}
          </Tabs.List>

          <Tabs.Panel value="settings" style={DRAWER_PANEL_STYLE}>
            <DrawerScrollArea>
              {/* In read-only mode, all the form's fields are disabled
                  at once: that is what a disabled "fieldset" does. */}
              <fieldset disabled={readOnly} style={BARE_FIELDSET}>
                <Stack gap="xl">
                  {/* As on a card, what categorizes the project comes before what
                      names it: actors and labels open the form, each
                      column on its own list. The actors' avatars take
                      little room, labels carry text: the width
                      is split 30 / 70. The split is expressed in proportions, not
                      percentages — "30% + 70%" would have ignored the gap between
                      the two columns, and the second would have overflowed by that much. */}
                  <Group align="flex-start" gap="md" wrap="nowrap">
                    <div style={{ flex: "3 1 0", minWidth: 0 }}>
                      <ActorPicker
                        kind="project"
                        chipHeight={CHIP_HEIGHT}
                        // The avatars follow one another with the same thin gap as on
                        // a card or in the projects board.
                        chipGap={ACTOR_GAP}
                        label="Acteurs"
                        users={users}
                        value={form.actor_ids}
                        onChange={(value) =>
                          setForm((f) => ({ ...f, actor_ids: value }))
                        }
                      />
                    </div>
                    <div style={{ flex: "7 1 0", minWidth: 0 }}>
                      <LabelPicker
                        chipHeight={CHIP_HEIGHT}
                        labels={labels ?? []}
                        value={form.label_ids}
                        onChange={(value) =>
                          setForm((f) => ({ ...f, label_ids: value }))
                        }
                        list={ownList}
                        onLabelsChanged={onLabelsChanged}
                        labelsApi={PROJECT_LABELS_API}
                      />
                    </div>
                    {/* The project's number, at the end of the row, as on a
                      support request's details. */}
                    {number > 0 && (
                      <Badge
                        color="green"
                        variant="filled"
                        radius="sm"
                        size="lg"
                        style={{ flexShrink: 0, alignSelf: "center" }}
                      >
                        {projectReference(number)}
                      </Badge>
                    )}
                  </Group>
                  <TextInput
                    label="Nom du projet"
                    placeholder="Nom du projet"
                    value={form.name}
                    onChange={(e) => {
                      const { value } = e.currentTarget;
                      setForm((f) => ({ ...f, name: value }));
                    }}
                    required
                  />
                  <RichTextField editor={editor} label="Description" />
                  {/* In columns, level after level; any level may be chosen.
                      The project keeps the category's id; the categories are
                      set in the widget's drawer, or in the window the link
                      under the field opens — without leaving the project. */}
                  <div>
                    <Cascader
                      label="Catégorie"
                      placeholder="Choisir une catégorie"
                      data={categoryData}
                      value={
                        form.category_id ? treePath(categoryNodesList, form.category_id) : null
                      }
                      onChange={(path) => {
                        const chosen = path?.at(-1);
                        if (chosen) setForm((f) => ({ ...f, category_id: chosen }));
                      }}
                      nothingFoundMessage="Aucune catégorie"
                      {...TREE_CASCADER}
                      searchable
                      required
                    />
                    {canEditCategories && ownList && (
                      <AddButton
                        label="Ajouter une catégorie"
                        onClick={() => setCategoriesOpened(true)}
                        mt={4}
                      />
                    )}
                  </div>

                  {/* The milestone names are written under the slider, in the
                      flow (MilestoneLabels): they count in what scrolls. */}
                  <div>
                    <Group
                      justify="space-between"
                      align="flex-end"
                      wrap="nowrap"
                    >
                      <Input.Label>Progression</Input.Label>
                      {/* Discreet like a section's width: frameless
                          until hovered, at its height. */}
                      <Group gap={4} wrap="nowrap">
                        {/* The milestone type sets the slider's marks and the
                            colors of its slices; they are set in the
                            settings. */}
                        <Select
                          data={milestoneTypes.map((t) => ({
                            value: String(t.id),
                            label: t.name,
                          }))}
                          value={form.milestone_type_id || null}
                          onChange={(value) =>
                            setForm((f) => ({
                              ...f,
                              milestone_type_id: value ?? "",
                            }))
                          }
                          placeholder="Jalons"
                          allowDeselect={false}
                          size="xs"
                          // At the size of the chosen name, chevron included.
                          w={
                            fieldWidth(
                              milestoneTypes.find(
                                (t) => String(t.id) === form.milestone_type_id,
                              )?.name ?? "Jalons",
                            ) + 14
                          }
                          withCheckIcon={false}
                          rightSection={<IconChevronDown size={10} />}
                          rightSectionWidth={14}
                          comboboxProps={{ width: 220, position: "bottom-end" }}
                          aria-label="Type de jalons"
                          title="Type de jalons"
                          className={`${fields.field} ${fields.unit}`}
                        />
                        <NumberInput
                          value={form.status}
                          onChange={(value) => {
                            // The field can be emptied while typing.
                            const n =
                              typeof value === "number" ? value : Number(value);
                            setForm((f) => ({
                              ...f,
                              status: Number.isFinite(n)
                                ? Math.min(100, Math.max(0, n))
                                : 0,
                            }));
                          }}
                          min={0}
                          max={100}
                          clampBehavior="strict"
                          suffix="%"
                          hideControls
                          // Enough to write the longest: "100%".
                          w={fieldWidth("100%")}
                          size="xs"
                          aria-label="Progression"
                          title="Progression"
                          className={`${fields.field} ${fields.number}`}
                        />
                      </Group>
                    </Group>
                    <Slider
                      value={form.status}
                      onChange={(value) =>
                        setForm((f) => ({ ...f, status: value }))
                      }
                      min={0}
                      max={100}
                      step={1}
                      marks={milestoneMarks(milestones)}
                      color={progressColor(form.status, milestones)}
                    />
                    <MilestoneLabels milestones={milestones} />
                  </div>

                  {/* Read-only, the disabled fieldset turns its actions off; an
                      empty list then has nothing to show, nor a zone to drop on. */}
                  <CardAttachments
                    attachments={attachments}
                    onPick={() => fileField.current?.click()}
                    onReorder={arrangeAttachments}
                    onDelete={deleteAttachment}
                    drop={
                      readOnly
                        ? undefined
                        : {
                            icon: IconPaperclip,
                            message: "Déposez des fichiers ici",
                            onDrop: (files) => void addAttachments(files),
                            shown: dragging,
                          }
                    }
                    words={DOCUMENT_WORDS}
                  />
                </Stack>
              </fieldset>
            </DrawerScrollArea>
          </Tabs.Panel>

          {/* The panel takes all the free height: the empty thread spreads out in it. */}
          <Tabs.Panel value="comments" style={DRAWER_PANEL_STYLE}>
            <DrawerScrollArea fill>
              <Stack gap="md" style={{ flex: 1, minHeight: 0 }}>
                <CommentThread
                  comments={comments}
                  onAdd={handleAddComment}
                  onUpdate={handleUpdateComment}
                  onDelete={handleDeleteComment}
                  readOnly={readOnly}
                />

                {!isEditing && comments.length > 0 && (
                  <Notification
                    color="blue"
                    withCloseButton={false}
                    withBorder
                    radius="md"
                    mt={40}
                  >
                    {comments.length} commentaire
                    {comments.length > 1 ? "s" : ""} seront enregistrés avec le
                    projet.
                  </Notification>
                )}
              </Stack>
            </DrawerScrollArea>
          </Tabs.Panel>
        </Tabs>

        <DrawerFooter
          onSave={readOnly ? undefined : persist}
          onClose={onClose}
          onDelete={
            isEditing && can("projects", "delete")
              ? () => setConfirmDeleteOpened(true)
              : undefined
          }
          saving={saving}
        />

        {/* The picker, reset afterwards: choosing the same file again must
            still be seen. */}
        <input
          ref={fileField}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            const files = Array.from(e.currentTarget.files ?? []);
            e.currentTarget.value = "";
            void addAttachments(files);
          }}
        />
      </Drawer>

      {/* Categories belong to the board: changing board also means
          choosing the one that hosts the project there — for a copy
          as for a move. The same dialog as in a list row's
          menu. */}
      <MoveOrCopyProjectModal
        opened={movement !== null}
        onClose={() => setMove(null)}
        mode={movement ?? "move"}
        project={
          projectId
            ? {
                id: projectId,
                board_id: Number(boardId),
                list_key: readKey ?? "",
                name: form.name,
                category_id: Number(form.category_id),
              }
            : null
        }
        boards={boards}
        onMoved={handleMoved(movement ?? "move")}
      />

      <ProjectCategoriesModal
        opened={categoriesOpened}
        onClose={() => setCategoriesOpened(false)}
        list={ownList}
        onSaved={(saved) => {
          // The chosen category may be gone: the project then takes the
          // tree's first, as a new one does.
          setForm((f) =>
            saved.some((c) => String(c.id) === f.category_id)
              ? f
              : { ...f, category_id: categoryNodes(saved)[0]?.id ?? "" },
          );
          void onCategoriesChanged();
        }}
      />

      <DeleteConfirmModal
        opened={confirmDeleteOpened}
        onClose={() => setConfirmDeleteOpened(false)}
        onConfirm={handleDelete}
        title="Supprimer le projet"
        message={
          <>
            Voulez-vous vraiment supprimer
            {form.name ? ` « ${form.name} »` : " ce projet"} ? Cette action est
            irréversible.
          </>
        }
      />
    </>
  );
}
