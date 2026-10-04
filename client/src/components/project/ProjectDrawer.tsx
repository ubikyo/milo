import {
  ActionIcon,
  Button,
  Drawer,
  Group,
  Input,
  Menu,
  Modal,
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
  IconPlus,
  IconSettings,
} from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { api } from "../../api";
import { progressColor } from "../../themes/colors";
import { MODAL_PADDING, modalHeaderStyles } from "../../themes/modals";
import {
  ACTIONS_BUTTON_STYLE,
  DRAWER_MENU_OFFSET,
  TAB_MENU_STYLES,
} from "../../themes/menus";
import { tabStyle } from "../../themes/tabs";
import fields from "../../assets/styles/GapField.module.css";
import { fieldWidth } from "../../lib/fieldWidth";
import { DEFAULT_MILESTONE_TYPE } from "@milo/shared";
import CommentThread from "./CommentThread";
import { MilestoneLabels, milestoneMarks } from "./milestoneMarks";
import MoveOrCopyProjectModal from "./MoveOrCopyProjectModal";
import type { ProjectAction } from "./MoveOrCopyProjectModal";
import { ACTOR_GAP } from "../ui/ActorAvatars";
import ActorPicker from "../ui/ActorPicker";
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
import { errorMessage, notifyError } from "../../lib/errors";
import type {
  Category,
  Context,
  MilestoneType,
  ProjectBoard,
  ProjectInput,
  ProjectLabel,
  PublicUser,
} from "@milo/shared";
import type { ThreadItem } from "./CommentThread";
import CloseButton from "../ui/CloseButton";

/** La fiche en cours de saisie. Tout y est en chaînes : ce sont des champs. */

interface Form {
  name: string;
  category_id: string;
  context_id: string;
  /** Le type de jalons du curseur ; vide, le curseur reste nu. */
  milestone_type_id: string;
  status: number;
  actor_ids: string[];
  label_ids: string[];
}

// Les deux volets du tiroir : la fiche du projet, puis ses échanges.
const TABS = [
  { value: "settings", label: "Paramètres", icon: IconSettings },
  { value: "comments", label: "Commentaires", icon: IconMessage },
] as const;

// Hauteur des bulles d'acteurs et des étiquettes : la même pour les deux, et
// pour le « + » qui les suit, afin que les deux colonnes s'alignent. La même
// mesure que sur la fiche d'une carte : les deux tiroirs se lisent pareil.
const CHIP_HEIGHT = 30;

const emptyForm: Form = {
  name: "",
  category_id: "",
  context_id: "",
  milestone_type_id: "",
  status: 0,
  actor_ids: [],
  label_ids: [],
};

interface ProjectDrawerProps {
  opened: boolean;
  onClose: () => void;
  /** « null » pour un nouveau projet. */
  projectId: number | null;
  boardId: string | null;
  categories: Category[];
  /** Les contextes du tableau : le projet appartient à l'un d'eux. */
  contexts: Context[];
  /** Le contexte proposé à la création : celui qu'on regarde, ou le premier. */
  contextId: string;
  /** À la création : le widget « Projets » d'où on l'ajoute. */
  listKey?: string;
  /** Les types de jalons des réglages : le curseur en choisit un. */
  milestoneTypes: MilestoneType[];
  users: PublicUser[];
  labels: ProjectLabel[];
  /** Les tableaux où le projet peut être déplacé, par le menu « Actions ». */
  boards: ProjectBoard[];
  currentUser: PublicUser | null;
  onCategoriesChanged: () => void | Promise<void>;
  onLabelsChanged: (patch?: {
    id: number;
    data: Partial<ProjectLabel>;
  }) => void | Promise<void>;
  onSaved: () => void;
  onDeleted: () => void;
  /** Suivi : on est prévenu de chaque modification de ce projet. */
  following: boolean;
  onToggleFollow: () => void | Promise<void>;
}

export default function ProjectDrawer({
  opened,
  onClose,
  projectId,
  boardId,
  categories,
  contexts,
  contextId,
  listKey,
  milestoneTypes,
  users,
  labels,
  boards,
  currentUser,
  onCategoriesChanged,
  onLabelsChanged,
  onSaved,
  onDeleted,
  following,
  onToggleFollow,
}: ProjectDrawerProps) {
  const [form, setForm] = useState<Form>(emptyForm);
  const [comments, setComments] = useState<ThreadItem[]>([]);
  const [confirmDeleteOpened, setConfirmDeleteOpened] = useState(false);
  const [saving, setSaving] = useState(false);
  /**
   * Le geste en cours dans la boîte de destination — déplacer ou copier —, ou
   * « null » quand elle est fermée. Les deux posent la même question, et une
   * seule boîte y répond.
   */
  const [movement, setMove] = useState<ProjectAction | null>(null);
  const [newCategoryOpened, setNewCategoryOpened] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [activeTab, setActiveTab] = useState<string | null>("settings");

  const isEditing = Boolean(projectId);

  // Sans le droit de modifier les projets, la fiche se lit seulement.
  const can = useRights();
  const readOnly = isEditing && !can("projects", "update");

  // Les jalons sous le curseur de progression sont ceux du type choisi : ils
  // changent avec lui, et manquent s'il n'y en a aucun.
  const milestones =
    milestoneTypes.find((t) => String(t.id) === form.milestone_type_id)
      ?.milestones ?? [];

  // L'éditeur de la description, comme dans la fiche d'une carte : il vit tant
  // que le tiroir vit, son contenu est remplacé à chaque projet ouvert.
  const editor = useRichEditor({ placeholder: "Description du projet" });
  useEffect(() => {
    editor?.setEditable(!readOnly);
  }, [editor, readOnly]);

  // Les listes servent seulement à calculer les valeurs par défaut : on les lit
  // via une ref pour que leur rechargement (création d'une catégorie depuis ce
  // tiroir, par exemple) ne réinitialise pas la saisie en cours.
  const lookupsRef = useRef({ categories, contextId, milestoneTypes });
  useEffect(() => {
    lookupsRef.current = { categories, contextId, milestoneTypes };
  }, [categories, contextId, milestoneTypes]);

  useEffect(() => {
    if (!opened) return;
    // Un tiroir rouvert repart des paramètres, quel que soit l'onglet quitté.
    setActiveTab("settings");
    setMove(null);

    if (!projectId) {
      const {
        categories: cats,
        contextId: proposed,
        milestoneTypes: types,
      } = lookupsRef.current;
      // Un nouveau projet prend le type « Défaut », posé avec le widget.
      const defaultValue = types.find((t) => t.name === DEFAULT_MILESTONE_TYPE);
      setForm({
        ...emptyForm,
        category_id: cats[0] ? String(cats[0].id) : "",
        context_id: proposed,
        milestone_type_id: defaultValue ? String(defaultValue.id) : "",
      });
      setComments([]);
      editor?.commands.setContent("");
      return;
    }

    api.getProject(projectId).then((project) => {
      setForm({
        name: project.name,
        category_id: String(project.category_id),
        context_id: project.context_id ? String(project.context_id) : "",
        milestone_type_id: project.milestone_type_id
          ? String(project.milestone_type_id)
          : "",
        status: project.status,
        actor_ids: (project.actors || []).map((a) => String(a.id)),
        label_ids: (project.labels || []).map((l) => String(l.id)),
      });
      setComments(project.comments);
      editor?.commands.setContent(project.description || "");
    });
  }, [opened, projectId, editor]);

  const refreshComments = async () => {
    if (!projectId) return;
    const project = await api.getProject(projectId);
    setComments(project.comments);
  };

  // « Sauvegarder » : le seul geste qui écrit. Un projet sans nom ni catégorie
  // n'est pas créé — le tiroir reste ouvert, la saisie n'est jamais perdue.
  const persist = async () => {
    if (!form.name.trim() || !form.category_id) return;
    setSaving(true);
    const payload: ProjectInput = {
      name: form.name.trim(),
      description: editor?.getHTML() ?? "",
      board_id: Number(boardId),
      category_id: Number(form.category_id),
      context_id: form.context_id ? Number(form.context_id) : undefined,
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
    }
    setSaving(false);
    onSaved();
  };

  // La nouvelle catégorie est sélectionnée aussitôt créée.
  const createCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) return;
    setCreatingCategory(true);
    try {
      const created = await api.createCategory(Number(boardId), name);
      await onCategoriesChanged();
      setForm((f) => ({ ...f, category_id: String(created.id) }));
      setNewCategoryName("");
      setNewCategoryOpened(false);
    } catch (e) {
      notifyError(errorMessage(e));
    } finally {
      setCreatingCategory(false);
    }
  };

  const closeNewCategory = () => {
    setNewCategoryOpened(false);
    setNewCategoryName("");
  };

  /**
   * Le geste est fait. Déplacé, le projet n'est plus là où la fiche le croit :
   * le tiroir se referme sans enregistrer, sans quoi le refermer comme
   * d'habitude le ramènerait aussitôt dans son tableau d'origine. Copié, le
   * projet n'a pas bougé : le tiroir reste ouvert, et la copie paraît d'elle-
   * même dans la liste — le serveur signale l'écriture à tous les clients.
   */
  const handleMoved = (action: ProjectAction) => () => {
    setMove(null);
    if (action === "move") onSaved();
  };

  const handleDelete = async () => {
    if (!projectId) return;
    await api.deleteProject(projectId);
    setConfirmDeleteOpened(false);
    onDeleted();
  };

  // Avant création, les commentaires vivent en local et sont envoyés au
  // serveur une fois le projet enregistré.
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

  const categoryOptions = categories.map((c) => ({
    value: String(c.id),
    label: c.name,
  }));
  const contextOptions = contexts.map((c) => ({
    value: String(c.id),
    label: c.name,
  }));

  return (
    <>
      <Drawer
        opened={opened}
        onClose={onClose}
        position="right"
        size={560}
        padding={DRAWER_PADDING}
        withCloseButton={false}
        // Seul le panneau de l'onglet défile : les onglets et les boutons du
        // bas restent en place (components/ui/DrawerScroll.tsx).
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

            {/* Ce qu'on fait du projet lui-même, et non de sa fiche, se range
                au bout de la rangée d'onglets — comme dans le tiroir d'une
                carte ou d'un tableau. Un projet pas encore créé n'a rien à
                déplacer. */}
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
                  {/* Suivre vient en tête : c'est ce qui porte sur le projet
                      entier, là où le reste le déplace. Le menu ne se referme
                      pas, pour qu'on voie la coche changer. */}
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
              {/* En lecture seule, tous les champs de la fiche sont éteints
                  d'un coup : c'est ce que fait un « fieldset » désactivé. */}
              <fieldset disabled={readOnly} style={BARE_FIELDSET}>
                <Stack gap="xl">
                  {/* Comme sur une carte, ce qui range le projet vient avant ce
                    qui le nomme : acteurs et étiquettes ouvrent la fiche, chaque
                    colonne sur sa propre liste. Les bulles des acteurs tiennent
                    en peu de place, les étiquettes portent du texte : la largeur
                    se partage en 30 / 70. Ce partage se dit en proportions et non
                    en pourcentages — « 30% + 70% » aurait ignoré l'écart entre
                    les deux colonnes, et la seconde aurait débordé d'autant. */}
                  <Group align="flex-start" gap="md" wrap="nowrap">
                    <div style={{ flex: "3 1 0", minWidth: 0 }}>
                      <ActorPicker
                        chipHeight={CHIP_HEIGHT}
                        // Les bulles se suivent avec le même filet d'air que sur
                        // une carte ou dans le tableau des projets.
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
                        boardId={boardId ?? ""}
                        onLabelsChanged={onLabelsChanged}
                        labelsApi={PROJECT_LABELS_API}
                      />
                    </div>
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
                  {/* Un tableau sans contexte n'a rien à proposer. */}
                  {contextOptions.length > 0 && (
                    <Select
                      label="Contexte"
                      data={contextOptions}
                      value={form.context_id || null}
                      onChange={(value) =>
                        setForm((f) => ({
                          ...f,
                          context_id: value ?? f.context_id,
                        }))
                      }
                      allowDeselect={false}
                    />
                  )}
                  <Group gap="xs" align="flex-end" wrap="nowrap">
                    <Select
                      label="Catégorie"
                      data={categoryOptions}
                      value={form.category_id}
                      onChange={(value) =>
                        setForm((f) => ({ ...f, category_id: value ?? "" }))
                      }
                      required
                      style={{ flex: 1 }}
                    />
                    <ActionIcon
                      variant="filled"
                      color="teal"
                      size={36}
                      aria-label="Nouvelle catégorie"
                      onClick={() => setNewCategoryOpened(true)}
                    >
                      <IconPlus size={18} />
                    </ActionIcon>
                  </Group>

                  {/* Les noms des jalons s'écrivent sous le slider, dans le
                    flux (MilestoneLabels) : ils comptent dans ce qui défile. */}
                  <div>
                    <Group
                      justify="space-between"
                      align="flex-end"
                      wrap="nowrap"
                    >
                      <Input.Label>Progression</Input.Label>
                      {/* Discrets comme la largeur d'une section : sans cadre
                        tant qu'on ne les survole pas, à sa hauteur. */}
                      <Group gap={4} wrap="nowrap">
                        {/* Le type de jalons pose les marques du curseur et les
                          couleurs de ses tranches ; ils se règlent dans les
                          réglages. */}
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
                          // À la taille du nom choisi, chevron compris.
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
                            // Le champ peut être vidé pendant la frappe.
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
                          // De quoi écrire le plus long : « 100% ».
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
                </Stack>
              </fieldset>
            </DrawerScrollArea>
          </Tabs.Panel>

          {/* Le panneau prend toute la hauteur libre : le fil vide s'y étale. */}
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
      </Drawer>

      {/* Les catégories appartiennent au tableau : changer de tableau, c'est
          aussi choisir celle qui accueille le projet là-bas — pour une copie
          comme pour un déplacement. La même boîte qu'au menu d'une ligne de la
          liste. */}
      <MoveOrCopyProjectModal
        opened={movement !== null}
        onClose={() => setMove(null)}
        mode={movement ?? "move"}
        project={
          projectId
            ? {
                id: projectId,
                board_id: Number(boardId),
                name: form.name,
                category_id: Number(form.category_id),
              }
            : null
        }
        boards={boards}
        onMoved={handleMoved(movement ?? "move")}
      />

      <Modal
        opened={newCategoryOpened}
        onClose={closeNewCategory}
        title="Nouvelle catégorie"
        centered
        padding={MODAL_PADDING}
        withCloseButton={false}
        styles={modalHeaderStyles(MODAL_PADDING)}
      >
        <Stack gap="md">
          <TextInput
            label="Nom"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                createCategory();
              }
            }}
            required
            autoFocus
          />
          {/* Espace au-dessus des actions égal au retrait de la fenêtre, comme
              dans la confirmation de suppression. */}
          <Group justify="flex-end" mt={MODAL_PADDING - 16}>
            <CloseButton onClick={closeNewCategory} />
            <Button
              color="teal"
              onClick={createCategory}
              loading={creatingCategory}
              disabled={!newCategoryName.trim()}
            >
              Ajouter
            </Button>
          </Group>
        </Stack>
      </Modal>

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
