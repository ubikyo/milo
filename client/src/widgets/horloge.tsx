import { Box, Checkbox, NumberInput, Select, Stack, Text } from "@mantine/core";
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

const FUSEAU = "fuseau";
const TAILLE = "taille";
const ENCADRE = "encadre";

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

/** Une horloge est nue par défaut : c'est l'encadré qu'on demande, pas l'inverse. */
const estEncadre = (config: unknown): boolean =>
  Boolean((config as Record<string, unknown> | null)?.[ENCADRE]);

function Horloge({ config }: { config: unknown }) {
  const [maintenant, setMaintenant] = useState(() => new Date());

  // L'affichage s'arrête à la minute : la rafraîchir chaque seconde ne
  // changerait rien à l'écran, et ferait battre la page pour rien.
  useEffect(() => {
    const battement = setInterval(() => setMaintenant(new Date()), 30_000);
    return () => clearInterval(battement);
  }, []);

  const encadre = estEncadre(config);

  const heure = (
    // Centrée sur la colonne, quelle que soit sa largeur : l'heure est courte,
    // et collée à gauche elle paraîtrait posée là par accident.
    <Text ta="center" fz={nombre(config, TAILLE, TAILLE_PAR_DEFAUT)} fw={600}>
      {heureDans(texte(config, FUSEAU, FUSEAU_PAR_DEFAUT), maintenant)}
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
  label: "Horloge",
  icon: IconClock,
  defaultConfig: {
    [FUSEAU]: FUSEAU_PAR_DEFAUT,
    [TAILLE]: TAILLE_PAR_DEFAUT,
    [ENCADRE]: false,
  },

  Display: Horloge,

  marges: () => ({ haute: 0, basse: MARGE_BASSE }),

  Config: ({ config, onChange }) => (
    <Stack gap="xl">
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
    </Stack>
  ),

  // Encadrée, l'horloge prend un fond et se détache de la colonne. Posé
  // après les marges, en dernier du tiroir.
  ConfigFin: ({ config, onChange }) => (
    <Checkbox
      label="Encadrer"
      checked={estEncadre(config)}
      onChange={(e) => onChange(avec(config, ENCADRE, e.currentTarget.checked))}
      color="teal"
    />
  ),
};
