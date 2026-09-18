import { Badge, Group, Progress, Table, Text } from "@mantine/core";
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

export default function ProjectTable({ projects, loading, onRowClick }) {
  if (!loading && projects.length === 0) {
    return (
      <Text c="dimmed" ta="center" py="xl">
        Aucun projet ne correspond à ces filtres.
      </Text>
    );
  }

  return (
    <Table highlightOnHover verticalSpacing="sm">
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Projet</Table.Th>
          <Table.Th>Catégorie</Table.Th>
          <Table.Th>Date ajout</Table.Th>
          <Table.Th>Date modification</Table.Th>
          <Table.Th w={320}>Statut</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {projects.map((project) => (
          <Table.Tr
            key={project.id}
            onClick={() => onRowClick(project)}
            style={{ cursor: "pointer" }}
          >
            <Table.Td>
              <Text fw={500}>{project.name}</Text>
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
