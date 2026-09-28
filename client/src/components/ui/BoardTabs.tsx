import { Button, Menu, Tabs } from "@mantine/core";
import { IconChevronDown, IconPencil, IconPlus, IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import { NEUTRAL_HOVER, RED } from "../../themes/colors";
import DeleteConfirmModal from "./DeleteConfirmModal.jsx";
import { tabStyle } from "../../themes/tabs";

// Les tableaux d'un mode, en onglets, avec le menu qui les gère. Sert au mode
// Tâche comme au mode Projet : seul « deleteWarning » change, il décrit ce que
// la suppression en cascade emporte.
export default function BoardTabs({
  boards,
  value,
  onChange,
  onAdd,
  onEdit,
  onDelete,
  deleteWarning,
}) {
  const [confirmOpened, setConfirmOpened] = useState(false);
  const courant = boards.find((board) => String(board.id) === value);

  const supprimer = async () => {
    setConfirmOpened(false);
    await onDelete();
  };

  return (
    <>
      <Tabs value={value} onChange={onChange} mb={50}>
        <Tabs.List>
          {boards.map((board) => (
            <Tabs.Tab
              key={board.id}
              value={String(board.id)}
              style={tabStyle(value === String(board.id))}
            >
              {board.name}
            </Tabs.Tab>
          ))}

          {/* Le menu est dans la liste d'onglets : le filet du cadre court
              ainsi sous lui jusqu'au bord droit. */}
          <Menu position="bottom-end" withinPortal>
            <Menu.Target>
              <Button
                variant="subtle"
                color="gray"
                rightSection={<IconChevronDown size={14} />}
                ml="auto"
                mb={4}
                // Le gris de Mantine tire sur le bleu au survol : on pose le
                // nôtre, neutre, sur la variable que Button lit pour son fond.
                style={{ alignSelf: "center", "--button-hover": NEUTRAL_HOVER }}
              >
                Actions
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item leftSection={<IconPlus size={16} />} onClick={onAdd}>
                Ajouter
              </Menu.Item>
              {/* Modifier et supprimer portent sur l'onglet ouvert. */}
              <Menu.Item
                leftSection={<IconPencil size={16} />}
                onClick={onEdit}
                disabled={!courant}
              >
                Modifier
              </Menu.Item>
              <Menu.Divider />
              <Menu.Item
                color={RED}
                leftSection={<IconTrash size={16} />}
                onClick={() => setConfirmOpened(true)}
                disabled={!courant}
              >
                Supprimer
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Tabs.List>
      </Tabs>

      <DeleteConfirmModal
        opened={confirmOpened}
        onClose={() => setConfirmOpened(false)}
        onConfirm={supprimer}
        title="Supprimer le tableau"
        message={
          <>
            Voulez-vous vraiment supprimer « {courant?.name} » ? {deleteWarning} Cette action est
            irréversible.
          </>
        }
      />
    </>
  );
}
