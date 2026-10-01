import {
  Button,
  Drawer,
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
} from "@tabler/icons-react";
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { api } from "../../api";
import { NEUTRAL_HOVER } from "../../themes/colors";
import { DRAWER_MENU_OFFSET, TAB_MENU_STYLES } from "../../themes/menus";
import { tabStyle } from "../../themes/tabs";
import CopyToBoardModal from "../ui/CopyToBoardModal";
import type { ChoseACopier } from "../ui/CopyToBoardModal";
import DeleteConfirmModal from "../ui/DeleteConfirmModal";
import DrawerFooter from "../ui/DrawerFooter";
import DrawerScrollArea, {
  DRAWER_PADDING,
  DRAWER_PANEL_STYLE,
  DRAWER_STYLES,
  DRAWER_TABS_STYLES,
} from "../ui/DrawerScroll";
import ErrorAlert from "../ui/ErrorAlert";
import LookupManager from "../ui/LookupManager";
import { messageErreur } from "../../lib/errors";
import type { Category, ProjectBoard } from "@milo/shared";

// Un tableau de projets porte son nom et ses catégories : elles lui sont
// propres, elles se gèrent donc ici et non dans le paramétrage. Ses étiquettes
// se gèrent depuis la fiche d'un projet, là où on les pose. Il porte aussi
// « Privé » : fermé, il ne se montre plus qu'à son auteur.
interface ProjectBoardDrawerProps {
  opened: boolean;
  onClose: () => void;
  /** « null » à la création, le tableau visé sinon. */
  board: ProjectBoard | null;
  categories: Category[];
  onCategoriesChanged: () => void | Promise<void>;
  onSaved: (board: ProjectBoard) => void | Promise<void>;
  onDeleted: () => void | Promise<void>;
}

export default function ProjectBoardDrawer({
  opened,
  onClose,
  board,
  categories,
  onCategoriesChanged,
  onSaved,
  onDeleted,
}: ProjectBoardDrawerProps) {
  const [name, setName] = useState("");
  // Fermé, le tableau ne se montre qu'à son auteur.
  const [prive, setPrive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteOpened, setConfirmDeleteOpened] = useState(false);
  const [saving, setSaving] = useState(false);
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
    setSaving(false);
    setCopie(null);
  }, [opened, board]);

  // « Sauvegarder » : le seul geste qui écrit. Un tableau sans nom n'est pas
  // créé — le message le dit plutôt que de laisser une ligne vide.
  const sauvegarder = async () => {
    const nom = name.trim();
    if (!nom) return setError("Le nom du tableau est requis");
    setError(null);
    setSaving(true);
    try {
      const enregistre = board
        ? await api.updateProjectBoard(board.id, {
            name: nom,
            is_private: prive,
          })
        : await api.createProjectBoard(nom);
      await onSaved(enregistre);
    } catch (e) {
      setError(messageErreur(e));
    } finally {
      setSaving(false);
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
        onClose={onClose}
        position="right"
        size={560}
        padding={DRAWER_PADDING}
        withCloseButton={false}
        // Seul le panneau de l'onglet défile : les onglets et les boutons du
        // bas restent en place (components/ui/DrawerScroll.tsx).
        styles={DRAWER_STYLES}
      >
        {/* Un seul volet, mais la même rangée d'onglets que la fiche d'un
            projet ou d'une carte : le tiroir se présente pareil, et le menu
            « Actions » trouve sa place au bout, où on le cherche. */}
        <Tabs
          defaultValue="settings"
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
          }}
          // Le retrait sous la barre d'onglets est posé ici, comme ailleurs.
          styles={DRAWER_TABS_STYLES}
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
                    // Poussé au bout de la rangée, il ne se confond pas avec
                    // les onglets.
                    ml="auto"
                    mb={4}
                    // Le même bouton que les menus « Actions » d'ailleurs — la
                    // rangée d'onglets des tableaux, la fiche d'une carte —,
                    // jusqu'au gris neutre du survol : celui de Mantine tire
                    // sur le bleu.
                    style={
                      {
                        alignSelf: "center",
                        "--button-hover": NEUTRAL_HOVER,
                      } as CSSProperties
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

          <Tabs.Panel value="settings" style={DRAWER_PANEL_STYLE}>
            <DrawerScrollArea>
              {/* Le même air entre les champs que dans le tiroir d'un projet ou
                d'une carte : c'est le même tiroir, il doit se lire pareil. */}
              <Stack gap="xl" style={{ flex: 1, minHeight: 0 }}>
                {error && (
                  <ErrorAlert onClose={() => setError(null)}>
                    {error}
                  </ErrorAlert>
                )}
                <TextInput
                  label="Nom du tableau"
                  placeholder="Nom du tableau"
                  value={name}
                  onChange={(e) => {
                    const { value } = e.currentTarget;
                    setName(value);
                  }}
                  required
                  autoFocus
                />

                {/* Les catégories attendent que le tableau existe : à la
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
                        maxRows={10}
                        emptyIcon={IconTag}
                        emptyText="Aucune catégorie pour ce tableau"
                        entityLabel="la catégorie"
                      />
                    </Input.Wrapper>

                    {/* Comme pour un tableau de tâches : fermé, le tableau sort de
                      la vue des autres, avec ses catégories, ses étiquettes et
                      ses projets. */}
                    <Input.Wrapper label="Options">
                      <Stack gap="sm">
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
                    Les catégories de ce tableau se renseigneront une fois
                    celui-ci créé.
                  </Text>
                )}
              </Stack>
            </DrawerScrollArea>
          </Tabs.Panel>
        </Tabs>

        <DrawerFooter
          onSave={sauvegarder}
          onClose={onClose}
          onDelete={board ? () => setConfirmDeleteOpened(true) : undefined}
          saving={saving}
        />
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
            Voulez-vous vraiment supprimer « {board?.name} » ? Ses catégories,
            ses étiquettes, ses projets et leurs commentaires seront supprimés.
            Cette action est irréversible.
          </>
        }
      />
    </>
  );
}
