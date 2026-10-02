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

/** Celle de l'aperçu de la couleur, qui le suit dans le champ couleur. */
const LARGEUR_APERCU = 26;

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
  leftSection: <Reinitialiser actif={actif} onClick={onClick} />,
  leftSectionWidth: LARGEUR_BOUTON,
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
  const reinitialiser = avecReinitialiser(valeur.toLowerCase() !== ordinaire.toLowerCase(), () =>
    onChange(regle(config, cle, "", ordinaire)),
  );
  return (
    <ColorInput
      label="Couleur"
      description={`Par défaut : ${libelleDefaut ?? defaut}`}
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
      {...reinitialiser}
      // La section de gauche est celle où Mantine montre la couleur : le
      // bouton la prend, et l'aperçu se range à sa suite. Sans couleur
      // choisie, il montre celle du texte, que l'élément prend alors.
      leftSection={
        <div style={{ display: "flex", width: "100%", height: "100%" }}>
          <div style={{ width: LARGEUR_BOUTON, flexShrink: 0 }}>{reinitialiser.leftSection}</div>
          <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ColorSwatch color={valeur || "var(--mantine-color-text)"} size={16} />
          </div>
        </div>
      }
      leftSectionWidth={LARGEUR_BOUTON + LARGEUR_APERCU}
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
      description={`Par défaut : ${defaut} px`}
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
