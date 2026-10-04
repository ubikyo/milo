import { Text, TextInput } from "@mantine/core";
import { NAME } from "../components/ui/IndicatorTitle";
import { withField, text } from "../widgets/types";
import type { IndicatorConfigProps } from "./types";
import type { SupportRequest } from "@milo/shared";

// Ce que les widgets du panneau partagent : le nom qu'on leur donne, et la
// façon de reconnaître une demande encore en cours.

export { NAME };
export { default as IndicatorTitle, IndicatorValue } from "../components/ui/IndicatorTitle";

/** Une demande résolue ou fermée n'attend plus rien. */
export const ongoing = (d: SupportRequest): boolean =>
  d.status !== "resolved" && d.status !== "closed";

/** Le champ « Nom » du tiroir ; vide, l'indicateur prend le nom de son type. */
export function NameField({ config, onChange, defaultValue }: IndicatorConfigProps & { defaultValue: string }) {
  return (
    <TextInput
      label="Nom"
      placeholder={defaultValue}
      value={text(config, NAME)}
      onChange={(e) => onChange(withField(config, NAME, e.currentTarget.value))}
      autoFocus
    />
  );
}

/** Ce qu'un indicateur montre quand il n'a rien à compter. */
export function Nothing({ children }: { children: string }) {
  return (
    <Text size="sm" c="dimmed">
      {children}
    </Text>
  );
}
