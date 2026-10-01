import { ActionIcon, Menu, Tabs } from "@mantine/core";
import { IconLock, IconLockOpen, IconPencil, IconPlus, IconTrash } from "@tabler/icons-react";
import { Fragment, useRef, useState } from "react";
import { ADD_ACTION, RED } from "../../themes/colors";
import DeleteConfirmModal from "./DeleteConfirmModal";
import ModeBar from "./ModeBar";
import PointMenu, { positionDuMenu, type PointMenuPosition } from "./PointMenu";
import { InsertLine, useTabReorder } from "./useTabReorder";
import { tabStyle } from "../../themes/tabs";
import type { AccountSlot } from "./AccountControls";
import type { ReactNode } from "react";

/** Un onglet : les tableaux des modes n'ont en commun qu'un identifiant et un nom. */
interface Onglet {
  id: number;
  name: string;
  /** Les modes dont les onglets se verrouillent : Accès et Tâche. */
  is_locked?: number;
}

// Les tableaux d'un mode, en onglets. Sert au mode Tâche, au mode Projet et au
// mode Accès : seul « deleteWarning » change, il décrit ce que la suppression
// en cascade emporte.
//
// Chaque onglet se modifie et se supprime depuis son menu contextuel, au clic
// droit ; un double clic sur son nom le renomme sur place ; le « + » au bout de
// la rangée en ajoute un.
//
// La rangée elle-même — le logo à gauche, la société et le compte à droite —
// appartient à ModeBar : elle est la même dans tous les modes, y compris ceux
// qui n'ont pas de tableaux.
interface BoardTabsProps {
  boards: Onglet[];
  value: string | null;
  onChange: (value: string | null) => void;
  onAdd: () => void;
  /** L'onglet visé par le clic droit, qui n'est pas forcément l'onglet ouvert. */
  onEdit: (id: number) => void;
  /**
   * Renommer l'onglet sur place, au double clic. Sans lui, le double clic ne
   * fait rien de plus qu'un clic.
   */
  onRename?: (id: number, name: string) => void | Promise<void>;
  onDelete: (id: number) => void | Promise<void>;
  /**
   * Verrouiller ou déverrouiller l'onglet visé, sans passer par son tiroir.
   * Sans lui, le menu n'en propose pas : tous les modes n'ont pas de verrou.
   */
  onToggleLock?: (id: number) => void | Promise<void>;
  /**
   * L'ordre des onglets, une fois l'onglet déposé. Il vaut pour tout le monde
   * et non pour le seul navigateur qui l'a changé : c'est le mode qui est
   * rangé, pas la vue qu'on en a. Sans lui, les onglets ne se glissent pas.
   */
  onReorder?: (ids: number[]) => void | Promise<void>;
  /** Ce que la suppression en cascade emporte, dit à l'utilisateur. */
  deleteWarning?: ReactNode;
  /** Le titre de la confirmation : tous les onglets ne sont pas des tableaux. */
  deleteTitle?: string;
  /**
   * Le verrou des sections de l'écran, communes à tous les onglets : ni ajout
   * ni déplacement. Sans lui, le menu n'en propose pas.
   */
  sectionsLock?: { locked: boolean; onToggle: () => void | Promise<void> };
  /** La société et le compte, que ModeBar pose au bout de la rangée. */
  account: AccountSlot;
}

export default function BoardTabs({
  boards,
  value,
  onChange,
  onAdd,
  onEdit,
  onRename,
  onDelete,
  onToggleLock,
  onReorder,
  deleteWarning,
  deleteTitle = "Supprimer le tableau",
  sectionsLock,
  account,
}: BoardTabsProps) {
  // Le menu contextuel ouvert, et l'onglet qu'il vise.
  const [menu, setMenu] = useState<{ onglet: Onglet; position: PointMenuPosition } | null>(null);
  // L'onglet dont on confirme la suppression.
  const [aSupprimer, setASupprimer] = useState<Onglet | null>(null);
  const [plusSurvole, setPlusSurvole] = useState(false);
  // L'onglet en cours de renommage et le nom qu'on y tape.
  const [renomme, setRenomme] = useState<{ id: number; name: string } | null>(null);
  // Le nom validé, montré le temps que le serveur réponde et que la rangée
  // revienne relue : sans lui, l'ancien nom reparaîtrait un instant.
  const [provisoire, setProvisoire] = useState<{ id: number; name: string } | null>(null);
  // Vrai dès que la saisie est conclue : Entrée suivie de la perte du focus ne
  // doit pas enregistrer deux fois.
  const conclu = useRef(false);

  // Le glisser-déposer des onglets : voir useTabReorder.
  const {
    ordered: onglets,
    tabProps,
    guardChange,
    insertAt,
  } = useTabReorder(boards, (board) => board.id, onReorder);
  const changerOnglet = guardChange(onChange);

  const ouvrirRenommage = (onglet: Onglet) => {
    if (!onRename) return;
    conclu.current = false;
    setRenomme({ id: onglet.id, name: onglet.name });
  };

  const conclureRenommage = async (valider: boolean) => {
    if (!renomme || conclu.current) return;
    conclu.current = true;
    const { id, name } = renomme;
    setRenomme(null);
    const nom = name.trim();
    const onglet = boards.find((b) => b.id === id);
    if (!valider || !nom || !onglet || nom === onglet.name || !onRename) return;
    setProvisoire({ id, name: nom });
    try {
      await onRename(id, nom);
    } finally {
      setProvisoire(null);
    }
  };

  const supprimer = async () => {
    const onglet = aSupprimer;
    setASupprimer(null);
    if (onglet) await onDelete(onglet.id);
  };

  return (
    <>
      <ModeBar value={value} onChange={changerOnglet} account={account}>
        {onglets.map((board, index) => (
          <Fragment key={board.id}>
            {insertAt(index) && <InsertLine />}
            <Tabs.Tab
              value={String(board.id)}
              {...tabProps(board.id, index, tabStyle(value === String(board.id)))}
              onContextMenu={(e) => setMenu({ onglet: board, position: positionDuMenu(e) })}
              onDoubleClick={() => ouvrirRenommage(board)}
            >
              {renomme?.id === board.id ? (
                <input
                  value={renomme.name}
                  onChange={(e) => {
                    const name = e.currentTarget.value;
                    setRenomme((r) => (r ? { ...r, name } : r));
                  }}
                  // Les touches restent au champ : sans cela, les flèches
                  // changeraient d'onglet et Entrée enregistrerait deux fois.
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter") {
                      e.preventDefault();
                      conclureRenommage(true);
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      conclureRenommage(false);
                    }
                  }}
                  onBlur={() => conclureRenommage(true)}
                  // L'appui dans le champ place le curseur : il ne commence pas
                  // à glisser l'onglet, et le clic ne le rouvre pas.
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => e.stopPropagation()}
                  onFocus={(e) => e.currentTarget.select()}
                  autoFocus
                  aria-label={`Renommer ${board.name}`}
                  style={{
                    font: "inherit",
                    color: "inherit",
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    padding: 0,
                    margin: 0,
                    // La largeur suit le nom tapé : l'onglet ne change pas de
                    // taille en passant en saisie.
                    width: `${Math.max(renomme.name.length, 1) + 1}ch`,
                  }}
                />
              ) : provisoire?.id === board.id ? (
                provisoire.name
              ) : (
                board.name
              )}
            </Tabs.Tab>
          </Fragment>
        ))}
        {insertAt(onglets.length) && <InsertLine />}

        {/* Au bout du dernier onglet : en ajouter un. Le vert des autres
            gestes « ajouter », un ton plus foncé au survol (AddButton). */}
        <ActionIcon
          variant="transparent"
          size="sm"
          aria-label="Ajouter"
          onClick={onAdd}
          onMouseEnter={() => setPlusSurvole(true)}
          onMouseLeave={() => setPlusSurvole(false)}
          ml={4}
          style={{
            alignSelf: "center",
            color: plusSurvole ? ADD_ACTION.hover : ADD_ACTION.color,
          }}
        >
          <IconPlus size={16} />
        </ActionIcon>
      </ModeBar>

      {menu && (
        <PointMenu position={menu.position} onClose={() => setMenu(null)}>
          <Menu.Item
            leftSection={<IconPencil size={16} />}
            onClick={() => onEdit(menu.onglet.id)}
          >
            Modifier
          </Menu.Item>
          {onToggleLock && (
            <Menu.Item
              leftSection={
                menu.onglet.is_locked ? <IconLockOpen size={16} /> : <IconLock size={16} />
              }
              onClick={() => onToggleLock(menu.onglet.id)}
            >
              {menu.onglet.is_locked ? "Déverrouiller" : "Verrouiller"}
            </Menu.Item>
          )}
          {/* Les sections valent pour tous les onglets : leur verrou aussi. */}
          {sectionsLock && (
            <Menu.Item
              leftSection={
                sectionsLock.locked ? <IconLockOpen size={16} /> : <IconLock size={16} />
              }
              onClick={() => sectionsLock.onToggle()}
            >
              {sectionsLock.locked ? "Déverrouiller les sections" : "Verrouiller les sections"}
            </Menu.Item>
          )}
          <Menu.Divider />
          <Menu.Item
            color={RED}
            leftSection={<IconTrash size={16} />}
            onClick={() => setASupprimer(menu.onglet)}
          >
            Supprimer
          </Menu.Item>
        </PointMenu>
      )}

      <DeleteConfirmModal
        opened={aSupprimer !== null}
        onClose={() => setASupprimer(null)}
        onConfirm={supprimer}
        title={deleteTitle}
        message={
          <>
            Voulez-vous vraiment supprimer « {aSupprimer?.name} » ? {deleteWarning} Cette action est
            irréversible.
          </>
        }
      />
    </>
  );
}
