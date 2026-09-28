import {
  Button,
  Drawer,
  Group,
  LoadingOverlay,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { IconTag, IconTrash } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { RED } from "../../themes/colors";
import DeleteConfirmModal from "../ui/DeleteConfirmModal.jsx";
import ErrorAlert from "../ui/ErrorAlert.jsx";
import LookupManager from "../ui/LookupManager.jsx";


// Un tableau de projets porte son nom et ses catégories : celles-ci lui sont
// propres, elles se gèrent donc ici et non dans le paramétrage.
export default function ProjectBoardDrawer({
  opened,
  onClose,
  board,
  categories,
  onCategoriesChanged,
  onSaved,
  onDeleted,
}) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [confirmDeleteOpened, setConfirmDeleteOpened] = useState(false);

  const isEditing = Boolean(board);

  useEffect(() => {
    if (!opened) return;
    setName(board ? board.name : "");
    setError(null);
  }, [opened, board]);

  // Le tiroir n'a ni « Fermer » ni « Enregistrer » : on le referme en cliquant
  // au dehors, et c'est à ce moment que le tableau part au serveur. Un tableau
  // qu'on n'a pas nommé n'est pas créé.
  const fermer = async () => {
    const nom = name.trim();
    if (!nom) return onClose();
    setSaving(true);
    setError(null);
    try {
      const enregistre = isEditing
        ? await api.updateProjectBoard(board.id, nom)
        : await api.createProjectBoard(nom);
      await onSaved(enregistre);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setConfirmDeleteOpened(false);
    try {
      await api.deleteProjectBoard(board.id);
      await onDeleted();
    } catch (e) {
      setError(e.message);
    }
  };

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
        <LoadingOverlay visible={saving} />

        <Stack gap="md" style={{ flex: 1, minHeight: 0 }}>
          {error && <ErrorAlert onClose={() => setError(null)}>{error}</ErrorAlert>}
          <TextInput
            label="Nom du tableau"
            placeholder="Nom du tableau"
            value={name}
            onChange={(e) => {
              const { value } = e.currentTarget;
              setName(value);
            }}
            onKeyDown={(e) => {
              // Entrée vaut « j'ai fini » : elle referme, donc elle enregistre.
              if (e.key === "Enter") fermer();
            }}
            required
            autoFocus
          />

          {/* Les catégories attendent que le tableau existe : à la création,
              elles se gèrent au prochain passage dans ce tiroir. */}
          {isEditing ? (
            <>
              <Title order={4}>Catégories</Title>
              <LookupManager
                items={categories}
                onCreate={async (nom) => {
                  await api.createCategory(board.id, nom);
                  await onCategoriesChanged();
                }}
                onUpdate={async (id, nom) => {
                  await api.updateCategory(id, nom);
                  await onCategoriesChanged();
                }}
                onDelete={async (id) => {
                  await api.deleteCategory(id);
                  await onCategoriesChanged();
                }}
                addTitle="Nouvelle catégorie"
                maxRows={15}
                emptyIcon={IconTag}
                emptyText="Aucune catégorie pour ce tableau"
                entityLabel="la catégorie"
              />
            </>
          ) : (
            <Text size="sm" c="dimmed">
              Les catégories de ce tableau se renseigneront une fois celui-ci créé.
            </Text>
          )}
        </Stack>

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

      <DeleteConfirmModal
        opened={confirmDeleteOpened}
        onClose={() => setConfirmDeleteOpened(false)}
        onConfirm={remove}
        title="Supprimer le tableau"
        message={
          <>
            Voulez-vous vraiment supprimer « {board?.name} » ? Ses catégories, ses projets et leurs
            commentaires seront supprimés. Cette action est irréversible.
          </>
        }
      />
    </>
  );
}
