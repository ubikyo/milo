import { Box, Checkbox, Input, NumberInput, SegmentedControl, Select, Stack, Text } from "@mantine/core";
import { IconClock } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import classes from "../assets/styles/AccessNumero.module.css";
import { avec, nombre, texte } from "./types";
import type { AccessWidget } from "./types";

// Une horloge : l'heure qu'il est ailleurs. Utile quand on appelle un site
// dans un autre fuseau — on voit d'un coup d'œil s'il est ouvert.
//
// Elle ne montre que l'heure, centrée dans sa colonne : le fuseau se choisit
// dans son tiroir, et l'élément ne répète pas ce choix — c'est un titre posé
// au-dessus qui dit de quel lieu il s'agit, quand il faut le dire.
//
// Elle se lit en chiffres, ou sur un cadran à aiguilles (« analogique ») : la
// taille dit alors le diamètre du cadran, et la trotteuse peut s'y ajouter.

const FUSEAU = "fuseau";
const TAILLE = "taille";
const ENCADRE = "encadre";
const MODE = "mode";
const SECONDES = "secondes";
const CHIFFRES = "chiffres";

const MODES = [
  { value: "numerique", label: "Numérique" },
  { value: "analogique", label: "Analogique" },
];

/** Le diamètre d'un cadran, en pixels, et ses bornes. */
const DIAMETRE_PAR_DEFAUT = 120;
const DIAMETRE_MIN = 40;
const DIAMETRE_MAX = 400;

// Les fuseaux proposés. La liste complète en compte des centaines : celle-ci
// couvre les lieux avec lesquels on travaille, et la saisie reste possible par
// ailleurs si le besoin vient.
const FUSEAUX = [
  { value: "Europe/Paris", label: "Paris" },
  { value: "Europe/London", label: "Londres" },
  { value: "Europe/Lisbon", label: "Lisbonne" },
  { value: "Africa/Casablanca", label: "Casablanca" },
  { value: "America/New_York", label: "New York" },
  { value: "America/Los_Angeles", label: "Los Angeles" },
  { value: "Asia/Dubai", label: "Dubaï" },
  { value: "Asia/Shanghai", label: "Shanghai" },
  { value: "Asia/Tokyo", label: "Tokyo" },
  { value: "Australia/Sydney", label: "Sydney" },
];

const FUSEAU_PAR_DEFAUT = "Europe/Paris";

/**
 * La taille de l'heure, en pixels. Plus grosse que le texte d'une colonne :
 * c'est tout ce que l'élément porte, et elle se lit de loin. Les bornes
 * tiennent la colonne — en deçà l'heure ne se lit plus, au-delà elle déborde.
 */
const TAILLE_PAR_DEFAUT = 18;
const TAILLE_MIN = 8;
const TAILLE_MAX = 96;

/** Le retrait que l'encadré laisse autour de l'heure. */
const RETRAIT = 5;

/**
 * L'air que l'horloge laisse sous elle, que la colonne pose
 * (components/access/SectionBlocks.tsx) : sans cela l'heure toucherait le
 * lien qui la suit.
 */
const MARGE_BASSE = 15;

/**
 * L'heure dans ce fuseau, sans les secondes. Un fuseau que le navigateur ne
 * connaît pas ferait lever « Intl » : on retombe alors sur l'heure locale
 * plutôt que de faire tomber la colonne entière.
 */
const heureDans = (fuseau: string, maintenant: Date): string => {
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: fuseau || FUSEAU_PAR_DEFAUT,
    }).format(maintenant);
  } catch {
    return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(
      maintenant,
    );
  }
};

/** Les heures, minutes et secondes qu'il est dans ce fuseau, pour placer les aiguilles. */
const instantDans = (fuseau: string, maintenant: Date): { h: number; m: number; s: number } => {
  const lire = (timeZone?: string) => {
    const parties = new Intl.DateTimeFormat("fr-FR", {
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hourCycle: "h23",
      ...(timeZone ? { timeZone } : {}),
    }).formatToParts(maintenant);
    const valeur = (type: string) => Number(parties.find((p) => p.type === type)?.value ?? 0);
    return { h: valeur("hour"), m: valeur("minute"), s: valeur("second") };
  };
  try {
    return lire(fuseau || FUSEAU_PAR_DEFAUT);
  } catch {
    return lire();
  }
};

const estAnalogique = (config: unknown): boolean => texte(config, MODE, "numerique") === "analogique";

/** Une case cochée par défaut tant qu'elle n'a pas été réglée. */
const coche = (config: unknown, cle: string, defaut: boolean): boolean => {
  const valeur = (config as Record<string, unknown> | null)?.[cle];
  return valeur === undefined ? defaut : Boolean(valeur);
};

/**
 * Le cadran : douze repères, les chiffres en option, les aiguilles des
 * heures et des minutes, et la trotteuse si on la demande. Dessiné sur une
 * grille de 100 de côté, il prend le diamètre réglé ; ses traits suivent la
 * couleur du texte, et la trotteuse prend la couleur de l'application.
 */
function Cadran({
  diametre,
  h,
  m,
  s,
  secondes,
  chiffres,
}: {
  diametre: number;
  h: number;
  m: number;
  s: number;
  secondes: boolean;
  chiffres: boolean;
}) {
  const angleHeures = ((h % 12) + m / 60) * 30;
  const angleMinutes = (m + s / 60) * 6;
  const angleSecondes = s * 6;
  const aiguille = (angle: number, longueur: number, epaisseur: number, couleur: string, queue = 0) => (
    <line
      x1={50}
      y1={50 + queue}
      x2={50}
      y2={50 - longueur}
      stroke={couleur}
      strokeWidth={epaisseur}
      strokeLinecap="round"
      transform={`rotate(${angle} 50 50)`}
    />
  );
  return (
    <svg
      width={diametre}
      height={diametre}
      viewBox="0 0 100 100"
      role="img"
      aria-label={`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`}
      style={{ display: "block", margin: "0 auto" }}
    >
      <circle cx={50} cy={50} r={48} fill="none" stroke="var(--mantine-color-dimmed)" strokeWidth={1.5} />
      {Array.from({ length: 12 }, (_, i) => (
        <line
          key={i}
          x1={50}
          y1={4}
          x2={50}
          y2={i % 3 === 0 ? 11 : 8}
          stroke="var(--mantine-color-text)"
          strokeWidth={i % 3 === 0 ? 2 : 1}
          strokeLinecap="round"
          transform={`rotate(${i * 30} 50 50)`}
        />
      ))}
      {chiffres &&
        Array.from({ length: 12 }, (_, i) => {
          const angle = ((i + 1) * 30 * Math.PI) / 180;
          return (
            <text
              key={i}
              x={50 + 31 * Math.sin(angle)}
              y={50 - 31 * Math.cos(angle)}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={9}
              fill="var(--mantine-color-text)"
            >
              {i + 1}
            </text>
          );
        })}
      {aiguille(angleHeures, 24, 4, "var(--mantine-color-text)")}
      {aiguille(angleMinutes, 36, 2.5, "var(--mantine-color-text)")}
      {secondes && aiguille(angleSecondes, 40, 1, "var(--mantine-color-teal-6)", 8)}
      <circle cx={50} cy={50} r={2.5} fill={secondes ? "var(--mantine-color-teal-6)" : "var(--mantine-color-text)"} />
    </svg>
  );
}

/** Une horloge est nue par défaut : c'est l'encadré qu'on demande, pas l'inverse. */
const estEncadre = (config: unknown): boolean =>
  Boolean((config as Record<string, unknown> | null)?.[ENCADRE]);

function Horloge({ config }: { config: unknown }) {
  const [maintenant, setMaintenant] = useState(() => new Date());
  const analogique = estAnalogique(config);
  const secondes = analogique && coche(config, SECONDES, true);

  // L'affichage s'arrête à la minute : la rafraîchir chaque seconde ne
  // changerait rien à l'écran, et ferait battre la page pour rien — sauf
  // quand la trotteuse tourne. Sans elle, l'aiguille des minutes avance tout
  // de même par petits pas.
  useEffect(() => {
    const battement = setInterval(() => setMaintenant(new Date()), secondes ? 1_000 : analogique ? 10_000 : 30_000);
    return () => clearInterval(battement);
  }, [analogique, secondes]);

  const encadre = estEncadre(config);
  const fuseau = texte(config, FUSEAU, FUSEAU_PAR_DEFAUT);

  const heure = analogique ? (
    <Cadran
      diametre={nombre(config, TAILLE, DIAMETRE_PAR_DEFAUT)}
      {...instantDans(fuseau, maintenant)}
      secondes={secondes}
      chiffres={coche(config, CHIFFRES, false)}
    />
  ) : (
    // Centrée sur la colonne, quelle que soit sa largeur : l'heure est courte,
    // et collée à gauche elle paraîtrait posée là par accident.
    <Text ta="center" fz={nombre(config, TAILLE, TAILLE_PAR_DEFAUT)} fw={600}>
      {heureDans(fuseau, maintenant)}
    </Text>
  );

  if (!encadre) return heure;

  // Encadrée, l'horloge se détache du reste de la colonne : le fond et le
  // trait de l'encart des attributs (widgets/numero), et l'air qu'il faut
  // autour pour que l'heure n'en touche pas les bords.
  return (
    <Box className={classes.encart} style={{ padding: RETRAIT, border: "none" }}>
      {heure}
    </Box>
  );
}

export const horlogeWidget: AccessWidget = {
  type: "clock",
  kind: "common",
  label: "Horloge",
  icon: IconClock,
  defaultConfig: {
    [FUSEAU]: FUSEAU_PAR_DEFAUT,
    [TAILLE]: TAILLE_PAR_DEFAUT,
    [ENCADRE]: false,
    [MODE]: "numerique",
  },

  Display: Horloge,

  marges: () => ({ haute: 0, basse: MARGE_BASSE }),

  // Il dessine lui-même son cadre, réglé dans le bloc « Apparence » du tiroir.
  cadrePropre: true,

  Config: ({ config, onChange }) => (
    <Stack gap="xl">
      {/* Changer de mode ramène la taille à celle du mode : 18 px de texte ne
          font pas un cadran, ni 120 px de cadran un texte. */}
      <Input.Wrapper label="Affichage">
        <SegmentedControl
          display="flex"
          w="fit-content"
          mt={4}
          data={MODES}
          value={estAnalogique(config) ? "analogique" : "numerique"}
          onChange={(mode) =>
            onChange({
              ...avec(config, MODE, mode),
              [TAILLE]: mode === "analogique" ? DIAMETRE_PAR_DEFAUT : TAILLE_PAR_DEFAUT,
            })
          }
        />
      </Input.Wrapper>
      <Select
        label="Fuseau horaire"
        data={FUSEAUX}
        value={texte(config, FUSEAU, FUSEAU_PAR_DEFAUT)}
        onChange={(value) => value && onChange(avec(config, FUSEAU, value))}
        allowDeselect={false}
        searchable
        autoFocus
        styles={{ wrapper: { width: 200 } }}
      />
      {/* La taille de l'heure. Un champ vidé le temps d'une saisie ne dit
          rien : on range alors la taille par défaut plutôt qu'un zéro, qui
          ferait disparaître l'heure. */}
      {estAnalogique(config) ? (
        <>
          <NumberInput
            label="Diamètre du cadran"
            placeholder={String(DIAMETRE_PAR_DEFAUT)}
            value={nombre(config, TAILLE, DIAMETRE_PAR_DEFAUT)}
            onChange={(valeur) =>
              onChange(avec(config, TAILLE, valeur === "" ? DIAMETRE_PAR_DEFAUT : Number(valeur)))
            }
            min={DIAMETRE_MIN}
            max={DIAMETRE_MAX}
            suffix=" px"
            allowNegative={false}
            allowDecimal={false}
            styles={{ wrapper: { width: 120 } }}
          />
          <Stack gap="sm">
            <Checkbox
              label="Trotteuse (secondes)"
              checked={coche(config, SECONDES, true)}
              onChange={(e) => onChange(avec(config, SECONDES, e.currentTarget.checked))}
              color="teal"
            />
            <Checkbox
              label="Chiffres sur le cadran"
              checked={coche(config, CHIFFRES, false)}
              onChange={(e) => onChange(avec(config, CHIFFRES, e.currentTarget.checked))}
              color="teal"
            />
          </Stack>
        </>
      ) : (
        <NumberInput
          label="Taille de la police"
          placeholder={String(TAILLE_PAR_DEFAUT)}
          value={nombre(config, TAILLE, TAILLE_PAR_DEFAUT)}
          onChange={(valeur) =>
            onChange(avec(config, TAILLE, valeur === "" ? TAILLE_PAR_DEFAUT : Number(valeur)))
          }
          min={TAILLE_MIN}
          max={TAILLE_MAX}
          suffix=" px"
          allowNegative={false}
          allowDecimal={false}
          styles={{ wrapper: { width: 120 } }}
        />
      )}
    </Stack>
  ),

};
