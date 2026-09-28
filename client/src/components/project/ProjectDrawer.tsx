import {
  ActionIcon,
  Button,
  Drawer,
  Group,
  LoadingOverlay,
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
import { IconMessage, IconPlus, IconSettings, IconTrash } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../api";
import { RED, statusColor } from "../../themes/colors";
import { MODAL_PADDING, modalHeaderStyles } from "../../themes/modals";
import { tabStyle } from "../../themes/tabs";
import CommentThread from "./CommentThread.jsx";
import { ACTOR_GAP, PersonAvatar } from "../ui/ActorAvatars.jsx";
import ChipPicker from "../ui/ChipPicker.jsx";
import RichTextField, { useRichEditor } from "../ui/RichText.jsx";
import DeleteConfirmModal from "../ui/DeleteConfirmModal.jsx";
import ErrorAlert from "../ui/ErrorAlert.jsx";
import LabelPicker, { PROJECT_LABELS_API } from "../ui/LabelPicker.jsx";

// Les deux volets du tiroir : la fiche du projet, puis ses échanges.
const TABS = [
  { value: "settings", label: "Paramètres", icon: IconSettings },
  { value: "comments", label: "Commentaires", icon: IconMessage },
];

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

const emptyForm = {
  name: "",
  category_id: "",
  company_id: "",
  building_id: "",
  status: 0,
  actor_ids: [],
  label_ids: [],
};

export default function ProjectDrawer({
  opened,
  onClose,
  projectId,
  boardId,
  categories,
  companies,
  buildings,
  users,
  labels,
  currentUser,
  onCategoriesChanged,
  onLabelsChanged,
  onSaved,
  onDeleted,
}) {
  const [form, setForm] = useState(emptyForm);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDeleteOpened, setConfirmDeleteOpened] = useState(false);
  const [newCategoryOpened, setNewCategoryOpened] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryError, setNewCategoryError] = useState(null);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [activeTab, setActiveTab] = useState("settings");

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

    setLoading(true);
    api
      .getProject(projectId)
      .then((project) => {
        setForm({
          name: project.name,
          category_id: String(project.category_id),
          company_id: project.company_id ? String(project.company_id) : "",
          building_id: project.building_id ? String(project.building_id) : "",
          status: project.status,
          actor_ids: (project.actors || []).map((a) => String(a.id)),
          label_ids: (project.labels || []).map((l) => String(l.id)),
        });
        setComments(project.comments);
        editor?.commands.setContent(project.description || "");
      })
      .finally(() => setLoading(false));
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
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: editor?.getHTML() ?? "",
        board_id: Number(boardId),
        category_id: Number(form.category_id),
        company_id: form.company_id ? Number(form.company_id) : null,
        building_id: form.building_id ? Number(form.building_id) : null,
        actor_ids: form.actor_ids.map(Number),
        label_ids: form.label_ids.map(Number),
        status: Number(form.status),
      };
      if (isEditing) {
        await api.updateProject(projectId, payload);
      } else {
        const created = await api.createProject(payload);
        for (const comment of comments) {
          await api.addComment(created.id, comment.text);
        }
      }
      onSaved();
    } finally {
      setSaving(false);
    }
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
      setNewCategoryError(e.message);
    } finally {
      setCreatingCategory(false);
    }
  };

  const closeNewCategory = () => {
    setNewCategoryOpened(false);
    setNewCategoryName("");
    setNewCategoryError(null);
  };

  const handleDelete = async () => {
    await api.deleteProject(projectId);
    setConfirmDeleteOpened(false);
    onDeleted();
  };

  // Avant création, les commentaires vivent en local et sont envoyés au
  // serveur une fois le projet enregistré.
  const handleAddComment = async (text) => {
    if (!isEditing) {
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

  const handleUpdateComment = async (commentId, text) => {
    if (!isEditing) {
      setComments((list) =>
        list.map((c) => (c.id === commentId ? { ...c, text, updated_at: new Date().toISOString() } : c)),
      );
      return;
    }
    await api.updateComment(commentId, text);
    await refreshComments();
  };

  const handleDeleteComment = async (commentId) => {
    if (!isEditing) {
      setComments((list) => list.filter((c) => c.id !== commentId));
      return;
    }
    await api.deleteComment(commentId);
    await refreshComments();
  };

  const categoryOptions = categories.map((c) => ({ value: String(c.id), label: c.name }));
  const companyOptions = companies.map((c) => ({ value: String(c.id), label: c.name }));
  // Les bâtiments proposés sont ceux de la société choisie.
  const buildingOptions = buildings
    .filter((b) => String(b.company_id) === form.company_id)
    .map((b) => ({ value: String(b.id), label: b.name }));

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
        <LoadingOverlay visible={loading || saving} />

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
                    boardId={boardId}
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
              {/* Le bâtiment dépend de la société : les deux se lisent côte à côte. */}
              <Group grow align="flex-start" wrap="nowrap">
                <Select
                  label="Société"
                  placeholder="Aucune société"
                  data={companyOptions}
                  value={form.company_id || null}
                  onChange={(value) =>
                    setForm((f) => ({ ...f, company_id: value ?? "", building_id: "" }))
                  }
                  clearable
                />
                <Select
                  label="Bâtiment"
                  placeholder={
                    form.company_id
                      ? buildingOptions.length
                        ? "Aucun bâtiment"
                        : "Cette société n'a pas de bâtiment"
                      : "Choisissez d'abord une société"
                  }
                  data={buildingOptions}
                  value={form.building_id || null}
                  onChange={(value) => setForm((f) => ({ ...f, building_id: value ?? "" }))}
                  disabled={!form.company_id || buildingOptions.length === 0}
                  clearable
                />
              </Group>
              <Group gap="xs" align="flex-end" wrap="nowrap">
                <Select
                  label="Catégorie"
                  data={categoryOptions}
                  value={form.category_id}
                  onChange={(value) => setForm((f) => ({ ...f, category_id: value }))}
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
