import { Autocomplete, Group, Input, Menu, Select, Stack } from "@mantine/core";
import { IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import type { ComponentType, ReactNode } from "react";
import { useReferences } from "../../lib/references";
import { RED } from "../../themes/colors";
import { avec } from "../../widgets/types";
import type { IndicatorConfigProps } from "../../indicators/types";
import type { Id } from "@milo/shared";
import AddButton from "./AddButton";
import {
  ARRONDI,
  ListeVide,
  RETRAIT_LIGNE,
  RETRAIT_NOM,
  STYLE_SAISIE,
  styleLigne,
} from "./LignesDuTiroir";
import PointMenu, { positionDuMenu, type PointMenuPosition } from "./PointMenu";

// Ce qu'une liste reçoit du dehors : les adresses e-mail d'où arrivent ses
// tickets, les tags d'agent GLPI d'où arrivent ses postes. Chacun va à l'un
// des contextes du tableau ; le serveur relit cette configuration
// (server, repositories/receptions.ts).
//
// Elles se présentent comme les colonnes d'une liste (ChampsColonnes) : une
// ligne par réception, sa valeur à même la ligne, son contexte à droite. Le
// clic droit la retire ; « Ajouter » pose une ligne vide au bout, qui
// s'efface si on la quitte sans rien y écrire. Sans réception, l'invite des
// listes vides (ListeVide).

/** Une réception : la valeur reçue, et le contexte où elle se range. */
type Reception = Record<string, unknown> & { contexte?: number | null };

/** La largeur du choix du contexte. */
const LARGEUR_CONTEXTE = 170;

interface ChampReceptionProps extends IndicatorConfigProps {
  /** La clé de la configuration qui garde la liste : « boites », « tags ». */
  cle: string;
  /** Le champ de chaque entrée qui porte la valeur reçue : « email », « tag ». */
  champ: string;
  label: string;
  /** Ce que le libellé explique, dessous. */
  description?: ReactNode;
  /** L'invite du champ de saisie : « Adresse e-mail », « Tag de l'agent ». */
  placeholder: string;
  /** Le libellé du bouton d'ajout : « Ajouter une adresse e-mail ». */
  ajouter: string;
  /** L'icône et le message de la liste vide. */
  icone: ComponentType<{ size?: number; color?: string }>;
  vide: string;
  /** Les valeurs déjà connues, proposées à la saisie. */
  suggestions?: string[];
  /** Ce que la ligne montre au bout, d'après sa valeur — l'état d'une adresse. */
  etat?: (valeur: string) => ReactNode;
  /** La valeur telle qu'elle se range : une adresse sans espaces, par exemple. */
  normaliser?: (valeur: string) => string;
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
  description,
  placeholder,
  ajouter,
  icone,
  vide,
  suggestions = [],
  etat,
  normaliser = (valeur) => valeur,
  config,
  onChange,
}: ChampReceptionProps) {
  const { contexts } = useReferences();
  const lignes = receptionsDe(config, cle);
  const contextes = contexts.map((c) => ({ value: String(c.id), label: c.name }));
  /** Le champ qui a le focus : il prend le fond du tiroir. */
  const [saisie, setSaisie] = useState<string | null>(null);
  /** La ligne qu'on vient d'ajouter : sa valeur prend le focus. */
  const [aRemplir, setARemplir] = useState<number | null>(null);
  /**
   * La ligne dont les suggestions sont ouvertes. Elles attendent qu'on tape ou
   * qu'on clique dans le champ : la ligne ajoutée prend le focus sans les
   * déplier.
   */
  const [suggere, setSuggere] = useState<number | null>(null);
  const [menu, setMenu] = useState<{ rang: number; position: PointMenuPosition } | null>(null);

  const valeurDe = (l: Reception) => (typeof l[champ] === "string" ? (l[champ] as string) : "");
  const poser = (suivantes: Reception[]) => onChange(avec(config, cle, suivantes));
  const changer = (rang: number, modif: Partial<Reception>) =>
    poser(lignes.map((l, i) => (i === rang ? { ...l, ...modif } : l)));
  const retirer = (rang: number) => poser(lignes.filter((_, i) => i !== rang));

  // La ligne neuve va au premier contexte : on le change sur la ligne.
  const ajouterLigne = () => {
    poser([...lignes, { [champ]: "", contexte: contexts[0]?.id ?? null }]);
    setARemplir(lignes.length);
  };

  return (
    <Input.Wrapper
      label={label}
      description={description}
      styles={description ? { description: { paddingBottom: 10 } } : undefined}
    >
      {lignes.length === 0 ? (
        <ListeVide icon={icone} message={vide} />
      ) : (
        <Stack gap={1}>
          {lignes.map((ligne, rang) => (
            <Group
              key={rang}
              gap="sm"
              wrap="nowrap"
              onContextMenu={(e) => setMenu({ rang, position: positionDuMenu(e) })}
              // Sans poignée, la valeur se cale à gauche comme le contexte à
              // droite : à RETRAIT_LIGNE du bord de la ligne.
              style={{ ...styleLigne(rang, lignes.length, false), paddingLeft: RETRAIT_LIGNE }}
            >
              <Autocomplete
                size="sm"
                radius={ARRONDI}
                style={{ flex: 1, minWidth: 0 }}
                styles={{
                  input: {
                    height: "var(--input-height-xs)",
                    minHeight: "var(--input-height-xs)",
                    paddingLeft: RETRAIT_NOM,
                    borderWidth: 0,
                    ...(saisie === `${rang}-valeur`
                      ? STYLE_SAISIE
                      : { backgroundColor: "transparent" }),
                  },
                }}
                placeholder={placeholder}
                aria-label={placeholder}
                data={suggestions}
                value={valeurDe(ligne)}
                onChange={(valeur) => {
                  changer(rang, { [champ]: normaliser(valeur) });
                  setSuggere(rang);
                }}
                dropdownOpened={suggere === rang}
                onClick={() => setSuggere(rang)}
                onOptionSubmit={() => setSuggere(null)}
                onDropdownClose={() => setSuggere(null)}
                autoFocus={aRemplir === rang}
                onFocus={() => setSaisie(`${rang}-valeur`)}
                onBlur={() => {
                  setSaisie(null);
                  setARemplir(null);
                  setSuggere(null);
                  // Une ligne quittée sans valeur s'efface.
                  if (!valeurDe(ligne).trim()) retirer(rang);
                }}
              />
              {/* Un tableau sans contexte reçoit sans contexte : rien à choisir. */}
              {contextes.length > 0 && (
                <Select
                  size="xs"
                  radius={ARRONDI}
                  w={LARGEUR_CONTEXTE}
                  style={{ flexShrink: 0 }}
                  placeholder="Contexte"
                  aria-label="Contexte"
                  data={contextes}
                  value={ligne.contexte ? String(ligne.contexte) : null}
                  onChange={(valeur) => changer(rang, { contexte: valeur ? Number(valeur) : null })}
                  allowDeselect={false}
                  comboboxProps={{ withinPortal: true }}
                  onFocus={() => setSaisie(`${rang}-contexte`)}
                  onBlur={() => setSaisie(null)}
                  styles={saisie === `${rang}-contexte` ? { input: STYLE_SAISIE } : undefined}
                />
              )}
              {etat?.(valeurDe(ligne))}
            </Group>
          ))}
        </Stack>
      )}

      {/* Au plus près de la liste qu'il allonge. */}
      <AddButton label={ajouter} onClick={ajouterLigne} mt={4} />

      {menu && (
        <PointMenu position={menu.position} onClose={() => setMenu(null)}>
          <Menu.Item
            color={RED}
            leftSection={<IconTrash size={16} />}
            onClick={() => {
              retirer(menu.rang);
              setMenu(null);
            }}
          >
            Supprimer
          </Menu.Item>
        </PointMenu>
      )}
    </Input.Wrapper>
  );
}
