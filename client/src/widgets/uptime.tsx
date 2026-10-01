import {
  ActionIcon,
  Box,
  Input,
  Group,
  NumberInput,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
} from "@mantine/core";
import { ChartTooltip, MatrixChart } from "@mantine/charts";
import {
  IconArrowDown,
  IconArrowUp,
  IconCornerDownLeft,
  IconHeartbeat,
  IconTrash,
} from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, RefObject } from "react";
import { api } from "../api";
import classes from "../assets/styles/Uptime.module.css";
import ActorPicker from "../components/ui/ActorPicker";
import ListItems from "../components/ui/ListItems";
import {
  DragHandle,
  InsertLine,
  usePileGlissante,
} from "../components/ui/PileGlissante";
import { avec, nombre, texte } from "./types";
import type { AccessWidget, WidgetConfigProps } from "./types";
import {
  UPTIME_INTERVAL_DEFAUT,
  UPTIME_INTERVAL_MAX,
  UPTIME_INTERVAL_MIN,
  UPTIME_PORTS_DEFAUT,
  isUptimeCheckType,
} from "@milo/shared";
import type {
  EntraPrincipal,
  Id,
  PublicUser,
  UptimeCheckType,
  UptimeStatus,
} from "@milo/shared";

// Uptime : une matrice de cases, une par machine — verte quand elle répond,
// rouge quand elle ne répond plus. On y voit d'un coup d'œil si le parc tient.
// C'est la matrice de Mantine (MatrixChart, @mantine/charts) : la heatmap
// « Heatmap » du même paquet est un calendrier, sept jours par colonne, et ne
// se range pas en rangées de machines.
//
// Le navigateur ne sait ni pinger, ni lire un OID, ni parler à un agent
// Zabbix : c'est le serveur qui vérifie (server/src/lib/uptime.ts), à
// l'intervalle que l'élément règle, et qui garde l'état de chaque machine et
// depuis quand il dure. La colonne le relit ; le serveur, lui, prévient les
// acteurs de l'élément à chaque changement d'état.
//
// Le nom et la durée de l'état peuvent s'afficher : chaque machine devient
// alors une carte sur une ligne, le nom à gauche, la durée à droite.
//
// Les clés « machines », « intervalle », « acteurs » et « groupes » sont lues
// aussi par le serveur (reglagesUptime) : elles ne changent pas.

const MACHINES = "machines";
const INTERVALLE = "intervalle";
const ACTEURS = "acteurs";
const GROUPES = "groupes";
const TAILLE = "taille";
const COLONNES = "colonnes";
const NOMS = "noms";
const DUREES = "durees";

/** Le côté d'une case, en pixels. */
const TAILLE_PAR_DEFAUT = 24;
const TAILLE_MIN = 8;
const TAILLE_MAX = 200;

/** Les cases d'une rangée. */
const COLONNES_PAR_DEFAUT = 10;
const COLONNES_MIN = 1;
const COLONNES_MAX = 50;

/** Les machines que la liste des réglages montre : au-delà, elle défile. */
const MACHINES_VISIBLES = 10;

/** L'écart entre deux cases, en pixels : un filet, qui ne se règle pas. */
const ESPACEMENT = 3;

/**
 * La colonne relit l'état gardé par le serveur au rythme de ses
 * vérifications, sans descendre sous cinq secondes ni monter au-delà d'une
 * demi-minute : c'est une lecture en base, et la durée affichée doit avancer.
 */
const relectureDe = (intervalle: number): number =>
  Math.min(30, Math.max(5, intervalle)) * 1000;

const TYPES: { value: UptimeCheckType; label: string }[] = [
  { value: "icmp", label: "ICMP" },
  { value: "tcp", label: "TCP" },
  { value: "snmp", label: "SNMP" },
  { value: "zabbix", label: "Zabbix" },
];

/**
 * La valeur de chaque état dans la matrice (MatrixChart), et la couleur que
 * chacune prend : la matrice choisit sa couleur dans « COULEURS » au rang que
 * la valeur occupe dans le domaine — 0 la première, 2 la dernière.
 */
const VALEURS = { pending: 0, down: 1, up: 2 } as const;
const DOMAINE: [number, number] = [0, 2];
const COULEURS = ["var(--mantine-color-default-border)", "red.6", "green.6"];

/** Les mêmes couleurs, pour la barre d'une carte (nom ou durée affichés). */
const FONDS_CARTE = {
  pending: "var(--mantine-color-default-border)",
  down: "var(--mantine-color-red-6)",
  up: "var(--mantine-color-green-6)",
} as const;

const LIBELLES = { up: "Up", down: "Down", pending: "En attente" } as const;

interface Machine {
  id: string;
  nom: string;
  hote: string;
  type: UptimeCheckType;
  /** Vide : le port par défaut de la vérification. */
  port: number | "";
  oid: string;
  communaute: string;
}

const nouvelId = (): string => Math.random().toString(36).slice(2, 10);

const machineVide = (): Machine => ({
  id: nouvelId(),
  nom: "",
  hote: "",
  type: "icmp",
  port: "",
  oid: "",
  communaute: "public",
});

/** Les machines de l'élément ; une machine abîmée comble ce qui lui manque. */
const machinesDe = (config: unknown): Machine[] => {
  const brut = (config as Record<string, unknown> | null)?.[MACHINES];
  if (!Array.isArray(brut)) return [];
  return brut.map((m) => {
    const type = (m as Record<string, unknown> | null)?.type;
    const port = nombre(m, "port", NaN);
    return {
      id: texte(m, "id") || nouvelId(),
      nom: texte(m, "nom"),
      hote: texte(m, "hote"),
      type: isUptimeCheckType(type) ? type : "icmp",
      port: Number.isFinite(port) ? port : "",
      oid: texte(m, "oid"),
      communaute: texte(m, "communaute", "public"),
    };
  });
};

/** Les personnes acteurs, en identifiants de compte — en chaînes, comme ActorPicker les veut. */
const acteursDe = (config: unknown): string[] => {
  const brut = (config as Record<string, unknown> | null)?.[ACTEURS];
  return Array.isArray(brut)
    ? brut.map(Number).filter(Number.isInteger).map(String)
    : [];
};

/** Les groupes Entra acteurs : leur identifiant d'objet, et de quoi les nommer. */
const groupesDe = (config: unknown): EntraPrincipal[] => {
  const brut = (config as Record<string, unknown> | null)?.[GROUPES];
  if (!Array.isArray(brut)) return [];
  return brut
    .map((g) => ({
      type: "group" as const,
      id: texte(g, "id"),
      name: texte(g, "name"),
      email: texte(g, "email"),
    }))
    .filter((g) => g.id);
};

/** Un réglage numérique ramené dans ses bornes, quoi que la configuration porte. */
const borne = (
  config: unknown,
  cle: string,
  defaut: number,
  min: number,
  max: number,
): number =>
  Math.min(max, Math.max(min, Math.round(nombre(config, cle, defaut))));

/** Le nom et la durée sont des options : une matrice neuve ne montre que ses cases. */
const option = (config: unknown, cle: string): boolean =>
  Boolean((config as Record<string, unknown> | null)?.[cle]);

/** « 42 s », « 12 min », « 3 h 05 », « 2 j 4 h ». */
const duree = (depuis: string | null, maintenant: number): string => {
  if (!depuis) return "";
  const secondes = Math.max(
    0,
    Math.floor((maintenant - Date.parse(depuis)) / 1000),
  );
  if (secondes < 60) return `${secondes} s`;
  const minutes = Math.floor(secondes / 60);
  if (minutes < 60) return `${minutes} min`;
  const heures = Math.floor(minutes / 60);
  if (heures < 24)
    return `${heures} h ${String(minutes % 60).padStart(2, "0")}`;
  return `${Math.floor(heures / 24)} j ${heures % 24} h`;
};

type Etat =
  | { phase: "attente" }
  | { phase: "pret"; statuts: Map<string, UptimeStatus> }
  | { phase: "erreur"; message: string };

function Matrice({ blockId, config }: { blockId: Id; config: unknown }) {
  const machines = machinesDe(config);
  const intervalle = nombre(config, INTERVALLE, UPTIME_INTERVAL_DEFAUT);
  const taille = borne(
    config,
    TAILLE,
    TAILLE_PAR_DEFAUT,
    TAILLE_MIN,
    TAILLE_MAX,
  );
  const colonnes = borne(
    config,
    COLONNES,
    COLONNES_PAR_DEFAUT,
    COLONNES_MIN,
    COLONNES_MAX,
  );
  const noms = option(config, NOMS);
  const durees = option(config, DUREES);
  const [etat, setEtat] = useState<Etat>({ phase: "attente" });
  const [maintenant, setMaintenant] = useState(() => Date.now());

  // La configuration enregistrée est celle que le serveur lit : quand elle
  // change, ce qu'il garde change aussi.
  const signature = JSON.stringify(
    (config as Record<string, unknown> | null)?.[MACHINES] ?? [],
  );

  useEffect(() => {
    if (!machines.length) return;
    let actif = true;
    const lire = () =>
      api
        .getAccessUptime(blockId)
        .then((lu) => {
          if (!actif) return;
          setEtat({
            phase: "pret",
            statuts: new Map(lu.statuses.map((s) => [s.machine, s])),
          });
          setMaintenant(Date.now());
        })
        .catch(
          (e: Error) =>
            actif && setEtat({ phase: "erreur", message: e.message }),
        );
    lire();
    const battement = setInterval(lire, relectureDe(intervalle));
    return () => {
      actif = false;
      clearInterval(battement);
    };
    // « machines » se recalcule à chaque rendu : c'est sa signature qui dit
    // s'il a changé.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockId, signature, intervalle]);

  if (!machines.length) {
    return (
      <Text size="sm" c="dimmed">
        Uptime
      </Text>
    );
  }
  if (etat.phase === "erreur") {
    return (
      <Text size="sm" c="red" lineClamp={2}>
        {etat.message}
      </Text>
    );
  }

  const nomDe = (m: Machine) => m.nom || m.hote || "Sans nom";
  const cases = machines.map((m) => {
    const statut = etat.phase === "pret" ? etat.statuts.get(m.id) : undefined;
    return { machine: m, statut, etat: statut?.state ?? ("pending" as const) };
  });

  // Avec le nom ou la durée, chaque machine devient une carte sur une ligne :
  // une barre de la couleur de l'état, le nom à gauche, la durée à droite. Une carte prend la
  // largeur de sa colonne et la hauteur de ce qu'elle porte — la taille d'une
  // case n'a plus cours. Une case de la matrice, elle, est un rectangle SVG,
  // qui ne porte pas de texte.
  if (noms || durees) {
    return (
      <Box
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${Math.min(colonnes, machines.length)}, minmax(0, 1fr))`,
          gap: ESPACEMENT,
        }}
      >
        {cases.map(({ machine: m, statut, etat: e }) => (
          <Box key={m.id} className={classes.carte}>
            <span
              className={classes.barre}
              style={{ backgroundColor: FONDS_CARTE[e] }}
            />
            <Box className={classes.ligne}>
              {noms && (
                <Text size="sm" fw={400} truncate className={classes.nom}>
                  {nomDe(m)}
                </Text>
              )}
              {durees && (
                <Text size="xs" className={classes.duree}>
                  {statut?.since
                    ? duree(statut.since, maintenant)
                    : LIBELLES[e]}
                </Text>
              )}
            </Box>
          </Box>
        ))}
      </Box>
    );
  }

  // Sans texte, la matrice de Mantine. Les machines se rangent de gauche à
  // droite, rangée par rangée ; la dernière rangée, incomplète, laisse ses
  // cases vides : elles n'ont pas de valeur, et la feuille de style les
  // efface.
  const largeur = Math.min(colonnes, machines.length);
  const rangees = Math.ceil(machines.length / largeur);

  // Au survol, ce que les cartes affichent : le nom de la machine, son état et
  // depuis quand il dure — dans l'infobulle des graphiques de Mantine
  // (ChartTooltip), que la bulle de la matrice porte sans son propre habit.
  const infobulle = ({ x, y }: { x: string; y: string }) => {
    const c = cases[Number(y) * largeur + Number(x)];
    if (!c) return null;
    return (
      <ChartTooltip
        type="radial"
        label={nomDe(c.machine)}
        payload={[
          {
            name: LIBELLES[c.etat],
            value: c.statut?.since ? duree(c.statut.since, maintenant) : "",
            color: FONDS_CARTE[c.etat],
          },
        ]}
      />
    );
  };

  return (
    <MatrixChart
      data={cases.map(({ etat: e }, i) => ({
        x: String(i % largeur),
        y: String(Math.floor(i / largeur)),
        value: VALEURS[e],
      }))}
      xLabels={Array.from({ length: largeur }, (_, i) => String(i))}
      yLabels={Array.from({ length: rangees }, (_, i) => String(i))}
      domain={DOMAINE}
      colors={COULEURS}
      cellSize={taille}
      gap={ESPACEMENT}
      cellRadius={Math.min(6, Math.round(taille / 6))}
      classNames={{ cell: classes.case }}
      withTooltip
      getTooltipLabel={infobulle}
      tooltipProps={{
        styles: {
          tooltip: { padding: 0, background: "transparent", color: "inherit" },
        },
      }}
    />
  );
}

// Les colonnes de la liste des machines : la ligne d'ajout et l'en-tête les
// reprennent, pour que tout s'aligne. Une vérification qui n'a pas l'usage
// d'un champ laisse sa colonne vide plutôt que de décaler les suivantes.
const LARGEUR_TYPE = 110;
const LARGEUR_PORT = 64;
const LARGEUR_OID = 140;
const LARGEUR_COMMUNAUTE = 84;
/** La place de la poignée, que la ligne d'ajout et l'en-tête laissent vide. */
const LARGEUR_POIGNEE = 16;

// Hauteur d'un champ dans sa ligne : celle du texte, comme les attributs
// (numero.tsx). Un champ « sm » fait 36 px, plus que la ligne.
const HAUTEUR_CHAMP = 22;
const CHAMP_EN_LIGNE = {
  input: {
    height: HAUTEUR_CHAMP,
    minHeight: HAUTEUR_CHAMP,
    lineHeight: `${HAUTEUR_CHAMP}px`,
  },
};

const colonne = (largeur: number) => ({ width: largeur, flexShrink: 0 });

/**
 * Les champs d'une machine, en ligne : ceux d'une machine de la liste comme
 * ceux de la ligne d'ajout. « onEntree » valide la ligne d'ajout ; Échap la
 * vide.
 */
function ChampsMachine({
  machine,
  onChange,
  onEntree,
  onEchap,
  premierChamp,
}: {
  machine: Machine;
  onChange: (machine: Machine) => void;
  onEntree?: () => void;
  onEchap?: () => void;
  premierChamp?: RefObject<HTMLInputElement | null>;
}) {
  const changer = (champ: Partial<Machine>) =>
    onChange({ ...machine, ...champ });
  const portParDefaut = UPTIME_PORTS_DEFAUT[machine.type];
  // Entrée est consommée : le tiroir n'enregistre pas en plus.
  const touche = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && onEntree) {
      e.preventDefault();
      onEntree();
    }
    if (e.key === "Escape") onEchap?.();
  };
  const commun = {
    variant: "unstyled" as const,
    size: "sm" as const,
    styles: CHAMP_EN_LIGNE,
    onKeyDown: touche,
  };

  return (
    <>
      <TextInput
        {...commun}
        ref={premierChamp}
        placeholder="Nom"
        aria-label="Nom"
        value={machine.nom}
        onChange={(e) => changer({ nom: e.currentTarget.value })}
        style={{ flex: 1, minWidth: 0 }}
      />
      <TextInput
        {...commun}
        placeholder="IP ou FQDN"
        aria-label="IP ou FQDN"
        value={machine.hote}
        onChange={(e) => changer({ hote: e.currentTarget.value.trim() })}
        style={{ flex: 1, minWidth: 0 }}
      />
      <Select
        variant="unstyled"
        size="sm"
        styles={CHAMP_EN_LIGNE}
        aria-label="Vérification"
        data={TYPES}
        value={machine.type}
        onChange={(value) =>
          isUptimeCheckType(value) && changer({ type: value })
        }
        allowDeselect={false}
        rightSectionWidth={20}
        style={colonne(LARGEUR_TYPE)}
      />
      {machine.type === "icmp" ? (
        <Box style={colonne(LARGEUR_PORT)} />
      ) : (
        <NumberInput
          {...commun}
          // Un port TCP n'a pas de valeur par défaut : le champ le réclame.
          placeholder={portParDefaut ? String(portParDefaut) : "Port"}
          aria-label="Port"
          value={machine.port}
          onChange={(valeur) =>
            changer({ port: valeur === "" ? "" : Number(valeur) })
          }
          min={1}
          max={65535}
          allowNegative={false}
          allowDecimal={false}
          hideControls
          error={
            machine.type === "tcp" && machine.port === "" && machine.hote !== ""
          }
          style={colonne(LARGEUR_PORT)}
        />
      )}
      {machine.type === "snmp" ? (
        <>
          <TextInput
            {...commun}
            placeholder="OID"
            aria-label="OID"
            value={machine.oid}
            onChange={(e) => changer({ oid: e.currentTarget.value.trim() })}
            style={colonne(LARGEUR_OID)}
          />
          <TextInput
            {...commun}
            placeholder="public"
            aria-label="Communauté"
            value={machine.communaute}
            onChange={(e) => changer({ communaute: e.currentTarget.value })}
            style={colonne(LARGEUR_COMMUNAUTE)}
          />
        </>
      ) : (
        <>
          <Box style={colonne(LARGEUR_OID)} />
          <Box style={colonne(LARGEUR_COMMUNAUTE)} />
        </>
      )}
    </>
  );
}

/**
 * Les machines, dans la liste des catégories et des attributs (ListItems) :
 * chaque ligne se modifie sur place, se glisse par sa poignée ou se déplace
 * d'un cran par le clic droit, qui la supprime aussi ; la dernière en ajoute
 * une. Au-delà de dix, la liste défile. Tout reste dans le brouillon du
 * tiroir jusqu'à l'enregistrement.
 */
function Machines({ config, onChange }: WidgetConfigProps) {
  const machines = machinesDe(config);
  const [nouvelle, setNouvelle] = useState<Machine>(machineVide);
  const premierChamp = useRef<HTMLInputElement | null>(null);

  const ranger = (liste: Machine[]) => onChange(avec(config, MACHINES, liste));

  const reordonner = (ordre: number[]) =>
    ranger(ordre.flatMap((i) => machines[i] ?? []));
  const { zoneRef, drag, onPointerDown } = usePileGlissante({
    ids: machines.map((_, i) => i),
    selector: "[data-ligne-machine]",
    onReorder: reordonner,
  });

  const deplacer = (index: number, vers: number) => {
    const ordre = machines.map((_, i) => i).filter((i) => i !== index);
    ordre.splice(vers, 0, index);
    reordonner(ordre);
  };

  // Sans adresse, il n'y a rien à vérifier. Le focus revient au nom, et la
  // vérification choisie reste : on enchaîne les machines d'un même genre.
  const ajouter = () => {
    if (!nouvelle.hote.trim()) return;
    ranger([...machines, nouvelle]);
    setNouvelle({ ...machineVide(), type: nouvelle.type, port: nouvelle.port });
    premierChamp.current?.focus();
  };

  return (
    <Input.Wrapper label="Périphériques">
      <ListItems
        isEmpty={machines.length === 0}
        emptyIcon={IconHeartbeat}
        emptyText="Aucune machine"
        maxRows={MACHINES_VISIBLES}
        add={{
          input: (
            <>
              <Box style={colonne(LARGEUR_POIGNEE)} />
              <ChampsMachine
                machine={nouvelle}
                onChange={setNouvelle}
                onEntree={ajouter}
                onEchap={() => setNouvelle(machineVide())}
                premierChamp={premierChamp}
              />
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                onClick={ajouter}
                style={{ flexShrink: 0, opacity: 0.5 }}
                aria-label="Ajouter la machine"
              >
                <IconCornerDownLeft size={14} />
              </ActionIcon>
            </>
          ),
        }}
      >
        <div ref={zoneRef}>
          {machines.map((machine, i) => (
            <div
              key={machine.id}
              data-ligne-machine
              style={{ opacity: drag?.id === i ? 0.4 : 1 }}
            >
              {drag?.target === i && <InsertLine />}
              <ListItems.Row
                actions={[
                  ...(i > 0
                    ? [
                        {
                          label: "Monter",
                          icon: IconArrowUp,
                          onClick: () => deplacer(i, i - 1),
                        },
                      ]
                    : []),
                  ...(i < machines.length - 1
                    ? [
                        {
                          label: "Descendre",
                          icon: IconArrowDown,
                          onClick: () => deplacer(i, i + 1),
                        },
                      ]
                    : []),
                  {
                    label: "Supprimer",
                    icon: IconTrash,
                    onClick: () => ranger(machines.filter((_, j) => j !== i)),
                    danger: true,
                  },
                ]}
              >
                {(active) => (
                  <>
                    {/* Seule la poignée déplace la ligne : les champs gardent leurs clics. */}
                    <DragHandle
                      onPointerDown={onPointerDown(i, i)}
                      visible={active}
                      label="Glisser pour réordonner"
                    />
                    <ChampsMachine
                      machine={machine}
                      onChange={(modifiee) =>
                        ranger(machines.map((m, j) => (j === i ? modifiee : m)))
                      }
                    />
                    <Box style={colonne(22)} />
                  </>
                )}
              </ListItems.Row>
            </div>
          ))}
          {drag && drag.target >= machines.length && <InsertLine />}
        </div>
      </ListItems>
    </Input.Wrapper>
  );
}

function Reglages({ config, onChange }: WidgetConfigProps) {
  const [comptes, setComptes] = useState<PublicUser[]>([]);

  useEffect(() => {
    let actif = true;
    api
      .getUsers()
      .then((lus) => actif && setComptes(lus))
      .catch(() => {
        /* sans la liste, on ne choisit personne : le reste se règle quand même */
      });
    return () => {
      actif = false;
    };
  }, []);

  const avecTexte = option(config, NOMS) || option(config, DUREES);

  /** Un champ vidé le temps d'une saisie range la valeur par défaut plutôt qu'un zéro. */
  const champNombre =
    (cle: string, defaut: number) => (valeur: string | number) =>
      onChange(avec(config, cle, valeur === "" ? defaut : Number(valeur)));

  return (
    <Stack gap="xl">
      {/* Les acteurs sont prévenus à chaque changement d'état : les personnes,
          et les membres des groupes. Une catégorie privée ne prévient que son
          auteur. */}
      <ActorPicker
        label="Acteurs"
        users={comptes}
        value={acteursDe(config)}
        onChange={(ids) => onChange(avec(config, ACTEURS, ids.map(Number)))}
        groups={groupesDe(config)}
        onGroupsChange={(groupes) =>
          onChange(
            avec(
              config,
              GROUPES,
              groupes.map(({ id, name, email }) => ({ id, name, email })),
            ),
          )
        }
      />

      <Machines config={config} onChange={onChange} />

      {/* Des champs étroits : un nombre de quelques chiffres, réglable aux
          flèches. Le libellé garde sa ligne. L'intervalle vient après ce qui
          règle la matrice. */}
      <Group gap="md" align="flex-start">
        {/* Avec le nom ou la durée, les cartes prennent la largeur de leur
            colonne : la taille d'une case n'a plus cours. */}
        {!avecTexte && (
          <NumberInput
            label="Taille d'une case"
            placeholder={String(TAILLE_PAR_DEFAUT)}
            value={nombre(config, TAILLE, TAILLE_PAR_DEFAUT)}
            onChange={champNombre(TAILLE, TAILLE_PAR_DEFAUT)}
            min={TAILLE_MIN}
            max={TAILLE_MAX}
            suffix=" px"
            allowNegative={false}
            allowDecimal={false}
            styles={{ wrapper: { width: 120 } }}
          />
        )}
        <NumberInput
          label="Cases par rangée"
          placeholder={String(COLONNES_PAR_DEFAUT)}
          value={nombre(config, COLONNES, COLONNES_PAR_DEFAUT)}
          onChange={champNombre(COLONNES, COLONNES_PAR_DEFAUT)}
          min={COLONNES_MIN}
          max={COLONNES_MAX}
          allowNegative={false}
          allowDecimal={false}
          styles={{ wrapper: { width: 120 } }}
        />
        {/* Le serveur vérifie chaque machine à ce rythme ; la colonne relit
            ce qu'il garde. */}
        <NumberInput
          label="Intervalle d'actualisation"
          placeholder={String(UPTIME_INTERVAL_DEFAUT)}
          value={nombre(config, INTERVALLE, UPTIME_INTERVAL_DEFAUT)}
          onChange={champNombre(INTERVALLE, UPTIME_INTERVAL_DEFAUT)}
          min={UPTIME_INTERVAL_MIN}
          max={UPTIME_INTERVAL_MAX}
          suffix=" s"
          allowNegative={false}
          allowDecimal={false}
          styles={{ wrapper: { width: 120 } }}
        />
      </Group>

      {/* Ce qui règle l'affichage de la matrice. */}
      <Input.Wrapper label="Options">
        <Stack gap="sm">
          <Switch
            label="Afficher le nom"
            checked={option(config, NOMS)}
            onChange={(e) =>
              onChange(avec(config, NOMS, e.currentTarget.checked))
            }
            color="teal"
          />
          <Switch
            label="Afficher la durée de l'état"
            checked={option(config, DUREES)}
            onChange={(e) =>
              onChange(avec(config, DUREES, e.currentTarget.checked))
            }
            color="teal"
          />
        </Stack>
      </Input.Wrapper>
    </Stack>
  );
}

export const uptimeWidget: AccessWidget = {
  type: "uptime",
  label: "Uptime",
  icon: IconHeartbeat,
  defaultConfig: {
    [MACHINES]: [],
    [INTERVALLE]: UPTIME_INTERVAL_DEFAUT,
    [TAILLE]: TAILLE_PAR_DEFAUT,
    [COLONNES]: COLONNES_PAR_DEFAUT,
    [NOMS]: false,
    [DUREES]: false,
    [ACTEURS]: [],
    [GROUPES]: [],
  },

  Display: Matrice,

  // Une matrice de cases : l'air qu'il faut pour ne pas toucher le lien qui suit.
  marges: () => ({ haute: 0, basse: 10 }),

  Config: Reglages,

  // Une machine par ligne, avec sa vérification : la largeur commune ne les
  // tient pas. Moitié plus large.
  drawerSize: 840,
};
