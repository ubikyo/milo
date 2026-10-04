import {
  ActionIcon,
  Center,
  Group,
  Menu,
  Progress,
  ScrollArea,
  Table,
  Text,
  UnstyledButton,
} from "@mantine/core";
import {
  IconCheck,
  IconEye,
  IconChevronDown,
  IconChevronUp,
  IconCopy,
  IconCopyPlus,
  IconFilter,
  IconFolderOpen,
  IconFolderSymlink,
  IconPencil,
  IconSelector,
  IconSquarePlus,
  IconTrash,
} from "@tabler/icons-react";
import { createContext, Fragment, useContext, useMemo, useState } from "react";
import dayjs from "dayjs";
import { RED, STRONG_TEXT } from "../../themes/colors";
import ActorAvatars, { ACTOR_AVATAR_SIZE } from "../ui/ActorAvatars";
import AddButton from "../ui/AddButton";
import { keptColumns, defaultWidths } from "../ui/ChampsColonnes";
import EmptyPanel from "../ui/EmptyPanel";
import GridScroll from "../ui/GrilleScroll";
import LabelChip from "../ui/LabelChip";
import { menuPosition } from "../ui/PointMenu";
import { ReferenceTag } from "../ui/ReferenceTag";
import { useResizableColumns } from "../ui/useColonnesRedimensionnables";
import { listKey, projectReference } from "@milo/shared";
import { inList } from "../../lib/listes";
import type { ReactNode } from "react";
import type { Category, Project, PublicUser } from "@milo/shared";
import type { ProjectAction } from "./MoveOrCopyProjectModal";
import { useRights } from "../../lib/droits";
import { useIsEditing } from "../../lib/edition";

/** Une option d'entonnoir : « all » vaut « pas de filtre ». */
interface FilterOption {
  value: string;
  label: string;
}

/** Ce que le tableau demande pour ses entonnoirs de colonnes. */
export interface ProjectFiltersProps {
  categories: Category[];
  categoryFilter: string;
  onCategoryFilterChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  users: PublicUser[];
  actorFilter: string;
  onActorFilterChange: (value: string) => void;
}

/** Les clés de colonne : ce sur quoi on trie et ce qui se masque. */
type ColumnKey =
  | "number"
  | "name"
  | "context_name"
  | "category_name"
  | "actors"
  | "created_at"
  | "updated_at"
  | "labels"
  | "status";

interface Column {
  key: ColumnKey;
  label: string;
  /** La valeur sur laquelle la colonne se trie. */
  value: (p: Project) => string | number | null;
  width?: number;
}

interface Sort {
  key: ColumnKey;
  direction: "asc" | "desc";
}

/** Le projet visé par le clic droit, et le point où le menu doit s'ouvrir. */
interface ContextTarget {
  project: Project;
  x: number;
  y: number;
}

// Padding vertical des lignes ; la hauteur inclut le padding (box-sizing).
const ROW_PADDING_Y = 5;

// La colonne « Progression » est taillée sur son contenu : la barre et le
// pourcentage, plus l'espace qui les sépare.
const PROGRESS_WIDTH = 85;
const PERCENT_WIDTH = 40;
const STATUS_GAP = 10;
const STATUS_WIDTH = PROGRESS_WIDTH + PERCENT_WIDTH + STATUS_GAP;

// La référence la plus longue qu'on attend : le tag en prend la largeur.
const REFERENCE_TEMPLATE = projectReference(999);

const formatDate = (value: string): string =>
  dayjs(value).format("DD/MM/YYYY HH:mm");

const STATUS_OPTIONS: FilterOption[] = [
  { value: "all", label: "Tous" },
  { value: "in_progress", label: "En cours" },
  { value: "done", label: "Terminé" },
];

// Les étiquettes d'un projet, sur une seule ligne. Elles sont plus larges
// que les pastilles d'acteurs : au-delà de deux, le compte des autres remplace
// la liste, sans quoi la colonne prendrait la largeur du projet le plus
// étiqueté.
const LABELS_SHOWN = 2;
const LABEL_HEIGHT = 20;

function LabelsCell({ labels }: { labels: Project["labels"] }) {
  if (!labels?.length) {
    return (
      <Text size="sm" c="dimmed">
        —
      </Text>
    );
  }

  // Les plus lourdes devant : le serveur les range ainsi, la saisie du tiroir
  // non.
  const shown = [...labels]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, LABELS_SHOWN);
  const remaining = labels.length - shown.length;

  return (
    // Même boîte de hauteur fixe que les acteurs : sans elle, la line-box
    // ajoute un demi-pixel et la ligne devient plus haute que les autres.
    <div
      style={{
        height: ACTOR_AVATAR_SIZE,
        display: "flex",
        alignItems: "center",
        overflow: "hidden",
      }}
    >
      <Group gap={4} wrap="nowrap">
        {shown.map((label) => (
          <LabelChip
            key={label.id}
            label={label}
            size="xs"
            height={LABEL_HEIGHT}
          />
        ))}
        {remaining > 0 && (
          <Text size="xs" c="dimmed">
            +{remaining}
          </Text>
        )}
      </Group>
    </div>
  );
}

// Une barre neutre, grise : la liste se lit d'un coup d'œil sans que chaque ligne
// crie sa couleur. La couleur des jalons se voit dans la fiche du projet.
function StatusCell({ status }: { status: number }) {
  return (
    <Group gap={STATUS_GAP} wrap="nowrap">
      <Progress
        value={status}
        color="gray.6"
        size="lg"
        radius="xl"
        w={PROGRESS_WIDTH}
      />
      <Text size="sm" w={PERCENT_WIDTH} ta="right">
        {status}%
      </Text>
    </Group>
  );
}

const COLUMNS: Column[] = [
  { key: "number", label: "Réf.", value: (p) => p.number || null, width: 65 },
  { key: "name", label: "Projet", value: (p) => p.name },
  { key: "context_name", label: "Contexte", value: (p) => p.context_name },
  { key: "category_name", label: "Catégorie", value: (p) => p.category_name },
  {
    key: "actors",
    label: "Acteurs",
    // Tri sur les noms ; les projets sans acteur passent en bas.
    value: (p) =>
      p.actors?.length ? p.actors.map((a) => a.name).join(", ") : null,
  },
  { key: "created_at", label: "Date ajout", value: (p) => p.created_at },
  { key: "updated_at", label: "Date modification", value: (p) => p.updated_at },
  {
    key: "labels",
    // Tri sur la plus lourde des étiquettes : celle que la cellule montre en
    // tête. Les projets sans étiquette passent en bas.
    label: "Étiquettes",
    value: (p) =>
      p.labels?.length ? Math.max(...p.labels.map((l) => l.weight)) : null,
  },
  {
    key: "status",
    label: "Progression",
    value: (p) => p.status,
    width: STATUS_WIDTH,
  },
];

/**
 * Les colonnes que le widget liste propose de montrer (Display dans
 * project-indicators/liste.tsx).
 */
export const PROJECT_COLUMNS: { key: ColumnKey; label: string }[] = COLUMNS.map(
  ({ key, label }) => ({ key, label: key === "number" ? "Référence" : label }),
);

// Au-delà de dix options — les acteurs, vite nombreux —, la liste défile.
// Une ligne de menu : sa ligne de texte, et son retrait dessus et dessous.
const FILTER_VISIBLE_ROWS = 10;
const FILTER_ROW_HEIGHT =
  "(var(--mantine-font-size-sm) * var(--mantine-line-height) + var(--mantine-spacing-xs) / 1.5 * 2)";

// Filtre d'une colonne. L'entonnoir se colore tant qu'une valeur est retenue,
// pour qu'un tableau filtré ne passe pas pour un tableau vide.
interface ColumnFilterProps {
  label: string;
  options: FilterOption[];
  value: string;
  onChange: (value: string) => void;
}

function ColumnFilter({ label, options, value, onChange }: ColumnFilterProps) {
  const active = value !== "all";

  return (
    <Menu position="bottom-end" withinPortal shadow="md">
      <Menu.Target>
        <ActionIcon
          variant={active ? "light" : "subtle"}
          color={active ? "teal" : "gray"}
          size="sm"
          aria-label={`Filtrer par ${label}`}
        >
          <IconFilter size={14} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <ScrollArea.Autosize
          mah={`calc(${FILTER_VISIBLE_ROWS} * ${FILTER_ROW_HEIGHT})`}
          type="auto"
          scrollbars="y"
          scrollbarSize={2}
        >
          {options.map((option) => (
            <Menu.Item
              key={option.value}
              onClick={() => onChange(option.value)}
              leftSection={
                option.value === value ? (
                  <IconCheck size={14} />
                ) : (
                  <span style={{ width: 14 }} />
                )
              }
            >
              {option.label}
            </Menu.Item>
          ))}
        </ScrollArea.Autosize>
      </Menu.Dropdown>
    </Menu>
  );
}

// Le tri et le filtre sont deux commandes distinctes : le bouton de tri ne
// couvre que le libellé, sinon ouvrir le filtre trierait la colonne au passage.
interface SortableThProps {
  column: Column;
  sort: Sort;
  onSort: (key: ColumnKey) => void;
  filter: ReactNode;
  handle: ReactNode;
  /** Les largeurs sont figées par un redimensionnement. */
  frozen: boolean;
}

function SortableTh({
  column,
  sort,
  onSort,
  filter,
  handle,
  frozen,
}: SortableThProps) {
  const active = sort.key === column.key;
  const Icon = !active
    ? IconSelector
    : sort.direction === "asc"
      ? IconChevronUp
      : IconChevronDown;

  return (
    <Table.Th w={column.width}>
      {/* En mise en page naturelle, la largeur d'une cellule n'est qu'un
          souhait : une grille à l'étroit la ramène à celle de son contenu.
          Le minimum posé sur le contenu la tient. */}
      <Group gap={4} wrap="nowrap" miw={frozen ? undefined : column.width}>
        <UnstyledButton
          onClick={() => onSort(column.key)}
          style={{ flex: 1, minWidth: 0 }}
        >
          <Group gap={4} wrap="nowrap" justify="space-between">
            <Text size="sm" fw={600} c={STRONG_TEXT}>
              {column.label}
            </Text>
            <Center c={active ? undefined : "dimmed"}>
              <Icon size={14} />
            </Center>
          </Group>
        </UnstyledButton>
        {filter}
      </Group>
      {handle}
    </Table.Th>
  );
}

// Menu d'un projet, ouvert au clic droit et posé sous la souris : son ancre
// est un point invisible placé aux coordonnées du clic.
interface ProjectContextMenuProps {
  target: ContextTarget;
  onClose: () => void;
  onEdit: (project: Project) => void;
  onMove: (project: Project, mode: ProjectAction) => void;
  onDuplicate: (project: Project) => void;
  onDelete: (project: Project) => void;
  onCreateTask: (project: Project) => void;
  /** La personne suit ce projet : elle est prévenue de chaque modification. */
  following: boolean;
  onToggleFollow: (project: Project) => void;
}

function ProjectContextMenu({
  target,
  onClose,
  onEdit,
  onMove,
  onDuplicate,
  onDelete,
  onCreateTask,
  following,
  onToggleFollow,
}: ProjectContextMenuProps) {
  const { project, x, y } = target;
  // Ce que le menu propose suit les droits du compte dans la société du
  // projet : qui ne fait que lire n'y trouve que « Suivre ».
  const can = useRights();
  const updateStatement = can("projects", "update");
  const add = can("projects", "create");
  const canDelete = can("projects", "delete");
  const createTask = can("tasks", "create");
  const isEditing = useIsEditing();

  // En modification, le menu ne propose que « Copier », qui s'y fait
  // seulement : le reste attend qu'on la quitte.
  if (isEditing)
    return (
      <Menu
        opened
        onChange={(isOpen) => !isOpen && onClose()}
        position="bottom-start"
        withinPortal
        shadow="md"
      >
        <Menu.Target>
          <div style={{ position: "fixed", left: x, top: y, width: 1, height: 1 }} />
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item leftSection={<IconCopy size={16} />} onClick={() => onMove(project, "copy")}>
            Copier
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    );

  return (
    <Menu
      opened
      onChange={(isOpen) => !isOpen && onClose()}
      position="bottom-start"
      withinPortal
      shadow="md"
    >
      <Menu.Target>
        <div
          style={{ position: "fixed", left: x, top: y, width: 1, height: 1 }}
        />
      </Menu.Target>
      <Menu.Dropdown>
        {/* Suivre vient en tête, comme dans le tiroir du projet. Le menu ne
            se referme pas, pour qu'on voie la coche changer. */}
        <Menu.Item
          leftSection={<IconEye size={16} />}
          rightSection={following ? <IconCheck size={14} /> : null}
          onClick={() => onToggleFollow(project)}
          closeMenuOnClick={false}
        >
          Suivre
        </Menu.Item>
        {(updateStatement || add) && <Menu.Divider />}
        {updateStatement && (
          <Menu.Item
            leftSection={<IconPencil size={16} />}
            onClick={() => onEdit(project)}
          >
            Modifier
          </Menu.Item>
        )}
        {/* Sur place, sans question : la copie s'ouvre aussitôt dans le
            tiroir, pour servir de base à un autre projet. */}
        {add && (
          <Menu.Item
            leftSection={<IconCopyPlus size={16} />}
            onClick={() => onDuplicate(project)}
          >
            Dupliquer
          </Menu.Item>
        )}
        {updateStatement && (
          <Menu.Item
            leftSection={<IconFolderSymlink size={16} />}
            onClick={() => onMove(project, "move")}
          >
            Déplacer
          </Menu.Item>
        )}
        {createTask && (
          <>
            <Menu.Divider />
            <Menu.Item
              leftSection={<IconSquarePlus size={16} />}
              onClick={() => onCreateTask(project)}
            >
              Créer une tâche
            </Menu.Item>
          </>
        )}
        {canDelete && (
          <>
            <Menu.Divider />
            <Menu.Item
              color={RED}
              leftSection={<IconTrash size={16} />}
              onClick={() => onDelete(project)}
            >
              Supprimer
            </Menu.Item>
          </>
        )}
      </Menu.Dropdown>
    </Menu>
  );
}

// Une ligne du tableau : le clic ouvre le projet, le clic droit demande le
// menu au tableau, qui l'ouvre au point cliqué.
//
// « active » est la ligne dont le menu est ouvert : elle garde le fond du
// survol, sinon le menu flotterait sans qu'on sache sur quel projet il porte
// dès que la souris quitte la ligne. La variable reprise est celle que Mantine
// pose pour son propre survol : même couleur, dans les deux thèmes.
interface ProjectRowProps {
  project: Project;
  active: boolean;
  /** Les colonnes montrées, dans l'ordre que le widget a réglé. */
  columns: (Column & { id: string })[];
  onEdit: (project: Project) => void;
  onContextMenu?: (project: Project, x: number, y: number) => void;
}

// Le contenu de chaque cellule, par colonne : la ligne les pose dans l'ordre
// des colonnes montrées.
const CELLS: Record<ColumnKey, (project: Project) => ReactNode> = {
  number: (project) => (
    <Table.Td style={{ whiteSpace: "nowrap" }}>
      {project.number > 0 && (
        <ReferenceTag
          reference={projectReference(project.number)}
          template={REFERENCE_TEMPLATE}
        />
      )}
    </Table.Td>
  ),
  name: (project) => (
    <Table.Td>
      {/* Même taille que le reste de la ligne : un « Text » sans taille prend
          le « md » de Mantine, alors que la table est en « sm ». */}
      <Text size="sm">{project.name}</Text>
    </Table.Td>
  ),
  context_name: (project) => (
    <Table.Td>
      {project.context_name ?? (
        <Text size="sm" c="dimmed">
          —
        </Text>
      )}
    </Table.Td>
  ),
  category_name: (project) => <Table.Td>{project.category_name}</Table.Td>,
  actors: (project) => (
    <Table.Td>
      <ActorAvatars actors={project.actors} />
    </Table.Td>
  ),
  created_at: (project) => <Table.Td>{formatDate(project.created_at)}</Table.Td>,
  updated_at: (project) => <Table.Td>{formatDate(project.updated_at)}</Table.Td>,
  labels: (project) => (
    <Table.Td>
      <LabelsCell labels={project.labels} />
    </Table.Td>
  ),
  status: (project) => (
    <Table.Td>
      <StatusCell status={project.status} />
    </Table.Td>
  ),
};

function ProjectRow({
  project,
  active,
  columns,
  onEdit,
  onContextMenu,
}: ProjectRowProps) {
  return (
    <Table.Tr
      onClick={() => onEdit(project)}
      onContextMenu={(e) => {
        // Sans menu — en modification, sans le droit de copier —, le clic
        // droit revient au menu du widget.
        if (!onContextMenu) return;
        // À la place du menu du navigateur, et de celui du widget qui porte
        // la liste.
        const { x, y } = menuPosition(e);
        onContextMenu(project, x, y);
      }}
      style={{
        cursor: "pointer",
        backgroundColor: active ? "var(--tr-hover-bg)" : undefined,
      }}
    >
      {columns.map((column) => (
        <Fragment key={column.id}>{CELLS[column.key](project)}</Fragment>
      ))}
    </Table.Tr>
  );
}

interface ProjectTableProps extends ProjectFiltersProps {
  /** La configuration du widget qui la porte : les colonnes montrées. */
  config?: unknown;
  projects: Project[];
  loading: boolean;
  onRowClick: (project: Project) => void;
  onMoveProject: (project: Project, mode: ProjectAction) => void;
  onDuplicateProject: (project: Project) => void;
  onDeleteProject: (project: Project) => void;
  /** « Créer une tâche », au menu contextuel d'un projet. */
  onCreateTask: (project: Project) => void;
  /** Sans lui — sans le droit d'ajouter un projet —, pas de ligne d'ajout. */
  onAddProject?: () => void;
  /** Les projets que la personne suit, pour la coche de « Suivre ». */
  followedIds: number[];
  onToggleFollow: (project: Project) => void;
}

export default function ProjectTable({
  config,
  projects,
  loading,
  onRowClick,
  onMoveProject,
  onDuplicateProject,
  onDeleteProject,
  onCreateTask,
  onAddProject,
  followedIds,
  onToggleFollow,
  categories,
  categoryFilter,
  onCategoryFilterChange,
  statusFilter,
  onStatusFilterChange,
  users,
  actorFilter,
  onActorFilterChange,
}: ProjectTableProps) {
  // Par défaut : les projets les plus avancés en premier.
  const [sort, setSort] = useState<Sort>({ key: "status", direction: "desc" });
  // Les colonnes que le widget montre, dans l'ordre réglé ; sans réglage,
  // toutes.
  // Une colonne peut revenir : « id » distingue chaque occurrence.
  const columns = keptColumns(PROJECT_COLUMNS, config).flatMap((c) => {
    const column = COLUMNS.find((col) => col.key === c.key);
    return column ? [{ ...column, id: c.id }] : [];
  });
  // Les largeurs par défaut du widget, tant que personne n'a tiré les
  // colonnes.
  const resize = useResizableColumns(
    "projets",
    columns.map((c) => c.id),
    defaultWidths(PROJECT_COLUMNS, config),
  );
  // Projet visé par le clic droit, et le point où le menu doit s'ouvrir.
  const [contextMenu, setContextMenu] = useState<ContextTarget | null>(null);
  const isEditing = useIsEditing();
  const canCopy = useRights()("projects", "create");

  const actorOptions: FilterOption[] = [
    { value: "all", label: "Tous" },
    ...users.map((u) => ({ value: String(u.id), label: u.name })),
  ];

  const categoryOptions: FilterOption[] = [
    { value: "all", label: "Toutes" },
    ...categories.map((c) => ({ value: String(c.id), label: c.name })),
  ];

  // Chaque colonne filtrable porte son entonnoir.
  const filterFor = (key: ColumnKey): ReactNode => {
    if (key === "category_name") {
      return (
        <ColumnFilter
          label="catégorie"
          options={categoryOptions}
          value={categoryFilter}
          onChange={onCategoryFilterChange}
        />
      );
    }
    if (key === "actors") {
      return (
        <ColumnFilter
          label="acteur"
          options={actorOptions}
          value={actorFilter}
          onChange={onActorFilterChange}
        />
      );
    }
    if (key === "status") {
      return (
        <ColumnFilter
          label="progression"
          options={STATUS_OPTIONS}
          value={statusFilter}
          onChange={onStatusFilterChange}
        />
      );
    }
    return null;
  };

  const handleSort = (key: ColumnKey) =>
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key, direction: key === "name" ? "asc" : "desc" },
    );

  const sorted = useMemo(() => {
    const column = COLUMNS.find((c) => c.key === sort.key);
    if (!column) return projects;
    const factor = sort.direction === "asc" ? 1 : -1;

    return [...projects].sort((a, b) => {
      const left = column.value(a);
      const right = column.value(b);
      // Valeurs absentes (pas de société, pas d'acteur, pas d'étiquette)
      // toujours en bas.
      if (left == null && right == null) return 0;
      if (left == null) return 1;
      if (right == null) return -1;
      if (typeof left === "number" && typeof right === "number")
        return (left - right) * factor;
      return (
        String(left).localeCompare(String(right), "fr", { numeric: true }) *
        factor
      );
    });
  }, [projects, sort]);

  // Sans projet à montrer, le tableau n'a plus de raison d'être : seul l'état
  // vide s'affiche. Il emporte alors de quoi défaire les filtres. Pendant une
  // lecture, on n'affiche rien plutôt qu'une conclusion prématurée.
  if (projects.length === 0) {
    return loading ? null : (
      <EmptyPanel
        icon={IconFolderOpen}
        message="Aucun projet"
        actionLabel="Nouveau projet"
        onAction={onAddProject}
        size="md"
      />
    );
  }

  return (
    <>
      {/* Une section plus étroite que la liste la fait défiler de côté. */}
      <GridScroll>
        <Table
          {...resize.tableProps}
          highlightOnHover
          verticalSpacing={0}
          // Les lignes font exactement la hauteur d'une pastille d'acteur, qu'il y
          // ait des acteurs ou non. L'entête suit la même mesure.
          styles={{
            // content-box : la hauteur décrit la zone de contenu, soit exactement
            // une pastille, sans que le padding ni la bordure la rognent.
            td: {
              boxSizing: "content-box",
              height: ACTOR_AVATAR_SIZE,
              paddingTop: ROW_PADDING_Y,
              paddingBottom: ROW_PADDING_Y,
            },
            th: {
              boxSizing: "content-box",
              height: ACTOR_AVATAR_SIZE,
              paddingTop: ROW_PADDING_Y,
              paddingBottom: ROW_PADDING_Y,
              // Le libellé, le tri et le filtre se calent au milieu de la cellule.
              verticalAlign: "middle",
            },
          }}
        >
          {resize.colgroup}
          <Table.Thead>
            <Table.Tr>
              {columns.map((column) => (
                <SortableTh
                  key={column.id}
                  column={column}
                  sort={sort}
                  onSort={handleSort}
                  filter={filterFor(column.key)}
                  handle={resize.handle(column.id)}
                  frozen={resize.colgroup !== null}
                />
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {sorted.map((project) => (
              <ProjectRow
                key={project.id}
                project={project}
                active={contextMenu?.project.id === project.id}
                columns={columns}
                onEdit={onRowClick}
                onContextMenu={
                  isEditing && !canCopy
                    ? undefined
                    : (project, x, y) => setContextMenu({ project: project, x, y })
                }
              />
            ))}

            {/* Dernière ligne du tableau : l'ajout d'un projet se fait là où la
                liste se termine, et non plus dans l'entête de l'application. Sans
                marge intérieure, le « + » s'aligne sur les noms de projets. Le fond
                explicite neutralise le survol du tableau : cette ligne n'est pas
                un projet, elle ne s'allume pas au passage de la souris, et la
                variante « transparent » du bouton n'a pas de fond au survol. */}
            {onAddProject && (
              <Table.Tr style={{ backgroundColor: "transparent" }}>
                <Table.Td colSpan={columns.length}>
                  <AddButton label="Ajouter un projet" onClick={onAddProject} />
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </GridScroll>

      {contextMenu && (
        <ProjectContextMenu
          target={contextMenu}
          onClose={() => setContextMenu(null)}
          onEdit={onRowClick}
          onMove={onMoveProject}
          onDuplicate={onDuplicateProject}
          onDelete={onDeleteProject}
          onCreateTask={onCreateTask}
          following={followedIds.includes(contextMenu.project.id)}
          onToggleFollow={onToggleFollow}
        />
      )}
    </>
  );
}

/** Ce que la page donne à la liste, hors de la configuration du widget. */
export type ProjectsList = Omit<ProjectTableProps, "config" | "projects" | "onAddProject"> & {
  /** « null » tant que les projets du tableau ne sont pas lus. */
  projects: Project[] | null;
  /** Un projet ajouté depuis un widget : sa clé de liste dit lequel. */
  onAddProject?: (listKey: string) => void;
};

/**
 * La liste des projets du tableau ouvert, telle que la page la met en scène :
 * le widget liste (project-indicators/liste.tsx) la lit ici, où qu'il soit
 * posé dans les sections.
 */
export const ProjectsListContext = createContext<ProjectsList | null>(null);

/**
 * La liste des projets en widget : ses colonnes viennent de sa configuration,
 * et elle ne montre que ses projets (lib/listes.ts). Un projet ajouté ici est
 * le sien.
 */
export function ProjectsListWidget({ config }: { config: unknown }) {
  const list = useContext(ProjectsListContext);
  const all = list?.projects ?? null;
  const projects = useMemo(() => all?.filter(inList(config)) ?? null, [all, config]);
  if (!list || !projects) return null;
  const { onAddProject } = list;
  return (
    <ProjectTable
      {...list}
      projects={projects}
      config={config}
      onAddProject={onAddProject && (() => onAddProject(listKey(config)))}
    />
  );
}
