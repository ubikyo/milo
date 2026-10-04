import { Group, Text, TagsInput } from "@mantine/core";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { FIELD_BG } from "../ui/RichText";
import type { DirectoryUser } from "@milo/shared";

// Une ligne « CC » ou « CCI » d'une réponse : les adresses retenues en tags,
// chacun avec sa croix, et un champ qui cherche dans l'annuaire Entra. Une
// adresse externe se tape telle quelle, et Entrée, la virgule ou le
// point-virgule la posent.

const SEARCH_DELAY = 300;
const SEARCH_MIN = 2;

/** Une adresse e-mail, à peu près : de quoi écarter une faute de frappe. */
export const isAddress = (text: string): boolean =>
  /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(text.trim());

/** La largeur du libellé : « CC » et « CCI » alignent leur champ. */
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

  // Les personnes de l'annuaire, par leur adresse : c'est elle que le tag
  // porte, et elle qui part dans l'e-mail. Une adresse n'y figure qu'une
  // fois : l'annuaire peut rendre deux fiches pour la même, et la liste de
  // Mantine refuse — en faisant tomber la page — deux options de même valeur.
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
      // Le fond du reste de l'éditeur : la ligne en fait partie.
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
        // Seules les adresses bien formées deviennent des tags : un nom tapé
        // sans choisir la personne dans la liste ne part nulle part.
        onChange={(tags) =>
          onChange([...new Set(tags.map((t) => t.trim().toLowerCase()).filter(isAddress))])
        }
        searchValue={search}
        onSearchChange={setSearch}
        data={suggestions}
        // L'annuaire a déjà cherché : la liste ne se refiltre pas sur ce qu'on tape.
        filter={({ options }) => options}
        splitChars={[",", ";", " "]}
        clearable={false}
        comboboxProps={{ withinPortal: true }}
      />
    </Group>
  );
}
