// Les modes de l'application, dans l'ordre du sélecteur en bas à gauche.
// Tab passe de l'un à l'autre, dans cet ordre.
//
// Cette liste était écrite deux fois — une fois par le client pour son
// sélecteur, une fois par le serveur pour valider le mode d'ouverture d'un
// compte. Les deux la lisent désormais ici.

export const MODES = [
  { value: "access", label: "Accès" },
  { value: "projects", label: "Projets" },
  { value: "tasks", label: "Tâches" },
  { value: "support", label: "Support" },
] as const;

export type Mode = (typeof MODES)[number]["value"];

/** Mode d'ouverture d'une session, tant que le compte n'en a pas choisi un autre. */
export const DEFAULT_MODE: Mode = "projects";

export const isMode = (value: unknown): value is Mode =>
  MODES.some((m) => m.value === value);
