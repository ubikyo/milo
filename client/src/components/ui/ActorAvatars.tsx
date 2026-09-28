import { Avatar, Group, Text } from "@mantine/core";

const PALETTE = [
  "red",
  "pink",
  "grape",
  "violet",
  "indigo",
  "blue",
  "cyan",
  "teal",
  "green",
  "lime",
  "orange",
];

// Diamètre des pastilles ; la hauteur des lignes du tableau s'y aligne.
export const ACTOR_AVATAR_SIZE = 28;

// Écart entre deux pastilles voisines. Elles ne se chevauchent pas : elles se
// suivent, et un filet d'air suffit à les séparer.
export const ACTOR_GAP = 3;

// Couleur tirée du nom : arbitraire à l'œil, mais stable d'un rendu à l'autre
// et identique partout pour une même personne.
const colorFor = (key) => {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) % 1000003;
  }
  return PALETTE[hash % PALETTE.length];
};

// « Jérôme Quintard » -> « JQ », « Camille » -> « CA »
export const initialsOf = (name) => {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

// Pastille d'une seule personne, hors groupe. Même couleur et mêmes initiales
// que dans les acteurs, pour qu'on reconnaisse la même personne d'un écran à
// l'autre.
export function PersonAvatar({ person, size = 22 }) {
  return (
    <Avatar
      size={size}
      radius="xl"
      variant="filled"
      color={colorFor(person?.email || person?.name || "")}
      src={person?.gravatar_url || null}
    >
      {initialsOf(person?.name)}
    </Avatar>
  );
}

export default function ActorAvatars({ actors, size = ACTOR_AVATAR_SIZE, max = 4 }) {
  if (!actors || actors.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        —
      </Text>
    );
  }

  const shown = actors.slice(0, max);
  const hidden = actors.slice(max);

  return (
    // Boîte de hauteur fixe : sans elle, la line-box ajoute un demi-pixel et la
    // ligne du tableau devient plus haute que celles sans acteur.
    <div style={{ height: size, display: "flex", alignItems: "center", overflow: "hidden" }}>
      {/* Une simple rangée : les pastilles se suivent sans se recouvrir, donc
          sans le liseré qui servait à les détacher les unes des autres. */}
      <Group gap={ACTOR_GAP} wrap="nowrap">
        {shown.map((actor) => (
          <Avatar
            key={actor.id}
            size={size}
            radius="xl"
            variant="filled"
            color={colorFor(actor.email || actor.name)}
            src={actor.gravatar_url || null}
            // Le nom ne s'affiche pas au survol : il reste lisible au clavier
            // et aux lecteurs d'écran.
            aria-label={actor.name}
          >
            {initialsOf(actor.name)}
          </Avatar>
        ))}
        {hidden.length > 0 && (
          <Avatar
            size={size}
            radius="xl"
            aria-label={hidden.map((a) => a.name).join(", ")}
          >
            +{hidden.length}
          </Avatar>
        )}
      </Group>
    </div>
  );
}
