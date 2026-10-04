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
import { keptColumns, defaultWidths } from "../ui/ColumnFields";
import EmptyPanel from "../ui/EmptyPanel";
import GridScroll from "../ui/GridScroll";
import LabelChip from "../ui/LabelChip";
import { menuPosition } from "../ui/PointMenu";
import { ReferenceTag } from "../ui/ReferenceTag";
import { useResizableColumns } from "../ui/useResizableColumns";
import { listKey, projectReference } from "@milo/shared";
import { inList } from "../../lib/lists";
import type { ReactNode } from "react";
import type { Category, Project, PublicUser } from "@milo/shared";
import type { ProjectAction } from "./MoveOrCopyProjectModal";
import { useRights } from "../../lib/rights";
import { useIsEditing } from "../../lib/editing";

/** A funnel option: "all" means "no filter". */
interface FilterOption {
  value: string;
  label: string;
}

/** What the table asks for its column funnels. */
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

/** The column keys: what is sorted on and what gets hidden. */
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
  /** The value the column is sorted on. */
  value: (p: Project) => string | number | null;
  width?: number;
}

interface Sort {
  key: ColumnKey;
  direction: "asc" | "desc";
}

/** The project targeted by the right-click, and the point where the menu should open. */
interface ContextTarget {
  project: Project;
  x: number;
  y: number;
}

// Vertical padding of the rows; the height includes the padding (box-sizing).
const ROW_PADDING_Y = 5;

// The "Progression" column is sized to its content: the bar and the
// percentage, plus the space between them.
const PROGRESS_WIDTH = 85;
const PERCENT_WIDTH = 40;
const STATUS_GAP = 10;
const STATUS_WIDTH = PROGRESS_WIDTH + PERCENT_WIDTH + STATUS_GAP;

// The longest reference expected: the tag takes its width.
const REFERENCE_TEMPLATE = projectReference(999);

const formatDate = (value: string): string =>
  dayjs(value).format("DD/MM/YYYY HH:mm");

const STATUS_OPTIONS: FilterOption[] = [
  { value: "all", label: "Tous" },
  { value: "in_progress", label: "En cours" },
  { value: "done", label: "Terminé" },
];

// A project's labels, on a single row. They are wider than the actor
// badges: beyond two, the count of the others replaces the list,
// otherwise the column would take the width of the most labeled
// project.
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

  // Heaviest first: the server orders them this way, the drawer's input
  // does not.
  const shown = [...labels]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, LABELS_SHOWN);
  const remaining = labels.length - shown.length;

  return (
    // Same fixed-height box as the actors: without it, the line box
    // adds half a pixel and the row becomes taller than the others.
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

// A neutral, gray bar: the list reads at a glance without each row
// shouting its color. The milestones' color shows in the project's details.
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
    // Sort on names; projects without actors go to the bottom.
    value: (p) =>
      p.actors?.length ? p.actors.map((a) => a.name).join(", ") : null,
  },
  { key: "created_at", label: "Date ajout", value: (p) => p.created_at },
  { key: "updated_at", label: "Date modification", value: (p) => p.updated_at },
  {
    key: "labels",
    // Sort on the heaviest label: the one the cell shows
    // first. Projects without labels go to the bottom.
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
 * The columns the list widget offers to show (Display in
 * widgets/project/list.tsx).
 */
export const PROJECT_COLUMNS: { key: ColumnKey; label: string }[] = COLUMNS.map(
  ({ key, label }) => ({ key, label: key === "number" ? "Référence" : label }),
);

// Beyond ten options — actors, quickly numerous —, the list scrolls.
// A menu row: its line of text, and its inset above and below.
const FILTER_VISIBLE_ROWS = 10;
const FILTER_ROW_HEIGHT =
  "(var(--mantine-font-size-sm) * var(--mantine-line-height) + var(--mantine-spacing-xs) / 1.5 * 2)";

// A column's filter. The funnel is colored while a value is selected,
// so a filtered table does not pass for an empty table.
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

// Sort and filter are two distinct controls: the sort button only
// covers the label, otherwise opening the filter would sort the column in passing.
interface SortableThProps {
  column: Column;
  sort: Sort;
  onSort: (key: ColumnKey) => void;
  filter: ReactNode;
  handle: ReactNode;
  /** Widths are frozen by a resize. */
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
      {/* In natural layout, a cell's width is only a wish:
          a squeezed grid brings it back to that of its content.
          The minimum set on the content holds it. */}
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

// A project's menu, opened on right-click and placed under the mouse: its anchor
// is an invisible point placed at the click's coordinates.
interface ProjectContextMenuProps {
  target: ContextTarget;
  onClose: () => void;
  onEdit: (project: Project) => void;
  onMove: (project: Project, mode: ProjectAction) => void;
  onDuplicate: (project: Project) => void;
  onDelete: (project: Project) => void;
  onCreateTask: (project: Project) => void;
  /** The person follows this project: they are notified of every change. */
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
  // What the menu offers follows the account's rights in the project's
  // company: whoever only reads finds only "Suivre".
  const can = useRights();
  const updateStatement = can("projects", "update");
  const add = can("projects", "create");
  const canDelete = can("projects", "delete");
  const createTask = can("tasks", "create");
  const isEditing = useIsEditing();

  // When editing, the menu only offers "Copier", which only works there:
  // the rest waits until editing is left.
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
        {/* Follow comes first, as in the project's drawer. The menu does
            not close, so the checkmark can be seen changing. */}
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
        {/* In place, no question asked: the copy opens right away in the
            drawer, to serve as a basis for another project. */}
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

// A table row: a click opens the project, a right-click asks the
// table for the menu, which opens at the clicked point.
//
// "active" is the row whose menu is open: it keeps the hover background,
// otherwise the menu would float without it being clear which project it applies to
// once the mouse leaves the row. The variable used is the one Mantine
// sets for its own hover: same color, in both themes.
interface ProjectRowProps {
  project: Project;
  active: boolean;
  /** The columns shown, in the order the widget has set. */
  columns: (Column & { id: string })[];
  onEdit: (project: Project) => void;
  onContextMenu?: (project: Project, x: number, y: number) => void;
}

// The content of each cell, by column: the row places them in the order
// of the columns shown.
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
      {/* Same size as the rest of the row: a "Text" without a size takes
          Mantine's "md", whereas the table is "sm". */}
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
        // Without a menu — when editing, without the right to copy —, right-click
        // goes back to the widget menu.
        if (!onContextMenu) return;
        // In place of the browser menu, and of the widget menu that holds
        // the list.
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
  /** The configuration of the widget that holds it: the columns shown. */
  config?: unknown;
  projects: Project[];
  loading: boolean;
  onRowClick: (project: Project) => void;
  onMoveProject: (project: Project, mode: ProjectAction) => void;
  onDuplicateProject: (project: Project) => void;
  onDeleteProject: (project: Project) => void;
  /** "Créer une tâche", in a project's context menu. */
  onCreateTask: (project: Project) => void;
  /** Without it — without the right to add a project —, no add row. */
  onAddProject?: () => void;
  /** The projects the person follows, for the "Suivre" checkmark. */
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
  // By default: the most advanced projects first.
  const [sort, setSort] = useState<Sort>({ key: "status", direction: "desc" });
  // The columns the widget shows, in the set order; without a setting,
  // all of them.
  // A column can come back: "id" distinguishes each occurrence.
  const columns = keptColumns(PROJECT_COLUMNS, config).flatMap((c) => {
    const column = COLUMNS.find((col) => col.key === c.key);
    return column ? [{ ...column, id: c.id }] : [];
  });
  // The widget's default widths, as long as nobody has dragged the
  // columns.
  const resize = useResizableColumns(
    "projects",
    columns.map((c) => c.id),
    defaultWidths(PROJECT_COLUMNS, config),
  );
  // Project targeted by the right-click, and the point where the menu should open.
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
      // Missing values (no company, no actor, no label)
      // always at the bottom.
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

  // With no project to show, the table has no reason to exist: only the empty
  // state is displayed. It then carries what is needed to undo the filters. During
  // a read, nothing is shown rather than a premature conclusion.
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
      {/* A section narrower than the list makes it scroll sideways. */}
      <GridScroll>
        <Table
          {...resize.tableProps}
          highlightOnHover
          verticalSpacing={0}
          // Rows are exactly the height of an actor badge, whether there
          // are actors or not. The header follows the same measure.
          styles={{
            // content-box: the height describes the content area, i.e. exactly
            // one badge, without the padding or border trimming it.
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
              // The label, sort and filter sit in the middle of the cell.
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

            {/* Last row of the table: adding a project happens where the
                list ends, and no longer in the application header. With no
                inner margin, the "+" aligns with the project names. The explicit
                background neutralizes the table's hover: this row is not
                a project, it does not light up when the mouse passes, and the
                button's "transparent" variant has no background on hover. */}
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

/** What the page gives the list, outside the widget's configuration. */
export type ProjectsList = Omit<ProjectTableProps, "config" | "projects" | "onAddProject"> & {
  /** "null" until the board's projects are read. */
  projects: Project[] | null;
  /** A project added from a widget: its list key says which one. */
  onAddProject?: (listKey: string) => void;
};

/**
 * The open board's project list, as the page stages it:
 * the list widget (widgets/project/list.tsx) reads it here, wherever it is
 * placed in the sections.
 */
export const ProjectsListContext = createContext<ProjectsList | null>(null);

/**
 * The project list as a widget: its columns come from its configuration,
 * and it only shows its own projects (lib/lists.ts). A project added here is
 * its own.
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
