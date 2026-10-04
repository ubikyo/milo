import {
  ActionIcon,
  ColorInput,
  Group,
  Input,
  NumberInput,
  Stack,
  Switch,
  Text,
  Tooltip,
} from "@mantine/core";
import { IconRestore } from "@tabler/icons-react";
import { useState } from "react";
import { GREEN } from "../../themes/colors";
import { NUANCES, NUANCES_PAR_RANGEE } from "../../widgets/champs-style";
import {
  ARRONDI,
  RETRAIT_LIGNE,
  RETRAIT_NOM,
  STYLE_SAISIE,
  styleLigne,
} from "./LignesDuTiroir";

// Des réglages d'allure en lignes, comme les colonnes d'une liste
// (ChampsColonnes) : l'apparence d'un indicateur, d'un titre ou d'un lien, les
// marges d'un élément du mode Accès. Chaque ligne porte à gauche le bouton qui
// la ramène à l'ordinaire — vert quand il y a de quoi —, son nom, puis sa
// couleur et sa taille, ou son interrupteur, calés à droite.

/** La place du nom de la ligne : les champs des lignes s'alignent dessous. */
const LARGEUR_NOM = 41;

/** L'air entre le bouton et le nom, plus serré que celui des champs. */
const ECART_NOM = 6;
const LARGEUR_TAILLE = 80;
const LARGEUR_COULEUR = 120;

/** Le fond du bouton, plus foncé que celui de la ligne (FOND_LIGNE). */
const FOND_BOUTON = "light-dark(#d4d4d4, var(--mantine-color-dark-4))";

type Config = Record<string, unknown>;

/** La configuration où les réglages prennent leur valeur ; vides, ils en sont retirés. */
export const poser = (
  config: unknown,
  reglages: Record<string, unknown>,
): Config => {
  const suivante: Config = { ...((config as Config | null) ?? {}) };
  for (const [cle, valeur] of Object.entries(reglages)) {
    if (valeur === "" || valeur === undefined) delete suivante[cle];
    else suivante[cle] = valeur;
  }
  return suivante;
};

export interface LigneReglage {
  nom: string;
  /** « du titre », « de la marge haute » : ce que disent les libellés des champs. */
  quoi: string;
  couleur?: { valeur: string; onChange: (valeur: string) => void };
  taille?: {
    valeur: number;
    defaut: number;
    min: number;
    max: number;
    /** Vide quand le champ l'est. */
    onChange: (valeur: number | "") => void;
  };
  /** Un réglage qui s'allume ou s'éteint — l'encadré d'un widget —, calé à droite. */
  interrupteur?: { valeur: boolean; onChange: (valeur: boolean) => void };
  /** Vrai quand un réglage de la ligne s'écarte de l'ordinaire. */
  modifiee: boolean;
  reinitialiser: () => void;
}

/** Le bouton de la ligne, à gauche : il ramène tous ses réglages à l'ordinaire. */
function Reinitialiser({
  actif,
  onClick,
  quoi,
}: {
  actif: boolean;
  onClick: () => void;
  quoi: string;
}) {
  const label = `Revenir à la valeur par défaut ${quoi}`;
  return (
    <Tooltip label={label} disabled={!actif}>
      {/* Vert dès qu'un réglage s'écarte de l'ordinaire : il y a de quoi
          revenir. Sinon, un fond un cran plus foncé que la ligne, d'un gris
          neutre — ceux de Mantine tirent sur le bleu —, estompé. */}
      <ActionIcon
        variant="filled"
        radius={3}
        onClick={onClick}
        disabled={!actif}
        aria-label={label}
        style={{
          backgroundColor: actif ? GREEN : FOND_BOUTON,
          color: actif ? "#ffffff" : "var(--mantine-color-text)",
          opacity: actif ? 1 : 0.5,
        }}
      >
        <IconRestore size={16} />
      </ActionIcon>
    </Tooltip>
  );
}

/** La couleur d'une ligne, avec les nuances habituelles (champs-style). */
function Couleur({
  valeur,
  onChange,
  label,
}: {
  valeur: string;
  onChange: (valeur: string) => void;
  label: string;
}) {
  const [saisie, setSaisie] = useState(false);
  return (
    <ColorInput
      size="xs"
      radius={ARRONDI}
      w={LARGEUR_COULEUR}
      placeholder="Par défaut"
      value={valeur}
      onChange={(v) => onChange(v.toLowerCase())}
      format="hex"
      swatches={NUANCES}
      swatchesPerRow={NUANCES_PAR_RANGEE}
      withEyeDropper={false}
      popoverProps={{ withinPortal: true }}
      aria-label={label}
      onFocus={() => setSaisie(true)}
      onBlur={() => setSaisie(false)}
      styles={saisie ? { input: STYLE_SAISIE } : undefined}
    />
  );
}

/** La taille d'une ligne, en pixels, calée à droite. */
function Taille({
  taille,
  label,
}: {
  taille: NonNullable<LigneReglage["taille"]>;
  label: string;
}) {
  const [saisie, setSaisie] = useState(false);
  return (
    <NumberInput
      size="xs"
      radius={ARRONDI}
      w={LARGEUR_TAILLE}
      style={{ marginLeft: "auto" }}
      placeholder={String(taille.defaut)}
      suffix=" px"
      min={taille.min}
      max={taille.max}
      allowDecimal={false}
      allowNegative={false}
      aria-label={label}
      value={taille.valeur}
      onChange={(v) => taille.onChange(v === "" ? "" : Number(v))}
      onFocus={() => setSaisie(true)}
      onBlur={() => setSaisie(false)}
      styles={saisie ? { input: STYLE_SAISIE } : undefined}
    />
  );
}

export default function LignesReglages({
  label,
  lignes,
}: {
  label: string;
  lignes: LigneReglage[];
}) {
  return (
    <Input.Wrapper label={label}>
      <Stack gap={1}>
        {lignes.map((l, rang) => (
          <Group
            key={l.nom}
            gap="sm"
            wrap="nowrap"
            // Le bouton, au début, se cale contre le bord gauche comme le
            // dernier champ contre le droit.
            style={{
              ...styleLigne(rang, lignes.length, false),
              paddingLeft: RETRAIT_LIGNE,
            }}
          >
            <Reinitialiser
              actif={l.modifiee}
              quoi={l.quoi}
              onClick={l.reinitialiser}
            />
            <Text
              size="sm"
              w={LARGEUR_NOM}
              style={{
                flexShrink: 0,
                marginLeft: `calc(${ECART_NOM}px - var(--mantine-spacing-sm))`,
              }}
            >
              {l.nom}
            </Text>
            {l.couleur && (
              <Couleur
                valeur={l.couleur.valeur}
                onChange={l.couleur.onChange}
                label={`Couleur ${l.quoi}`}
              />
            )}
            {l.taille && (
              <Taille taille={l.taille} label={`Taille ${l.quoi}`} />
            )}
            {l.interrupteur && (
              <Switch
                checked={l.interrupteur.valeur}
                onChange={(e) => l.interrupteur?.onChange(e.currentTarget.checked)}
                color="teal"
                aria-label={l.nom}
                // Calé à droite, à RETRAIT_NOM du bout comme les boutons des
                // lignes (BoutonDeLigne).
                style={{ marginLeft: "auto", marginRight: RETRAIT_NOM - RETRAIT_LIGNE }}
              />
            )}
          </Group>
        ))}
      </Stack>
    </Input.Wrapper>
  );
}

/**
 * La ligne « Cadre », commune à tous les widgets : « valeur » est le cadre en
 * vigueur, « defaut » celui du widget tant que rien n'est réglé.
 */
export const ligneCadre = (
  config: unknown,
  onChange: (config: Config) => void,
  cle: string,
  valeur: boolean,
  defaut: boolean,
): LigneReglage => ({
  nom: "Cadre",
  quoi: "du cadre",
  interrupteur: {
    valeur,
    onChange: (v) => onChange(poser(config, { [cle]: v === defaut ? "" : v })),
  },
  modifiee: valeur !== defaut,
  reinitialiser: () => onChange(poser(config, { [cle]: "" })),
});
