import { ColorInput, ColorSwatch, NumberInput, Tooltip, UnstyledButton } from "@mantine/core";
import { IconRestore } from "@tabler/icons-react";
import classes from "../assets/styles/Reinitialiser.module.css";
import { BLEU, ORANGE, ROUGE, VERT } from "../themes/colors";
import { nombre, texte } from "./types";

// Les champs qui règlent l'allure d'un texte dans la colonne — sa couleur,
// sa taille — tels que les titres et les liens les proposent. Chacun montre
// la valeur en vigueur et porte de quoi revenir à celle du widget. Ramené à
// cette valeur, ou vidé, le réglage est retiré de la configuration : l'élément
// suit alors de nouveau ce que le widget prévoit.

/**
 * Les couleurs proposées d'un clic, sur deux rangées de sept : celles de
 * l'application, les autres teintes de Mantine (nuance 6, celle de ses
 * boutons), et des neutres — des gris francs, pas ceux de Mantine, qui tirent
 * sur le bleu.
 */
const NUANCES = [
  ROUGE,
  ORANGE,
  "#fab005", // jaune
  "#82c91e", // lime
  VERT,
  "#1098ad", // cyan
  BLEU,
  "#4263eb", // indigo
  "#7048e8", // violet
  "#ae3ec9", // grape
  "#d6336c", // rose
  "#ffffff",
  "#c4c4c4",
  "#4d4d4d",
];

/** Le nombre de nuances par rangée. */
const NUANCES_PAR_RANGEE = 7;

/**
 * La largeur des champs de réglage : quelques chiffres ou un code couleur,
 * ils n'ont pas à couvrir le tiroir. Les marges la reprennent (marges.tsx).
 */
export const LARGEUR_CHAMP = 120;

/** La place du bouton de réinitialisation, à gauche dans le champ. */
const LARGEUR_BOUTON = 28;

/**
 * L'air laissé entre le filet du bouton et ce qui le suit dans le champ : sans
 * lui, le texte vient contre le filet et le bouton ne s'en détache pas.
 */
const ECART = 8;

/** L'aperçu de la couleur, qui suit le bouton dans le champ couleur. */
const TAILLE_APERCU = 16;

/** La configuration reçue, où un réglage est posé — ou retiré s'il vaut l'ordinaire. */
const regle = (
  config: unknown,
  cle: string,
  valeur: unknown,
  defaut: unknown,
): Record<string, unknown> => {
  const { [cle]: _retire, ...reste } = (config as Record<string, unknown> | null) ?? {};
  return valeur === "" || valeur === defaut ? reste : { ...reste, [cle]: valeur };
};

/**
 * Le bouton qui ramène un champ à la valeur du widget, posé à gauche dans le
 * champ (assets/styles/Reinitialiser.module.css). Toujours là, pour qu'on
 * sache où il se trouve ; estompé et sans effet tant que le champ y est déjà.
 */
function Reinitialiser({ actif, onClick }: { actif: boolean; onClick: () => void }) {
  return (
    <Tooltip label="Revenir à la valeur par défaut" disabled={!actif}>
      <UnstyledButton
        className={classes.bouton}
        aria-label="Revenir à la valeur par défaut"
        aria-disabled={!actif}
        onClick={() => actif && onClick()}
      >
        <IconRestore size={14} />
      </UnstyledButton>
    </Tooltip>
  );
}

/**
 * Ce qu'un champ de Mantine reçoit pour porter le bouton à sa gauche. La
 * section laisse passer les clics : par défaut, Mantine les lui retire.
 */
export const avecReinitialiser = (actif: boolean, onClick: () => void) => ({
  // La section s'étend au-delà du bouton, de l'écart qui le sépare du texte :
  // le champ fait commencer sa saisie là où elle s'arrête.
  leftSection: (
    <div style={{ width: "100%", height: "100%", paddingInlineEnd: ECART }}>
      <Reinitialiser actif={actif} onClick={onClick} />
    </div>
  ),
  leftSectionWidth: LARGEUR_BOUTON + ECART,
  leftSectionPointerEvents: "all" as const,
});

interface ChampProps {
  config: unknown;
  onChange: (config: Record<string, unknown>) => void;
  cle: string;
}

interface ChampCouleurProps extends ChampProps {
  /**
   * La couleur du widget, en hexadécimal ; à défaut, il suit celle du texte
   * du thème, qu'aucun code ne dit — le champ reste alors vide.
   */
  defaut?: string;
  /** Ce que le champ dit de la couleur par défaut. */
  libelleDefaut?: string;
}

export function ChampCouleur({ config, onChange, cle, defaut, libelleDefaut }: ChampCouleurProps) {
  const valeur = texte(config, cle, defaut ?? "");
  const ordinaire = defaut ?? "";
  const actif = valeur.toLowerCase() !== ordinaire.toLowerCase();
  const reinitialiser = () => onChange(regle(config, cle, "", ordinaire));
  return (
    <ColorInput
      label="Couleur"
      placeholder={libelleDefaut ?? defaut}
      value={valeur}
      onChange={(v) => onChange(regle(config, cle, v.toLowerCase(), ordinaire))}
      format="hex"
      swatches={NUANCES}
      swatchesPerRow={NUANCES_PAR_RANGEE}
      // La pipette prendrait à droite une place que le code couleur n'a pas
      // à céder dans un champ si étroit.
      withEyeDropper={false}
      w={LARGEUR_CHAMP}
      // La section de gauche est celle où Mantine montre la couleur : le
      // bouton la prend, et l'aperçu se range à sa suite, écarté du filet
      // comme du texte. Sans couleur choisie, il montre celle du texte, que
      // l'élément prend alors.
      leftSection={
        <div style={{ display: "flex", alignItems: "center", width: "100%", height: "100%" }}>
          <div style={{ width: LARGEUR_BOUTON, height: "100%", flexShrink: 0 }}>
            <Reinitialiser actif={actif} onClick={reinitialiser} />
          </div>
          <ColorSwatch
            color={valeur || "var(--mantine-color-text)"}
            size={TAILLE_APERCU}
            style={{ marginInlineStart: ECART, flexShrink: 0 }}
          />
        </div>
      }
      leftSectionWidth={LARGEUR_BOUTON + ECART + TAILLE_APERCU + ECART}
      leftSectionPointerEvents="all"
      // Le code couleur a besoin de toute la place qui reste : la marge de
      // droite du champ se resserre d'autant.
      styles={{ input: { paddingInlineEnd: 6 } }}
    />
  );
}

interface ChampTailleProps extends ChampProps {
  defaut: number;
  min: number;
  max: number;
}

export function ChampTaille({ config, onChange, cle, defaut, min, max }: ChampTailleProps) {
  const valeur = nombre(config, cle, defaut);
  return (
    <NumberInput
      label="Taille de la police"
      placeholder={String(defaut)}
      value={valeur}
      onChange={(v) => onChange(regle(config, cle, v === "" ? "" : Number(v), defaut))}
      min={min}
      max={max}
      suffix=" px"
      allowNegative={false}
      allowDecimal={false}
      w={LARGEUR_CHAMP}
      {...avecReinitialiser(valeur !== defaut, () => onChange(regle(config, cle, "", defaut)))}
    />
  );
}
