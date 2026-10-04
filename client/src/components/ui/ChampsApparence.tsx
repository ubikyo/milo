import { nombre, texte } from "../../widgets/types";
import { poser, type LigneReglage } from "./LignesReglages";
import { FOND, TITRE, VALEUR, type TexteDeCarte } from "./TitreIndicateur";

// L'allure de la carte d'un indicateur, en lignes du bloc « Apparence »
// (LignesReglages) : le titre et la valeur règlent leur couleur et leur
// taille ; le fond, sa seule couleur. Le registre (board-widgets) y ajoute le
// cadre et les marges, communs à tous les widgets.

type Config = Record<string, unknown>;

const ligneTexte = (
  nom: string,
  quoi: string,
  t: TexteDeCarte,
  config: unknown,
  onChange: (config: Config) => void,
): LigneReglage => {
  const taille = nombre(config, t.cleTaille, t.tailleDefaut);
  const couleur = texte(config, t.cleCouleur);
  return {
    nom,
    quoi,
    couleur: {
      valeur: couleur,
      onChange: (v) => onChange(poser(config, { [t.cleCouleur]: v })),
    },
    taille: {
      valeur: taille,
      defaut: t.tailleDefaut,
      min: t.tailleMin,
      max: t.tailleMax,
      onChange: (v) =>
        onChange(
          poser(config, { [t.cleTaille]: v === t.tailleDefaut ? "" : v }),
        ),
    },
    modifiee: taille !== t.tailleDefaut || couleur !== "",
    reinitialiser: () =>
      onChange(poser(config, { [t.cleTaille]: "", [t.cleCouleur]: "" })),
  };
};

/**
 * Les lignes de la carte d'un indicateur : le titre, la valeur pour un
 * indicateur qui compte, puis le fond.
 */
export const lignesApparence = (
  config: unknown,
  onChange: (config: Config) => void,
  avecValeur?: boolean,
): LigneReglage[] => {
  const fond = texte(config, FOND);
  return [
    ligneTexte("Titre", "du titre", TITRE, config, onChange),
    ...(avecValeur ? [ligneTexte("Valeur", "de la valeur", VALEUR, config, onChange)] : []),
    {
      nom: "Fond",
      quoi: "du fond",
      couleur: {
        valeur: fond,
        onChange: (v) => onChange(poser(config, { [FOND]: v })),
      },
      modifiee: fond !== "",
      reinitialiser: () => onChange(poser(config, { [FOND]: "" })),
    },
  ];
};
