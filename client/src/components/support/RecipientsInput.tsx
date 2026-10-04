import { Group, Text, TagsInput } from "@mantine/core";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { FIELD_BG } from "../ui/RichText";
import type { DirectoryUser } from "@milo/shared";

// A "CC" or "CCI" row of a reply: the retained addresses as tags,
// each with its cross, and a field that searches the Entra directory. An
// external address is typed as is, and Enter, comma or
// semicolon commits it.

const SEARCH_DELAY = 300;
const SEARCH_MIN = 2;

/** An e-mail address, roughly: enough to rule out a typo. */
export const isAddress = (text: string): boolean =>
  /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(text.trim());

/** The label's width: "CC" and "CCI" align their field. */
const LABEL_WIDTH = 36;

interface RecipientsInputProps {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
}

export default function RecipientsInput({ label, value, onChange }: RecipientsInputProps) {
  const [search, setSearch] = useState("");
  const [directory, setDirectory] = useState<DirectoryUser[]>([]);

  useEffect(() => {
    const term = search.trim();
    if (term.length < SEARCH_MIN || isAddress(term)) {
      setDirectory([]);
      return;
    }
    let cancelled = false;
    const timeout = setTimeout(() => {
      api
        .searchDirectoryUsers(term)
        .then((matches) => !cancelled && setDirectory(matches.filter((p) => p.email)))
        .catch(() => !cancelled && setDirectory([]));
    }, SEARCH_DELAY);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [search]);

  // The people in the directory, by address: it is what the tag
  // carries, and what goes into the e-mail. An address appears only once
  // there: the directory may return two records for the same one, and Mantine's
  // list refuses — crashing the page — two options with the same value.
  const suggestions = [
    ...new Map(
      directory
        .map((p) => ({ value: p.email.toLowerCase(), label: `${p.name} <${p.email}>` }))
        .filter((o) => !value.includes(o.value))
        .map((o) => [o.value, o] as const),
    ).values(),
  ];

  return (
    <Group
      gap="xs"
      wrap="nowrap"
      px="xs"
      py={4}
      // The background of the rest of the editor: the row is part of it.
      style={{
        backgroundColor: FIELD_BG,
        borderBottom: "1px solid light-dark(var(--mantine-color-gray-4), var(--mantine-color-dark-4))",
      }}
    >
      <Text size="sm" fw={600} c="dimmed" w={LABEL_WIDTH} style={{ flexShrink: 0 }}>
        {label}
      </Text>
      <TagsInput
        variant="unstyled"
        size="sm"
        style={{ flex: 1, minWidth: 0 }}
        aria-label={label}
        placeholder={value.length ? undefined : "Nom ou adresse e-mail"}
        value={value}
        // Only well-formed addresses become tags: a name typed
        // without choosing the person in the list goes nowhere.
        onChange={(tags) =>
          onChange([...new Set(tags.map((t) => t.trim().toLowerCase()).filter(isAddress))])
        }
        searchValue={search}
        onSearchChange={setSearch}
        data={suggestions}
        // The directory has already searched: the list is not re-filtered on what is typed.
        filter={({ options }) => options}
        splitChars={[",", ";", " "]}
        clearable={false}
        comboboxProps={{ withinPortal: true }}
      />
    </Group>
  );
}
