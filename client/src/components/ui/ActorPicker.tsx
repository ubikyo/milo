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
  IconBuilding,
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
  EntraPrincipal,
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
//
// For Support ("helpdesk"), a search also reaches the whole Entra directory:
// its people — their account created when picked — and its groups, whose
// users all come in.
//
// A record may offer contacts too, under the groups ("contacts"): an order's
// supplier and its people who have an e-mail address. Their chips follow the
// people's; the list checks and unchecks them.

/** A contact offered as an actor: a person, or their company. */
export interface ContactActorOption {
  /** Its contact's id, as a string. */
  id: string;
  name: string;
  email: string;
  company: boolean;
}

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

/**
 * The widget types whose actors may be anyone in the Entra directory: a
 * search there also offers its people and groups beyond the workspace.
 */
const WHOLE_DIRECTORY: readonly WidgetKind[] = ["helpdesk"];

/** The time to let typing finish before querying the directory. */
const DIRECTORY_WAIT = 300;

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
  /** Retained actors who cannot be removed: those a message was sent to. */
  locked?: string[];
  /** Contacts offered under the groups, with their own value: an order's supplier's. */
  contacts?: {
    /** Their heading in the list: the company's name. */
    title: string;
    options: ContactActorOption[];
    value: string[];
    onChange: (value: string[]) => void;
    /** Retained contacts who cannot be removed, as "locked". */
    locked?: string[];
  };
}

/** A contact's bubble: a person's initials, a building for a company. */
function ContactAvatar({ contact, size }: { contact: ContactActorOption; size: number }) {
  if (contact.company) {
    return (
      <Avatar size={size} radius="xl" variant="light" color="gray" title={contact.name}>
        <IconBuilding size={Math.round(size * 0.6)} />
      </Avatar>
    );
  }
  return <PersonAvatar person={{ id: 0, name: contact.name, email: contact.email, gravatar_url: "" }} size={size} />;
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
  locked = [],
  contacts,
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

  // What the whole directory answers to the search, when the type allows it.
  const wholeDirectory = WHOLE_DIRECTORY.includes(kind);
  const [found, setFound] = useState<EntraPrincipal[]>([]);
  useEffect(() => {
    const typed = search.trim();
    if (!wholeDirectory || typed.length < 2) {
      setFound([]);
      return undefined;
    }
    let abandoned = false;
    const timeout = window.setTimeout(() => {
      api
        .searchDirectoryPrincipals(typed)
        .then((list) => !abandoned && setFound(list))
        .catch(() => !abandoned && setFound([]));
    }, DIRECTORY_WAIT);
    return () => {
      abandoned = true;
      window.clearTimeout(timeout);
    };
  }, [search, wholeDirectory]);

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
  // The directory's, beyond those already offered above.
  const listedIds = new Set(list.map((u) => u.id));
  const directoryPeople: DirectoryUser[] = found
    .filter((p) => p.type === "user")
    .map((p) => ({ oid: p.id, name: p.name, email: p.email, user_id: null, synced: p.synced }))
    .filter((p) => {
      const account = accountOf(p);
      return account
        ? !listedIds.has(account.id) && !value.includes(String(account.id))
        : !newItems.some((n) => n.oid === p.oid);
    });
  const directoryGroups = found.filter(
    (p) => p.type === "group" && !groups.some((g) => g.id === p.id),
  );
  // The contacts offered, and those retained — still listed while they are, to be unchecked.
  const listContacts = (contacts?.options ?? []).filter((c) => matches(`${c.name} ${c.email}`));
  const chosenContacts = (contacts?.options ?? []).filter((c) => contacts?.value.includes(c.id));
  const toggleContact = (id: string) => {
    if (!contacts) return;
    if (contacts.value.includes(id) && contacts.locked?.includes(id)) return;
    contacts.onChange(
      contacts.value.includes(id) ? contacts.value.filter((v) => v !== id) : [...contacts.value, id],
    );
  };

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

  /** A directory group: its users all come in. */
  const addDirectoryGroup = async (group: EntraPrincipal) => {
    setAdding(group.id);
    try {
      const accounts = await accountsOf(await api.getDirectoryGroupMembers(group.id));
      onChange([
        ...value,
        ...accounts.map((a) => String(a.id)).filter((id) => !value.includes(id)),
      ]);
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
      // Those a message was sent to stay.
      const leaving = new Set(members.map((p) => String(accountOf(p)?.id)).filter((id) => !locked.includes(id)));
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
      locked={locked}
      fullWidthOptions
      separated
      dropdownWidth={LIST_WIDTH}
      listMaxHeight={LIST_MAX_HEIGHT}
      emptyText={
        people === null ||
        newItems.length ||
        listGroups.length ||
        listContacts.length ||
        directoryPeople.length ||
        directoryGroups.length
          ? ""
          : search.trim()
            ? "Personne ne correspond dans ce workspace"
            : "Personne n'a accès à ce type de widget"
      }
      leadingChips={
        chosenContacts.length ? (
          <>
            {leadingChips}
            {chosenContacts.map((c) => (
              <span key={c.id} style={{ display: "inline-flex" }} aria-label={c.name} title={c.name}>
                <ContactAvatar contact={c} size={chipHeight} />
              </span>
            ))}
          </>
        ) : (
          leadingChips
        )
      }
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
          {directoryPeople.length + directoryGroups.length > 0 && (
            // The rest of the directory, under the workspace's: its people,
            // then its groups.
            <Stack
              gap={0}
              style={list.length || newItems.length || listGroups.length ? { borderTop: RULE } : undefined}
            >
              <Text size="xs" c="dimmed" fw={600} px={10} pt={8} pb={4} truncate>
                Annuaire
              </Text>
              {[...directoryPeople.map((p) => ({ type: "user" as const, p })), ...directoryGroups.map((p) => ({ type: "group" as const, p }))].map(
                (row, rank, rows) => {
                  const id = row.type === "user" ? row.p.oid : row.p.id;
                  return (
                    <UnstyledButton
                      key={`${row.type}:${id}`}
                      onClick={() =>
                        void (row.type === "user"
                          ? selectFromDirectory(row.p)
                          : addDirectoryGroup(row.p))
                      }
                      disabled={adding !== null}
                      px={10}
                      py={8}
                      style={rank < rows.length - 1 ? { borderBottom: RULE } : undefined}
                      data-row
                    >
                      <Group gap={8} wrap="nowrap">
                        <Checkbox
                          checked={false}
                          readOnly
                          size="xs"
                          tabIndex={-1}
                          aria-hidden
                          style={{ pointerEvents: "none" }}
                        />
                        {adding === id ? (
                          <Loader size={chipHeight - 8} style={{ width: chipHeight, flexShrink: 0 }} />
                        ) : row.type === "group" ? (
                          <GroupAvatar group={row.p} size={chipHeight} />
                        ) : (
                          <PersonAvatar
                            person={{ id: 0, name: row.p.name, email: row.p.email, gravatar_url: "" }}
                            size={chipHeight}
                          />
                        )}
                        <NameAndAddress name={row.p.name} email={row.p.email} />
                      </Group>
                    </UnstyledButton>
                  );
                },
              )}
            </Stack>
          )}
          {contacts && listContacts.length > 0 && (
            // The contacts, last, under their company's name.
            <Stack
              gap={0}
              style={
                list.length || newItems.length || listGroups.length || directoryPeople.length || directoryGroups.length
                  ? { borderTop: RULE }
                  : undefined
              }
            >
              <Text size="xs" c="dimmed" fw={600} px={10} pt={8} pb={4} truncate>
                {contacts.title}
              </Text>
              {listContacts.map((c, rank) => (
                <UnstyledButton
                  key={c.id}
                  onClick={() => toggleContact(c.id)}
                  disabled={contacts.value.includes(c.id) && contacts.locked?.includes(c.id)}
                  px={10}
                  py={8}
                  style={rank < listContacts.length - 1 ? { borderBottom: RULE } : undefined}
                  data-row
                >
                  <Group gap={8} wrap="nowrap">
                    <Checkbox
                      checked={contacts.value.includes(c.id)}
                      disabled={contacts.value.includes(c.id) && contacts.locked?.includes(c.id)}
                      readOnly
                      size="xs"
                      tabIndex={-1}
                      aria-hidden
                      style={{ pointerEvents: "none" }}
                    />
                    <ContactAvatar contact={c} size={chipHeight} />
                    <NameAndAddress name={c.name} email={c.email} />
                  </Group>
                </UnstyledButton>
              ))}
            </Stack>
          )}
        </>
      }
    />
  );
}
