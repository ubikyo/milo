import {
  Button,
  Drawer,
  Group,
  Input,
  LoadingOverlay,
  Stack,
  Switch,
  Text,
  TextInput,
} from "@mantine/core";
import { IconTrash } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { RED } from "../../themes/colors";
import DeleteConfirmModal from "../ui/DeleteConfirmModal.jsx";
import ErrorAlert from "../ui/ErrorAlert.jsx";
import LabelsManager from "./LabelsManager.jsx";


// Un tableau porte son nom et les étiquettes que ses cartes peuvent recevoir.
// Le tiroir reprend la présentation de celui des projets, en plus court.
export default function BoardDrawer({
  opened,
  onClose,
  board,
  companyId,
  labels,
  onLabelsChanged,
  onSaved,
  onDeleted,
}) {
  const [name, setName] = useState("");
  // Le numéro des cartes se montre par défaut ; ce tableau peut le taire.
  const [showNumbers, setShowNumbers] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [confirmDeleteOpened, setConfirmDeleteOpened] = useState(false);

  const isEditing = Boolean(board);

  useEffect(() => {
    if (!opened) return;
    setName(board ? board.name : "");
    setShowNumbers(board ? board.show_card_numbers !== 0 : true);
    setError(null);
  }, [opened, board]);

  // Le tiroir n'a ni « Fermer » ni « Enregistrer » : on le referme en cliquant
  // au dehors, et c'est à ce moment que le tableau part au serveur. Un tableau
  // qu'on n'a pas nommé n'est pas créé : refermer sans rien saisir ne laisse
  // rien derrière soi. Si le serveur refuse, le tiroir reste ouvert avec le
  // message plutôt que d'emporter la saisie.
  const fermer = async () => {
    const nom = name.trim();
    if (!nom) return onClose();
    setSaving(true);
    setError(null);
    try {
      const enregistre = isEditing
        ? await api.updateBoard(board.id, { name: nom, show_card_numbers: showNumbers })
        : await api.createBoard(Number(companyId), nom);
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
      await api.deleteBoard(board.id);
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

        <Stack gap="md">
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


          {/* Les étiquettes appartiennent au tableau : elles n'ont de sens
              qu'une fois qu'il existe. Chaque geste part au serveur aussitôt,
              sans attendre l'enregistrement du nom. */}
          {isEditing && (
            <Input.Wrapper label="Étiquettes">
              <Stack gap="sm" mt={4}>
                <LabelsManager
                  labels={labels ?? []}
                  onCreate={async (nom, couleur) => {
                    await api.createLabel(board.id, nom, couleur);
                    await onLabelsChanged();
                  }}
                  onUpdate={async (id, data) => {
                    await api.updateLabel(id, data);
                    await onLabelsChanged();
                  }}
                  onDelete={async (id) => {
                    await api.deleteLabel(id);
                    await onLabelsChanged();
                  }}
                />
              </Stack>
            </Input.Wrapper>
          )}

          {/* Ce qui règle l'affichage du tableau, sous ce qui le garnit. Le
              numéro d'une carte sert à la désigner à l'oral : les tableaux qui
              n'en ont pas l'usage peuvent le taire. */}
          {isEditing && (
            <Input.Wrapper label="Options">
              <Stack gap="sm" mt={8}>
                <Switch
                  label="Numéros des cartes"
                  checked={showNumbers}
                  onChange={(e) => setShowNumbers(e.currentTarget.checked)}
                  color="teal"
                />
              </Stack>
            </Input.Wrapper>
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
            Voulez-vous vraiment supprimer « {board?.name} » ? Ses listes et leurs cartes seront
            supprimées. Cette action est irréversible.
          </>
        }
      />
    </>
  );
}
