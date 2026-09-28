import {
  ActionIcon,
  Button,
  Drawer,
  Group,
  Menu,
  Modal,
  Notification,
  NumberInput,
  Select,
  Slider,
  Stack,
  Tabs,
  Text,
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
  IconTrash,
} from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { api } from "../../api";
import { NEUTRAL_HOVER, RED, statusColor } from "../../themes/colors";
import { MODAL_PADDING, modalHeaderStyles } from "../../themes/modals";
import { tabStyle } from "../../themes/tabs";
import CommentThread from "./CommentThread";
import MoveOrCopyProjectModal from "./MoveOrCopyProjectModal";
import type { ProjectAction } from "./MoveOrCopyProjectModal";
import { ACTOR_GAP, PersonAvatar } from "../ui/ActorAvatars";
import ChipPicker from "../ui/ChipPicker";
import RichTextField, { useRichEditor } from "../ui/RichText";
import DeleteConfirmModal from "../ui/DeleteConfirmModal";
import ErrorAlert from "../ui/ErrorAlert";
import LabelPicker, { PROJECT_LABELS_API } from "../ui/LabelPicker";
import { messageErreur } from "../../lib/errors";
import type {
  Category,
  Company,
  ProjectBoard,
  ProjectInput,
  ProjectLabel,
  PublicUser,
} from "@milo/shared";
import type { FilItem } from "./CommentThread";

/** La fiche en cours de saisie. Tout y est en chaînes : ce sont des champs. */
interface Formulaire {
  name: string;
  category_id: string;
  company_id: string;
  status: number;
  actor_ids: string[];
  label_ids: string[];
}

// Les deux volets du tiroir : la fiche du projet, puis ses échanges.
const TABS = [
  { value: "settings", label: "Paramètres", icon: IconSettings },
  { value: "comments", label: "Commentaires", icon: IconMessage },
] as const;

// Jalons métier affichés sous le curseur de progression.
const PROGRESS_MARKS = [
  { value: 10, label: "Étude" },
  { value: 20, label: "Devis" },
  { value: 30, label: "Commande" },
  { value: 50, label: "Déploiement" },
  { value: 80, label: "Tests" },
];


// Hauteur des bulles d'acteurs et des étiquettes : la même pour les deux, et
// pour le « + » qui les suit, afin que les deux colonnes s'alignent. La même
// mesure que sur la fiche d'une carte : les deux tiroirs se lisent pareil.
const CHIP_HEIGHT = 30;

const emptyForm: Formulaire = {
  name: "",
  category_id: "",
  company_id: "",
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
  companies: Company[];
  users: PublicUser[];
  labels: ProjectLabel[];
  /** Les tableaux où le projet peut être déplacé, par le menu « Actions ». */
  boards: ProjectBoard[];
  currentUser: PublicUser | null;
  onCategoriesChanged: () => void | Promise<void>;
  onLabelsChanged: (patch?: { id: number; data: Partial<ProjectLabel> }) => void | Promise<void>;
  onSaved: () => void;
  onDeleted: () => void;
  /** Suivi : on est prévenu de chaque modification de ce projet. */
  suivi: boolean;
  onToggleFollow: () => void | Promise<void>;
}

export default function ProjectDrawer({
  opened,
  onClose,
  projectId,
  boardId,
  categories,
  companies,
  users,
  labels,
  boards,
  currentUser,
  onCategoriesChanged,
  onLabelsChanged,
  onSaved,
  onDeleted,
  suivi,
  onToggleFollow,
}: ProjectDrawerProps) {
  const [form, setForm] = useState<Formulaire>(emptyForm);
  const [comments, setComments] = useState<FilItem[]>([]);
  const [confirmDeleteOpened, setConfirmDeleteOpened] = useState(false);
  /**
   * Le geste en cours dans la boîte de destination — déplacer ou copier —, ou
   * « null » quand elle est fermée. Les deux posent la même question, et une
   * seule boîte y répond.
   */
  const [deplacement, setDeplacement] = useState<ProjectAction | null>(null);
  const [newCategoryOpened, setNewCategoryOpened] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryError, setNewCategoryError] = useState<string | null>(null);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [activeTab, setActiveTab] = useState<string | null>("settings");

  const isEditing = Boolean(projectId);

  // L'éditeur de la description, comme dans la fiche d'une carte : il vit tant
  // que le tiroir vit, son contenu est remplacé à chaque projet ouvert.
  const editor = useRichEditor({ placeholder: "Description du projet" });

  // Les listes servent seulement à calculer les valeurs par défaut : on les lit
  // via une ref pour que leur rechargement (création d'une catégorie depuis ce
  // tiroir, par exemple) ne réinitialise pas la saisie en cours.
  const lookupsRef = useRef({ categories, companies });
  useEffect(() => {
    lookupsRef.current = { categories, companies };
  }, [categories, companies]);

  useEffect(() => {
    if (!opened) return;
    // Un tiroir rouvert repart des paramètres, quel que soit l'onglet quitté.
    setActiveTab("settings");
    setDeplacement(null);

    if (!projectId) {
      const { categories: cats, companies: comps } = lookupsRef.current;
      setForm({
        ...emptyForm,
        category_id: cats[0] ? String(cats[0].id) : "",
        company_id: comps[0] ? String(comps[0].id) : "",
      });
      setComments([]);
      editor?.commands.setContent("");
      return;
    }

    api
      .getProject(projectId)
      .then((project) => {
        setForm({
          name: project.name,
          category_id: String(project.category_id),
          company_id: project.company_id ? String(project.company_id) : "",
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

  // Le tiroir n'a ni « Fermer » ni « Enregistrer » : on le referme en cliquant
  // au dehors, et c'est à ce moment que la fiche part au serveur. Un projet
  // sans nom ni catégorie n'est pas créé : refermer sans rien saisir ne laisse
  // rien derrière soi. Si le serveur refuse, le tiroir reste ouvert — sans
  // bouton pour réessayer, la saisie ne doit pas partir avec lui.
  const fermer = async () => {
    if (!form.name.trim() || !form.category_id) return onClose();
    const payload: ProjectInput = {
      name: form.name.trim(),
      description: editor?.getHTML() ?? "",
      board_id: Number(boardId),
      category_id: Number(form.category_id),
      company_id: form.company_id ? Number(form.company_id) : null,
      actor_ids: form.actor_ids.map(Number),
      label_ids: form.label_ids.map(Number),
      status: Number(form.status),
    };
    if (projectId) {
      await api.updateProject(projectId, payload);
    } else {
      const created = await api.createProject(payload);
      for (const comment of comments) {
        await api.addComment(created.id, comment.text);
      }
    }
    onSaved();
  };

  // La nouvelle catégorie est sélectionnée aussitôt créée.
  const createCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) return;
    setCreatingCategory(true);
    setNewCategoryError(null);
    try {
      const created = await api.createCategory(Number(boardId), name);
      await onCategoriesChanged();
      setForm((f) => ({ ...f, category_id: String(created.id) }));
      setNewCategoryName("");
      setNewCategoryOpened(false);
    } catch (e) {
      setNewCategoryError(messageErreur(e));
    } finally {
      setCreatingCategory(false);
    }
  };

  const closeNewCategory = () => {
    setNewCategoryOpened(false);
    setNewCategoryName("");
    setNewCategoryError(null);
  };

  /**
   * Le geste est fait. Déplacé, le projet n'est plus là où la fiche le croit :
   * le tiroir se referme sans enregistrer, sans quoi le refermer comme
   * d'habitude le ramènerait aussitôt dans son tableau d'origine. Copié, le
   * projet n'a pas bougé : le tiroir reste ouvert, et la copie paraît d'elle-
   * même dans la liste — le serveur signale l'écriture à tous les clients.
   */
  const handleMoved = (geste: ProjectAction) => () => {
    setDeplacement(null);
    if (geste === "move") onSaved();
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

  const handleUpdateComment = async (commentId: number | string, text: string) => {
    if (!projectId || typeof commentId !== "number") {
      setComments((list) =>
        list.map((c) => (c.id === commentId ? { ...c, text, updated_at: new Date().toISOString() } : c)),
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

  const categoryOptions = categories.map((c) => ({ value: String(c.id), label: c.name }));
  const companyOptions = companies.map((c) => ({ value: String(c.id), label: c.name }));

  return (
    <>
      <Drawer
        opened={opened}
        onClose={fermer}
        position="right"
        size={560}
        padding={40}
        withCloseButton={false}
        styles={{
          content: { display: "flex", flexDirection: "column" },
          body: {
            flex: 1,
            display: "flex",
            flexDirection: "column",
            overflowY: "auto",
          },
        }}
      >
        <Tabs
          value={activeTab}
          onChange={setActiveTab}
          style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}
          // Le retrait sous la barre d'onglets est posé ici, une fois : les
          // deux panneaux démarrent ainsi exactement à la même hauteur.
          styles={{ panel: { paddingTop: 20 } }}
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
              <Menu position="bottom-end" withinPortal shadow="md">
                <Menu.Target>
                  <Button
                    variant="subtle"
                    color="gray"
                    rightSection={<IconChevronDown size={14} />}
                    ml="auto"
                    mb={4}
                    // Le gris de Mantine tire sur le bleu au survol : on pose
                    // le nôtre, neutre, comme partout ailleurs.
                    style={
                      { alignSelf: "center", "--button-hover": NEUTRAL_HOVER } as CSSProperties
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
                    rightSection={suivi ? <IconCheck size={14} /> : null}
                    onClick={() => onToggleFollow()}
                    closeMenuOnClick={false}
                  >
                    Suivre
                  </Menu.Item>

                  <Menu.Divider />

                  <Menu.Item
                    leftSection={<IconFolderSymlink size={16} />}
                    onClick={() => setDeplacement("move")}
                  >
                    Déplacer
                  </Menu.Item>
                  <Menu.Item
                    leftSection={<IconCopy size={16} />}
                    onClick={() => setDeplacement("copy")}
                  >
                    Copier
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            )}
          </Tabs.List>

          <Tabs.Panel value="settings">
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
                  <ChipPicker
                    chipHeight={CHIP_HEIGHT}
                    // Les bulles se suivent avec le même filet d'air que sur
                    // une carte ou dans le tableau des projets.
                    chipGap={ACTOR_GAP}
                    label="Acteurs"
                    options={users}
                    value={form.actor_ids}
                    onChange={(value) => setForm((f) => ({ ...f, actor_ids: value }))}
                    emptyText="Aucun compte à proposer"
                    // Dans la liste, la bulle et le nom : il faut pouvoir
                    // choisir quelqu'un. Une fois retenu, la bulle suffit.
                    render={(u) => (
                      <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
                        <PersonAvatar person={u} size={CHIP_HEIGHT} />
                        <Text size="xs" truncate>
                          {u.name}
                        </Text>
                      </Group>
                    )}
                    renderChip={(u) => (
                      <span style={{ display: "inline-flex" }} aria-label={u.name}>
                        <PersonAvatar person={u} size={CHIP_HEIGHT} />
                      </span>
                    )}
                  />
                </div>
                <div style={{ flex: "7 1 0", minWidth: 0 }}>
                  <LabelPicker
                    chipHeight={CHIP_HEIGHT}
                    labels={labels ?? []}
                    value={form.label_ids}
                    onChange={(value) => setForm((f) => ({ ...f, label_ids: value }))}
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
              <Select
                label="Société"
                placeholder="Aucune société"
                data={companyOptions}
                value={form.company_id || null}
                onChange={(value) => setForm((f) => ({ ...f, company_id: value ?? "" }))}
                clearable
              />
              <Group gap="xs" align="flex-end" wrap="nowrap">
                <Select
                  label="Catégorie"
                  data={categoryOptions}
                  value={form.category_id}
                  onChange={(value) => setForm((f) => ({ ...f, category_id: value ?? "" }))}
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

              <div>
                <Group justify="space-between" mb={4} align="center">
                  <Text size="sm" fw={500}>
                    Progression
                  </Text>
                  <Group gap="xs" align="center">
                    <NumberInput
                      value={form.status}
                      onChange={(value) => {
                        // Le champ peut être vidé pendant la frappe.
                        const n = typeof value === "number" ? value : Number(value);
                        setForm((f) => ({
                          ...f,
                          status: Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0,
                        }));
                      }}
                      min={0}
                      max={100}
                      clampBehavior="strict"
                      suffix="%"
                      w={90}
                      size="xs"
                      aria-label="Progression"
                    />
                    <Text size="sm" c="dimmed">
                      {form.status >= 100 ? "Terminé" : "En cours"}
                    </Text>
                  </Group>
                </Group>
                <Slider
                  value={form.status}
                  onChange={(value) => setForm((f) => ({ ...f, status: value }))}
                  min={0}
                  max={100}
                  step={1}
                  marks={PROGRESS_MARKS}
                  styles={{ markLabel: { fontSize: 10 } }}
                  color={statusColor(form.status)}
                />
              </div>
            </Stack>
          </Tabs.Panel>

          {/* Le panneau prend toute la hauteur libre : le fil vide s'y étale. */}
          <Tabs.Panel
            value="comments"
            style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}
          >
            <Stack gap="md" style={{ flex: 1, minHeight: 0 }}>
              <CommentThread
                comments={comments}
                onAdd={handleAddComment}
                onUpdate={handleUpdateComment}
                onDelete={handleDeleteComment}
              />

              {!isEditing && comments.length > 0 && (
                <Notification color="blue" withCloseButton={false} withBorder radius="md" mt={40}>
                  {comments.length} commentaire{comments.length > 1 ? "s" : ""} seront enregistrés avec le projet.
                </Notification>
              )}
            </Stack>
          </Tabs.Panel>
        </Tabs>

        {/* Ne reste en bas que la suppression : le reste s'enregistre en
            refermant. */}
        {isEditing && (
          <Stack gap="sm" mt="auto" pt={40}>
            <Group wrap="nowrap">
              <Button
                color={RED}
                variant="subtle"
                leftSection={<IconTrash size={16} />}
                onClick={() => setConfirmDeleteOpened(true)}
              >
                Supprimer
              </Button>
            </Group>
          </Stack>
        )}
      </Drawer>

      {/* Les catégories appartiennent au tableau : changer de tableau, c'est
          aussi choisir celle qui accueille le projet là-bas — pour une copie
          comme pour un déplacement. La même boîte qu'au menu d'une ligne de la
          liste. */}
      <MoveOrCopyProjectModal
        opened={deplacement !== null}
        onClose={() => setDeplacement(null)}
        mode={deplacement ?? "move"}
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
        onMoved={handleMoved(deplacement ?? "move")}
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
          {newCategoryError && <ErrorAlert>{newCategoryError}</ErrorAlert>}
          <TextInput
            label="Nom"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") createCategory();
            }}
            required
            autoFocus
          />
          {/* Espace au-dessus des actions égal au retrait de la fenêtre, comme
              dans la confirmation de suppression. */}
          <Group justify="flex-end" mt={MODAL_PADDING - 16}>
            <Button variant="default" onClick={closeNewCategory}>
              Annuler
            </Button>
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
            {form.name ? ` « ${form.name} »` : " ce projet"} ? Cette action est irréversible.
          </>
        }
      />
    </>
  );
}
