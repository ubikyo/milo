import { Text, UnstyledButton } from "@mantine/core";
import { Spotlight, spotlight } from "@mantine/spotlight";
import {
  IconBrandGoogle,
  IconCalendarEvent,
  IconDeviceDesktop,
  IconApps,
  IconDevices,
  IconExternalLink,
  IconFolder,
  IconHeadset,
  IconKey,
  IconLayoutKanban,
  IconMail,
  IconRss,
  IconSearch,
} from "@tabler/icons-react";
import Fuse from "fuse.js";
import { useMemo, useState } from "react";
import type { ComponentType } from "react";
import type { SearchKind, SearchResult } from "@milo/shared";
import { api } from "../../api";
import classes from "../../assets/styles/SearchBox.module.css";
import { ROW_CONTROL_HEIGHT } from "../../themes/menus";
import { useDisplaySettings } from "../../lib/displaySettings";
import { knownResults } from "../../lib/searchSources";

// The search, in the tab row: from the end of the tabs to the menus and the
// account, in all modes (ModeBar). The field there is only a lure: a click
// opens the Spotlight, which searches everything the application holds and
// opens the chosen item, wherever it is. The server hands over all the person
// sees on opening, the widgets add the e-mails and appointments they have
// loaded (lib/searchSources.ts); Fuse.js searches it, fuzzily — a typo still
// finds.

/** The kinds, in the order the list presents them — that of the modes. */
const KINDS: { kind: SearchKind; label: string; icon: ComponentType<{ size?: number }> }[] = [
  { kind: "access", label: "Accès", icon: IconKey },
  { kind: "project", label: "Projets", icon: IconFolder },
  { kind: "card", label: "Tâches", icon: IconLayoutKanban },
  { kind: "support", label: "Support", icon: IconHeadset },
  { kind: "managed_device_asset", label: "Assets", icon: IconDeviceDesktop },
  { kind: "unmanaged_device_asset", label: "Équipements déclarés", icon: IconDevices },
  { kind: "application_asset", label: "Applications", icon: IconApps },
  { kind: "mail", label: "E-mails", icon: IconMail },
  { kind: "appointment", label: "Rendez-vous", icon: IconCalendarEvent },
  { kind: "article", label: "Flux RSS", icon: IconRss },
];

/** The most each kind shows: the list stays readable at a glance. */
const PER_KIND = 8;

/**
 * A result's key: a widget's elements share its id, their title tells them
 * apart. An e-mail or an appointment is itself, whatever widget shows it.
 */
const key = (r: SearchResult) => (r.item ? `${r.kind}:${r.item}` : `${r.kind}:${r.id}:${r.url ?? r.title}`);

/** Each result once: two widgets may show the same e-mail or appointment. */
const unique = (results: SearchResult[]): SearchResult[] => [
  ...new Map(results.map((r) => [key(r), r])).values(),
];

export interface SearchBoxProps {
  onOpen: (result: SearchResult) => void;
}

export default function SearchBox({ onOpen }: SearchBoxProps) {
  const [query, setQuery] = useState("");
  // The tolerance set in Paramétrage > Affichage.
  const { settings: display } = useDisplaySettings();
  // Everything searchable, loaded at each opening: null while it comes.
  const [index, setIndex] = useState<SearchResult[] | null>(null);

  const load = async () => {
    setIndex(null);
    let server: SearchResult[] = [];
    try {
      server = await api.getSearchIndex();
    } catch {
      /* the server's part fails: what the widgets loaded is still searched */
    }
    setIndex(unique([...server, ...knownResults()]));
  };

  // The title counts most, then where the item is; the rest (description,
  // sender…) only to find it. Accents are ignored, and so is where the words
  // fall in the text.
  const fuse = useMemo(
    () =>
      new Fuse(index ?? [], {
        keys: [
          { name: "title", weight: 3 },
          { name: "context", weight: 1 },
          { name: "keywords", weight: 0.5 },
        ],
        // From 0, the text as typed, to 1, anything (Paramétrage > Affichage).
        threshold: display.fuzzySearch ? display.searchThreshold : 0,
        ignoreLocation: true,
        ignoreDiacritics: true,
        minMatchCharLength: 2,
      }),
    [index, display.fuzzySearch, display.searchThreshold],
  );

  const search = query.trim();
  const found = useMemo(
    () => (search ? fuse.search(search).map((r) => r.item) : []),
    [fuse, search],
  );

  const openGoogle = () =>
    window.open(
      `https://www.google.com/search?q=${encodeURIComponent(search)}`,
      "_blank",
      "noopener",
    );

  const groups = KINDS.map(({ kind, label, icon: Icon }) => {
    const own = found.filter((r) => r.kind === kind).slice(0, PER_KIND);
    if (own.length === 0) return null;
    return (
      <Spotlight.ActionsGroup key={kind} label={label}>
        {own.map((r) => {
          // A link, an appointment, an article opens as is, in a new tab: its icon says so.
          const IconRow = r.url ? IconExternalLink : Icon;
          return (
            <Spotlight.Action
              key={key(r)}
              label={r.title}
              // Cut to one line: the whole title on hovering.
              title={r.title}
              leftSection={<IconRow size={16} />}
              // On a single line: its context on the right.
              rightSection={
                r.context ? (
                  <Text size="xs" c="dimmed" truncate maw={260}>
                    {r.context}
                  </Text>
                ) : undefined
              }
              onClick={() => onOpen(r)}
            />
          );
        })}
      </Spotlight.ActionsGroup>
    );
  });

  return (
    <>
      {/* The lure: a magnifier where the field was, a click opens the Spotlight. */}
      <UnstyledButton
        className={classes.lure}
        h={ROW_CONTROL_HEIGHT}
        aria-label="Recherche"
        onClick={spotlight.open}
      >
        <IconSearch size={18} />
      </UnstyledButton>

      <Spotlight.Root
        query={query}
        onQueryChange={setQuery}
        onSpotlightOpen={() => void load()}
        scrollable
        maxHeight={420}
        // The results in the contexts list's style (SearchBox.module.css).
        classNames={{
          actionsList: classes.actionsList,
          action: classes.action,
          actionBody: classes.actionBody,
          actionLabel: classes.actionLabel,
          actionSection: classes.actionSection,
          actionsGroup: classes.actionsGroup,
        }}
      >
        <Spotlight.Search
          placeholder="Rechercher dans Milo…"
          leftSection={<IconSearch size={18} />}
          // The typed text in the search's own color (themes).
          styles={{ input: { color: "var(--milo-search-text)" } }}
        />
        <Spotlight.ActionsList>
          {!search ? (
            <Spotlight.Empty>
              Tapez pour rechercher projets, tâches, demandes, assets, accès, e-mails, rendez-vous et
              articles.
            </Spotlight.Empty>
          ) : index === null ? (
            <Spotlight.Empty>Chargement…</Spotlight.Empty>
          ) : found.length > 0 ? (
            groups
          ) : (
            // Nothing in Milo: the input goes to Google.
            <Spotlight.Action
              label={`Rechercher « ${search} » sur Google`}
              leftSection={<IconBrandGoogle size={16} />}
              onClick={openGoogle}
            />
          )}
        </Spotlight.ActionsList>
      </Spotlight.Root>
    </>
  );
}
