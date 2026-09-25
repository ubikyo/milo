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
import ActorAvatars, { ACTOR_AVATAR_SIZE } from "../ui/ActorAvatars.jsx";
import AddButton from "../ui/AddButton.jsx";
import EmptyPanel from "../ui/EmptyPanel.jsx";

// Padding vertical des lignes ; la hauteur inclut le padding (box-sizing).
const ROW_PADDING_Y = 5;

// La colonne « Progression » est taillée sur son contenu : la barre et le
// pourcentage, plus l'espace qui les sépare.
const PROGRESS_WIDTH = 85;
const PERCENT_WIDTH = 40;
const STATUS_GAP = 10;
const STATUS_WIDTH = PROGRESS_WIDTH + PERCENT_WIDTH + STATUS_GAP;

const formatDate = (value) => dayjs(value).format("DD/MM/YYYY HH:mm");

// Les dates s'effacent l'une après l'autre à mesure que la fenêtre se
// resserre, la moins regardée d'abord : « Date modification » en dessous de
// 1355px, puis « Date ajout » en dessous de 1200px. Les colonnes qui restent y
// gagnent leur aise.
const DATE_WINDOWS = {
  updated_at: "(min-width: 1355px)",
  created_at: "(min-width: 1200px)",
};

const STATUS_OPTIONS = [
  { value: "all", label: "Tous" },
  { value: "in_progress", label: "En cours" },
  { value: "done", label: "Terminé" },
];

function StatusCell({ status }) {
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

const COLUMNS = [
  { key: "name", label: "Projet", value: (p) => p.name },
  { key: "company_name", label: "Société", value: (p) => p.company_name },
  { key: "building_name", label: "Bâtiment", value: (p) => p.building_name },
  { key: "category_name", label: "Catégorie", value: (p) => p.category_name },
  {
    key: "actors",
    label: "Acteurs",
    // Tri sur les noms ; les projets sans acteur passent en bas.
    value: (p) => (p.actors?.length ? p.actors.map((a) => a.name).join(", ") : null),
  },
  { key: "created_at", label: "Date ajout", value: (p) => p.created_at },
  { key: "updated_at", label: "Date modification", value: (p) => p.updated_at },
  { key: "status", label: "Progression", value: (p) => p.status, width: STATUS_WIDTH },
];

// Filtre d'une colonne. L'entonnoir se colore tant qu'une valeur est retenue,
// pour qu'un tableau filtré ne passe pas pour un tableau vide.
function ColumnFilter({ label, options, value, onChange }) {
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
function SortableTh({ column, sort, onSort, filter }) {
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
function ProjectContextMenu({ target, onClose, onEdit, onMove, onDelete }) {
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
function ProjectRow({ project, active, masquees, onEdit, onContextMenu }) {
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
      <Table.Td>
        {project.building_name ?? (
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
        <StatusCell status={project.status} />
      </Table.Td>
    </Table.Tr>
  );
}

export default function ProjectTable({
  projects,
  loading,
  onRowClick,
  onMoveProject,
  onDeleteProject,
  onAddProject,
  companyFilter,
  buildings,
  buildingFilter,
  onBuildingFilterChange,
  categories,
  categoryFilter,
  onCategoryFilterChange,
  statusFilter,
  onStatusFilterChange,
  users,
  actorFilter,
  onActorFilterChange,
}) {
  // Par défaut : les projets les plus avancés en premier.
  const [sort, setSort] = useState({ key: "status", direction: "desc" });
  // La fenêtre laisse-t-elle la place à chacune des dates ? Sans
  // « getInitialValueInEffect: false », le premier rendu répondrait toujours
  // oui et les colonnes apparaîtraient le temps d'un souffle avant de s'en
  // aller.
  const options = { getInitialValueInEffect: false };
  const placePourModification = useMediaQuery(DATE_WINDOWS.updated_at, undefined, options);
  const placePourAjout = useMediaQuery(DATE_WINDOWS.created_at, undefined, options);
  const masquees = new Set(
    [
      !placePourModification && "updated_at",
      !placePourAjout && "created_at",
    ].filter(Boolean),
  );
  const colonnes = COLUMNS.filter((c) => !masquees.has(c.key));
  // Projet visé par le clic droit, et le point où le menu doit s'ouvrir.
  const [contextMenu, setContextMenu] = useState(null);

  // Quand une société est choisie, on ne propose que ses bâtiments.
  const buildingOptions = [
    { value: "all", label: "Tous les bâtiments" },
    ...buildings
      .filter((b) => companyFilter === "all" || String(b.company_id) === companyFilter)
      .map((b) => ({
        value: String(b.id),
        label: companyFilter === "all" ? `${b.name} — ${b.company_name}` : b.name,
      })),
  ];

  const actorOptions = [
    { value: "all", label: "Tous" },
    ...users.map((u) => ({ value: String(u.id), label: u.name })),
  ];

  const categoryOptions = [
    { value: "all", label: "Toutes" },
    ...categories.map((c) => ({ value: String(c.id), label: c.name })),
  ];

  // Chaque colonne filtrable porte son entonnoir.
  const filterFor = (key) => {
    if (key === "building_name") {
      return (
        <ColumnFilter
          label="bâtiment"
          options={buildingOptions}
          value={buildingFilter}
          onChange={onBuildingFilterChange}
        />
      );
    }
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

  const handleSort = (key) =>
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
      // Valeurs absentes (pas de société, pas de bâtiment) toujours en bas.
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
