import { ActionIcon, Group, Select, Title } from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";

const STATUS_OPTIONS = [
  { value: "all", label: "Tous" },
  { value: "in_progress", label: "En cours" },
  { value: "done", label: "Terminé" },
];

export default function Header({
  categories,
  categoryFilter,
  onCategoryFilterChange,
  statusFilter,
  onStatusFilterChange,
  onAddProject,
}) {
  const categoryOptions = [
    { value: "all", label: "Toutes" },
    ...categories.map((c) => ({ value: String(c.id), label: c.name })),
  ];

  return (
    <Group
      justify="space-between"
      px="xl"
      py="md"
      style={{ borderBottom: "1px solid var(--mantine-color-gray-3)" }}
    >
      <Title order={3}>Milo</Title>

      <Group>
        <Select
          label="Catégorie"
          data={categoryOptions}
          value={categoryFilter}
          onChange={(value) => onCategoryFilterChange(value ?? "all")}
          allowDeselect={false}
          w={180}
        />
        <Select
          label="Statut"
          data={STATUS_OPTIONS}
          value={statusFilter}
          onChange={(value) => onStatusFilterChange(value ?? "all")}
          allowDeselect={false}
          w={180}
        />
        <ActionIcon
          variant="filled"
          size="lg"
          color="blue"
          mt={24}
          aria-label="Ajouter un projet"
          onClick={onAddProject}
        >
          <IconPlus size={18} />
        </ActionIcon>
      </Group>
    </Group>
  );
}
