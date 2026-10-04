import { Combobox, Group, ScrollArea, Text, TextInput, useCombobox } from "@mantine/core";
import {
  IconBrandGoogle,
  IconDeviceDesktop,
  IconExternalLink,
  IconFolder,
  IconHeadset,
  IconKey,
  IconLayoutKanban,
} from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import type { ComponentType, CSSProperties } from "react";
import { SEARCH_MIN_LENGTH } from "@milo/shared";
import type { SearchKind, SearchResult } from "@milo/shared";
import { api } from "../../api";
import classes from "../../assets/styles/SearchBox.module.css";
import { ROW_CONTROL_HEIGHT, ROW_MENU_OFFSET, TAB_MENU_STYLES } from "../../themes/menus";

// La recherche, dans la rangée d'onglets : de la fin des onglets jusqu'aux
// menus et au compte, dans tous les modes (ModeBar). Un champ nu — ni bordure ni fond, son invite seule — qui fouille tout ce que
// l'application porte et ouvre l'élément choisi, où qu'il soit.

/** Le temps qu'on laisse à la frappe avant d'interroger le serveur. */
const WAITING = 200;

/** Les sortes, dans l'ordre où la liste les présente — celui des modes. */
const KINDS: { kind: SearchKind; label: string; icon: ComponentType<{ size?: number }> }[] = [
  { kind: "access", label: "Accès", icon: IconKey },
  { kind: "project", label: "Projets", icon: IconFolder },
  { kind: "card", label: "Tâches", icon: IconLayoutKanban },
  { kind: "support", label: "Support", icon: IconHeadset },
  { kind: "asset", label: "Assets", icon: IconDeviceDesktop },
];

const key = (r: SearchResult) => `${r.kind}:${r.id}`;

/** Les angles bas de la liste, plus vifs que ceux des menus. */
const RADIUS = 2;

/** L'option qui, faute de résultat, envoie la saisie à Google. */
const GOOGLE = "google";

export interface SearchBoxProps {
  onOpen: (result: SearchResult) => void;
}

export default function SearchBox({ onOpen }: SearchBoxProps) {
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  });
  const [input, setInput] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  // La dernière recherche partie : une réponse plus lente qu'une frappe
  // suivante n'écrase pas ce que celle-ci a rendu.
  const last = useRef(0);

  useEffect(() => {
    const search = input.trim();
    if (search.length < SEARCH_MIN_LENGTH) {
      setResults(null);
      return;
    }
    const phoneNumber = ++last.current;
    const timeout = window.setTimeout(async () => {
      try {
        const matches = await api.search(search);
        if (phoneNumber === last.current) setResults(matches);
      } catch {
        if (phoneNumber === last.current) setResults([]);
      }
    }, WAITING);
    return () => window.clearTimeout(timeout);
  }, [input]);

  // La première ligne est prête pour Entrée — le premier résultat, ou Google
  // faute de mieux. Après le rendu : avant, les options n'existent pas encore.
  useEffect(() => {
    if (results) combobox.selectFirstOption();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results]);

  const select = (value: string) => {
    if (value === GOOGLE) {
      window.open(
        `https://www.google.com/search?q=${encodeURIComponent(input.trim())}`,
        "_blank",
        "noopener",
      );
      combobox.closeDropdown();
      setInput("");
      setResults(null);
      return;
    }
    const result = results?.find((r) => key(r) === value);
    if (!result) return;
    combobox.closeDropdown();
    setInput("");
    setResults(null);
    onOpen(result);
  };

  const groups = KINDS.map(({ kind, label, icon: Icon }) => {
    const own = (results ?? []).filter((r) => r.kind === kind);
    if (own.length === 0) return null;
    return (
      <Combobox.Group key={kind} label={label}>
        {own.map((r) => {
          // Un lien du mode Accès s'ouvre tel quel, dans un nouvel onglet :
          // son icône le dit.
          const IconRow = r.url ? IconExternalLink : Icon;
          return (
            <Combobox.Option key={key(r)} value={key(r)}>
              <Group gap="xs" wrap="nowrap">
                <IconRow size={16} />
                <div style={{ minWidth: 0 }}>
                  <Text size="sm" truncate>
                    {r.title}
                  </Text>
                  {r.context && (
                    <Text size="xs" c="dimmed" truncate>
                      {r.context}
                    </Text>
                  )}
                </div>
              </Group>
            </Combobox.Option>
          );
        })}
      </Combobox.Group>
    );
  });

  return (
    <Combobox
      store={combobox}
      classNames={{ option: classes.option }}
      onOptionSubmit={select}
      position="bottom-start"
      offset={ROW_MENU_OFFSET}
      width={360}
      withinPortal
      styles={{
        ...TAB_MENU_STYLES,
        dropdown: {
          ...TAB_MENU_STYLES.dropdown,
          borderBottomLeftRadius: RADIUS,
          borderBottomRightRadius: RADIUS,
        },
      }}
    >
      <Combobox.Target>
        <TextInput
          variant="unstyled"
          placeholder="Recherche"
          aria-label="Recherche"
          value={input}
          h={ROW_CONTROL_HEIGHT}
          styles={{
            input: {
              height: ROW_CONTROL_HEIGHT,
              minHeight: ROW_CONTROL_HEIGHT,
              // Un gris plus sombre que celui des autres champs, dans les deux
              // thèmes.
              "--input-placeholder-color":
                "light-dark(var(--mantine-color-gray-7), var(--mantine-color-dark-4))",
            } as CSSProperties,
          }}
          onChange={(event) => {
            setInput(event.currentTarget.value);
            combobox.openDropdown();
          }}
          onFocus={() => combobox.openDropdown()}
          onBlur={() => combobox.closeDropdown()}
          onKeyDown={(event) => {
            // Échap vide le champ ; une seconde fois, il le quitte.
            if (event.key !== "Escape") return;
            if (input) setInput("");
            else event.currentTarget.blur();
          }}
        />
      </Combobox.Target>

      <Combobox.Dropdown hidden={results === null}>
        <Combobox.Options>
          {/* La barre de Mantine, comme partout ailleurs, et non celle du
              navigateur. */}
          <ScrollArea.Autosize mah={420} type="scroll" scrollbarSize={6}>
            {results && results.length === 0 ? (
              // Rien dans Milo : la saisie part sur Google, Entrée suffit.
              <Combobox.Option value={GOOGLE}>
                <Group gap="xs" wrap="nowrap">
                  <IconBrandGoogle size={16} />
                  <Text size="sm" truncate>
                    Rechercher « {input.trim()} » sur Google
                  </Text>
                </Group>
              </Combobox.Option>
            ) : (
              groups
            )}
          </ScrollArea.Autosize>
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}
