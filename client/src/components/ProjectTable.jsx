import {
  Badge,
  Button,
  Center,
  Group,
  Progress,
  Stack,
  Table,
  Text,
  ThemeIcon,
  UnstyledButton,
} from "@mantine/core";
import { IconChevronDown, IconChevronUp, IconFolderOpen, IconPlus, IconSelector } from "@tabler/icons-react";
import { useMemo, useState } from "react";
import dayjs from "dayjs";

const formatDate = (value) => dayjs(value).format("DD/MM/YYYY HH:mm");

function StatusCell({ status }) {
  const isDone = status >= 100;
  return (
    <Group gap="xs" wrap="nowrap">
      <Progress
        value={status}
        color={isDone ? "teal" : "blue"}
        size="lg"
        radius="xl"
        style={{ flex: 1, minWidth: 100 }}
      />
      <Text size="sm" w={40} ta="right">
        {status}%
      </Text>
      <Badge color={isDone ? "teal" : "blue"} variant="light">
        {isDone ? "Terminé" : "En cours"}
      </Badge>
    </Group>
  );
}

function EmptyState({ filtered, onAddProject }) {
  return (
    <Stack align="center" gap="md" py={80}>
      <ThemeIcon size={64} radius="xl" variant="light" color="gray">
        <IconFolderOpen size={32} />
      </ThemeIcon>
      <Stack align="center" gap={4}>
        <Text fw={600} size="lg">
          {filtered ? "Aucun projet ne correspond à ces filtres" : "Aucun projet pour le moment"}
        </Text>
        <Text size="sm" c="dimmed" ta="center">
          {filtered
            ? "Modifiez les filtres ou créez un nouveau projet."
            : "Créez votre premier projet pour commencer à suivre son avancement."}
        </Text>
      </Stack>
      <Button color="teal" leftSection={<IconPlus size={18} />} onClick={onAddProject}>
        Nouveau projet
      </Button>
    </Stack>
  );
}

const COLUMNS = [
  { key: "name", label: "Projet", value: (p) => p.name },
  { key: "company_name", label: "Société", value: (p) => p.company_name },
  { key: "building_name", label: "Bâtiment", value: (p) => p.building_name },
  { key: "category_name", label: "Catégorie", value: (p) => p.category_name },
  { key: "created_at", label: "Date ajout", value: (p) => p.created_at },
  { key: "updated_at", label: "Date modification", value: (p) => p.updated_at },
  { key: "status", label: "Statut", value: (p) => p.status, width: 320 },
];

function SortableTh({ column, sort, onSort }) {
  const active = sort.key === column.key;
  const Icon = !active ? IconSelector : sort.direction === "asc" ? IconChevronUp : IconChevronDown;

  return (
    <Table.Th w={column.width}>
      <UnstyledButton onClick={() => onSort(column.key)} w="100%">
        <Group gap={4} wrap="nowrap" justify="space-between">
          <Text size="sm" fw={600}>
            {column.label}
          </Text>
          <Center c={active ? undefined : "dimmed"}>
            <Icon size={14} />
          </Center>
        </Group>
      </UnstyledButton>
    </Table.Th>
  );
}

export default function ProjectTable({ projects, filtered, onRowClick, onAddProject }) {
  // Par défaut : les projets les plus avancés en premier.
  const [sort, setSort] = useState({ key: "status", direction: "desc" });

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

  if (projects.length === 0) {
    return <EmptyState filtered={filtered} onAddProject={onAddProject} />;
  }

  return (
    <Table highlightOnHover verticalSpacing="sm">
      <Table.Thead>
        <Table.Tr>
          {COLUMNS.map((column) => (
            <SortableTh key={column.key} column={column} sort={sort} onSort={handleSort} />
          ))}
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {sorted.map((project) => (
          <Table.Tr key={project.id} onClick={() => onRowClick(project)} style={{ cursor: "pointer" }}>
            <Table.Td>
              <Text fw={500}>{project.name}</Text>
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
            <Table.Td>{formatDate(project.created_at)}</Table.Td>
            <Table.Td>{formatDate(project.updated_at)}</Table.Td>
            <Table.Td>
              <StatusCell status={project.status} />
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}
