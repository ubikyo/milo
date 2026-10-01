import { Input, Stack, Switch } from "@mantine/core";
import { avec } from "../../widgets/types";
import type { IndicatorConfigProps } from "../../indicators/types";

// Les colonnes d'un widget liste — les demandes du Support, les postes des
// Assets : un interrupteur par colonne. Celle qui désigne la ligne — le
// numéro de ticket, le nom de l'asset — reste toujours montrée : son
// interrupteur est figé.

export interface ColonneDeListe {
  key: string;
  label: string;
  obligatoire?: boolean;
}

/** La clé des colonnes dans la configuration : un booléen par colonne, absent vaut montré. */
export const COLONNES = "colonnes";

/** Les colonnes que la configuration garde, dans l'ordre de la liste ; sans réglage, toutes. */
export const colonnesGardees = <C extends ColonneDeListe>(colonnes: C[], config: unknown): C[] => {
  const reglees = ((config as Record<string, unknown> | null)?.[COLONNES] ?? {}) as Record<
    string,
    unknown
  >;
  return colonnes.filter((c) => c.obligatoire || reglees[c.key] !== false);
};

export default function ChampsColonnes({
  colonnes,
  config,
  onChange,
}: IndicatorConfigProps & { colonnes: ColonneDeListe[] }) {
  const reglees = ((config as Record<string, unknown> | null)?.[COLONNES] ?? {}) as Record<
    string,
    unknown
  >;
  return (
    <Input.Wrapper label="Colonnes">
      <Stack gap="sm" mt="xs">
        {colonnes.map((colonne) => (
          <Switch
            key={colonne.key}
            color="teal"
            label={colonne.label}
            checked={colonne.obligatoire || reglees[colonne.key] !== false}
            disabled={colonne.obligatoire}
            onChange={(e) =>
              onChange(
                avec(config, COLONNES, { ...reglees, [colonne.key]: e.currentTarget.checked }),
              )
            }
          />
        ))}
      </Stack>
    </Input.Wrapper>
  );
}
