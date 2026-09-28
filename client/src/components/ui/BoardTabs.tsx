import { Button, Menu, Tabs } from "@mantine/core";
import { IconChevronDown, IconPencil, IconPlus, IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import { NEUTRAL_HOVER, RED } from "../../themes/colors";
import DeleteConfirmModal from "./DeleteConfirmModal";
import { tabStyle } from "../../themes/tabs";
import type { CSSProperties, ReactNode } from "react";

/** Un onglet : les tableaux des deux modes n'ont en commun qu'un identifiant et un nom. */
interface Onglet {
  id: number;
  name: string;
}

// Les tableaux d'un mode, en onglets, avec le menu qui les gère. Sert au mode
// Tâche comme au mode Projet : seul « deleteWarning » change, il décrit ce que
// la suppression en cascade emporte.
interface BoardTabsProps {
  boards: Onglet[];
  value: string | null;
  onChange: (value: string | null) => void;
  onAdd: () => void;
  onEdit: () => void;
  onDelete: () => void | Promise<void>;
  /** Ce que la suppression en cascade emporte, dit à l'utilisateur. */
  deleteWarning?: ReactNode;
  /** Le titre de la confirmation : tous les onglets ne sont pas des tableaux. */
  deleteTitle?: string;
  /**
   * Onglets posés au milieu de la rangée plutôt qu'à gauche. « Actions » reste
   * au bord droit : il sort donc du flux, sinon sa largeur décalerait le
   * centre d'autant.
   */
  centered?: boolean;
  /**
   * Gestes propres au mode, posés en tête du menu : ils portent sur ce que
   * l'onglet ouvert contient, avant ceux qui portent sur l'onglet lui-même.
   */
  extraActions?: ReactNode;
}

export default function BoardTabs({
  boards,
  value,
  onChange,
  onAdd,
  onEdit,
  onDelete,
  deleteWarning,
  deleteTitle = "Supprimer le tableau",
  centered = false,
  extraActions,
}: BoardTabsProps) {
  const [confirmOpened, setConfirmOpened] = useState(false);
  const courant = boards.find((board) => String(board.id) === value);

  const supprimer = async () => {
    setConfirmOpened(false);
    await onDelete();
  };

  // Le bouton du menu. Il sert deux fois quand les onglets sont centrés :
  // pour de vrai au bord droit, et en double invisible au bord gauche.
  const boutonActions = (
    <Button
      variant="subtle"
      color="gray"
      rightSection={<IconChevronDown size={14} />}
      // Poussé au bout de la rangée. Centrés, les onglets se placent entre
      // cette marge automatique et celle du double : deux marges « auto » se
      // partagent le vide à parts égales, et les deux boutons ayant la même
      // largeur, le milieu tombe juste.
      ml="auto"
      mb={4}
      // Le gris de Mantine tire sur le bleu au survol : on pose le nôtre,
      // neutre, sur la variable que Button lit pour son fond.
      style={{ alignSelf: "center", "--button-hover": NEUTRAL_HOVER } as CSSProperties}
    >
      Actions
    </Button>
  );

  return (
    <>
      <Tabs value={value} onChange={onChange} mb={50}>
        <Tabs.List>
          {/* Le double du menu, au bord gauche : invisible, mais il occupe la
              même largeur, et les onglets tombent donc au milieu de la rangée
              entière. Il lui laisse aussi la hauteur qu'elle a dans les autres
              modes — c'est le bouton qui la fixe, pas les onglets. */}
          {centered && (
            <div
              aria-hidden
              style={{
                display: "flex",
                marginRight: "auto",
                visibility: "hidden",
                pointerEvents: "none",
              }}
            >
              {boutonActions}
            </div>
          )}

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
            <Menu.Target>{boutonActions}</Menu.Target>
            <Menu.Dropdown>
              {extraActions && (
                <>
                  {extraActions}
                  <Menu.Divider />
                </>
              )}
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
        title={deleteTitle}
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
