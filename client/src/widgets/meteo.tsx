import { Box, Checkbox, Group, Loader, NumberInput, Select, SimpleGrid, Stack, Text } from "@mantine/core";
import { AreaChart, BarChart } from "@mantine/charts";
import { useDebouncedValue } from "@mantine/hooks";
import {
  IconCloud,
  IconCloudBolt,
  IconCloudFog,
  IconCloudRain,
  IconCloudSnow,
  IconDroplet,
  IconMoon,
  IconSun,
  IconSunHigh,
  IconSunMoon,
  IconTemperature,
  IconWind,
} from "@tabler/icons-react";
import { useEffect, useState } from "react";
import type { ComponentType } from "react";
import { api } from "../api";
import classes from "../assets/styles/AccessNumero.module.css";
import { avec, nombre, texte } from "./types";
import type { AccessWidget, WidgetConfigProps } from "./types";
import type { AccessWeather, Id, WeatherPlace } from "@milo/shared";

// La météo d'un lieu : la température, un pictogramme de l'état du ciel, et
// au choix le ressenti, l'humidité et le vent, puis les prévisions — la
// courbe des températures ou la pluie des prochaines heures (les graphiques
// de Mantine), ou la semaine qui vient.
//
// Les prévisions viennent d'Open-Meteo, par le serveur (server/src/lib/meteo.ts),
// qui les garde un quart d'heure : la page ne sort pas de l'application. Le
// lieu se cherche par son nom dans le tiroir ; seules ses coordonnées et son
// nom sont rangés.
//
// Les clés « latitude » et « longitude » sont lues aussi par le serveur
// (coordonneesMeteo) : elles ne changent pas.

const LIEU = "lieu";
const LATITUDE = "latitude";
const LONGITUDE = "longitude";
const TAILLE = "taille";
const AFFICHER_LIEU = "afficherLieu";
const DETAILS = "details";
const PREVISIONS = "previsions";
const ENCADRE = "encadre";

const TAILLE_PAR_DEFAUT = 32;
const TAILLE_MIN = 12;
const TAILLE_MAX = 96;

/** La page relit le serveur à ce rythme : c'est lui qui interroge la source. */
const RELECTURE = 15 * 60_000;

/** La hauteur d'un graphique de prévisions. */
const HAUTEUR_GRAPHIQUE = 110;

const PREVISIONS_PROPOSEES = [
  { value: "aucune", label: "Aucune" },
  { value: "temperature", label: "Températures sur 24 h" },
  { value: "pluie", label: "Risque de pluie sur 24 h" },
  { value: "semaine", label: "La semaine" },
];

interface Ciel {
  libelle: string;
  icone: ComponentType<{ size?: number; color?: string; stroke?: number }>;
  couleur: string;
}

/**
 * L'état du ciel d'après le code de l'OMM (WMO 4677) qu'Open-Meteo donne.
 * La nuit, un ciel clair montre la lune plutôt que le soleil.
 */
const cielDe = (code: number, jour = true): Ciel => {
  if (code === 0) {
    return jour
      ? { libelle: "Ensoleillé", icone: IconSun, couleur: "#fab005" }
      : { libelle: "Ciel clair", icone: IconMoon, couleur: "#c4c4c4" };
  }
  if (code <= 2) {
    return jour
      ? { libelle: "Éclaircies", icone: IconSunHigh, couleur: "#fab005" }
      : { libelle: "Éclaircies", icone: IconSunMoon, couleur: "#c4c4c4" };
  }
  if (code === 3) return { libelle: "Couvert", icone: IconCloud, couleur: "#a6a6a6" };
  if (code === 45 || code === 48) return { libelle: "Brouillard", icone: IconCloudFog, couleur: "#a6a6a6" };
  if (code >= 51 && code <= 57) return { libelle: "Bruine", icone: IconCloudRain, couleur: "#4dabf7" };
  if (code >= 61 && code <= 67) return { libelle: "Pluie", icone: IconCloudRain, couleur: "#228be6" };
  if (code >= 71 && code <= 77) return { libelle: "Neige", icone: IconCloudSnow, couleur: "#74c0fc" };
  if (code >= 80 && code <= 82) return { libelle: "Averses", icone: IconCloudRain, couleur: "#228be6" };
  if (code === 85 || code === 86) return { libelle: "Averses de neige", icone: IconCloudSnow, couleur: "#74c0fc" };
  if (code >= 95) return { libelle: "Orage", icone: IconCloudBolt, couleur: "#7048e8" };
  return { libelle: "Nuageux", icone: IconCloud, couleur: "#a6a6a6" };
};

const degres = (valeur: number) => `${Math.round(valeur)}°`;

/** Une case est cochée par défaut quand elle n'a jamais été réglée. */
const coche = (config: unknown, cle: string, defaut: boolean): boolean => {
  const valeur = (config as Record<string, unknown> | null)?.[cle];
  return valeur === undefined ? defaut : Boolean(valeur);
};

const aUnLieu = (config: unknown): boolean => {
  const c = (config as Record<string, unknown> | null) ?? {};
  return typeof c[LATITUDE] === "number" && typeof c[LONGITUDE] === "number";
};

/** Les dernières prévisions de chaque élément, pour la durée de la page. */
const dejaLues = new Map<string, AccessWeather>();

type Etat =
  | { phase: "attente" }
  | { phase: "pret"; meteo: AccessWeather }
  | { phase: "erreur"; message: string };

function Previsions({ meteo, quoi }: { meteo: AccessWeather; quoi: string }) {
  if (quoi === "temperature") {
    const data = meteo.hourly.map((h) => ({ heure: `${h.time.slice(11, 13)} h`, temperature: h.temperature }));
    return (
      <AreaChart
        h={HAUTEUR_GRAPHIQUE}
        data={data}
        dataKey="heure"
        series={[{ name: "temperature", label: "Température", color: "orange.6" }]}
        curveType="natural"
        gridAxis="none"
        withDots={false}
        unit="°"
        yAxisProps={{ width: 28, domain: ["dataMin - 2", "dataMax + 2"], tickFormatter: (v: number) => `${Math.round(v)}` }}
        xAxisProps={{ interval: 5 }}
        valueFormatter={(v) => `${Math.round(v)}`}
      />
    );
  }
  if (quoi === "pluie") {
    const data = meteo.hourly.map((h) => ({ heure: `${h.time.slice(11, 13)} h`, pluie: h.precipitation }));
    return (
      <BarChart
        h={HAUTEUR_GRAPHIQUE}
        data={data}
        dataKey="heure"
        series={[{ name: "pluie", label: "Risque de pluie", color: "blue.6" }]}
        gridAxis="none"
        unit=" %"
        yAxisProps={{ width: 28, domain: [0, 100] }}
        xAxisProps={{ interval: 5 }}
      />
    );
  }
  if (quoi === "semaine") {
    const jour = new Intl.DateTimeFormat("fr-FR", { weekday: "short" });
    return (
      <SimpleGrid cols={meteo.daily.length} spacing={4}>
        {meteo.daily.map((j) => {
          const ciel = cielDe(j.code);
          return (
            <Stack key={j.time} gap={2} align="center" title={ciel.libelle}>
              <Text size="xs" c="dimmed" tt="capitalize">
                {jour.format(new Date(`${j.time}T12:00:00`)).replace(".", "")}
              </Text>
              <ciel.icone size={20} color={ciel.couleur} stroke={1.6} />
              <Text size="xs" fw={600}>
                {degres(j.temperature)}
              </Text>
              <Text size="xs" c="dimmed">
                {degres(j.min ?? j.temperature)}
              </Text>
            </Stack>
          );
        })}
      </SimpleGrid>
    );
  }
  return null;
}

function Meteo({ blockId, config }: { blockId: Id; config: unknown }) {
  const lieu = texte(config, LIEU);
  const latitude = nombre(config, LATITUDE, Number.NaN);
  const longitude = nombre(config, LONGITUDE, Number.NaN);
  const cle = `${blockId}|${latitude}|${longitude}`;
  const taille = nombre(config, TAILLE, TAILLE_PAR_DEFAUT);
  const previsions = texte(config, PREVISIONS, "aucune");
  const [etat, setEtat] = useState<Etat>(() => {
    const meteo = dejaLues.get(cle);
    return meteo ? { phase: "pret", meteo } : { phase: "attente" };
  });

  useEffect(() => {
    if (!aUnLieu(config) || !blockId) return;
    let actif = true;
    const lire = () =>
      api
        .getAccessWeather(blockId)
        .then((meteo) => {
          dejaLues.set(cle, meteo);
          if (actif) setEtat({ phase: "pret", meteo });
        })
        .catch((e: Error) => actif && setEtat({ phase: "erreur", message: e.message }));
    const connue = dejaLues.get(cle);
    setEtat(connue ? { phase: "pret", meteo: connue } : { phase: "attente" });
    lire();
    const battement = setInterval(lire, RELECTURE);
    return () => {
      actif = false;
      clearInterval(battement);
    };
    // La clé porte l'élément et ses coordonnées : c'est ce qui change la météo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle]);

  const contenu = (() => {
    if (!aUnLieu(config)) {
      return (
        <Group gap={6} c="dimmed">
          <IconSun size={16} />
          <Text size="sm">Météo : choisissez un lieu</Text>
        </Group>
      );
    }
    if (etat.phase === "attente") {
      return (
        <Group gap="xs" c="dimmed" h={taille * 1.4}>
          <Loader size="xs" color="gray" />
          <Text size="sm">Météo{lieu ? ` de ${lieu}` : ""}…</Text>
        </Group>
      );
    }
    if (etat.phase === "erreur") {
      return (
        <Text size="sm" c="red" lineClamp={2}>
          {etat.message}
        </Text>
      );
    }

    const { current } = etat.meteo;
    const ciel = cielDe(current.code, current.is_day);
    return (
      <Stack gap="xs">
        <Group gap="sm" wrap="nowrap" justify="center">
          <ciel.icone size={Math.round(taille * 1.3)} color={ciel.couleur} stroke={1.5} />
          <Stack gap={0}>
            <Text fz={taille} fw={600} lh={1.1}>
              {degres(current.temperature)}
            </Text>
            <Text size="xs" c="dimmed" lineClamp={1}>
              {coche(config, AFFICHER_LIEU, true) && lieu ? `${lieu} · ` : ""}
              {ciel.libelle}
            </Text>
          </Stack>
        </Group>
        {coche(config, DETAILS, false) && (
          <Group gap="md" justify="center" c="dimmed">
            <Group gap={4} title="Ressenti">
              <IconTemperature size={14} />
              <Text size="xs">{degres(current.apparent)}</Text>
            </Group>
            <Group gap={4} title="Humidité">
              <IconDroplet size={14} />
              <Text size="xs">{Math.round(current.humidity)} %</Text>
            </Group>
            <Group gap={4} title="Vent">
              <IconWind size={14} />
              <Text size="xs">{Math.round(current.wind)} km/h</Text>
            </Group>
          </Group>
        )}
        <Previsions meteo={etat.meteo} quoi={previsions} />
      </Stack>
    );
  })();

  if (!coche(config, ENCADRE, false)) return contenu;
  return (
    <Box className={classes.encart} style={{ border: "none" }}>
      {contenu}
    </Box>
  );
}

/** Un lieu en valeur de liste : ses coordonnées, assez pour le retrouver. */
const valeurDe = (latitude: number, longitude: number) => `${latitude},${longitude}`;

function ChampLieu({ config, onChange }: WidgetConfigProps) {
  const [saisie, setSaisie] = useState("");
  const [cherchee] = useDebouncedValue(saisie, 300);
  const [lieux, setLieux] = useState<WeatherPlace[]>([]);
  const [cherche, setCherche] = useState(false);

  const nom = texte(config, LIEU);
  const actuel = aUnLieu(config)
    ? valeurDe(nombre(config, LATITUDE, 0), nombre(config, LONGITUDE, 0))
    : null;

  useEffect(() => {
    // La saisie qui reprend le lieu choisi n'est pas une recherche.
    if (cherchee.trim().length < 2 || cherchee === nom) return;
    let actif = true;
    setCherche(true);
    api
      .searchWeatherPlaces(cherchee)
      .then((trouves) => actif && setLieux(trouves))
      .catch(() => actif && setLieux([]))
      .finally(() => actif && setCherche(false));
    return () => {
      actif = false;
    };
  }, [cherchee, nom]);

  const options = lieux.map((l) => ({
    value: valeurDe(l.latitude, l.longitude),
    label: l.detail ? `${l.name} (${l.detail})` : l.name,
  }));
  if (actuel && !options.some((o) => o.value === actuel)) options.unshift({ value: actuel, label: nom || actuel });

  return (
    <Select
      label="Lieu"
      placeholder="Chercher une ville"
      data={options}
      value={actuel}
      searchable
      searchValue={saisie}
      onSearchChange={setSaisie}
      // Le serveur a déjà trié : la liste ne refiltre pas ce qu'il a trouvé.
      filter={({ options: o }) => o}
      nothingFoundMessage={saisie.trim().length < 2 ? "Tapez au moins deux lettres" : "Aucun lieu"}
      rightSection={cherche ? <Loader size="xs" /> : undefined}
      onChange={(valeur) => {
        const lieu = lieux.find((l) => valeurDe(l.latitude, l.longitude) === valeur);
        if (!lieu) return;
        onChange({ ...avec(config, LIEU, lieu.name), [LATITUDE]: lieu.latitude, [LONGITUDE]: lieu.longitude });
      }}
      allowDeselect={false}
      autoFocus
    />
  );
}

export const meteoWidget: AccessWidget = {
  type: "weather",
  kind: "common",
  label: "Météo",
  icon: IconSun,
  defaultConfig: {
    [TAILLE]: TAILLE_PAR_DEFAUT,
    [AFFICHER_LIEU]: true,
    [DETAILS]: false,
    [PREVISIONS]: "aucune",
    [ENCADRE]: false,
  },
  ownClicks: true,

  Display: Meteo,

  marges: () => ({ haute: 0, basse: 15 }),

  Config: ({ config, onChange }) => (
    <Stack gap="xl">
      <ChampLieu config={config} onChange={onChange} />
      <NumberInput
        label="Taille de la température"
        placeholder={String(TAILLE_PAR_DEFAUT)}
        value={nombre(config, TAILLE, TAILLE_PAR_DEFAUT)}
        onChange={(v) => onChange(avec(config, TAILLE, v === "" ? TAILLE_PAR_DEFAUT : Number(v)))}
        min={TAILLE_MIN}
        max={TAILLE_MAX}
        suffix=" px"
        allowNegative={false}
        allowDecimal={false}
        w={120}
      />
      <Select
        label="Prévisions"
        data={PREVISIONS_PROPOSEES}
        value={texte(config, PREVISIONS, "aucune")}
        onChange={(v) => v && onChange(avec(config, PREVISIONS, v))}
        allowDeselect={false}
        w={240}
      />
      <Stack gap="sm">
        <Checkbox
          label="Afficher le nom du lieu"
          checked={coche(config, AFFICHER_LIEU, true)}
          onChange={(e) => onChange(avec(config, AFFICHER_LIEU, e.currentTarget.checked))}
          color="teal"
        />
        <Checkbox
          label="Afficher le ressenti, l'humidité et le vent"
          checked={coche(config, DETAILS, false)}
          onChange={(e) => onChange(avec(config, DETAILS, e.currentTarget.checked))}
          color="teal"
        />
      </Stack>
    </Stack>
  ),

  ConfigFin: ({ config, onChange }) => (
    <Checkbox
      label="Encadrer"
      checked={coche(config, ENCADRE, false)}
      onChange={(e) => onChange(avec(config, ENCADRE, e.currentTarget.checked))}
      color="teal"
    />
  ),
};
