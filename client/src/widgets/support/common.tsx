import { Text, TextInput } from "@mantine/core";
import { NAME } from "../../components/ui/IndicatorTitle";
import { withField, text } from "../types";
import type { IndicatorConfigProps } from "./types";
import type { SupportRequest } from "@milo/shared";

// What the panel's widgets share: the name given to them, and the
// way to recognize a request still open.

export { NAME };
export { default as IndicatorTitle, IndicatorValue } from "../../components/ui/IndicatorTitle";

/** A resolved or closed request is waiting for nothing anymore. */
export const ongoing = (d: SupportRequest): boolean =>
  d.status !== "resolved" && d.status !== "closed";

/** The drawer's "Nom" field; when empty, the indicator takes the name of its type. */
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

/** What an indicator shows when it has nothing to count. */
export function Nothing({ children }: { children: string }) {
  return (
    <Text size="sm" c="dimmed">
      {children}
    </Text>
  );
}
