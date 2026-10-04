import {
  ActionIcon,
  Avatar,
  Checkbox,
  Group,
  Loader,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import {
  IconSearch,
  IconStar,
  IconStarFilled,
  IconUsersGroup,
} from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import { useFavorites } from "../../lib/favorites";
import { ACTOR_AVATAR_SIZE, ACTOR_GAP, PersonAvatar } from "./ActorAvatars";
import ChipPicker from "./ChipPicker";
import type { FloatingPosition } from "@mantine/core";
import type { ReactNode } from "react";
import type { DirectoryUser, EntraPrincipal, PublicUser } from "@milo/shared";
import DirectoryOrigin from "./DirectoryOrigin";

// The actor picker, the same everywhere — a card's members, a project's or
// request's actors, "Assigner à":
//
//   - favorites first, marked with a filled star; a row's star
//     adds it there or removes it, for all lists in the application;
//   - a search, which filters Milo's accounts and queries the Entra
//     directory: a person not yet in Milo can be picked there too,
//     and their account is created at that moment;
//   - where an actor is merely notified, Entra groups too
//     ("onGroupsChange"): the search
//     offers them under the people, and they are placed as chips in front of
//     them.

// The directory is only queried once the input has settled: not one request per
// keystroke.
const SEARCH_DELAY = 300;
const SEARCH_MIN = 2;

// Wider than the other lists: the name, the star at the end, and the address
// of directory people.
const LIST_WIDTH = 320;
// The list's height, past which it scrolls.
const LIST_MAX_HEIGHT = 350;

const RULE = "1px solid var(--mantine-color-default-border)";

const normalizeValue = (text: string): string =>
  text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** A person in the list: their name in bold, their address below. */
// The favorites button's width (ActionIcon "sm"): the origin of a
// directory person is centered on it, under the stars of the rows above.
const FAVORITE_WIDTH = "var(--ai-size-sm, calc(1.375rem * var(--mantine-scale)))";

function NameAndAddress({ name, email }: { name: string; email: string }) {
  // It takes the free space: what follows is lined up at the end of the row.
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <Text size="xs" fw={700} truncate>
        {name}
      </Text>
      {email && (
        <Text size="xs" c="dimmed" truncate>
          {email}
        </Text>
      )}
    </div>
  );
}

interface ActorPickerProps {
  label: string;
  users: PublicUser[];
  /** The retained identifiers, as strings. */
  value: string[];
  onChange: (value: string[]) => void;
  chipHeight?: number;
  chipGap?: number;
  /** A retained actor's chip; its default bubble. */
  renderChip?: (user: PublicUser) => ReactNode;
  /** See ChipPicker: chips that cannot be chosen. */
  leadingChips?: ReactNode;
  /** See ChipPicker: a compact trigger in place of the chips. */
  target?: ReactNode;
  position?: FloatingPosition;
  /** The retained Entra groups, when the choice allows them ("onGroupsChange"). */
  groups?: EntraPrincipal[];
  /** Without it, the search only offers people. */
  onGroupsChange?: (groups: EntraPrincipal[]) => void;
}

/** A group's bubble: the same as a person's, a pictogram in place of the initials. */
function GroupAvatar({ group, size }: { group: EntraPrincipal; size: number }) {
  return (
    <Avatar
      size={size}
      radius="xl"
      variant="light"
      color="gray"
      title={group.name}
    >
      <IconUsersGroup size={Math.round(size * 0.6)} />
    </Avatar>
  );
}

export default function ActorPicker({
  label,
  users,
  value,
  onChange,
  chipHeight = ACTOR_AVATAR_SIZE,
  chipGap = ACTOR_GAP,
  renderChip,
  leadingChips,
  target,
  position,
  groups = [],
  onGroupsChange,
}: ActorPickerProps) {
  const withGroups = onGroupsChange !== undefined;
  const { favorites, toggle } = useFavorites();
  const [search, setSearch] = useState("");
  const [directory, setDirectory] = useState<DirectoryUser[]>([]);
  const [foundGroups, setFoundGroups] = useState<EntraPrincipal[]>([]);
  const [searchDirectory, setSearchingDirectory] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  /**
   * Accounts created from the directory, until the application's account list
   * brings them back (it re-reads itself).
   */
  const [created, setCreatedUsers] = useState<PublicUser[]>([]);

  const options = useMemo(
    () => [...users, ...created.filter((c) => !users.some((u) => u.id === c.id))],
    [users, created],
  );

  // The list only keeps the favorites, and the retained actors — for as long
  // as they are, so they can be unchecked. All the others, whether they
  // already have an account in Milo or not, are found through the Entra search.
  // A search also filters this list, on name and address, without
  // regard to accents. Favorites first; each group by name.
  const list = useMemo(() => {
    const term = normalizeValue(search.trim());
    return options
      .filter((u) => favorites.includes(u.id) || value.includes(String(u.id)))
      .filter(
        (u) => !term || normalizeValue(`${u.name} ${u.email}`).includes(term),
      )
      .sort((a, b) => {
        const fa = favorites.includes(a.id) ? 0 : 1;
        const fb = favorites.includes(b.id) ? 0 : 1;
        return fa - fb || a.name.localeCompare(b.name, "fr");
      });
  }, [options, search, favorites, value]);

  useEffect(() => {
    const term = search.trim();
    if (term.length < SEARCH_MIN) {
      setDirectory([]);
      setFoundGroups([]);
      return;
    }
    let cancelled = false;
    const timeout = setTimeout(() => {
      setSearchingDirectory(true);
      Promise.all([
        api.searchDirectoryUsers(term).catch(() => []),
        withGroups
          ? api.searchDirectoryGroups(term).catch(() => [])
          : Promise.resolve([]),
      ])
        .then(([people, loadedGroups]) => {
          if (cancelled) return;
          setDirectory(people);
          setFoundGroups(loadedGroups);
        })
        .finally(() => !cancelled && setSearchingDirectory(false));
    }, SEARCH_DELAY);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [search, withGroups]);

  // The retained groups stay in the list, checked, so they can be
  // removed; those the search finds in addition are checked to be added.
  const groupsTerm = normalizeValue(search.trim());
  const listGroups = [
    ...groups.filter(
      (g) => !groupsTerm || normalizeValue(g.name).includes(groupsTerm),
    ),
    ...foundGroups.filter((g) => !groups.some((r) => r.id === g.id)),
  ];
  const toggleGroup = (group: EntraPrincipal) =>
    onGroupsChange?.(
      groups.some((g) => g.id === group.id)
        ? groups.filter((g) => g.id !== group.id)
        : [...groups, { ...group, type: "group" }],
    );

  // The directory offers everyone the list does not already show — including
  // those with an account in Milo: choosing them simply places them.
  const newItems = directory.filter(
    (p) =>
      !list.some(
        (u) =>
          u.id === p.user_id || u.email.toLowerCase() === p.email.toLowerCase(),
      ),
  );

  const selectFromDirectory = async (person: DirectoryUser) => {
    setAdding(person.oid);
    try {
      const account = await api.addDirectoryUser(person.oid);
      setCreatedUsers((already) => [...already, account]);
      if (!value.includes(String(account.id)))
        onChange([...value, String(account.id)]);
      setSearch("");
    } finally {
      setAdding(null);
    }
  };

  return (
    <ChipPicker
      chipHeight={chipHeight}
      chipGap={chipGap}
      label={label}
      options={options}
      listOptions={list}
      value={value}
      onChange={onChange}
      fullWidthOptions
      separated
      dropdownWidth={LIST_WIDTH}
      listMaxHeight={LIST_MAX_HEIGHT}
      emptyText={
        search.trim()
          ? searchDirectory || newItems.length || listGroups.length
            ? ""
            : "Personne ne correspond dans l'annuaire"
          : listGroups.length
            ? ""
            : withGroups
              ? "Recherchez une personne ou un groupe à ajouter"
              : "Recherchez une personne à ajouter"
      }
      leadingChips={
        <>
          {leadingChips}
          {groups.map((g) => (
            <span
              key={g.id}
              style={{ display: "inline-flex" }}
              aria-label={g.name}
            >
              <GroupAvatar group={g} size={chipHeight} />
            </span>
          ))}
        </>
      }
      target={target}
      position={position}
      onClose={() => setSearch("")}
      header={
        <TextInput
          size="xs"
          placeholder="Rechercher"
          leftSection={<IconSearch size={14} />}
          rightSection={searchDirectory ? <Loader size={12} /> : null}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          data-autofocus
        />
      }
      render={(u) => {
        const favorite = favorites.includes(u.id);
        return (
          <Group
            gap={6}
            wrap="nowrap"
            justify="space-between"
            style={{ minWidth: 0 }}
          >
            <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
              <PersonAvatar person={u} size={chipHeight} />
              <NameAndAddress name={u.name} email={u.email} />
            </Group>
            {/* The star does not check the row: it lives in the checkbox's
                label, and thus stops the click before it. */}
            <ActionIcon
              component="span"
              role="button"
              style={{ flexShrink: 0 }}
              variant="subtle"
              color="gray"
              size="sm"
              aria-label={
                favorite ? "Retirer des favoris" : "Ajouter aux favoris"
              }
              onClick={(e: React.MouseEvent) => {
                e.preventDefault();
                e.stopPropagation();
                void toggle(u.id);
              }}
            >
              {/* A favorite is a filled, yellow star; the others
                  only show the outline, discreetly. */}
              {favorite ? (
                <IconStarFilled
                  size={14}
                  color="var(--mantine-color-yellow-5)"
                />
              ) : (
                <IconStar size={14} />
              )}
            </ActionIcon>
          </Group>
        );
      }}
      renderChip={
        renderChip ??
        ((u) => (
          <span style={{ display: "inline-flex" }} aria-label={u.name}>
            <PersonAvatar person={u} size={chipHeight} />
          </span>
        ))
      }
      listFooter={
        <>
          {newItems.length > 0 && (
            // Separated from the favorites by a line, when there are some above; the
            // rows and their borders run from edge to edge, like those
            // of the favorites. The last one has no border below.
            <Stack
              gap={0}
              style={list.length ? { borderTop: RULE } : undefined}
            >
              {newItems.map((p, rank) => (
                <UnstyledButton
                  key={p.oid}
                  onClick={() => void selectFromDirectory(p)}
                  disabled={adding !== null}
                  px={10}
                  py={8}
                  style={
                    rank < newItems.length - 1
                      ? { borderBottom: RULE }
                      : undefined
                  }
                  data-row
                >
                  <Group gap={8} wrap="nowrap">
                    {/* The person's bubble, with their initials, like that
                        of the accounts above; while their account is being
                        created, a spinner in its place. */}
                    {adding === p.oid ? (
                      <Loader
                        size={chipHeight - 8}
                        style={{ width: chipHeight, flexShrink: 0 }}
                      />
                    ) : (
                      <PersonAvatar
                        person={{
                          id: 0,
                          name: p.name,
                          email: p.email,
                          gravatar_url: "",
                        }}
                        size={chipHeight}
                      />
                    )}
                    <NameAndAddress name={p.name} email={p.email} />
                    {/* The origin, at the end of the row, as in the
                        access search. */}
                    <DirectoryOrigin synced={p.synced} width={FAVORITE_WIDTH} />
                  </Group>
                </UnstyledButton>
              ))}
            </Stack>
          )}
          {listGroups.length > 0 && (
            // The groups, under the people: a line separates them when
            // there is something above.
            <Stack
              gap={0}
              style={
                list.length || newItems.length
                  ? { borderTop: RULE }
                  : undefined
              }
            >
              {listGroups.map((g, rank) => {
                const chosen = groups.some((r) => r.id === g.id);
                return (
                  <UnstyledButton
                    key={g.id}
                    onClick={() => toggleGroup(g)}
                    px={10}
                    py={8}
                    style={
                      rank < listGroups.length - 1
                        ? { borderBottom: RULE }
                        : undefined
                    }
                    data-row
                  >
                    <Group gap={8} wrap="nowrap">
                      <Checkbox
                        checked={chosen}
                        readOnly
                        size="xs"
                        tabIndex={-1}
                        aria-hidden
                        style={{ pointerEvents: "none" }}
                      />
                      <GroupAvatar group={g} size={chipHeight} />
                      <NameAndAddress name={g.name} email={g.email} />
                      <DirectoryOrigin synced={g.synced} width={FAVORITE_WIDTH} />
                    </Group>
                  </UnstyledButton>
                );
              })}
            </Stack>
          )}
        </>
      }
    />
  );
}
