import { Anchor, Box, Checkbox, Group, Indicator, Stack, Text } from "@mantine/core";
import { Calendar } from "@mantine/dates";
import { IconCalendar } from "@tabler/icons-react";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import classes from "../assets/styles/AccessNumero.module.css";
import { avec } from "./types";
import type { AccessWidget } from "./types";
import type { AccessCalendarEvent, Id } from "@milo/shared";

// Un calendrier : le mois en cours, celui de Mantine. En option, il marque
// d'un point les jours où la personne qui regarde a des rendez-vous dans son
// agenda Outlook, lu dans Entra par le serveur (server/src/lib/entra.ts,
// permission d'application Calendars.Read) : chacun voit les siens, quel que
// soit le tableau. Un jour choisi montre ses rendez-vous sous le mois.

const RENDEZ_VOUS = "rendezVous";
const LISTE = "liste";
const ENCADRE = "encadre";

/** La page relit l'agenda à ce rythme : un rendez-vous pris ailleurs finit par paraître. */
const RELECTURE = 5 * 60_000;

/** Au plus, les rendez-vous listés sous le mois. */
const LISTE_MAX = 6;

const coche = (config: unknown, cle: string, defaut: boolean): boolean => {
  const valeur = (config as Record<string, unknown> | null)?.[cle];
  return valeur === undefined ? defaut : Boolean(valeur);
};

/** Les jours qu'un rendez-vous couvre, au format des jours du calendrier. */
const joursDe = (r: AccessCalendarEvent): string[] => {
  // Un rendez-vous d'une journée entière finit à minuit le lendemain, en UTC :
  // on le lit à la date, sans fuseau, pour ne pas déborder d'un jour.
  const debut = r.all_day ? dayjs(r.start.slice(0, 10)) : dayjs(r.start);
  const fin = r.all_day ? dayjs(r.end.slice(0, 10)).subtract(1, "day") : dayjs(r.end).subtract(1, "minute");
  const jours: string[] = [];
  for (let j = debut.startOf("day"); !j.isAfter(fin, "day") && jours.length < 62; j = j.add(1, "day")) {
    jours.push(j.format("YYYY-MM-DD"));
  }
  return jours.length ? jours : [debut.format("YYYY-MM-DD")];
};

const heure = (iso: string) => dayjs(iso).format("HH:mm");

type Etat =
  | { phase: "attente" }
  | { phase: "pret"; rendezVous: AccessCalendarEvent[] }
  | { phase: "erreur"; message: string };

function Calendrier({ blockId, config }: { blockId: Id; config: unknown }) {
  const avecRendezVous = coche(config, RENDEZ_VOUS, false);
  const avecListe = coche(config, LISTE, true);
  const [mois, setMois] = useState(() => dayjs().startOf("month").format("YYYY-MM-DD"));
  const [choisi, setChoisi] = useState(() => dayjs().format("YYYY-MM-DD"));
  const [etat, setEtat] = useState<Etat>({ phase: "attente" });

  // La grille montre quelques jours des mois voisins : la période les couvre.
  useEffect(() => {
    if (!avecRendezVous || !blockId) return;
    let actif = true;
    const debut = dayjs(mois).startOf("month").subtract(7, "day").toDate();
    const fin = dayjs(mois).endOf("month").add(8, "day").startOf("day").toDate();
    const lire = () =>
      api
        .getAccessCalendar(blockId, debut, fin)
        .then((rendezVous) => actif && setEtat({ phase: "pret", rendezVous }))
        .catch((e: Error) => actif && setEtat({ phase: "erreur", message: e.message }));
    lire();
    const battement = setInterval(lire, RELECTURE);
    return () => {
      actif = false;
      clearInterval(battement);
    };
  }, [avecRendezVous, blockId, mois]);

  const parJour = useMemo(() => {
    const carte = new Map<string, AccessCalendarEvent[]>();
    if (etat.phase !== "pret") return carte;
    for (const r of etat.rendezVous) {
      for (const jour of joursDe(r)) carte.set(jour, [...(carte.get(jour) ?? []), r]);
    }
    return carte;
  }, [etat]);

  const duJour = parJour.get(choisi) ?? [];

  const contenu = (
    <Stack gap="sm">
      <Calendar
        fullWidth
        date={mois}
        onDateChange={setMois}
        // Le calendrier ne descend pas au-delà du mois : les niveaux « année »
        // et « décennie » n'ont rien à montrer ici.
        maxLevel="year"
        highlightToday
        getDayProps={(date) => ({
          selected: date === choisi,
          onClick: () => setChoisi(date),
        })}
        renderDay={(date) => {
          const nombre = parJour.get(date)?.length ?? 0;
          return (
            <Indicator size={5} color="teal" offset={-3} disabled={!nombre} position="bottom-center">
              <div>{dayjs(date).date()}</div>
            </Indicator>
          );
        }}
      />
      {avecRendezVous && etat.phase === "erreur" && (
        <Text size="xs" c="red" lineClamp={3}>
          {etat.message}
        </Text>
      )}
      {avecRendezVous && avecListe && etat.phase === "pret" && (
        <Stack gap={4}>
          <Text size="xs" c="dimmed" tt="capitalize">
            {dayjs(choisi).format("dddd D MMMM")}
          </Text>
          {duJour.length === 0 && (
            <Text size="sm" c="dimmed">
              Aucun rendez-vous
            </Text>
          )}
          {duJour.slice(0, LISTE_MAX).map((r) => (
            <Group key={r.id} gap="xs" wrap="nowrap" align="baseline">
              <Text size="xs" c="dimmed" style={{ flexShrink: 0, fontVariantNumeric: "tabular-nums" }} w={84}>
                {r.all_day ? "Journée" : `${heure(r.start)} – ${heure(r.end)}`}
              </Text>
              <Box style={{ minWidth: 0 }}>
                <Anchor
                  href={r.url || undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  size="sm"
                  c="var(--mantine-color-text)"
                  underline="hover"
                  lineClamp={1}
                  title={r.subject}
                  style={{ opacity: r.show_as === "free" ? 0.6 : 1 }}
                >
                  {r.subject || "Sans objet"}
                </Anchor>
                {r.location && (
                  <Text size="xs" c="dimmed" lineClamp={1}>
                    {r.location}
                  </Text>
                )}
              </Box>
            </Group>
          ))}
          {duJour.length > LISTE_MAX && (
            <Text size="xs" c="dimmed">
              et {duJour.length - LISTE_MAX} de plus
            </Text>
          )}
        </Stack>
      )}
    </Stack>
  );

  if (!coche(config, ENCADRE, false)) return contenu;
  return (
    <Box className={classes.encart} style={{ border: "none" }}>
      {contenu}
    </Box>
  );
}

export const calendrierWidget: AccessWidget = {
  type: "calendar",
  kind: "m365",
  label: "Calendrier",
  icon: IconCalendar,
  defaultConfig: { [RENDEZ_VOUS]: false, [LISTE]: true, [ENCADRE]: false },
  // Les jours et les flèches du mois prennent leurs clics.
  ownClicks: true,

  Display: Calendrier,

  marges: () => ({ haute: 0, basse: 15 }),

  // Il dessine lui-même son cadre, réglé dans le bloc « Apparence » du tiroir.
  cadrePropre: true,

  Config: ({ config, onChange }) => (
    <Stack gap="sm">
      <Checkbox
        label="Marquer mes rendez-vous Outlook (Entra)"
        description="Chacun voit les siens. Demande la permission Calendars.Read sur l'application Entra."
        checked={coche(config, RENDEZ_VOUS, false)}
        onChange={(e) => onChange(avec(config, RENDEZ_VOUS, e.currentTarget.checked))}
        color="teal"
      />
      <Checkbox
        label="Lister les rendez-vous du jour choisi"
        checked={coche(config, LISTE, true)}
        disabled={!coche(config, RENDEZ_VOUS, false)}
        onChange={(e) => onChange(avec(config, LISTE, e.currentTarget.checked))}
        color="teal"
      />
    </Stack>
  ),

};
