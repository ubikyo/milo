import { Group, Select, Text } from "@mantine/core";
import { IconUser, IconUsersGroup } from "@tabler/icons-react";
import DirectoryOrigin from "../ui/DirectoryOrigin";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { errorMessage } from "../../lib/errors";
import type { EntraPrincipal } from "@milo/shared";
import type { SelectProps } from "@mantine/core";

// Le temps de laisser finir la frappe avant d'interroger l'annuaire.
const WAITING = 300;

/** La clé d'un principal dans la liste : un utilisateur et un groupe peuvent partager un nom. */
const key = (p: EntraPrincipal) => `${p.type}:${p.id}`;

interface DirectoryPickerProps extends Omit<
  SelectProps,
  "value" | "onChange" | "data" | "searchValue" | "onSearchChange"
> {
  value: EntraPrincipal | null;
  onChange: (principal: EntraPrincipal | null) => void;
  /** Ne chercher que des groupes : celui des administrateurs. */
  groupsOnly?: boolean;
  /**
   * Repartir d'un champ vide après chaque choix : la ligne d'ajout des accès,
   * prête pour le suivant.
   */
  resetOnSelect?: boolean;
}

/**
 * Un utilisateur ou un groupe de l'annuaire Entra, cherché pendant la frappe
 * — deux caractères au moins. Ce que Microsoft répond en cas d'échec
 * (permission manquante, par exemple) s'affiche à la place des résultats.
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

  useEffect(() => {
    const term = search.trim();
    // Le champ affiche le nom du principal choisi : ce n'est pas une recherche.
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

  // Le principal choisi reste dans la liste, sans quoi le champ se viderait.
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
        // Mantine pose le nom choisi dans le champ juste après : on l'efface
        // derrière lui.
        if (v && resetOnSelect) window.setTimeout(() => setSearch(""), 0);
      }}
      searchValue={search}
      onSearchChange={setSearch}
      // L'annuaire a déjà filtré : la liste ne refiltre pas derrière lui.
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
            {/* L'origine du compte, à droite : deux comptes de même nom et
                de même adresse se distinguent ainsi. */}
            {p && <DirectoryOrigin synced={p.synced} />}
          </Group>
        );
      }}
      {...props}
    />
  );
}
