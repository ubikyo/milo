import { Group, Select, Text } from "@mantine/core";
import { useState } from "react";
import { IconUser, IconUsersGroup } from "@tabler/icons-react";
import type { EntraPrincipal } from "@milo/shared";
import type { SelectProps } from "@mantine/core";

/** A principal's key in the list: a user and a group can share a name. */
const key = (p: EntraPrincipal) => `${p.type}:${p.id}`;

interface PrincipalSelectProps extends Omit<SelectProps, "value" | "onChange" | "data"> {
  /** Those that can be chosen: the users and groups with access to the workspace. */
  candidates: EntraPrincipal[];
  value: EntraPrincipal | null;
  onChange: (principal: EntraPrincipal | null) => void;
}

/**
 * A user or group picked from a given list — those with access to the
 * workspace, for a view's sharing — rather than searched in the directory
 * (DirectoryPicker). Same rows: the icon, the name, the address under it.
 */
export default function PrincipalSelect({
  candidates,
  value,
  onChange,
  ...props
}: PrincipalSelectProps) {
  // Closed when the field takes the focus — the row just added: the list only
  // opens on a click, when typing, or with the down arrow.
  const [opened, setOpened] = useState(false);
  // The chosen principal stays in the list, otherwise the field would empty.
  const all =
    value && !candidates.some((p) => key(p) === key(value)) ? [value, ...candidates] : candidates;
  const byKey = new Map(all.map((p) => [key(p), p]));

  return (
    <Select
      searchable
      data={all.map((p) => ({ value: key(p), label: p.name || p.email }))}
      value={value ? key(value) : null}
      onChange={(v) => onChange(v ? (byKey.get(v) ?? null) : null)}
      dropdownOpened={opened}
      onClick={() => setOpened(true)}
      onSearchChange={(search) => {
        if (search && search !== value?.name) setOpened(true);
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowDown") setOpened(true);
        if (e.key === "Escape") setOpened(false);
      }}
      onDropdownClose={() => setOpened(false)}
      nothingFoundMessage="Aucun utilisateur ni groupe de ce workspace"
      renderOption={({ option }) => {
        const p = byKey.get(option.value);
        const Icon = p?.type === "group" ? IconUsersGroup : IconUser;
        return (
          <Group gap="xs" wrap="nowrap" style={{ width: "100%" }}>
            <Icon size={16} style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <Text size="sm" truncate>
                {option.label}
              </Text>
              {p?.email && (
                <Text size="xs" c="dimmed" truncate>
                  {p.email}
                </Text>
              )}
            </div>
          </Group>
        );
      }}
      {...props}
    />
  );
}
