import { Avatar, Group, Text, useComputedColorScheme } from "@mantine/core";
import { IconAt } from "@tabler/icons-react";
import { MILO_ACTOR_ID } from "@milo/shared";
import { useDisplaySettings } from "../../lib/displaySettings";
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

// Avatar diameter; the table rows' height aligns with it.
export const ACTOR_AVATAR_SIZE = 28;

// Gap between two neighboring avatars. They do not overlap: they follow
// one another, and a thin gap of air is enough to separate them.
export const ACTOR_GAP = 3;

// Color derived from the name: arbitrary to the eye, but stable from one render to the next
// and identical everywhere for the same person.
const colorFor = (key: string): string => {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) % 1000003;
  }
  return PALETTE[hash % PALETTE.length] as string;
};

// "Jérôme Quintard" -> "JQ", "Camille" -> "CA".
//
// Until the first sign-in has happened, the account has no name and
// the address stands in for it: "j.quintard@…" gave "J.". The first
// and last names are then read from the part before the @, whose
// pieces are separated by a dot, a hyphen or an underscore.
export const initialsOf = (name: string | undefined): string => {
  const raw = String(name || "").trim();
  const atSign = raw.indexOf("@");
  const source = atSign > 0 ? raw.slice(0, atSign).replace(/[._-]+/g, " ") : raw;

  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return (parts[0] as string).slice(0, 2).toUpperCase();
  const first = parts[0] as string;
  const last = parts[parts.length - 1] as string;
  return (first.charAt(0) + last.charAt(0)).toUpperCase();
};

// Avatar of a single person, outside a group. Same color and same initials
// as in the actors, so that the same person is recognized from one screen to
// the other.
export function PersonAvatar({
  person,
  size = 22,
}: {
  person: Actor | null | undefined;
  size?: number;
}) {
  const { settings } = useDisplaySettings();
  if (person?.id === MILO_ACTOR_ID) return <MiloAvatar size={size} />;
  return (
    <Avatar
      size={size}
      radius="xl"
      variant="filled"
      color={colorFor(person?.email || person?.name || "")}
      src={(settings.showGravatars && person?.gravatar_url) || null}
    >
      {initialsOf(person?.name || person?.email)}
    </Avatar>
  );
}

// Milo, when it signs an application word: its logo alone, without an avatar,
// in the manner of the favicon — the inverted variant, light, on a dark
// theme. It is wider than tall: it fits whole in the space of an
// avatar, without being cropped.
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
  const { settings } = useDisplaySettings();
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
    // Fixed-height box: without it, the line-box adds half a pixel and the
    // table row becomes taller than those without an actor.
    <div style={{ height: size, display: "flex", alignItems: "center", overflow: "hidden" }}>
      {/* A simple row: the avatars follow one another without overlapping, hence
          without the outline that used to set them apart from one another. */}
      <Group gap={ACTOR_GAP} wrap="nowrap">
        {shown.map((actor) => (
          <Avatar
            key={actor.id}
            size={size}
            radius="xl"
            variant="filled"
            color={colorFor(actor.email || actor.name)}
            src={(settings.showGravatars && actor.gravatar_url) || null}
            // The name is not displayed on hover: it stays readable by keyboard
            // and screen readers.
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

// The @ badge placed on the sender's avatar: a third
// of the bubble, at the bottom-right corner, ringed with the background to stand out.
const BADGE_RATIO = 0.5;

/**
 * The avatar of the person who sent a request's e-mail, marked with a
 * small @, on a gray background: it is recognized among the actors without hovering.
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
