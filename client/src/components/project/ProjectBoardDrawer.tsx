import {
  Button,
  Drawer,
  Group,
  Input,
  Menu,
  Stack,
  Switch,
  Tabs,
  Text,
  TextInput,
} from "@mantine/core";
import {
  IconChevronDown,
  IconSettings,
  IconTag,
  IconTags,
  IconTrash,
} from "@tabler/icons-react";
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { api } from "../../api";
import { NEUTRAL_HOVER, RED } from "../../themes/colors";
import { tabStyle } from "../../themes/tabs";
import CopyToBoardModal from "../ui/CopyToBoardModal";
import type { ChoseACopier } from "../ui/CopyToBoardModal";
import DeleteConfirmModal from "../ui/DeleteConfirmModal";
import ErrorAlert from "../ui/ErrorAlert";
import LabelsManager from "../board/LabelsManager";
import LookupManager from "../ui/LookupManager";
import { messageErreur } from "../../lib/errors";
import type { Category, ProjectBoard, ProjectLabel } from "@milo/shared";


// Un tableau de projets porte son nom, ses catégories et les étiquettes que
// ses projets peuvent recevoir : les unes comme les autres lui sont propres,
// elles se gèrent donc ici et non dans le paramétrage. Il porte aussi
// « Privé » : fermé, il ne se montre plus qu'à son auteur.
interface ProjectBoardDrawerProps {
  opened: boolean;
  onClose: () => void;
  /** « null » à la création, le tableau visé sinon. */
  board: ProjectBoard | null;
  categories: Category[];
  onCategoriesChanged: () => void | Promise<void>;
  labels: ProjectLabel[];
  onLabelsChanged: (patch?: { id: number; data: Partial<ProjectLabel> }) => void | Promise<void>;
  onSaved: (board: ProjectBoard) => void | Promise<void>;
  onDeleted: () => void | Promise<void>;
}

export default function ProjectBoardDrawer({
  opened,
  onClose,
  board,
  categories,
  onCategoriesChanged,
  labels,
  onLabelsChanged,
  onSaved,
  onDeleted,
}: ProjectBoardDrawerProps) {
  const [name, setName] = useState("");
  // Fermé, le tableau ne se montre qu'à son auteur.
  const [prive, setPrive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteOpened, setConfirmDeleteOpened] = useState(false);
  /**
   * Ce que le menu du tableau est en train de copier vers un autre tableau,
   * ou « null » quand rien ne l'est. Les deux copies posent la même question
   * — lequel ? — et une seule boîte y répond.
   */
  const [copie, setCopie] = useState<ChoseACopier | null>(null);

  useEffect(() => {
    if (!opened) return;
    setName(board ? board.name : "");
    setPrive(board ? board.is_private !== 0 : false);
    setError(null);
    setCopie(null);
  }, [opened, board]);

  // Le tiroir n'a ni « Fermer » ni « Enregistrer » : on le referme en cliquant
  // au dehors, et c'est à ce moment que le tableau part au serveur. Un tableau
  // qu'on n'a pas nommé n'est pas créé.
  const fermer = async () => {
    const nom = name.trim();
    if (!nom) return onClose();
    setError(null);
    try {
      const enregistre = board
        ? await api.updateProjectBoard(board.id, { name: nom, is_private: prive })
        : await api.createProjectBoard(nom);
      await onSaved(enregistre);
    } catch (e) {
      setError(messageErreur(e));
    }
  };

  const remove = async () => {
    setConfirmDeleteOpened(false);
    if (!board) return;
    try {
      await api.deleteProjectBoard(board.id);
      await onDeleted();
    } catch (e) {
      setError(messageErreur(e));
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
        {/* Un seul volet, mais la même rangée d'onglets que la fiche d'un
            projet ou d'une carte : le tiroir se présente pareil, et le menu
            « Actions » trouve sa place au bout, où on le cherche. */}
        <Tabs
          defaultValue="settings"
          style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}
          // Le retrait sous la barre d'onglets est posé ici, comme ailleurs.
          styles={{ panel: { paddingTop: 20 } }}
        >
          <Tabs.List mb="md">
            <Tabs.Tab
              value="settings"
              leftSection={<IconSettings size={16} />}
              style={tabStyle(true)}
            >
              Paramètres
            </Tabs.Tab>

            {board && (
              <Menu position="bottom-end" withinPortal shadow="md">
                <Menu.Target>
                  <Button
                    variant="subtle"
                    color="gray"
                    rightSection={<IconChevronDown size={14} />}
                    // Poussé au bout de la rangée, il ne se confond pas avec
                    // les onglets.
                    ml="auto"
                    mb={4}
                    // Le même bouton que les menus « Actions » d'ailleurs — la
                    // rangée d'onglets des tableaux, la fiche d'une carte —,
                    // jusqu'au gris neutre du survol : celui de Mantine tire
                    // sur le bleu.
                    style={
                      { alignSelf: "center", "--button-hover": NEUTRAL_HOVER } as CSSProperties
                    }
                  >
                    Actions
                  </Button>
                </Menu.Target>
                <Menu.Dropdown>
                  {/* Catégories et étiquettes appartiennent au tableau : les
                      reporter ailleurs évite de les ressaisir une à une. Elles
                      se suivent ici dans l'ordre où le tiroir les présente. */}
                  <Menu.Item
                    leftSection={<IconTag size={16} />}
                    onClick={() => setCopie("categories")}
                  >
                    Copier les catégories
                  </Menu.Item>
                  <Menu.Item
                    leftSection={<IconTags size={16} />}
                    onClick={() => setCopie("labels")}
                  >
                    Copier les étiquettes
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            )}
          </Tabs.List>

          <Tabs.Panel value="settings">
            {/* Le même air entre les champs que dans le tiroir d'un projet ou
                d'une carte : c'est le même tiroir, il doit se lire pareil. */}
            <Stack gap="xl" style={{ flex: 1, minHeight: 0 }}>
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

              {/* Catégories et étiquettes attendent que le tableau existe : à la
                  création, elles se gèrent au prochain passage dans ce tiroir.
                  Chaque geste part au serveur aussitôt, sans attendre
                  l'enregistrement du nom. */}
              {board ? (
                <>
                  {/* Chaque bloc porte son intitulé comme les champs qui
                      l'entourent — et comme le tiroir d'un tableau de tâches, qui
                      range ses étiquettes de la même façon. L'intitulé reste ainsi
                      collé à ce qu'il annonce, quel que soit l'air laissé entre
                      les champs. */}
                  <Input.Wrapper label="Catégories">
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
                  </Input.Wrapper>

                  <Input.Wrapper label="Étiquettes">
                    <LabelsManager
                      labels={labels}
                      onCreate={async (nom, couleur) => {
                        await api.createProjectLabel(board.id, nom, couleur);
                        await onLabelsChanged();
                      }}
                      onUpdate={async (id, data) => {
                        await api.updateProjectLabel(id, data);
                        await onLabelsChanged();
                      }}
                      onDelete={async (id) => {
                        await api.deleteProjectLabel(id);
                        await onLabelsChanged();
                      }}
                    />
                  </Input.Wrapper>

                  {/* Comme pour un tableau de tâches : fermé, le tableau sort de
                      la vue des autres, avec ses catégories, ses étiquettes et
                      ses projets. */}
                  <Input.Wrapper label="Options">
                    <Stack gap="sm" mt={8}>
                      <Switch
                        label="Privé"
                        checked={prive}
                        onChange={(e) => setPrive(e.currentTarget.checked)}
                        color="teal"
                      />
                    </Stack>
                  </Input.Wrapper>
                </>
              ) : (
                <Text size="sm" c="dimmed">
                  Les catégories et les étiquettes de ce tableau se renseigneront une fois celui-ci
                  créé.
                </Text>
              )}
            </Stack>
          </Tabs.Panel>
        </Tabs>

        {/* Ne reste en bas que la suppression : le reste s'enregistre en
            refermant. */}
        {board && (
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

      {board && copie && (
        <CopyToBoardModal
          opened
          onClose={() => setCopie(null)}
          chose={copie}
          sourceId={board.id}
          univers="projects"
          onCopy={(cible) =>
            copie === "labels"
              ? api.copyProjectLabels(board.id, cible)
              : api.copyCategories(board.id, cible)
          }
        />
      )}

      <DeleteConfirmModal
        opened={confirmDeleteOpened}
        onClose={() => setConfirmDeleteOpened(false)}
        onConfirm={remove}
        title="Supprimer le tableau"
        message={
          <>
            Voulez-vous vraiment supprimer « {board?.name} » ? Ses catégories, ses étiquettes, ses
            projets et leurs commentaires seront supprimés. Cette action est irréversible.
          </>
        }
      />
    </>
  );
}
