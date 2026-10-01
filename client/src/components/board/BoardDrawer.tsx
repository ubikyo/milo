import {
  Button,
  Drawer,
  Input,
  Menu,
  Stack,
  Switch,
  Tabs,
  TextInput,
} from "@mantine/core";
import { IconChevronDown, IconSettings, IconTags } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { api } from "../../api";
import { NEUTRAL_HOVER } from "../../themes/colors";
import { DRAWER_MENU_OFFSET, TAB_MENU_STYLES } from "../../themes/menus";
import { tabStyle } from "../../themes/tabs";
import CopyToBoardModal from "../ui/CopyToBoardModal";
import DeleteConfirmModal from "../ui/DeleteConfirmModal";
import DrawerFooter from "../ui/DrawerFooter";
import DrawerScrollArea, {
  DRAWER_PADDING,
  DRAWER_PANEL_STYLE,
  DRAWER_STYLES,
  DRAWER_TABS_STYLES,
} from "../ui/DrawerScroll";
import ErrorAlert from "../ui/ErrorAlert";
import { messageErreur } from "../../lib/errors";
import type { Board } from "@milo/shared";

// Un tableau porte son nom et ses réglages, dont « Privé » : fermé, il ne se
// montre plus qu'à son auteur. Ses étiquettes se gèrent depuis la fiche d'une
// carte, là où on les pose.
// Le tiroir reprend la présentation de celui des projets, en plus court.
interface BoardDrawerProps {
  opened: boolean;
  onClose: () => void;
  /** « null » à la création, le tableau visé sinon. */
  board: Board | null;
  companyId: string;
  onSaved: (board: Board) => void | Promise<void>;
  onDeleted: () => void | Promise<void>;
}

export default function BoardDrawer({
  opened,
  onClose,
  board,
  companyId,
  onSaved,
  onDeleted,
}: BoardDrawerProps) {
  const [name, setName] = useState("");
  // Le numéro des cartes se montre par défaut ; ce tableau peut le taire.
  const [showNumbers, setShowNumbers] = useState(true);
  // Fermé, le tableau ne se montre qu'à son auteur.
  const [prive, setPrive] = useState(false);
  // Verrouillé, le tableau garde ses listes telles quelles.
  const [verrouille, setVerrouille] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteOpened, setConfirmDeleteOpened] = useState(false);
  const [saving, setSaving] = useState(false);
  /** Vrai quand la copie des étiquettes vers un autre tableau est en cours. */
  const [copieOuverte, setCopieOuverte] = useState(false);

  useEffect(() => {
    if (!opened) return;
    setName(board ? board.name : "");
    setShowNumbers(board ? board.show_card_numbers !== 0 : true);
    setPrive(board ? board.is_private !== 0 : false);
    setVerrouille(board ? board.is_locked !== 0 : false);
    setError(null);
    setSaving(false);
    setCopieOuverte(false);
  }, [opened, board]);

  // « Sauvegarder » : le seul geste qui écrit. Un tableau sans nom n'est pas
  // créé — le message le dit plutôt que de laisser une ligne vide. Si le
  // serveur refuse, le tiroir reste ouvert avec le message : la saisie n'est
  // jamais perdue.
  const sauvegarder = async () => {
    const nom = name.trim();
    if (!nom) return setError("Le nom du tableau est requis");
    setError(null);
    setSaving(true);
    try {
      const enregistre = board
        ? await api.updateBoard(board.id, {
            name: nom,
            show_card_numbers: showNumbers,
            is_private: prive,
            is_locked: verrouille,
          })
        : await api.createBoard(Number(companyId), nom);
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

          <Tabs.Panel value="settings" style={DRAWER_PANEL_STYLE}>
            <DrawerScrollArea>
              {/* Le même air entre les champs que dans le tiroir d'un projet ou
                d'une carte : c'est le même tiroir, il doit se lire pareil. */}
              <Stack gap="xl">
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

                {/* Ce qui règle l'affichage du tableau. Le
                  numéro d'une carte sert à la désigner à l'oral : les tableaux qui
                  n'en ont pas l'usage peuvent le taire. */}
                {board && (
                  <Input.Wrapper label="Options">
                    <Stack gap="sm">
                      <Switch
                        label="Numéros des cartes"
                        checked={showNumbers}
                        onChange={(e) =>
                          setShowNumbers(e.currentTarget.checked)
                        }
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
                      {/* Verrouillé : plus de liste ajoutée, déplacée ni
                        supprimée. Les cartes, elles, bougent toujours. */}
                      <Switch
                        label="Verrouillé"
                        checked={verrouille}
                        onChange={(e) =>
                          setVerrouille(e.currentTarget.checked)
                        }
                        color="teal"
                      />
                    </Stack>
                  </Input.Wrapper>
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
            Voulez-vous vraiment supprimer « {board?.name} » ? Ses listes et
            leurs cartes seront supprimées. Cette action est irréversible.
          </>
        }
      />
    </>
  );
}
