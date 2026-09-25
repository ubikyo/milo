// Les modes de l'application, dans l'ordre du sélecteur en bas à gauche.
// Tab passe de l'un à l'autre, dans cet ordre.
export const MODES = [
  { value: "access", label: "Accès" },
  { value: "projects", label: "Projets" },
  { value: "tasks", label: "Tâches" },
  { value: "support", label: "Support" },
];

// Mode d'ouverture d'une session, tant que le compte n'en a pas choisi un autre.
export const DEFAULT_MODE = "projects";

export const isMode = (value) => MODES.some((m) => m.value === value);
