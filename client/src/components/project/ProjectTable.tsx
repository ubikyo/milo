import {
  ActionIcon,
  Center,
  Group,
  Menu,
  Progress,
  Table,
  Text,
  UnstyledButton,
} from "@mantine/core";
import {
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconFilter,
  IconFolderOpen,
  IconFolderSymlink,
  IconPencil,
  IconSelector,
  IconTrash,
} from "@tabler/icons-react";
import { useMediaQuery } from "@mantine/hooks";
import { useMemo, useState } from "react";
import dayjs from "dayjs";
import { RED, statusColor } from "../../themes/colors";
import ActorAvatars, { ACTOR_AVATAR_SIZE } from "../ui/ActorAvatars";
import AddButton from "../ui/AddButton";
import EmptyPanel from "../ui/EmptyPanel";
import LabelChip from "../ui/LabelChip";
import type { ReactNode } from "react";
import type { Category, Project, PublicUser } from "@milo/shared";

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
  | "name"
  | "company_name"
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

const formatDate = (value: string): string => dayjs(value).format("DD/MM/YYYY HH:mm");

// Les dates s'effacent l'une après l'autre à mesure que la fenêtre se
// resserre, la moins regardée d'abord : « Date modification » en dessous de
// 1355px, puis « Date ajout » en dessous de 1200px. Les colonnes qui restent y
// gagnent leur aise.
const DATE_WINDOWS = {
  updated_at: "(min-width: 1355px)",
  created_at: "(min-width: 1200px)",
} as const;

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

  const montrees = labels.slice(0, LABELS_SHOWN);
  const restantes = labels.length - montrees.length;

  return (
    // Même boîte de hauteur fixe que les acteurs : sans elle, la line-box
    // ajoute un demi-pixel et la ligne devient plus haute que les autres.
    <div style={{ height: ACTOR_AVATAR_SIZE, display: "flex", alignItems: "center", overflow: "hidden" }}>
      <Group gap={4} wrap="nowrap">
        {montrees.map((label) => (
          <LabelChip key={label.id} label={label} size="xs" height={LABEL_HEIGHT} />
        ))}
        {restantes > 0 && (
          <Text size="xs" c="dimmed">
            +{restantes}
          </Text>
        )}
      </Group>
    </div>
  );
}

function StatusCell({ status }: { status: number }) {
  return (
    <Group gap={STATUS_GAP} wrap="nowrap">
      <Progress
        value={status}
        color={statusColor(status)}
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
  { key: "name", label: "Projet", value: (p) => p.name },
  { key: "company_name", label: "Société", value: (p) => p.company_name },
  { key: "category_name", label: "Catégorie", value: (p) => p.category_name },
  {
    key: "actors",
    label: "Acteurs",
    // Tri sur les noms ; les projets sans acteur passent en bas.
    value: (p) => (p.actors?.length ? p.actors.map((a) => a.name).join(", ") : null),
  },
  { key: "created_at", label: "Date ajout", value: (p) => p.created_at },
  { key: "updated_at", label: "Date modification", value: (p) => p.updated_at },
  {
    key: "labels",
    // Tri sur les noms ; les projets sans étiquette passent en bas.
    label: "Étiquettes",
    value: (p) => (p.labels?.length ? p.labels.map((l) => l.name).join(", ") : null),
  },
  { key: "status", label: "Progression", value: (p) => p.status, width: STATUS_WIDTH },
];

// Filtre d'une colonne. L'entonnoir se colore tant qu'une valeur est retenue,
// pour qu'un tableau filtré ne passe pas pour un tableau vide.
interface ColumnFilterProps {
  label: string;
  options: FilterOption[];
  value: string;
  onChange: (value: string) => void;
}

function ColumnFilter({ label, options, value, onChange }: ColumnFilterProps) {
  const actif = value !== "all";

  return (
    <Menu position="bottom-end" withinPortal shadow="md">
      <Menu.Target>
        <ActionIcon
          variant={actif ? "light" : "subtle"}
          color={actif ? "teal" : "gray"}
          size="sm"
          aria-label={`Filtrer par ${label}`}
        >
          <IconFilter size={14} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        {options.map((option) => (
          <Menu.Item
            key={option.value}
            onClick={() => onChange(option.value)}
            leftSection={
              option.value === value ? <IconCheck size={14} /> : <span style={{ width: 14 }} />
            }
          >
            {option.label}
          </Menu.Item>
        ))}
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
}

function SortableTh({ column, sort, onSort, filter }: SortableThProps) {
  const active = sort.key === column.key;
  const Icon = !active ? IconSelector : sort.direction === "asc" ? IconChevronUp : IconChevronDown;

  return (
    <Table.Th w={column.width}>
      <Group gap={4} wrap="nowrap">
        <UnstyledButton onClick={() => onSort(column.key)} style={{ flex: 1, minWidth: 0 }}>
          <Group gap={4} wrap="nowrap" justify="space-between">
            <Text size="sm" fw={600}>
              {column.label}
            </Text>
            <Center c={active ? undefined : "dimmed"}>
              <Icon size={14} />
            </Center>
          </Group>
        </UnstyledButton>
        {filter}
      </Group>
    </Table.Th>
  );
}

// Menu d'un projet, ouvert au clic droit et posé sous la souris : son ancre
// est un point invisible placé aux coordonnées du clic.
interface ProjectContextMenuProps {
  target: ContextTarget;
  onClose: () => void;
  onEdit: (project: Project) => void;
  onMove: (project: Project) => void;
  onDelete: (project: Project) => void;
}

function ProjectContextMenu({
  target,
  onClose,
  onEdit,
  onMove,
  onDelete,
}: ProjectContextMenuProps) {
  const { project, x, y } = target;

  return (
    <Menu
      opened
      onChange={(ouvert) => !ouvert && onClose()}
      position="bottom-start"
      withinPortal
      shadow="md"
    >
      <Menu.Target>
        <div style={{ position: "fixed", left: x, top: y, width: 1, height: 1 }} />
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item leftSection={<IconPencil size={16} />} onClick={() => onEdit(project)}>
          Modifier
        </Menu.Item>
        <Menu.Item leftSection={<IconFolderSymlink size={16} />} onClick={() => onMove(project)}>
          Déplacer
        </Menu.Item>
        <Menu.Divider />
        <Menu.Item
          color={RED}
          leftSection={<IconTrash size={16} />}
          onClick={() => onDelete(project)}
        >
          Supprimer
        </Menu.Item>
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
  masquees: Set<ColumnKey>;
  onEdit: (project: Project) => void;
  onContextMenu: (project: Project, x: number, y: number) => void;
}

function ProjectRow({
  project,
  active,
  masquees,
  onEdit,
  onContextMenu,
}: ProjectRowProps) {
  return (
    <Table.Tr
      onClick={() => onEdit(project)}
      onContextMenu={(e) => {
        // À la place du menu du navigateur.
        e.preventDefault();
        onContextMenu(project, e.clientX, e.clientY);
      }}
      style={{ cursor: "pointer", backgroundColor: active ? "var(--tr-hover-bg)" : undefined }}
    >
      <Table.Td>
        {/* Même taille que le reste de la ligne : un « Text » sans taille prend
            le « md » de Mantine, alors que la table est en « sm ». */}
        <Text size="sm">{project.name}</Text>
      </Table.Td>
      <Table.Td>
        {project.company_name ?? (
          <Text size="sm" c="dimmed">
            —
          </Text>
        )}
      </Table.Td>
      <Table.Td>{project.category_name}</Table.Td>
      <Table.Td>
        <ActorAvatars actors={project.actors} />
      </Table.Td>
      {!masquees.has("created_at") && (
        <Table.Td>{formatDate(project.created_at)}</Table.Td>
      )}
      {!masquees.has("updated_at") && (
        <Table.Td>{formatDate(project.updated_at)}</Table.Td>
      )}
      <Table.Td>
        <LabelsCell labels={project.labels} />
      </Table.Td>
      <Table.Td>
        <StatusCell status={project.status} />
      </Table.Td>
    </Table.Tr>
  );
}

interface ProjectTableProps extends ProjectFiltersProps {
  projects: Project[];
  loading: boolean;
  onRowClick: (project: Project) => void;
  onMoveProject: (project: Project) => void;
  onDeleteProject: (project: Project) => void;
  onAddProject: () => void;
}

export default function ProjectTable({
  projects,
  loading,
  onRowClick,
  onMoveProject,
  onDeleteProject,
  onAddProject,
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
  // La fenêtre laisse-t-elle la place à chacune des dates ? Sans
  // « getInitialValueInEffect: false », le premier rendu répondrait toujours
  // oui et les colonnes apparaîtraient le temps d'un souffle avant de s'en
  // aller.
  const options = { getInitialValueInEffect: false };
  const placePourModification = useMediaQuery(DATE_WINDOWS.updated_at, undefined, options);
  const placePourAjout = useMediaQuery(DATE_WINDOWS.created_at, undefined, options);
  const masquees = new Set<ColumnKey>(
    ([
      placePourModification ? null : "updated_at",
      placePourAjout ? null : "created_at",
    ] as (ColumnKey | null)[]).filter((c): c is ColumnKey => c !== null),
  );
  const colonnes = COLUMNS.filter((c) => !masquees.has(c.key));
  // Projet visé par le clic droit, et le point où le menu doit s'ouvrir.
  const [contextMenu, setContextMenu] = useState<ContextTarget | null>(null);

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
      if (typeof left === "number" && typeof right === "number") return (left - right) * factor;
      return String(left).localeCompare(String(right), "fr", { numeric: true }) * factor;
    });
  }, [projects, sort]);

  // Sans projet à montrer, le tableau n'a plus de raison d'être : seul l'état
  // vide s'affiche. Il emporte alors de quoi défaire les filtres. Pendant une
  // lecture, on n'affiche rien plutôt qu'une conclusion prématurée.
  if (projects.length === 0) {
    return loading ? null : (
      <EmptyPanel
        icon={IconFolderOpen}
        message="Aucun projet pour cette entité"
        actionLabel="Nouveau projet"
        onAction={onAddProject}
      />
    );
  }

  return (
    <>
      <Table
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
        <Table.Thead>
          <Table.Tr>
            {colonnes.map((column) => (
              <SortableTh
                key={column.key}
                column={column}
                sort={sort}
                onSort={handleSort}
                filter={filterFor(column.key)}
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
              masquees={masquees}
              onEdit={onRowClick}
              onContextMenu={(projet, x, y) => setContextMenu({ project: projet, x, y })}
            />
          ))}

          {/* Dernière ligne du tableau : l'ajout d'un projet se fait là où la
              liste se termine, et non plus dans l'entête de l'application. Sans
              marge intérieure, le « + » s'aligne sur les noms de projets. Le fond
              explicite neutralise le survol du tableau : cette ligne n'est pas
              un projet, elle ne s'allume pas au passage de la souris, et la
              variante « transparent » du bouton n'a pas de fond au survol. */}
          <Table.Tr style={{ backgroundColor: "transparent" }}>
            <Table.Td colSpan={COLUMNS.length}>
              <AddButton label="Ajouter un projet" onClick={onAddProject} />
            </Table.Td>
          </Table.Tr>
        </Table.Tbody>
      </Table>

      {contextMenu && (
        <ProjectContextMenu
          target={contextMenu}
          onClose={() => setContextMenu(null)}
          onEdit={onRowClick}
          onMove={onMoveProject}
          onDelete={onDeleteProject}
        />
      )}
    </>
  );
}
