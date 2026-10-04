import { Group, Select, Text } from "@mantine/core";
import { IconUser, IconUsersGroup } from "@tabler/icons-react";
import DirectoryOrigin from "../ui/DirectoryOrigin";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { errorMessage } from "../../lib/errors";
import type { EntraPrincipal } from "@milo/shared";
import type { SelectProps } from "@mantine/core";

// The time to let typing finish before querying the directory.
const WAITING = 300;

/** A principal's key in the list: a user and a group can share a name. */
const key = (p: EntraPrincipal) => `${p.type}:${p.id}`;

interface DirectoryPickerProps extends Omit<
  SelectProps,
  "value" | "onChange" | "data" | "searchValue" | "onSearchChange"
> {
  value: EntraPrincipal | null;
  onChange: (principal: EntraPrincipal | null) => void;
  /** Search only for groups: that of the administrators. */
  groupsOnly?: boolean;
  /**
   * Restart from an empty field after each choice: the access add row,
   * ready for the next.
   */
  resetOnSelect?: boolean;
}

/**
 * A user or group from the Entra directory, searched while typing
 * — two characters at least. What Microsoft answers on failure
 * (missing permission, for example) is displayed in place of the results.
 */
export default function DirectoryPicker({
  value,
  onChange,
  groupsOnly = false,
  resetOnSelect = false,
  ...props
}: DirectoryPickerProps) {
  const [search, setSearch] = useState("");
  const [matches, setFound] = useState<EntraPrincipal[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ongoing, setInProgress] = useState(false);
  // The list only opens once something is typed: an empty field has nothing
  // to offer but a prompt.
  const [opened, setOpened] = useState(false);
  const typing = search.trim() !== "" && search !== value?.name;

  useEffect(() => {
    const term = search.trim();
    // The field shows the chosen principal's name: it is not a search.
    if (term.length < 2 || term === value?.name) {
      setFound([]);
      return undefined;
    }
    let abandoned = false;
    const timeout = window.setTimeout(() => {
      setInProgress(true);
      api
        .searchDirectory(term, groupsOnly)
        .then((list) => {
          if (abandoned) return;
          setFound(list);
          setError(null);
        })
        .catch((e) => {
          if (!abandoned) setError(errorMessage(e));
        })
        .finally(() => {
          if (!abandoned) setInProgress(false);
        });
    }, WAITING);
    return () => {
      abandoned = true;
      window.clearTimeout(timeout);
    };
  }, [search, groupsOnly, value?.name]);

  // The chosen principal stays in the list, otherwise the field would empty.
  const all =
    value && !matches.some((p) => key(p) === key(value))
      ? [value, ...matches]
      : matches;
  const byKey = new Map(all.map((p) => [key(p), p]));

  return (
    <Select
      searchable
      data={all.map((p) => ({ value: key(p), label: p.name || p.email }))}
      value={value ? key(value) : null}
      onChange={(v) => {
        onChange(v ? (byKey.get(v) ?? null) : null);
        // Mantine puts the chosen name in the field just afterwards: we clear it
        // behind it.
        if (v && resetOnSelect) window.setTimeout(() => setSearch(""), 0);
      }}
      searchValue={search}
      onSearchChange={setSearch}
      dropdownOpened={opened && typing}
      onDropdownOpen={() => setOpened(true)}
      onDropdownClose={() => setOpened(false)}
      // The directory has already filtered: the list does not filter again behind it.
      filter={({ options }) => options}
      nothingFoundMessage={
        error ??
        (ongoing
          ? "Recherche…"
          : search.trim().length < 2
            ? "Tapez au moins deux caractères"
            : "Aucun résultat")
      }
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
            {/* The account's origin, on the right: two accounts with the same name and
                the same address can thus be told apart. */}
            {p && <DirectoryOrigin synced={p.synced} />}
          </Group>
        );
      }}
      {...props}
    />
  );
}
