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
import { useFavorites } from "../../lib/favoris";
import { ACTOR_AVATAR_SIZE, ACTOR_GAP, PersonAvatar } from "./ActorAvatars";
import ChipPicker from "./ChipPicker";
import type { FloatingPosition } from "@mantine/core";
import type { ReactNode } from "react";
import type { DirectoryUser, EntraPrincipal, PublicUser } from "@milo/shared";
import DirectoryOrigin from "./OrigineAnnuaire";

// Le choix d'acteurs, le même partout — membres d'une carte, acteurs d'un
// projet ou d'une demande, « Assigner à » :
//
//   - les favoris en tête, marqués d'une étoile pleine ; l'étoile d'une ligne
//     l'y ajoute ou l'en retire, pour toutes les listes de l'application ;
//   - une recherche, qui filtre les comptes de Milo et interroge l'annuaire
//     Entra : une personne qui n'est pas encore dans Milo s'y choisit aussi,
//     et son compte est créé à ce moment-là ;
//   - là où un acteur ne fait qu'être prévenu, des groupes Entra aussi
//     (« onGroupsChange ») : la recherche
//     les propose sous les personnes, et ils se posent en vignettes devant
//     elles.

// L'annuaire n'est interrogé qu'une fois la saisie posée : pas une requête par
// touche.
const SEARCH_DELAY = 300;
const SEARCH_MIN = 2;

// Plus large que les autres listes : le nom, l'étoile au bout, et l'adresse
// des personnes de l'annuaire.
const LIST_WIDTH = 320;

const RULE = "1px solid var(--mantine-color-default-border)";

const normalizeValue = (text: string): string =>
  text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Une personne dans la liste : son nom en gras, son adresse dessous. */
// La largeur du bouton des favoris (ActionIcon « sm ») : l'origine d'une
// personne de l'annuaire s'y centre, sous l'étoile des lignes du dessus.
const FAVORITE_WIDTH = "var(--ai-size-sm, calc(1.375rem * var(--mantine-scale)))";

function NameAndAddress({ name, email }: { name: string; email: string }) {
  // Il prend la place libre : ce qui le suit se range au bout de la ligne.
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
  /** Les identifiants retenus, en chaînes. */
  value: string[];
  onChange: (value: string[]) => void;
  chipHeight?: number;
  chipGap?: number;
  /** La vignette d'un acteur retenu ; sa bulle par défaut. */
  renderChip?: (user: PublicUser) => ReactNode;
  /** Voir ChipPicker : des vignettes qui ne se choisissent pas. */
  leadingChips?: ReactNode;
  /** Voir ChipPicker : un déclencheur compact à la place des vignettes. */
  target?: ReactNode;
  position?: FloatingPosition;
  /** Les groupes Entra retenus, quand le choix en admet (« onGroupsChange »). */
  groups?: EntraPrincipal[];
  /** Sans elle, la recherche ne propose que des personnes. */
  onGroupsChange?: (groups: EntraPrincipal[]) => void;
}

/** La bulle d'un groupe : la même que celle d'une personne, un pictogramme à la place des initiales. */
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
  const { favoris, toggle } = useFavorites();
  const [search, setSearch] = useState("");
  const [directory, setDirectory] = useState<DirectoryUser[]>([]);
  const [foundGroups, setFoundGroups] = useState<EntraPrincipal[]>([]);
  const [searchDirectory, setSearchingDirectory] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  /**
   * Les comptes créés depuis l'annuaire, le temps que la liste des comptes de
   * l'application les rapporte (elle se relit d'elle-même).
   */
  const [created, setCreatedUsers] = useState<PublicUser[]>([]);

  const options = useMemo(
    () => [...users, ...created.filter((c) => !users.some((u) => u.id === c.id))],
    [users, created],
  );

  // La liste ne garde que les favoris, et les acteurs retenus — le temps
  // qu'ils le sont, pour pouvoir les décocher. Tous les autres, qu'ils aient
  // déjà un compte dans Milo ou non, se trouvent par la recherche dans Entra.
  // Une recherche filtre aussi cette liste, sur le nom et l'adresse, sans
  // tenir compte des accents. Les favoris d'abord ; chaque groupe par nom.
  const list = useMemo(() => {
    const term = normalizeValue(search.trim());
    return options
      .filter((u) => favoris.includes(u.id) || value.includes(String(u.id)))
      .filter(
        (u) => !term || normalizeValue(`${u.name} ${u.email}`).includes(term),
      )
      .sort((a, b) => {
        const fa = favoris.includes(a.id) ? 0 : 1;
        const fb = favoris.includes(b.id) ? 0 : 1;
        return fa - fb || a.name.localeCompare(b.name, "fr");
      });
  }, [options, search, favoris, value]);

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

  // Les groupes retenus restent dans la liste, cochés, pour pouvoir les
  // retirer ; ceux que la recherche trouve en plus se cochent pour s'ajouter.
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

  // L'annuaire propose tous ceux que la liste ne montre pas déjà — y compris
  // ceux qui ont un compte dans Milo : les choisir les pose simplement.
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
        const favori = favoris.includes(u.id);
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
            {/* L'étoile ne coche pas la ligne : elle vit dans le libellé de
                la case, et arrête donc le clic avant lui. */}
            <ActionIcon
              component="span"
              role="button"
              style={{ flexShrink: 0 }}
              variant="subtle"
              color="gray"
              size="sm"
              aria-label={
                favori ? "Retirer des favoris" : "Ajouter aux favoris"
              }
              onClick={(e: React.MouseEvent) => {
                e.preventDefault();
                e.stopPropagation();
                void toggle(u.id);
              }}
            >
              {/* Un favori, c'est une étoile pleine et jaune ; les autres
                  n'en montrent que le contour, discret. */}
              {favori ? (
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
            // Séparés des favoris par un trait, quand il y en a au-dessus ; les
            // lignes et leurs filets courent d'un bord à l'autre, comme celles
            // des favoris. La dernière n'a pas de filet dessous.
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
                  data-ligne
                >
                  <Group gap={8} wrap="nowrap">
                    {/* La bulle de la personne, avec ses initiales, comme celle
                        des comptes au-dessus ; le temps de la création de son
                        compte, une roue à sa place. */}
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
                    {/* L'origine, au bout de la ligne, comme dans la
                        recherche des accès. */}
                    <DirectoryOrigin synced={p.synced} largeur={FAVORITE_WIDTH} />
                  </Group>
                </UnstyledButton>
              ))}
            </Stack>
          )}
          {listGroups.length > 0 && (
            // Les groupes, sous les personnes : un filet les en sépare quand
            // il y a quelque chose au-dessus.
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
                    data-ligne
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
                      <DirectoryOrigin synced={g.synced} largeur={FAVORITE_WIDTH} />
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
