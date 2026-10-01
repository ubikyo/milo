import { Text, TextInput } from "@mantine/core";
import { NOM } from "../components/ui/TitreIndicateur";
import { avec, texte } from "../widgets/types";
import type { IndicatorConfigProps } from "./types";
import type { SupportRequest } from "@milo/shared";

// Ce que les widgets du panneau partagent : le nom qu'on leur donne, et la
// façon de reconnaître une demande encore en cours.

export { NOM };
export { default as TitreIndicateur } from "../components/ui/TitreIndicateur";

/** Une demande résolue ou fermée n'attend plus rien. */
export const enCours = (d: SupportRequest): boolean =>
  d.status !== "resolved" && d.status !== "closed";

/** Le champ « Nom » du tiroir ; vide, l'indicateur prend le nom de son type. */
export function ChampNom({ config, onChange, defaut }: IndicatorConfigProps & { defaut: string }) {
  return (
    <TextInput
      label="Nom"
      placeholder={defaut}
      value={texte(config, NOM)}
      onChange={(e) => onChange(avec(config, NOM, e.currentTarget.value))}
      autoFocus
    />
  );
}

/** Ce qu'un indicateur montre quand il n'a rien à compter. */
export function Rien({ children }: { children: string }) {
  return (
    <Text size="sm" c="dimmed">
      {children}
    </Text>
  );
}
