import { Avatar, Group, Text, useComputedColorScheme } from "@mantine/core";
import { IconAt } from "@tabler/icons-react";
import { MILO_ACTOR_ID } from "@milo/shared";
import type { Actor } from "@milo/shared";

const PALETTE: string[] = [
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
const colorFor = (key: string): string => {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) % 1000003;
  }
  return PALETTE[hash % PALETTE.length] as string;
};

// « Jérôme Quintard » -> « JQ », « Camille » -> « CA ».
//
// Tant que la première connexion n'a pas eu lieu, le compte n'a pas de nom et
// c'est l'adresse qui en tient lieu : « j.quintard@… » donnait « J. ». On lit
// alors le prénom et le nom dans la partie qui précède l'arobase, dont les
// morceaux sont séparés par un point, un tiret ou un souligné.
export const initialsOf = (name: string | undefined): string => {
  const brut = String(name || "").trim();
  const arobase = brut.indexOf("@");
  const source = arobase > 0 ? brut.slice(0, arobase).replace(/[._-]+/g, " ") : brut;

  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return (parts[0] as string).slice(0, 2).toUpperCase();
  const premier = parts[0] as string;
  const dernier = parts[parts.length - 1] as string;
  return (premier.charAt(0) + dernier.charAt(0)).toUpperCase();
};

// Pastille d'une seule personne, hors groupe. Même couleur et mêmes initiales
// que dans les acteurs, pour qu'on reconnaisse la même personne d'un écran à
// l'autre.
export function PersonAvatar({
  person,
  size = 22,
}: {
  person: Actor | null | undefined;
  size?: number;
}) {
  if (person?.id === MILO_ACTOR_ID) return <MiloAvatar size={size} />;
  return (
    <Avatar
      size={size}
      radius="xl"
      variant="filled"
      color={colorFor(person?.email || person?.name || "")}
      src={person?.gravatar_url || null}
    >
      {initialsOf(person?.name || person?.email)}
    </Avatar>
  );
}

// Milo, quand il signe un mot de l'application : son logo seul, sans pastille,
// à la manière de la favicon — la déclinaison inversée, claire, sur un thème
// sombre. Il est plus large que haut : il tient entier dans la place d'une
// pastille, sans être rogné.
function MiloAvatar({ size }: { size: number }) {
  const scheme = useComputedColorScheme("light", { getInitialValueInEffect: false });
  return (
    <Avatar
      size={size}
      radius={0}
      src={scheme === "dark" ? "/Milo-Inv-2.svg" : "/Milo-2.svg"}
      alt="Milo"
      styles={{ image: { objectFit: "contain" } }}
    />
  );
}

interface ActorAvatarsProps {
  actors: Actor[] | null | undefined;
  size?: number;
  max?: number;
}

export default function ActorAvatars({
  actors,
  size = ACTOR_AVATAR_SIZE,
  max = 4,
}: ActorAvatarsProps) {
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
            {initialsOf(actor.name || actor.email)}
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

// La pastille de l'arobase posée sur celle de l'expéditeur : un tiers
// de la bulle, au coin bas droit, cerclée du fond pour s'en détacher.
const BADGE_RATIO = 0.5;

/**
 * La bulle de la personne qui a envoyé l'e-mail d'une demande, marquée d'une
 * petite arobase, sur fond gris : on la reconnaît parmi les acteurs sans avoir à survoler.
 */
export function SenderAvatar({ person, size = ACTOR_AVATAR_SIZE }: { person: Actor; size?: number }) {
  const badge = Math.max(12, Math.round(size * BADGE_RATIO));
  return (
    <span style={{ position: "relative", display: "inline-flex" }}>
      <PersonAvatar person={person} size={size} />
      <span
        aria-hidden
        style={{
          position: "absolute",
          right: -3,
          bottom: -3,
          width: badge,
          height: badge,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "var(--mantine-color-gray-7)",
          border: "1px solid var(--mantine-color-black)",
          boxSizing: "border-box",
          color: "var(--mantine-color-white)",
          boxShadow: "0 0 0 2px var(--mantine-color-body)",
        }}
      >
        <IconAt size={badge - 4} stroke={2.2} />
      </span>
    </span>
  );
}
