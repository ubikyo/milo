import { Avatar, Text, Tooltip } from "@mantine/core";

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

// Recouvrement entre deux pastilles voisines.
const ACTOR_OVERLAP = 8;

// Contour des pastilles.
const ACTOR_OUTLINE = "#000000";

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
    <div style={{ height: ACTOR_AVATAR_SIZE, display: "flex", alignItems: "center", overflow: "hidden" }}>
      {/* `spacing` d'Avatar.Group correspond au recouvrement entre deux pastilles. */}
      <Avatar.Group spacing={ACTOR_OVERLAP}>
        {shown.map((actor) => (
          <Tooltip key={actor.id} label={actor.name} withinPortal>
            <Avatar
              size={size}
              radius="xl"
              variant="filled"
              color={colorFor(actor.email || actor.name)}
              src={actor.gravatar_url || null}
              // Trait noir fin autour de la pastille, en remplacement du liseré
              // épais et sombre posé par défaut par Avatar.Group.
              styles={{ root: { border: `1px solid ${ACTOR_OUTLINE}` } }}
            >
              {initialsOf(actor.name)}
            </Avatar>
          </Tooltip>
        ))}
        {hidden.length > 0 && (
          <Tooltip label={hidden.map((a) => a.name).join(", ")} withinPortal>
            <Avatar size={size} radius="xl" styles={{ root: { border: `1px solid ${ACTOR_OUTLINE}` } }}>
              +{hidden.length}
            </Avatar>
          </Tooltip>
        )}
      </Avatar.Group>
    </div>
  );
}
