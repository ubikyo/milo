import { ActionIcon, Anchor, Autocomplete, Group, Input, Select, Stack, Text } from "@mantine/core";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { useReferences } from "../../lib/references";
import { ADD_ACTION, RED } from "../../themes/colors";
import { PLUS_GAP, PLUS_SIZE } from "../../themes/plus";
import { avec } from "../../widgets/types";
import type { IndicatorConfigProps } from "../../indicators/types";
import type { Id } from "@milo/shared";

// Ce qu'une liste reçoit du dehors : les adresses e-mail d'où arrivent ses
// demandes, les tags d'agent GLPI d'où arrivent ses postes. Chacun va à l'un
// des contextes du tableau ; le serveur relit cette configuration
// (server, repositories/receptions.ts).

/** Une réception : la valeur reçue, et le contexte où elle se range. */
type Reception = Record<string, unknown> & { contexte?: number | null };

interface ChampReceptionProps extends IndicatorConfigProps {
  /** La clé de la configuration qui garde la liste : « boites », « tags ». */
  cle: string;
  /** Le champ de chaque entrée qui porte la valeur reçue : « email », « tag ». */
  champ: string;
  label: string;
  /** L'invite du champ de saisie : « support@… », « Tag de l'agent ». */
  placeholder: string;
  /** Le libellé du bouton d'ajout : « Ajouter une adresse », « Ajouter un tag ». */
  ajouter: string;
  /** Les valeurs déjà connues, proposées à la saisie. */
  suggestions?: string[];
}

/** Les réceptions que la configuration garde. */
export const receptionsDe = (config: unknown, cle: string): Reception[] => {
  const liste = (config as Record<string, unknown> | null)?.[cle];
  return Array.isArray(liste) ? (liste as Reception[]) : [];
};

/**
 * Vrai quand les réceptions d'un widget ne tiennent pas : aucune réception —
 * la liste ne recevrait rien —, ou une seule qui n'est pas complète. Chacune
 * doit avoir sa valeur, lisible (« valide » : une adresse e-mail pour une
 * boîte), et, dans un tableau qui a des contextes, un contexte qui existe
 * toujours — pas un ajouté depuis, ni un supprimé.
 */
export const receptionsAProbleme = (
  config: unknown,
  cle: string,
  champ: string,
  contextes: Id[],
  valide: (valeur: string) => boolean = (valeur) => valeur !== "",
): boolean => {
  const lignes = receptionsDe(config, cle);
  if (lignes.length === 0) return true;
  return lignes.some((l) => {
    const valeur = typeof l[champ] === "string" ? (l[champ] as string).trim() : "";
    if (!valide(valeur)) return true;
    return contextes.length > 0 && (!l.contexte || !contextes.includes(l.contexte as Id));
  });
};

/**
 * La liste des réceptions d'un widget : une ligne par adresse, ou par tag,
 * avec le contexte qui la reçoit. Se règle quand on pose la liste, et se
 * change ensuite dans son tiroir.
 */
export default function ChampReception({
  cle,
  champ,
  label,
  placeholder,
  ajouter,
  suggestions = [],
  config,
  onChange,
}: ChampReceptionProps) {
  const { contexts } = useReferences();
  const lignes = receptionsDe(config, cle);
  const contextes = contexts.map((c) => ({ value: String(c.id), label: c.name }));

  const poser = (suivantes: Reception[]) => onChange(avec(config, cle, suivantes));
  const changer = (rang: number, modif: Partial<Reception>) =>
    poser(lignes.map((l, i) => (i === rang ? { ...l, ...modif } : l)));

  return (
    <Input.Wrapper label={label}>
      <Stack gap="xs" mt="xs">
        {lignes.length === 0 && (
          <Text size="sm" c="dimmed">
            Rien n'est reçu pour l'instant.
          </Text>
        )}
        {lignes.map((ligne, rang) => (
          <Group key={rang} gap="xs" wrap="nowrap" align="flex-start">
            <Autocomplete
              style={{ flex: 1 }}
              placeholder={placeholder}
              data={suggestions}
              value={typeof ligne[champ] === "string" ? (ligne[champ] as string) : ""}
              onChange={(valeur) => changer(rang, { [champ]: valeur })}
            />
            {/* Un tableau sans contexte reçoit sans contexte : rien à choisir. */}
            {contextes.length > 0 && (
              <Select
                w={180}
                placeholder="Aucun contexte"
                data={contextes}
                value={ligne.contexte ? String(ligne.contexte) : null}
                onChange={(valeur) => changer(rang, { contexte: valeur ? Number(valeur) : null })}
                clearable
              />
            )}
            <ActionIcon
              variant="subtle"
              color={RED}
              size="lg"
              aria-label="Retirer"
              onClick={() => poser(lignes.filter((_, i) => i !== rang))}
            >
              <IconTrash size={16} />
            </ActionIcon>
          </Group>
        ))}
        <Anchor
          component="button"
          type="button"
          size="sm"
          c={ADD_ACTION.color}
          onClick={() => poser([...lignes, { [champ]: "", contexte: contexts[0]?.id ?? null }])}
          style={{ alignSelf: "flex-start" }}
        >
          <Group gap={PLUS_GAP} wrap="nowrap">
            <IconPlus size={PLUS_SIZE} />
            <span>{ajouter}</span>
          </Group>
        </Anchor>
      </Stack>
    </Input.Wrapper>
  );
}
