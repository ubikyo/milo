import { Group, Input, Menu, NumberInput, Select, Stack } from "@mantine/core";
import { IconChevronDown, IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import type { DragEvent } from "react";
import classes from "../../assets/styles/ChampsColonnes.module.css";
import { RED } from "../../themes/colors";
import { avec } from "../../widgets/types";
import type { IndicatorConfigProps } from "../../indicators/types";
import AddButton from "./AddButton";
import {
  ARRONDI,
  FOND_SAISIE,
  Poignee,
  RETRAIT_NOM,
  STYLE_SAISIE,
  deplacer,
  styleLigne,
} from "./LignesDuTiroir";
import PointMenu, { positionDuMenu, type PointMenuPosition } from "./PointMenu";

// Les colonnes d'un widget liste — les projets, les demandes du Support, les
// postes des Assets : lesquelles il montre, dans quel ordre, et à quelle
// largeur par défaut.
//
// Chaque colonne montrée est une ligne : sa poignée pour la glisser à une
// autre place, son nom, sa largeur. Le nom est un select : un clic ouvre la
// liste des colonnes, pour la remplacer par une autre. Le clic droit la retire
// (« Supprimer »). « Ajouter une colonne » pose une ligne vide au bout, où
// l'on choisit laquelle. Une colonne peut revenir autant de fois qu'on
// veut ; la liste en garde au moins une : la dernière ne se retire pas.
//
// La largeur est celle que la grille prend tant que personne n'a tiré ses
// colonnes : chacun peut encore les ajuster pour soi, et le double-clic sur
// une poignée de la grille y ramène. Vide, la colonne prend la largeur de son
// contenu.

export interface ColonneDeListe {
  key: string;
  label: string;
}

/** Une colonne montrée : « id » la distingue de ses doubles, dans la grille. */
export type ColonneMontree<C extends ColonneDeListe> = C & { id: string; largeur?: number };

/** Les colonnes montrées, dans l'ordre : une entrée par ligne de la liste. */
export const LISTE_COLONNES = "liste_colonnes";

// Les réglages d'avant la liste : un booléen par colonne, leur ordre, leurs
// largeurs. Relus tant que la liste n'a pas été enregistrée.
const COLONNES = "colonnes";
const ORDRE_COLONNES = "ordre_colonnes";
const LARGEURS_COLONNES = "largeurs_colonnes";

interface Entree {
  key: string;
  largeur?: number;
}

/**
 * La liste des colonnes ne montre que cinq options à la fois, puis défile :
 * une option de taille « sm » mesure 33,6875 px.
 */
const OPTIONS_VISIBLES = 5;
const HAUTEUR_OPTION = 33.6875;

/** En deçà, la colonne ne montrerait plus qu'une ellipse — comme dans la grille. */
const LARGEUR_MIN = 40;

const champ = (config: unknown, cle: string): unknown =>
  (config as Record<string, unknown> | null)?.[cle];

const objet = (config: unknown, cle: string): Record<string, unknown> => {
  const valeur = champ(config, cle);
  return valeur && typeof valeur === "object" && !Array.isArray(valeur)
    ? (valeur as Record<string, unknown>)
    : {};
};

const largeurLue = (valeur: unknown): number | undefined =>
  typeof valeur === "number" && valeur >= LARGEUR_MIN ? valeur : undefined;

/** Les entrées d'avant la liste : les colonnes non masquées, dans l'ordre réglé. */
const entreesAnciennes = (colonnes: ColonneDeListe[], config: unknown): Entree[] => {
  const brut = champ(config, ORDRE_COLONNES);
  const ordre = Array.isArray(brut) ? brut.filter((k): k is string => typeof k === "string") : [];
  const rang = (c: ColonneDeListe) => {
    const i = ordre.indexOf(c.key);
    return i === -1 ? ordre.length + colonnes.indexOf(c) : i;
  };
  const masquees = objet(config, COLONNES);
  const largeurs = objet(config, LARGEURS_COLONNES);
  return [...colonnes]
    .sort((a, b) => rang(a) - rang(b))
    .filter((c) => masquees[c.key] !== false)
    .map((c) => ({ key: c.key, largeur: largeurLue(largeurs[c.key]) }));
};

/**
 * Les entrées de la configuration, connues seulement. Sans liste — ou sans
 * aucune colonne connue —, toutes les colonnes.
 */
const entrees = (colonnes: ColonneDeListe[], config: unknown): Entree[] => {
  const brut = champ(config, LISTE_COLONNES);
  const lues: Entree[] = Array.isArray(brut)
    ? brut
        .filter(
          (e): e is Entree =>
            Boolean(e) && typeof e === "object" && colonnes.some((c) => c.key === e.key),
        )
        .map((e) => ({ key: e.key, largeur: largeurLue(e.largeur) }))
    : entreesAnciennes(colonnes, config);
  return lues.length > 0 ? lues : colonnes.map((c) => ({ key: c.key }));
};

/** L'identifiant de chaque entrée : sa clé, suivie de son rang pour un double. */
const identifiants = (liste: Entree[]): string[] => {
  const vues = new Map<string, number>();
  return liste.map(({ key }) => {
    const n = (vues.get(key) ?? 0) + 1;
    vues.set(key, n);
    return n === 1 ? key : `${key}~${n}`;
  });
};

/** Les colonnes que la configuration montre, dans son ordre ; sans réglage, toutes. */
export const colonnesGardees = <C extends ColonneDeListe>(
  colonnes: C[],
  config: unknown,
): ColonneMontree<C>[] => {
  const liste = entrees(colonnes, config);
  const ids = identifiants(liste);
  return liste.map((e, i) => ({
    ...colonnes.find((c) => c.key === e.key)!,
    id: ids[i]!,
    largeur: e.largeur,
  }));
};

/**
 * Les largeurs par défaut que la configuration donne, par identifiant, pour
 * la grille (useColonnesRedimensionnables) ; « undefined » quand elle n'en
 * donne aucune — la grille garde alors sa mise en page naturelle.
 */
export const largeursParDefaut = (
  colonnes: ColonneDeListe[],
  config: unknown,
): Record<string, number> | undefined => {
  const largeurs = Object.fromEntries(
    colonnesGardees(colonnes, config)
      .filter((c) => c.largeur !== undefined)
      .map((c) => [c.id, c.largeur!]),
  );
  return Object.keys(largeurs).length > 0 ? largeurs : undefined;
};

export default function ChampsColonnes({
  colonnes,
  config,
  onChange,
}: IndicatorConfigProps & { colonnes: ColonneDeListe[] }) {
  const liste = entrees(colonnes, config);
  const ids = identifiants(liste);
  /** Le rang de la ligne qu'on glisse. */
  const [tenue, setTenue] = useState<number | null>(null);
  /** Vrai pendant qu'une ligne ajoutée attend sa colonne, au bout de la liste. */
  const [enAjout, setEnAjout] = useState(false);
  /** Le rang de la ligne dont la liste des colonnes est ouverte. */
  const [ouverte, setOuverte] = useState<number | null>(null);
  /** Le rang de la ligne dont la largeur a le focus : son champ prend le fond du tiroir. */
  const [saisie, setSaisie] = useState<number | null>(null);
  /** Le menu du clic droit, et le rang de la ligne qu'il vise. */
  const [menu, setMenu] = useState<{ rang: number; position: PointMenuPosition } | null>(null);

  /** Les lignes affichées : la liste, et au bout celle qu'on ajoute. */
  const lignes = enAjout ? [...liste, { key: "" }] : liste;
  const colonneDe = (key: string) => colonnes.find((c) => c.key === key);
  const ranger = (suivante: Entree[]) => onChange(avec(config, LISTE_COLONNES, suivante));

  // La dernière colonne qui reste ne se retire pas : la liste en montre au
  // moins une.
  const derniere = liste.length === 1;

  const retirer = (rang: number) => ranger(liste.filter((_, i) => i !== rang));

  // La nouvelle ligne se pose au bout, vide : c'est là qu'on dit quelle
  // colonne on voulait. Elle n'entre dans la configuration qu'une colonne
  // choisie ; quittée sans choix, elle s'efface.
  const ajouter = () => setEnAjout(true);

  // Une autre colonne à la même place : sa largeur repart de zéro. Sur la
  // ligne ajoutée, la colonne choisie rejoint la liste.
  const remplacer = (rang: number, key: string | null) => {
    setEnAjout(false);
    if (!key) return;
    if (rang === liste.length) return ranger([...liste, { key }]);
    if (key === liste[rang]?.key) return;
    ranger(liste.map((e, i) => (i === rang ? { key } : e)));
  };

  const changerLargeur = (rang: number, valeur: string | number) =>
    ranger(liste.map((e, i) => (i === rang ? { key: e.key, largeur: largeurLue(valeur) } : e)));

  // La ligne tenue prend la place de celle qu'elle survole : la liste se
  // range sous le pointeur, et la configuration suit.
  const survoler = (e: DragEvent<HTMLElement>, rang: number) => {
    if (tenue === null) return;
    e.preventDefault();
    const suivante = deplacer(liste, tenue, rang);
    if (!suivante) return;
    setTenue(rang);
    ranger(suivante);
  };

  const options = colonnes.map((c) => ({ value: c.key, label: c.label }));

  return (
    <Input.Wrapper label="Colonnes">
      {/* Le même écart sous le libellé que celui des autres champs. */}
      <Stack gap={1}>
        {lignes.map((entree, rang) => {
          // La ligne ajoutée n'a pas encore de colonne.
          const colonne = colonneDe(entree.key) ?? { key: "", label: "" };
          const nouvelle = rang === liste.length;
          return (
            <Group
              key={nouvelle ? "nouvelle" : ids[rang]}
              gap="sm"
              wrap="nowrap"
              onDragOver={(e) => survoler(e, rang)}
              onDrop={(e) => e.preventDefault()}
              onContextMenu={(e) => {
                if (nouvelle || derniere) return;
                setMenu({ rang, position: positionDuMenu(e) });
              }}
              style={styleLigne(rang, lignes.length, tenue === rang)}
            >
              <Poignee
                label={`Déplacer la colonne ${colonne.label}`}
                // La ligne ajoutée ne bouge ni ne se règle tant qu'elle n'a
                // pas de colonne.
                active={!nouvelle}
                onDragStart={() => setTenue(rang)}
                onDragEnd={() => setTenue(null)}
              />
              <Select
                // Le texte a la taille des noms.
                size="sm"
                radius={ARRONDI}
                // Le champ garde le même retrait que celui de la largeur, en
                // haut et en bas, et s'avance sur son retrait de gauche : le
                // nom reste aligné sur la poignée.
                style={{ flex: 1, marginLeft: -RETRAIT_NOM }}
                data={options}
                value={entree.key || null}
                placeholder="Choisir une colonne"
                onChange={(valeur) => remplacer(rang, valeur)}
                // La ligne ajoutée, quittée sans colonne, s'efface.
                onBlur={() => nouvelle && setEnAjout(false)}
                onDropdownOpen={() => setOuverte(rang)}
                onDropdownClose={() => setOuverte(null)}
                allowDeselect={false}
                autoFocus={nouvelle}
                // Un select classique : le chevron toujours là, la liste
                // ouverte au clic.
                rightSection={<IconChevronDown size={14} />}
                rightSectionPointerEvents="none"
                // La liste se présente comme la palette des couleurs d'une
                // étiquette : un panneau flottant de Mantine, cerné et ombré.
                comboboxProps={{ shadow: "md" }}
                maxDropdownHeight={OPTIONS_VISIBLES * HAUTEUR_OPTION}
                styles={{
                  // Le champ se présente comme celui de la largeur : son fond,
                  // et celui du tiroir tant que la liste est ouverte.
                  input: {
                    height: "var(--input-height-xs)",
                    minHeight: "var(--input-height-xs)",
                    // Sans bordure, le texte s'aligne sur les autres noms.
                    borderWidth: 0,
                    paddingLeft: RETRAIT_NOM,
                    cursor: "pointer",
                    ...(ouverte === rang ? { backgroundColor: FOND_SAISIE } : {}),
                  },
                }}
                classNames={{ option: classes.option }}
                aria-label={nouvelle ? "Colonne à ajouter" : `Colonne ${colonne.label}`}
              />
              <NumberInput
                size="xs"
                radius={ARRONDI}
                disabled={nouvelle}
                w={100}
                placeholder="Auto"
                suffix=" px"
                min={LARGEUR_MIN}
                max={1200}
                allowDecimal={false}
                allowNegative={false}
                aria-label={`Largeur de la colonne ${colonne.label}`}
                value={entree.largeur ?? ""}
                onChange={(valeur) => changerLargeur(rang, valeur)}
                onFocus={() => setSaisie(rang)}
                onBlur={() => setSaisie(null)}
                styles={saisie === rang ? { input: STYLE_SAISIE } : undefined}
              />
            </Group>
          );
        })}
      </Stack>

      {/* Au plus près de la liste qu'il allonge. */}
      <AddButton label="Ajouter une colonne" onClick={ajouter} mt={4} />

      {menu && (
        <PointMenu position={menu.position} onClose={() => setMenu(null)}>
          <Menu.Item
            color={RED}
            leftSection={<IconTrash size={16} />}
            onClick={() => retirer(menu.rang)}
          >
            Supprimer
          </Menu.Item>
        </PointMenu>
      )}
    </Input.Wrapper>
  );
}
