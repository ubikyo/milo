import {
  Button,
  Drawer,
  Group,
  Input,
  Menu,
  Stack,
  Switch,
  Tabs,
  TextInput,
} from "@mantine/core";
import { IconChevronDown, IconSettings, IconTags, IconTrash } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { api } from "../../api";
import { NEUTRAL_HOVER, RED } from "../../themes/colors";
import { tabStyle } from "../../themes/tabs";
import CopyToBoardModal from "../ui/CopyToBoardModal";
import DeleteConfirmModal from "../ui/DeleteConfirmModal";
import ErrorAlert from "../ui/ErrorAlert";
import LabelsManager from "./LabelsManager";
import { messageErreur } from "../../lib/errors";
import type { Board, Label } from "@milo/shared";


// Un tableau porte son nom, les étiquettes que ses cartes peuvent recevoir et
// ses réglages, dont « Privé » : fermé, il ne se montre plus qu'à son auteur.
// Le tiroir reprend la présentation de celui des projets, en plus court.
interface BoardDrawerProps {
  opened: boolean;
  onClose: () => void;
  /** « null » à la création, le tableau visé sinon. */
  board: Board | null;
  companyId: string;
  labels: Label[];
  onLabelsChanged: (patch?: { id: number; data: Partial<Label> }) => void | Promise<void>;
  onSaved: (board: Board) => void | Promise<void>;
  onDeleted: () => void | Promise<void>;
}

export default function BoardDrawer({
  opened,
  onClose,
  board,
  companyId,
  labels,
  onLabelsChanged,
  onSaved,
  onDeleted,
}: BoardDrawerProps) {
  const [name, setName] = useState("");
  // Le numéro des cartes se montre par défaut ; ce tableau peut le taire.
  const [showNumbers, setShowNumbers] = useState(true);
  // Fermé, le tableau ne se montre qu'à son auteur.
  const [prive, setPrive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteOpened, setConfirmDeleteOpened] = useState(false);
  /** Vrai quand la copie des étiquettes vers un autre tableau est en cours. */
  const [copieOuverte, setCopieOuverte] = useState(false);

  useEffect(() => {
    if (!opened) return;
    setName(board ? board.name : "");
    setShowNumbers(board ? board.show_card_numbers !== 0 : true);
    setPrive(board ? board.is_private !== 0 : false);
    setError(null);
    setCopieOuverte(false);
  }, [opened, board]);

  // Le tiroir n'a ni « Fermer » ni « Enregistrer » : on le referme en cliquant
  // au dehors, et c'est à ce moment que le tableau part au serveur. Un tableau
  // qu'on n'a pas nommé n'est pas créé : refermer sans rien saisir ne laisse
  // rien derrière soi. Si le serveur refuse, le tiroir reste ouvert avec le
  // message plutôt que d'emporter la saisie.
  const fermer = async () => {
    const nom = name.trim();
    if (!nom) return onClose();
    setError(null);
    try {
      const enregistre = board
        ? await api.updateBoard(board.id, {
            name: nom,
            show_card_numbers: showNumbers,
            is_private: prive,
          })
        : await api.createBoard(Number(companyId), nom);
      await onSaved(enregistre);
    } catch (e) {
      setError(messageErreur(e));
    }
  };

  const remove = async () => {
    setConfirmDeleteOpened(false);
    if (!board) return;
    try {
      await api.deleteBoard(board.id);
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
                  {/* Les étiquettes appartiennent au tableau : les reporter
                      ailleurs évite de les ressaisir une à une. */}
                  <Menu.Item
                    leftSection={<IconTags size={16} />}
                    onClick={() => setCopieOuverte(true)}
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
            <Stack gap="xl">
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
              {board && (
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
              {board && (
                <Input.Wrapper label="Options">
                  <Stack gap="sm" mt={8}>
                    <Switch
                      label="Numéros des cartes"
                      checked={showNumbers}
                      onChange={(e) => setShowNumbers(e.currentTarget.checked)}
                      color="teal"
                    />
                    {/* Privé : le tableau sort de la vue des autres, avec ses
                        listes, ses cartes et ses étiquettes. L'intitulé le dit,
                        plutôt que de laisser deviner ce que « privé » recouvre. */}
                    <Switch
                      label="Privé"
                      checked={prive}
                      onChange={(e) => setPrive(e.currentTarget.checked)}
                      color="teal"
                    />
                  </Stack>
                </Input.Wrapper>
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

      {board && (
        <CopyToBoardModal
          opened={copieOuverte}
          onClose={() => setCopieOuverte(false)}
          chose="labels"
          sourceId={board.id}
          univers="tasks"
          companyId={companyId}
          onCopy={(cible) => api.copyLabels(board.id, cible)}
        />
      )}

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
