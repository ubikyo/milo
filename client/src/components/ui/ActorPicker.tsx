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
import { useFavoris } from "../../lib/favoris";
import { ACTOR_AVATAR_SIZE, ACTOR_GAP, PersonAvatar } from "./ActorAvatars";
import ChipPicker from "./ChipPicker";
import type { FloatingPosition } from "@mantine/core";
import type { ReactNode } from "react";
import type { DirectoryUser, EntraPrincipal, PublicUser } from "@milo/shared";
import OrigineAnnuaire from "./OrigineAnnuaire";

// Le choix d'acteurs, le même partout — membres d'une carte, acteurs d'un
// projet ou d'une demande, « Assigner à » :
//
//   - les favoris en tête, marqués d'une étoile pleine ; l'étoile d'une ligne
//     l'y ajoute ou l'en retire, pour toutes les listes de l'application ;
//   - une recherche, qui filtre les comptes de Milo et interroge l'annuaire
//     Entra : une personne qui n'est pas encore dans Milo s'y choisit aussi,
//     et son compte est créé à ce moment-là ;
//   - là où un acteur ne fait qu'être prévenu — les machines d'un élément
//     Uptime —, des groupes Entra aussi (« onGroupsChange ») : la recherche
//     les propose sous les personnes, et ils se posent en vignettes devant
//     elles.

// L'annuaire n'est interrogé qu'une fois la saisie posée : pas une requête par
// touche.
const DELAI_RECHERCHE = 300;
const RECHERCHE_MIN = 2;

// Plus large que les autres listes : le nom, l'étoile au bout, et l'adresse
// des personnes de l'annuaire.
const LARGEUR_LISTE = 320;

const FILET = "1px solid var(--mantine-color-default-border)";

const normaliser = (texte: string): string =>
  texte.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Une personne dans la liste : son nom en gras, son adresse dessous. */
// La largeur du bouton des favoris (ActionIcon « sm ») : l'origine d'une
// personne de l'annuaire s'y centre, sous l'étoile des lignes du dessus.
const LARGEUR_FAVORI = "var(--ai-size-sm, calc(1.375rem * var(--mantine-scale)))";

function NomEtAdresse({ nom, email }: { nom: string; email: string }) {
  // Il prend la place libre : ce qui le suit se range au bout de la ligne.
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <Text size="xs" fw={700} truncate>
        {nom}
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
  const avecGroupes = onGroupsChange !== undefined;
  const { favoris, basculer } = useFavoris();
  const [recherche, setRecherche] = useState("");
  const [annuaire, setAnnuaire] = useState<DirectoryUser[]>([]);
  const [groupesTrouves, setGroupesTrouves] = useState<EntraPrincipal[]>([]);
  const [chercheAnnuaire, setChercheAnnuaire] = useState(false);
  const [ajout, setAjout] = useState<string | null>(null);
  /**
   * Les comptes créés depuis l'annuaire, le temps que la liste des comptes de
   * l'application les rapporte (elle se relit d'elle-même).
   */
  const [crees, setCrees] = useState<PublicUser[]>([]);

  const options = useMemo(
    () => [...users, ...crees.filter((c) => !users.some((u) => u.id === c.id))],
    [users, crees],
  );

  // La liste ne garde que les favoris, et les acteurs retenus — le temps
  // qu'ils le sont, pour pouvoir les décocher. Tous les autres, qu'ils aient
  // déjà un compte dans Milo ou non, se trouvent par la recherche dans Entra.
  // Une recherche filtre aussi cette liste, sur le nom et l'adresse, sans
  // tenir compte des accents. Les favoris d'abord ; chaque groupe par nom.
  const liste = useMemo(() => {
    const terme = normaliser(recherche.trim());
    return options
      .filter((u) => favoris.includes(u.id) || value.includes(String(u.id)))
      .filter(
        (u) => !terme || normaliser(`${u.name} ${u.email}`).includes(terme),
      )
      .sort((a, b) => {
        const fa = favoris.includes(a.id) ? 0 : 1;
        const fb = favoris.includes(b.id) ? 0 : 1;
        return fa - fb || a.name.localeCompare(b.name, "fr");
      });
  }, [options, recherche, favoris, value]);

  useEffect(() => {
    const terme = recherche.trim();
    if (terme.length < RECHERCHE_MIN) {
      setAnnuaire([]);
      setGroupesTrouves([]);
      return;
    }
    let annule = false;
    const minuterie = setTimeout(() => {
      setChercheAnnuaire(true);
      Promise.all([
        api.searchDirectoryUsers(terme).catch(() => []),
        avecGroupes
          ? api.searchDirectoryGroups(terme).catch(() => [])
          : Promise.resolve([]),
      ])
        .then(([personnes, groupesLus]) => {
          if (annule) return;
          setAnnuaire(personnes);
          setGroupesTrouves(groupesLus);
        })
        .finally(() => !annule && setChercheAnnuaire(false));
    }, DELAI_RECHERCHE);
    return () => {
      annule = true;
      clearTimeout(minuterie);
    };
  }, [recherche, avecGroupes]);

  // Les groupes retenus restent dans la liste, cochés, pour pouvoir les
  // retirer ; ceux que la recherche trouve en plus se cochent pour s'ajouter.
  const termeGroupes = normaliser(recherche.trim());
  const groupesListes = [
    ...groups.filter(
      (g) => !termeGroupes || normaliser(g.name).includes(termeGroupes),
    ),
    ...groupesTrouves.filter((g) => !groups.some((r) => r.id === g.id)),
  ];
  const basculerGroupe = (groupe: EntraPrincipal) =>
    onGroupsChange?.(
      groups.some((g) => g.id === groupe.id)
        ? groups.filter((g) => g.id !== groupe.id)
        : [...groups, { ...groupe, type: "group" }],
    );

  // L'annuaire propose tous ceux que la liste ne montre pas déjà — y compris
  // ceux qui ont un compte dans Milo : les choisir les pose simplement.
  const nouveaux = annuaire.filter(
    (p) =>
      !liste.some(
        (u) =>
          u.id === p.user_id || u.email.toLowerCase() === p.email.toLowerCase(),
      ),
  );

  const choisirDansLAnnuaire = async (personne: DirectoryUser) => {
    setAjout(personne.oid);
    try {
      const compte = await api.addDirectoryUser(personne.oid);
      setCrees((deja) => [...deja, compte]);
      if (!value.includes(String(compte.id)))
        onChange([...value, String(compte.id)]);
      setRecherche("");
    } finally {
      setAjout(null);
    }
  };

  return (
    <ChipPicker
      chipHeight={chipHeight}
      chipGap={chipGap}
      label={label}
      options={options}
      listOptions={liste}
      value={value}
      onChange={onChange}
      fullWidthOptions
      separated
      dropdownWidth={LARGEUR_LISTE}
      emptyText={
        recherche.trim()
          ? chercheAnnuaire || nouveaux.length || groupesListes.length
            ? ""
            : "Personne ne correspond dans l'annuaire"
          : groupesListes.length
            ? ""
            : avecGroupes
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
      onClose={() => setRecherche("")}
      header={
        <TextInput
          size="xs"
          placeholder="Rechercher"
          leftSection={<IconSearch size={14} />}
          rightSection={chercheAnnuaire ? <Loader size={12} /> : null}
          value={recherche}
          onChange={(e) => setRecherche(e.currentTarget.value)}
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
              <NomEtAdresse nom={u.name} email={u.email} />
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
                void basculer(u.id);
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
          {nouveaux.length > 0 && (
            // Séparés des favoris par un trait, quand il y en a au-dessus ; les
            // lignes et leurs filets courent d'un bord à l'autre, comme celles
            // des favoris. La dernière n'a pas de filet dessous.
            <Stack
              gap={0}
              style={liste.length ? { borderTop: FILET } : undefined}
            >
              {nouveaux.map((p, rang) => (
                <UnstyledButton
                  key={p.oid}
                  onClick={() => void choisirDansLAnnuaire(p)}
                  disabled={ajout !== null}
                  px={10}
                  py={8}
                  style={
                    rang < nouveaux.length - 1
                      ? { borderBottom: FILET }
                      : undefined
                  }
                  data-ligne
                >
                  <Group gap={8} wrap="nowrap">
                    {/* La bulle de la personne, avec ses initiales, comme celle
                        des comptes au-dessus ; le temps de la création de son
                        compte, une roue à sa place. */}
                    {ajout === p.oid ? (
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
                    <NomEtAdresse nom={p.name} email={p.email} />
                    {/* L'origine, au bout de la ligne, comme dans la
                        recherche des accès. */}
                    <OrigineAnnuaire synced={p.synced} largeur={LARGEUR_FAVORI} />
                  </Group>
                </UnstyledButton>
              ))}
            </Stack>
          )}
          {groupesListes.length > 0 && (
            // Les groupes, sous les personnes : un filet les en sépare quand
            // il y a quelque chose au-dessus.
            <Stack
              gap={0}
              style={
                liste.length || nouveaux.length
                  ? { borderTop: FILET }
                  : undefined
              }
            >
              {groupesListes.map((g, rang) => {
                const retenu = groups.some((r) => r.id === g.id);
                return (
                  <UnstyledButton
                    key={g.id}
                    onClick={() => basculerGroupe(g)}
                    px={10}
                    py={8}
                    style={
                      rang < groupesListes.length - 1
                        ? { borderBottom: FILET }
                        : undefined
                    }
                    data-ligne
                  >
                    <Group gap={8} wrap="nowrap">
                      <Checkbox
                        checked={retenu}
                        readOnly
                        size="xs"
                        tabIndex={-1}
                        aria-hidden
                        style={{ pointerEvents: "none" }}
                      />
                      <GroupAvatar group={g} size={chipHeight} />
                      <NomEtAdresse nom={g.name} email={g.email} />
                      <OrigineAnnuaire synced={g.synced} largeur={LARGEUR_FAVORI} />
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
