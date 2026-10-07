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
import type {
  DirectoryUser,
  PublicUser,
  WidgetKind,
  WorkspacePeople,
} from "@milo/shared";

// The actor picker, the same everywhere — a card's members, a project's or
// request's actors, "Assigner à":
//
//   - favorites first, marked with a filled star; a row's star
//     adds it there or removes it, for all lists in the application;
//   - only the people of the workspace who read the widget type ("kind",
//     "Utiliser" at least): its users, and each user of its groups, listed
//     individually. A person not yet in Milo is offered too, and their
//     account is created when they are picked;
//   - under them, its groups: picking one adds each of its users, picking
//     it again — all of them in — removes them;
//   - a search, which filters all of it, without regard to accents.
//
// A retained actor who no longer has access stays listed, to be removed.

/** The workspace's people, by widget type: read once, again after a while. */
const PEOPLE_TTL = 60_000;
const peopleCache = new Map<WidgetKind, { at: number; people: Promise<WorkspacePeople> }>();

const loadPeople = (kind: WidgetKind): Promise<WorkspacePeople> => {
  const cached = peopleCache.get(kind);
  if (cached && Date.now() - cached.at < PEOPLE_TTL) return cached.people;
  const people = api.getWorkspacePeople(kind);
  peopleCache.set(kind, { at: Date.now(), people });
  people.catch(() => peopleCache.delete(kind));
  return people;
};

const NO_PEOPLE: WorkspacePeople = { users: [], groups: [] };

// Wider than the other lists: the name, the star at the end, and the address
// of directory people.
const LIST_WIDTH = 320;
// The list's height, past which it scrolls.
const LIST_MAX_HEIGHT = 350;

const RULE = "1px solid var(--mantine-color-default-border)";

const normalizeValue = (text: string): string =>
  text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** A person in the list: their name in bold, their address below. */
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
  /** The widget type of what receives the actors: only those who read it are offered. */
  kind: WidgetKind;
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
}

/** A group's bubble: the same as a person's, a pictogram in place of the initials. */
function GroupAvatar({ group, size }: { group: { name: string }; size: number }) {
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
  kind,
  users,
  value,
  onChange,
  chipHeight = ACTOR_AVATAR_SIZE,
  chipGap = ACTOR_GAP,
  renderChip,
  leadingChips,
  target,
  position,
}: ActorPickerProps) {
  const { favorites, toggle } = useFavorites();
  const [search, setSearch] = useState("");
  const [people, setPeople] = useState<WorkspacePeople | null>(null);
  // The person or group whose accounts are being created.
  const [adding, setAdding] = useState<string | null>(null);
  /**
   * Accounts created from the directory, until the application's account list
   * brings them back (it re-reads itself).
   */
  const [created, setCreatedUsers] = useState<PublicUser[]>([]);

  useEffect(() => {
    let cancelled = false;
    loadPeople(kind)
      .then((loaded) => !cancelled && setPeople(loaded))
      .catch(() => !cancelled && setPeople(NO_PEOPLE));
    return () => {
      cancelled = true;
    };
  }, [kind]);

  const options = useMemo(
    () => [...users, ...created.filter((c) => !users.some((u) => u.id === c.id))],
    [users, created],
  );

  const { users: allowed, groups } = people ?? NO_PEOPLE;
  /** The account of a person of the workspace, when they have one. */
  const accountOf = (p: DirectoryUser): PublicUser | undefined =>
    options.find(
      (u) =>
        (p.user_id !== null && u.id === p.user_id) ||
        u.email.toLowerCase() === p.email.toLowerCase(),
    );

  const term = normalizeValue(search.trim());
  const matches = (text: string) => !term || normalizeValue(text).includes(term);

  // The people of the workspace who have an account, and the retained actors
  // — for as long as they are, so they can be unchecked. Favorites first;
  // each group by name.
  const allowedIds = new Set(
    allowed.map((p) => accountOf(p)?.id).filter((id): id is number => id !== undefined),
  );
  const list = options
    .filter((u) => allowedIds.has(u.id) || value.includes(String(u.id)))
    .filter((u) => matches(`${u.name} ${u.email}`))
    .sort((a, b) => {
      const fa = favorites.includes(a.id) ? 0 : 1;
      const fb = favorites.includes(b.id) ? 0 : 1;
      return fa - fb || a.name.localeCompare(b.name, "fr");
    });

  // Those of the workspace without an account yet: picking them creates it.
  const newItems = allowed.filter(
    (p) => !accountOf(p) && matches(`${p.name} ${p.email}`),
  );
  const listGroups = groups.filter((g) => matches(`${g.name} ${g.email}`));

  /** The accounts of these people: created for those who have none yet. */
  const accountsOf = async (persons: DirectoryUser[]): Promise<PublicUser[]> => {
    const accounts = await Promise.all(
      persons.map(async (p) => accountOf(p) ?? (await api.addDirectoryUser(p.oid))),
    );
    const fresh = accounts.filter((a) => !options.some((u) => u.id === a.id));
    if (fresh.length) setCreatedUsers((already) => [...already, ...fresh]);
    return accounts;
  };

  const selectFromDirectory = async (person: DirectoryUser) => {
    setAdding(person.oid);
    try {
      const [account] = await accountsOf([person]);
      if (account && !value.includes(String(account.id)))
        onChange([...value, String(account.id)]);
      setSearch("");
    } finally {
      setAdding(null);
    }
  };

  /** A group's users: all of them in, they leave; otherwise, they all come in. */
  const groupMembers = (group: WorkspacePeople["groups"][number]) =>
    allowed.filter((p) => group.members.includes(p.oid));
  const groupChosen = (group: WorkspacePeople["groups"][number]) => {
    const members = groupMembers(group);
    return (
      members.length > 0 &&
      members.every((p) => {
        const account = accountOf(p);
        return account !== undefined && value.includes(String(account.id));
      })
    );
  };
  const toggleGroup = async (group: WorkspacePeople["groups"][number]) => {
    const members = groupMembers(group);
    if (groupChosen(group)) {
      const leaving = new Set(members.map((p) => String(accountOf(p)?.id)));
      onChange(value.filter((id) => !leaving.has(id)));
      return;
    }
    setAdding(group.id);
    try {
      const accounts = await accountsOf(members);
      onChange([
        ...value,
        ...accounts.map((a) => String(a.id)).filter((id) => !value.includes(id)),
      ]);
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
        people === null || newItems.length || listGroups.length
          ? ""
          : search.trim()
            ? "Personne ne correspond dans ce workspace"
            : "Personne n'a accès à ce type de widget"
      }
      leadingChips={leadingChips}
      target={target}
      position={position}
      onClose={() => setSearch("")}
      header={
        <TextInput
          size="xs"
          placeholder="Rechercher"
          leftSection={<IconSearch size={14} />}
          rightSection={people === null ? <Loader size={12} /> : null}
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
                    {/* Unchecked, like the accounts above: a click checks
                        them, their account created on the way. */}
                    <Checkbox
                      checked={false}
                      readOnly
                      size="xs"
                      tabIndex={-1}
                      aria-hidden
                      style={{ pointerEvents: "none" }}
                    />
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
                const chosen = groupChosen(g);
                return (
                  <UnstyledButton
                    key={g.id}
                    onClick={() => void toggleGroup(g)}
                    disabled={adding !== null}
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
                      {adding === g.id ? (
                        <Loader
                          size={chipHeight - 8}
                          style={{ width: chipHeight, flexShrink: 0 }}
                        />
                      ) : (
                        <GroupAvatar group={g} size={chipHeight} />
                      )}
                      <NameAndAddress name={g.name} email={g.email} />
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
