import {
  Button,
  Divider,
  Drawer,
  Group,
  LoadingOverlay,
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

const emptyForm = { name: "", description: "", category_id: "", status: 0 };

export default function ProjectDrawer({ opened, onClose, projectId, categories, onSaved, onDeleted }) {
  const [form, setForm] = useState(emptyForm);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDeleteOpened, setConfirmDeleteOpened] = useState(false);

  const isEditing = Boolean(projectId);

  useEffect(() => {
    if (!opened) return;

    if (!projectId) {
      setForm({ ...emptyForm, category_id: categories[0] ? String(categories[0].id) : "" });
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
          status: project.status,
        });
        setComments(project.comments);
      })
      .finally(() => setLoading(false));
  }, [opened, projectId, categories]);

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
        status: Number(form.status),
      };
      if (isEditing) {
        await api.updateProject(projectId, payload);
      } else {
        await api.createProject(payload);
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

  const handleAddComment = async (text) => {
    await api.addComment(projectId, text);
    await refreshComments();
  };

  const handleUpdateComment = async (commentId, text) => {
    await api.updateComment(commentId, text);
    await refreshComments();
  };

  const handleDeleteComment = async (commentId) => {
    await api.deleteComment(commentId);
    await refreshComments();
  };

  const categoryOptions = categories.map((c) => ({ value: String(c.id), label: c.name }));

  return (
    <>
      <Drawer
        opened={opened}
        onClose={onClose}
        position="right"
        title={isEditing ? "Modifier le projet" : "Nouveau projet"}
        size="md"
        padding="lg"
      >
        <LoadingOverlay visible={loading} />
        <Stack gap="md" justify="space-between" style={{ minHeight: "calc(100vh - 120px)" }}>
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
              label="Catégorie"
              data={categoryOptions}
              value={form.category_id}
              onChange={(value) => setForm((f) => ({ ...f, category_id: value }))}
              required
            />
            <div>
              <Group justify="space-between" mb={4}>
                <Text size="sm" fw={500}>
                  Progression
                </Text>
                <Text size="sm" c="dimmed">
                  {form.status}% — {form.status >= 100 ? "Terminé" : "En cours"}
                </Text>
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

            {isEditing ? (
              <>
                <Divider />
                <CommentThread
                  comments={comments}
                  onAdd={handleAddComment}
                  onUpdate={handleUpdateComment}
                  onDelete={handleDeleteComment}
                />
              </>
            ) : (
              <Text size="xs" c="dimmed">
                Enregistrez le projet pour pouvoir ajouter des commentaires.
              </Text>
            )}
          </Stack>

          <Stack gap="sm">
            <Divider />
            <Group justify="space-between">
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
        </Stack>
      </Drawer>

      <DeleteConfirmModal
        opened={confirmDeleteOpened}
        onClose={() => setConfirmDeleteOpened(false)}
        onConfirm={handleDelete}
        projectName={form.name}
      />
    </>
  );
}
