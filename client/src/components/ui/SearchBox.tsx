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

// The search, in the tab row: from the end of the tabs to the menus and the
// account, in all modes (ModeBar). A bare field — no border or background, only
// its prompt — that searches everything the application holds and opens the
// chosen item, wherever it is.

/** The time given to typing before querying the server. */
const WAITING = 200;

/** The kinds, in the order the list presents them — that of the modes. */
const KINDS: { kind: SearchKind; label: string; icon: ComponentType<{ size?: number }> }[] = [
  { kind: "access", label: "Accès", icon: IconKey },
  { kind: "project", label: "Projets", icon: IconFolder },
  { kind: "card", label: "Tâches", icon: IconLayoutKanban },
  { kind: "support", label: "Support", icon: IconHeadset },
  { kind: "asset", label: "Assets", icon: IconDeviceDesktop },
];

const key = (r: SearchResult) => `${r.kind}:${r.id}`;

/** The list's bottom corners, sharper than those of menus. */
const RADIUS = 2;

/** The option that, lacking results, sends the input to Google. */
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
  // The last search sent: a response slower than a following keystroke does not
  // overwrite what that one returned.
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

  // The first row is ready for Enter — the first result, or Google for lack of
  // better. After rendering: before, the options do not exist yet.
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
          // An Access mode link opens as is, in a new tab: its icon says so.
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
              // A gray darker than that of the other fields, in both themes.
              "--input-placeholder-color":
                "var(--milo-search-placeholder)",
            } as CSSProperties,
          }}
          onChange={(event) => {
            setInput(event.currentTarget.value);
            combobox.openDropdown();
          }}
          onFocus={() => combobox.openDropdown()}
          onBlur={() => combobox.closeDropdown()}
          onKeyDown={(event) => {
            // Escape clears the field; a second time, it leaves it.
            if (event.key !== "Escape") return;
            if (input) setInput("");
            else event.currentTarget.blur();
          }}
        />
      </Combobox.Target>

      <Combobox.Dropdown hidden={results === null}>
        <Combobox.Options>
          {/* Mantine's bar, as everywhere else, and not the browser's. */}
          <ScrollArea.Autosize mah={420} type="scroll" scrollbarSize={6}>
            {results && results.length === 0 ? (
              // Nothing in Milo: the input goes to Google, Enter is enough.
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
