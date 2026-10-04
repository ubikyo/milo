import { ActionIcon, Menu, Tabs } from "@mantine/core";
import {
  IconCategory,
  IconCheck,
  IconEyeOff,
  IconHierarchy2,
  IconPencil,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { Fragment, useEffect, useRef, useState } from "react";
import { ADD_ACTION, RED } from "../../themes/colors";
import DeleteConfirmModal from "./DeleteConfirmModal";
import InheritConfirmModal from "./InheritConfirmModal";
import ModeBar from "./ModeBar";
import ContextsMenu from "./ContextsMenu";
import AdjustedInput from "./AdjustedInput";
import PointMenu, { menuAnchor, type PointMenuPosition } from "./PointMenu";
import { InsertLine, useTabReorder } from "./useTabReorder";
import { tabStyle } from "../../themes/tabs";
import type { AccountSlot } from "./AccountControls";
import type { ReactNode, SyntheticEvent } from "react";

/** Ce qui se passe dans la liste des contextes ne remonte pas à l'onglet. */
const keep = (e: SyntheticEvent) => e.stopPropagation();

/** Un onglet : les tableaux des modes n'ont en commun qu'un identifiant et un nom. */
interface Tab {
  id: number;
  name: string;
  /** Les modes dont les onglets se ferment aux autres : Accès, Projet et Tâche. */
  is_private?: number;
  /** Le mode Accès, dont chaque catégorie a sa structure : « Hérité » pour le compte. */
  inherited?: boolean;
  /** Ses contextes : sans eux, rien à copier. */
  contexts?: readonly unknown[];
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
  boards: Tab[];
  value: string | null;
  onChange: (value: string | null) => void;
  /** Ajouter un onglet. Sans lui — sans le droit d'ajouter —, pas de « + ». */
  onAdd?: () => void;
  /**
   * L'onglet visé par le clic droit, qui n'est pas forcément l'onglet ouvert.
   * Sans lui, « Renommer » renomme l'onglet sur place.
   */
  onEdit?: (id: number) => void;
  /**
   * Renommer l'onglet sur place, au double clic. Sans lui, le double clic ne
   * fait rien de plus qu'un clic.
   */
  onRename?: (id: number, name: string) => void | Promise<void>;
  /** Sans lui — sans le droit de supprimer —, le menu n'en propose pas. */
  onDelete?: (id: number) => void | Promise<void>;
  /**
   * Rendre l'onglet visé privé ou de nouveau visible de tous. Sans lui, le
   * menu n'en propose pas.
   */
  onTogglePrivate?: (id: number) => void | Promise<void>;
  /** Copier les contextes de l'onglet vers un autre. Sans lui, le menu n'en propose pas. */
  onCopyContexts?: (id: number) => void;
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
   * « Hérité » : l'onglet visé montre la structure partagée — sections et
   * widgets —, ou la copie propre au compte. « of » le dit pour un onglet
   * (en Projet et Tâche, le même pour tous : les sections y sont communes).
   * Le décocher se confirme. Sans lui, le menu n'en propose pas.
   */
  inheritance?: {
    of: (tab: Tab) => boolean;
    onToggle: (id: number) => void | Promise<void>;
  };
  /** La société et le compte, que ModeBar pose au bout de la rangée. */
  account: AccountSlot;
  /** Le menu « Actions » du tableau ouvert, posé entre la société et le compte. */
  actions?: ReactNode;
  /**
   * L'onglet à passer en saisie de son nom dès qu'il paraît — celui qu'on
   * vient de créer. « onRenommageOuvert » dit que c'est fait.
   */
  toRename?: number | null;
  onRenameOpened?: () => void;
}

export default function BoardTabs({
  boards,
  value,
  onChange,
  onAdd,
  onEdit,
  onRename,
  onDelete,
  onTogglePrivate,
  onCopyContexts,
  onReorder,
  deleteWarning,
  deleteTitle = "Supprimer le tableau",
  inheritance,
  account,
  actions,
  toRename,
  onRenameOpened,
}: BoardTabsProps) {
  const { contexts } = account;
  // Le menu contextuel ouvert, et l'onglet qu'il vise.
  const [menu, setMenu] = useState<{ tab: Tab; position: PointMenuPosition } | null>(null);
  // L'onglet dont on confirme la suppression.
  const [toDelete, setToDelete] = useState<Tab | null>(null);
  // L'onglet privé qu'on s'apprête à ouvrir à tous : ce geste se confirme.
  const [toOpen, setToOpen] = useState<Tab | null>(null);
  // L'onglet dont on s'apprête à basculer « Hérité », et l'état qu'on quitte :
  // ce geste se confirme dans les deux sens. L'état reste posé à la
  // fermeture : le message ne change pas pendant que la fenêtre s'efface.
  const [toToggle, setToSwitch] = useState<{
    tab: Tab | null;
    inherits: boolean;
  }>({ tab: null, inherits: true });
  const closeToggle = () => setToSwitch((b) => ({ ...b, tab: null }));
  const [plusHovered, setMoreHovered] = useState(false);
  // L'onglet en cours de renommage et le nom qu'on y tape.
  const [renamed, setRenamed] = useState<{ id: number; name: string } | null>(null);
  // Le nom validé, montré le temps que le serveur réponde et que la rangée
  // revienne relue : sans lui, l'ancien nom reparaîtrait un instant.
  const [provisional, setProvisional] = useState<{ id: number; name: string } | null>(null);
  // Vrai dès que la saisie est conclue : Entrée suivie de la perte du focus ne
  // doit pas enregistrer deux fois.
  const finished = useRef(false);

  // Le glisser-déposer des onglets : voir useTabReorder.
  const {
    ordered: tabs,
    tabProps,
    guardChange,
    insertAt,
  } = useTabReorder(boards, (board) => board.id, onReorder);
  const changeTab = guardChange(onChange);

  const openRename = (tab: Tab) => {
    if (!onRename) return;
    finished.current = false;
    setRenamed({ id: tab.id, name: tab.name });
  };

  // L'onglet qu'on vient de créer passe en saisie de son nom dès qu'il paraît
  // dans la rangée relue.
  useEffect(() => {
    if (toRename == null) return;
    const tab = boards.find((b) => b.id === toRename);
    if (!tab) return;
    openRename(tab);
    onRenameOpened?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toRename, boards]);

  const finishRename = async (validate: boolean) => {
    if (!renamed || finished.current) return;
    finished.current = true;
    const { id, name } = renamed;
    setRenamed(null);
    const trimmedName = name.trim();
    const tab = boards.find((b) => b.id === id);
    if (!validate || !trimmedName || !tab || trimmedName === tab.name || !onRename) return;
    setProvisional({ id, name: trimmedName });
    try {
      await onRename(id, trimmedName);
    } finally {
      setProvisional(null);
    }
  };

  const remove = async () => {
    const tab = toDelete;
    setToDelete(null);
    if (tab && onDelete) await onDelete(tab.id);
  };

  // « Renommer » ne vaut que si l'on peut modifier l'onglet : sans tiroir ni
  // renommage, il ne ferait rien.
  const editable = Boolean(onEdit || onRename);
  // Un menu sans rien dedans ne s'ouvre pas : c'est le cas de qui ne fait que
  // lire.
  const usefulMenu =
    editable ||
    Boolean(
      onDelete ||
        onCopyContexts ||
        onTogglePrivate ||
        inheritance,
    );

  // Copier les contextes de l'onglet visé : seulement s'il en a au moins un.
  const copyContexts = Boolean(onCopyContexts) && (menu?.tab.contexts?.length ?? 0) > 0;

  return (
    <>
      <ModeBar value={value} onChange={changeTab} account={account} actions={actions}>
        {tabs.map((board, index) => (
          <Fragment key={board.id}>
            {insertAt(index) && <InsertLine />}
            <Tabs.Tab
              value={String(board.id)}
              {...tabProps(board.id, index, tabStyle(value === String(board.id)))}
              onContextMenu={(e) => {
                // Le menu de l'onglet pend sous lui, comme celui d'une rangée.
                if (usefulMenu) setMenu({ tab: board, position: menuAnchor(e) });
              }}
              onDoubleClick={() => openRename(board)}
            >
              {/* Le nom — ou son champ — et les contextes, alignés sur la
                  ligne de base du texte : le libellé des contextes est plus
                  petit, et le champ s'aligne en haut de sa ligne
                  (SaisieAjustee). */}
              <span style={{ display: "inline-flex", alignItems: "baseline" }}>
                {renamed?.id === board.id ? (
                  <AdjustedInput
                    value={renamed.name}
                    onChange={(e) => {
                      const name = e.currentTarget.value;
                      setRenamed((r) => (r ? { ...r, name } : r));
                    }}
                    // Les touches restent au champ : sans cela, les flèches
                    // changeraient d'onglet et Entrée enregistrerait deux fois.
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === "Enter") {
                        e.preventDefault();
                        finishRename(true);
                      }
                      if (e.key === "Escape") {
                        e.preventDefault();
                        finishRename(false);
                      }
                    }}
                    onBlur={() => finishRename(true)}
                    // L'appui dans le champ place le curseur : il ne commence pas
                    // à glisser l'onglet, et le clic ne le rouvre pas.
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    onDoubleClick={(e) => e.stopPropagation()}
                    onFocus={(e) => e.currentTarget.select()}
                    autoFocus
                    aria-label={`Renommer ${board.name}`}
                  />
                ) : provisional?.id === board.id ? (
                  provisional.name
                ) : (
                  board.name
                )}
                {/* Les contextes du tableau ouvert, à droite de son nom — sans
                    contexte et sans pouvoir en ajouter, la liste n'a rien à
                    offrir. Ce qui s'y passe reste à la liste : sans cela,
                    l'onglet glisserait, se renommerait au double clic, ou
                    ouvrirait son menu. */}
                {value === String(board.id) &&
                  contexts &&
                  (contexts.items.length > 0 || contexts.management) && (
                    <span
                      style={{ display: "inline-flex", marginLeft: 12 }}
                      // Arrêté ici, l'appui n'atteint pas non plus ce qui
                      // referme le menu de l'onglet : on le referme soi-même.
                      onPointerDown={(e) => {
                        setMenu(null);
                        keep(e);
                      }}
                      onMouseDown={keep}
                      onClick={keep}
                      onDoubleClick={keep}
                      // Arrêté ici, le clic droit n'atteint plus ce qui tait le
                    // menu du navigateur (App) : il le tait lui-même — sauf en
                    // Debug, où ce menu revient.
                    onContextMenu={(e) => {
                      if (!document.documentElement.hasAttribute("data-milo-debug")) {
                        e.preventDefault();
                      }
                      keep(e);
                    }}
                      onKeyDown={keep}
                      onDragStart={keep}
                      onDragOver={keep}
                      onDrop={keep}
                    >
                      <ContextsMenu {...contexts} inTab />
                    </span>
                  )}
              </span>
            </Tabs.Tab>
          </Fragment>
        ))}
        {insertAt(tabs.length) && <InsertLine />}

        {/* Au bout du dernier onglet : en ajouter un. Le vert des autres
            gestes « ajouter », un ton plus foncé au survol (AddButton). */}
        {onAdd && (
          <ActionIcon
            variant="transparent"
            size="sm"
            aria-label="Ajouter"
            onClick={onAdd}
            onMouseEnter={() => setMoreHovered(true)}
            onMouseLeave={() => setMoreHovered(false)}
            ml={4}
            style={{
              alignSelf: "center",
              color: plusHovered ? ADD_ACTION.hover : ADD_ACTION.color,
            }}
          >
            <IconPlus size={16} />
          </ActionIcon>
        )}
      </ModeBar>

      {menu && (
        <PointMenu position={menu.position} onClose={() => setMenu(null)}>
          {editable && (
            <Menu.Item
              leftSection={<IconPencil size={16} />}
              onClick={() =>
                onEdit ? onEdit(menu.tab.id) : openRename(menu.tab)
              }
            >
              Renommer
            </Menu.Item>
          )}
          {/* Ce que l'onglet porte, reporté sur un autre : à part du reste. */}
          {copyContexts && <Menu.Divider />}
          {/* Un tableau sans contexte n'en a aucun à copier. */}
          {copyContexts && onCopyContexts && (
            <Menu.Item
              leftSection={<IconCategory size={16} />}
              onClick={() => onCopyContexts(menu.tab.id)}
            >
              Copier les contextes
            </Menu.Item>
          )}

          {/* Les réglages de l'onglet, chacun coché quand il est actif. */}
          {(onTogglePrivate || inheritance) && (
            <>
              <Menu.Divider />
              <Menu.Label>Interface</Menu.Label>
            </>
          )}
          {onTogglePrivate && (
            <Menu.Item
              leftSection={<IconEyeOff size={16} />}
              rightSection={menu.tab.is_private ? <IconCheck size={14} /> : null}
              // Le rendre privé se fait aussitôt ; l'ouvrir à tous se confirme.
              onClick={() =>
                menu.tab.is_private
                  ? setToOpen(menu.tab)
                  : onTogglePrivate(menu.tab.id)
              }
            >
              Privée
            </Menu.Item>
          )}
          {inheritance &&
            (() => {
              // Un onglet privé n'est qu'à son auteur : il n'y a rien à
              // partager, ni donc à hériter.
              const isPrivate = Boolean(menu.tab.is_private);
              const inherits = !isPrivate && inheritance.of(menu.tab);
              return (
                <Menu.Item
                  leftSection={<IconHierarchy2 size={16} />}
                  rightSection={inherits ? <IconCheck size={14} /> : null}
                  disabled={isPrivate}
                  onClick={() => setToSwitch({ tab: menu.tab, inherits })}
                >
                  Héritée
                </Menu.Item>
              );
            })()}
          {onDelete && (
            <>
              <Menu.Divider />
              <Menu.Item
                color={RED}
                leftSection={<IconTrash size={16} />}
                onClick={() => setToDelete(menu.tab)}
              >
                Supprimer
              </Menu.Item>
            </>
          )}
        </PointMenu>
      )}

      <InheritConfirmModal
        opened={toToggle.tab !== null}
        inherited={toToggle.inherits}
        onClose={closeToggle}
        onConfirm={() => {
          const tab = toToggle.tab;
          closeToggle();
          if (tab && inheritance) void inheritance.onToggle(tab.id);
        }}
      />

      <DeleteConfirmModal
        opened={toOpen !== null}
        onClose={() => setToOpen(null)}
        onConfirm={() => {
          const tab = toOpen;
          setToOpen(null);
          if (tab && onTogglePrivate) void onTogglePrivate(tab.id);
        }}
        title="Retirer « Privée »"
        message={
          <>
            « {toOpen?.name} » ne sera plus privé : tous ceux qui ont accès à ce mode
            pourront le voir.
          </>
        }
        confirmLabel="Valider"
        cancelLabel="Annuler"
        confirmColor="teal"
      />

      <DeleteConfirmModal
        opened={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={remove}
        title={deleteTitle}
        message={
          <>
            Voulez-vous vraiment supprimer « {toDelete?.name} » ? {deleteWarning} Cette action est
            irréversible.
          </>
        }
      />
    </>
  );
}
