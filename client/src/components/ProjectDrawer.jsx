import {
  Button,
  Drawer,
  Group,
  LoadingOverlay,
  Notification,
  NumberInput,
  Select,
  Slider,
  Stack,
  Text,
  TextInput,
  Textarea,
} from "@mantine/core";
import { IconTrash } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { api } from "../api";
import CommentThread from "./CommentThread.jsx";
import DeleteConfirmModal from "./DeleteConfirmModal.jsx";

const emptyForm = {
  name: "",
  description: "",
  category_id: "",
  company_id: "",
  building_id: "",
  status: 0,
};

export default function ProjectDrawer({
  opened,
  onClose,
  projectId,
  categories,
  companies,
  buildings,
  onSaved,
  onDeleted,
}) {
  const [form, setForm] = useState(emptyForm);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDeleteOpened, setConfirmDeleteOpened] = useState(false);

  const isEditing = Boolean(projectId);

  useEffect(() => {
    if (!opened) return;

    if (!projectId) {
      setForm({
        ...emptyForm,
        category_id: categories[0] ? String(categories[0].id) : "",
        company_id: companies[0] ? String(companies[0].id) : "",
      });
      setComments([]);
      return;
    }

    setLoading(true);
    api
      .getProject(projectId)
      .then((project) => {
        setForm({
          name: project.name,
          description: project.description,
          category_id: String(project.category_id),
          company_id: project.company_id ? String(project.company_id) : "",
          building_id: project.building_id ? String(project.building_id) : "",
          status: project.status,
        });
        setComments(project.comments);
      })
      .finally(() => setLoading(false));
  }, [opened, projectId, categories, companies]);

  const refreshComments = async () => {
    if (!projectId) return;
    const project = await api.getProject(projectId);
    setComments(project.comments);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.category_id) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        category_id: Number(form.category_id),
        company_id: form.company_id ? Number(form.company_id) : null,
        building_id: form.building_id ? Number(form.building_id) : null,
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
        { id: `draft-${now}-${list.length}`, text, created_at: now, updated_at: now },
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
        onClose={onClose}
        position="right"
        title={
          <Text fw={700} fz={28}>
            {isEditing ? "Modifier le projet" : "Nouveau projet"}
          </Text>
        }
        size={560}
        padding={40}
        withCloseButton={false}
        styles={{
          content: { display: "flex", flexDirection: "column" },
          header: { paddingBottom: 20 },
          body: { flex: 1, display: "flex", flexDirection: "column", overflowY: "auto" },
        }}
      >
        <LoadingOverlay visible={loading} />

        <Stack gap="md">
          <TextInput
            label="Nom du projet"
            placeholder="Nom du projet"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.currentTarget.value }))}
            required
          />
          <Textarea
            label="Description"
            placeholder="Description du projet"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.currentTarget.value }))}
            autosize
            minRows={3}
          />
          <Select
            label="Société"
            placeholder="Aucune société"
            data={companyOptions}
            value={form.company_id}
            onChange={(value) => setForm((f) => ({ ...f, company_id: value ?? "", building_id: "" }))}
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
            value={form.building_id}
            onChange={(value) => setForm((f) => ({ ...f, building_id: value ?? "" }))}
            disabled={!form.company_id || buildingOptions.length === 0}
            clearable
          />
          <Select
            label="Catégorie"
            data={categoryOptions}
            value={form.category_id}
            onChange={(value) => setForm((f) => ({ ...f, category_id: value }))}
            required
          />
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
              marks={[
                { value: 0, label: "0%" },
                { value: 50, label: "50%" },
                { value: 100, label: "100%" },
              ]}
              color={form.status >= 100 ? "teal" : "blue"}
            />
          </div>

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

        {/* Actions collées en bas du tiroir */}
        <Stack gap="sm" mt="auto" pt={40}>
          <Group justify="space-between" wrap="nowrap">
            {isEditing ? (
              <Button
                color="red"
                variant="subtle"
                leftSection={<IconTrash size={16} />}
                onClick={() => setConfirmDeleteOpened(true)}
              >
                Supprimer
              </Button>
            ) : (
              <div />
            )}
            <Group>
              <Button variant="default" onClick={onClose}>
                Fermer
              </Button>
              <Button onClick={handleSave} loading={saving} disabled={!form.name.trim() || !form.category_id}>
                {isEditing ? "Enregistrer" : "Ajouter"}
              </Button>
            </Group>
          </Group>
        </Stack>
      </Drawer>

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
