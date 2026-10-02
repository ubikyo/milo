import { ActionIcon, Menu, Tabs } from "@mantine/core";
import {
  IconCheck,
  IconEyeOff,
  IconFlag,
  IconHash,
  IconHierarchy2,
  IconLock,
  IconPencil,
  IconPlus,
  IconTag,
  IconTags,
  IconTrash,
} from "@tabler/icons-react";
import { Fragment, useRef, useState } from "react";
import { ADD_ACTION, RED } from "../../themes/colors";
import DeleteConfirmModal from "./DeleteConfirmModal";
import HeriteConfirmModal from "./HeriteConfirmModal";
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
  /** Les modes dont les onglets se ferment aux autres : Accès, Projet et Tâche. */
  is_private?: number;
  /** Le mode Tâche, dont les cartes portent un numéro. */
  show_card_numbers?: number;
  /** Le mode Accès, dont chaque catégorie a sa structure : « Hérité » pour le compte. */
  inherited?: boolean;
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
  /** Ajouter un onglet. Sans lui — sans le droit d'ajouter —, pas de « + ». */
  onAdd?: () => void;
  /**
   * L'onglet visé par le clic droit, qui n'est pas forcément l'onglet ouvert.
   * Sans lui, « Modifier » renomme l'onglet sur place.
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
   * Verrouiller ou déverrouiller l'onglet visé, sans passer par son tiroir.
   * Sans lui, le menu n'en propose pas : tous les modes n'ont pas de verrou.
   */
  onToggleLock?: (id: number) => void | Promise<void>;
  /**
   * Rendre l'onglet visé privé ou de nouveau visible de tous. Sans lui, le
   * menu n'en propose pas.
   */
  onTogglePrivate?: (id: number) => void | Promise<void>;
  /** Montrer ou taire le numéro des cartes. Sans lui, le menu n'en propose pas. */
  onToggleCardNumbers?: (id: number) => void | Promise<void>;
  /** Copier les étiquettes de l'onglet vers un autre. Sans lui, le menu n'en propose pas. */
  onCopyLabels?: (id: number) => void;
  /** Gérer les catégories de l'onglet. Sans lui, le menu n'en propose pas. */
  onManageCategories?: (id: number) => void;
  /** Gérer les types de jalons. Sans lui, le menu n'en propose pas. */
  onManageMilestones?: () => void;
  /** Copier les catégories de l'onglet vers un autre. Sans lui, le menu n'en propose pas. */
  onCopyCategories?: (id: number) => void;
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
  /**
   * « Hérité » : l'onglet visé montre la structure partagée — sections et
   * widgets —, ou la copie propre au compte. « of » le dit pour un onglet
   * (en Projet et Tâche, le même pour tous : les sections y sont communes).
   * Le décocher se confirme. Sans lui, le menu n'en propose pas.
   */
  inheritance?: {
    of: (onglet: Onglet) => boolean;
    onToggle: (id: number) => void | Promise<void>;
  };
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
  onTogglePrivate,
  onToggleCardNumbers,
  onCopyLabels,
  onCopyCategories,
  onManageCategories,
  onManageMilestones,
  onReorder,
  deleteWarning,
  deleteTitle = "Supprimer le tableau",
  sectionsLock,
  inheritance,
  account,
}: BoardTabsProps) {
  // Le menu contextuel ouvert, et l'onglet qu'il vise.
  const [menu, setMenu] = useState<{ onglet: Onglet; position: PointMenuPosition } | null>(null);
  // L'onglet dont on confirme la suppression.
  const [aSupprimer, setASupprimer] = useState<Onglet | null>(null);
  // L'onglet privé qu'on s'apprête à ouvrir à tous : ce geste se confirme.
  const [aOuvrir, setAOuvrir] = useState<Onglet | null>(null);
  // L'onglet dont on s'apprête à basculer « Hérité », et l'état qu'on quitte :
  // ce geste se confirme dans les deux sens. L'état reste posé à la
  // fermeture : le message ne change pas pendant que la fenêtre s'efface.
  const [aBasculer, setABasculer] = useState<{
    onglet: Onglet | null;
    herite: boolean;
  }>({ onglet: null, herite: true });
  const fermerBascule = () => setABasculer((b) => ({ ...b, onglet: null }));
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
    if (onglet && onDelete) await onDelete(onglet.id);
  };

  // « Modifier » ne vaut que si l'on peut modifier l'onglet : sans tiroir ni
  // renommage, il ne ferait rien.
  const modifiable = Boolean(onEdit || onRename);
  // Un menu sans rien dedans ne s'ouvre pas : c'est le cas de qui ne fait que
  // lire.
  const menuUtile =
    modifiable ||
    Boolean(
      onDelete ||
        onManageCategories ||
        onManageMilestones ||
        onCopyCategories ||
        onCopyLabels ||
        onToggleCardNumbers ||
        onTogglePrivate ||
        onToggleLock ||
        sectionsLock ||
        inheritance,
    );

  return (
    <>
      <ModeBar value={value} onChange={changerOnglet} account={account}>
        {onglets.map((board, index) => (
          <Fragment key={board.id}>
            {insertAt(index) && <InsertLine />}
            <Tabs.Tab
              value={String(board.id)}
              {...tabProps(board.id, index, tabStyle(value === String(board.id)))}
              onContextMenu={(e) => {
                if (menuUtile) setMenu({ onglet: board, position: positionDuMenu(e) });
              }}
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
        {onAdd && (
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
        )}
      </ModeBar>

      {menu && (
        <PointMenu position={menu.position} onClose={() => setMenu(null)}>
          {modifiable && (
            <Menu.Item
              leftSection={<IconPencil size={16} />}
              onClick={() =>
                onEdit ? onEdit(menu.onglet.id) : ouvrirRenommage(menu.onglet)
              }
            >
              Modifier
            </Menu.Item>
          )}
          {onManageCategories && (
            <Menu.Item
              leftSection={<IconTag size={16} />}
              onClick={() => onManageCategories(menu.onglet.id)}
            >
              Catégories
            </Menu.Item>
          )}
          {onManageMilestones && (
            <Menu.Item leftSection={<IconFlag size={16} />} onClick={() => onManageMilestones()}>
              Jalons
            </Menu.Item>
          )}
          {/* Ce que l'onglet porte, reporté sur un autre : à part du reste. */}
          {(onCopyCategories || onCopyLabels) && <Menu.Divider />}
          {onCopyCategories && (
            <Menu.Item
              leftSection={<IconTags size={16} />}
              onClick={() => onCopyCategories(menu.onglet.id)}
            >
              Copier les catégories
            </Menu.Item>
          )}
          {onCopyLabels && (
            <Menu.Item
              leftSection={<IconTags size={16} />}
              onClick={() => onCopyLabels(menu.onglet.id)}
            >
              Copier les étiquettes
            </Menu.Item>
          )}

          {/* Les réglages de l'onglet, chacun coché quand il est actif. */}
          {(onToggleCardNumbers ||
            onTogglePrivate ||
            onToggleLock ||
            sectionsLock ||
            inheritance) && (
            <>
              <Menu.Divider />
              <Menu.Label>Affichage</Menu.Label>
            </>
          )}
          {onToggleCardNumbers && (
            <Menu.Item
              leftSection={<IconHash size={16} />}
              rightSection={menu.onglet.show_card_numbers ? <IconCheck size={14} /> : null}
              onClick={() => onToggleCardNumbers(menu.onglet.id)}
            >
              Numéros des cartes
            </Menu.Item>
          )}
          {onTogglePrivate && (
            <Menu.Item
              leftSection={<IconEyeOff size={16} />}
              rightSection={menu.onglet.is_private ? <IconCheck size={14} /> : null}
              // Le rendre privé se fait aussitôt ; l'ouvrir à tous se confirme.
              onClick={() =>
                menu.onglet.is_private
                  ? setAOuvrir(menu.onglet)
                  : onTogglePrivate(menu.onglet.id)
              }
            >
              Privé
            </Menu.Item>
          )}
          {inheritance &&
            (() => {
              // Un onglet privé n'est qu'à son auteur : il n'y a rien à
              // partager, ni donc à hériter.
              const prive = Boolean(menu.onglet.is_private);
              const herite = !prive && inheritance.of(menu.onglet);
              return (
                <Menu.Item
                  leftSection={<IconHierarchy2 size={16} />}
                  rightSection={herite ? <IconCheck size={14} /> : null}
                  disabled={prive}
                  onClick={() => setABasculer({ onglet: menu.onglet, herite })}
                >
                  Hérité
                </Menu.Item>
              );
            })()}
          {/* Un seul verrou pour l'onglet et les sections (qui valent pour
              tous les onglets) : verrouillé si l'un l'est, et le geste met
              les deux dans le même état. */}
          {(onToggleLock || sectionsLock) &&
            (() => {
              // « is_locked » vaut 0 ou 1 : ramené à un booléen pour comparer.
              const ongletVerrouille = Boolean(menu.onglet.is_locked);
              const verrouille =
                (onToggleLock !== undefined && ongletVerrouille) ||
                (sectionsLock?.locked ?? false);
              return (
                <Menu.Item
                  leftSection={<IconLock size={16} />}
                  rightSection={verrouille ? <IconCheck size={14} /> : null}
                  onClick={() => {
                    if (onToggleLock && ongletVerrouille === verrouille) {
                      onToggleLock(menu.onglet.id);
                    }
                    if (sectionsLock && Boolean(sectionsLock.locked) === verrouille) {
                      sectionsLock.onToggle();
                    }
                  }}
                >
                  Verrouillé
                </Menu.Item>
              );
            })()}

          {onDelete && (
            <>
              <Menu.Divider />
              <Menu.Item
                color={RED}
                leftSection={<IconTrash size={16} />}
                onClick={() => setASupprimer(menu.onglet)}
              >
                Supprimer
              </Menu.Item>
            </>
          )}
        </PointMenu>
      )}

      <HeriteConfirmModal
        opened={aBasculer.onglet !== null}
        inherited={aBasculer.herite}
        onClose={fermerBascule}
        onConfirm={() => {
          const onglet = aBasculer.onglet;
          fermerBascule();
          if (onglet && inheritance) void inheritance.onToggle(onglet.id);
        }}
      />

      <DeleteConfirmModal
        opened={aOuvrir !== null}
        onClose={() => setAOuvrir(null)}
        onConfirm={() => {
          const onglet = aOuvrir;
          setAOuvrir(null);
          if (onglet && onTogglePrivate) void onTogglePrivate(onglet.id);
        }}
        title="Retirer « Privé »"
        message={
          <>
            « {aOuvrir?.name} » ne sera plus privé : tous ceux qui ont accès à ce mode
            pourront le voir.
          </>
        }
        confirmLabel="Valider"
        cancelLabel="Annuler"
        confirmColor="teal"
      />

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
