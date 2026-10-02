import {
  ActionIcon,
  Badge,
  Box,
  CopyButton,
  Grid,
  Group,
  RingProgress,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import {
  IconBarcode,
  IconCheck,
  IconDevicesPc,
  IconLock,
  IconLockOpen,
  IconShieldOff,
  IconCopy,
  IconCpu,
  IconDeviceLaptop,
  IconDatabase,
  IconNetwork,
  IconServer,
  IconShieldCheck,
  IconShieldQuestion,
  IconUser,
  IconWall,
  IconWallOff,
  IconWifi,
} from "@tabler/icons-react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import encart from "../../assets/styles/AccessNumero.module.css";
import { OsLogo, ProtectionLogo } from "./AssetLogos";
import TitreFiche, { ESPACE_SOUS_TITRE } from "./TitreFiche";
import { FOND_CARTE } from "./fonds";
import { diskColor } from "./AssetsList";
import { VIDE, taille } from "./InventoryTables";
import {
  JOURS_SANS_INVENTAIRE,
  diskUsage,
  joursDepuisInventaire,
  libelleOs,
} from "../../lib/poste";
import { Fragment } from "react";
import type { CSSProperties, ReactNode } from "react";
import { RED } from "../../themes/colors";
import type { AssetDetail, AssetSummary } from "@milo/shared";

// L'onglet « Résumé » de la fiche d'un poste : ce qu'on cherche d'abord en
// l'ouvrant, rangé en cartes par thème. Le détail reste dans les autres onglets.

dayjs.extend(relativeTime);

/**
 * La grille suit la largeur du panneau, pas celle de la fenêtre : le tiroir
 * garde la même largeur sur tous les écrans. Trois cartes par ligne dès que le
 * panneau a la largeur d'un tiroir ouvert en entier.
 */
export const POINTS_DE_RUPTURE = {
  xs: "360px",
  sm: "480px",
  md: "600px",
  lg: "720px",
  xl: "960px",
};

/** Une carte : son titre précédé d'une icône, puis son contenu. */
export function Carte({
  titre,
  icone,
  span,
  children,
}: {
  /** Le titre et son icône ; sans titre, la carte commence par son contenu. */
  titre?: string;
  icone?: ReactNode;
  /** Sa largeur : un tiers par défaut, la moitié, deux tiers, ou toute la ligne. */
  span?: "half" | 2 | "full";
  children: ReactNode;
}) {
  // Sur douze colonnes : une seule carte par ligne dans un panneau étroit,
  // deux dans un moyen, trois dans un large.
  const largeur =
    span === "full"
      ? 12
      : span === "half"
        ? { base: 12, sm: 6 }
        : span === 2
          ? { base: 12, lg: 8 }
          : { base: 12, sm: 6, lg: 4 };
  return (
    <Grid.Col span={largeur}>
      {/* L'arrondi des widgets, sans filet, sur un gris neutre. */}
      <Box
        className={encart.encart}
        p="md"
        h="100%"
        style={{ backgroundColor: FOND_CARTE, border: "none" }}
      >
        {titre && (
          <Group gap={8} mb="sm" c="dimmed" wrap="nowrap">
            {icone}
            <Text size="xs" fw={600} tt="uppercase" c="dimmed">
              {titre}
            </Text>
          </Group>
        )}
        {children}
      </Box>
    </Grid.Col>
  );
}

/** Une ligne de carte : le libellé à gauche, la valeur à droite. */
export function Ligne({ libelle, children }: { libelle: string; children: ReactNode }) {
  return (
    <Group gap="sm" wrap="nowrap" align="flex-start">
      <Text size="sm" c="dimmed" w={110} style={{ flexShrink: 0 }}>
        {libelle}
      </Text>
      <div style={{ minWidth: 0, flex: 1 }}>{children}</div>
    </Group>
  );
}

/**
 * Le tag de l'asset, moitié plus grand que dans la liste (20 px de haut,
 * 11 px de texte, 10 px de marge) : c'est le titre de la fiche.
 */
const TAG_TITRE = {
  "--badge-height": "30px",
  "--badge-fz": "16.5px",
  "--badge-padding-x": "15px",
  maxWidth: "100%",
} as CSSProperties;

/** Le tag de l'asset, en tête du résumé : plus haut que les autres, sur toute la largeur. */
const TAG_ASSET = { ...TAG_TITRE, "--badge-height": "44px" } as CSSProperties;

/** La part libre de l'anneau : un gris neutre et clair, pas celui de Mantine qui tire sur le bleu. */
const FOND_ANNEAU = "light-dark(#e0e0e0, var(--mantine-color-dark-4))";

export { FOND_CARTE };

/** Le diamètre du rond des jauges, et l'épaisseur de son anneau. */
const ROND = 96;
const ANNEAU = 10;

/**
 * Le diamètre extérieur de l'anneau tel que Mantine le trace : un rayon de
 * (taille × 0,9 − 2 × épaisseur) / 2, plus la moitié du trait de chaque côté.
 */
const DIAMETRE_ANNEAU = ROND * 0.9 - ANNEAU;

/** Le diamètre de la pastille posée sur le disque. */
const PASTILLE = 30;

/** L'icône posée dans le disque. */
export const ICONE_ROND = 32;

/**
 * Le haut d'une carte de jauge : le rond à gauche, la valeur en gros et son
 * détail à droite. Le rond est un anneau quand on connaît une occupation (le
 * disque) ; sinon, l'icône de la carte — l'agent ne dit rien de la charge du
 * processeur ni de la mémoire utilisée, et un anneau plein mentirait.
 */
function Jauge({
  rond,
  valeur: texte,
  detail,
  sous,
}: {
  rond: ReactNode;
  valeur: string | null;
  detail?: string;
  /** Ce qui suit le détail, quand une ligne de texte ne suffit pas. */
  sous?: ReactNode;
}) {
  return (
    <Group gap="md" wrap="nowrap">
      {rond}
      <Stack gap={2} style={{ minWidth: 0 }}>
        <Text size="lg" fw={700} c={texte ? undefined : "dimmed"} lineClamp={2}>
          {texte || VIDE}
        </Text>
        {detail && (
          <Text size="xs" c="dimmed" lineClamp={2}>
            {detail}
          </Text>
        )}
        {sous}
      </Stack>
    </Group>
  );
}

/**
 * Le numéro de série, ou « VM » pour une machine virtuelle Parallels : le sien
 * (« Parallels-A1 B2 C3… ») n'identifie aucun matériel.
 */
const numeroDeSerie = (serial: string): string =>
  /^parallels/i.test(serial.trim()) ? "VM" : serial || VIDE;

/** Moins de six mois avant la fin de support : il est temps d'y penser. */
const MOIS_AVANT_FIN = 6;

/**
 * La fin de support du système, d'après endoflife.date : en rouge quand elle
 * est passée, en orange quand elle approche, en vert sinon — et en vert aussi
 * quand l'éditeur n'en a pas encore annoncé. En gris quand on ne sait pas.
 */
function FinSupport({ support }: { support: AssetDetail["support"] }) {
  if (!support) {
    return (
      <Text size="sm" c="dimmed">
        Fin support inconnue
      </Text>
    );
  }
  if (!support.eol) {
    return (
      <Text size="sm" fw={600} c={support.ended ? RED : "teal"}>
        {support.ended ? "Plus maintenu" : "Fin support non annoncée"}
      </Text>
    );
  }
  const fin = dayjs(support.eol);
  const couleur = support.ended
    ? RED
    : fin.diff(dayjs(), "month", true) < MOIS_AVANT_FIN
      ? "orange"
      : "teal";
  return (
    <Text size="sm" fw={600} c={couleur}>
      Fin support {fin.format("DD/MM/YYYY")}
    </Text>
  );
}

/**
 * Le rond d'une jauge sans occupation connue : l'icône sur un disque du même
 * gris neutre que l'anneau du disque, pour que les trois jauges se répondent.
 */
export const RondIcone = ({ children, bulle }: { children: ReactNode; bulle?: string }) => (
  // La boîte garde la place de l'anneau, pour que les valeurs s'alignent ;
  // le disque, lui, prend le diamètre que l'anneau dessine vraiment.
  <Box
    w={ROND}
    h={ROND}
    style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
  >
    <Box
      c="dimmed"
      w={DIAMETRE_ANNEAU}
      h={DIAMETRE_ANNEAU}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "50%",
        backgroundColor: FOND_ANNEAU,
        position: "relative",
      }}
    >
      {children}
      {/* Une précision dans une pastille ronde, à cheval sur le bas droit
          du disque : l'architecture du processeur. */}
      {bulle && (
        <Box
          bg="teal"
          c="white"
          w={PASTILLE}
          h={PASTILLE}
          style={{
            position: "absolute",
            right: -4,
            bottom: -4,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: `2px solid ${FOND_CARTE}`,
          }}
        >
          <Text size="10px" fw={700} c="inherit" lh={1}>
            {bulle}
          </Text>
        </Box>
      )}
    </Box>
  </Box>
);

/** Un état de la carte Sécurité : son icône et son texte, de la même couleur. */
function Etat({
  couleur,
  icone,
  children,
}: {
  couleur: string;
  icone: ReactNode;
  children: ReactNode;
}) {
  return (
    <Group gap={8} wrap="nowrap" c={couleur}>
      <span style={{ display: "inline-flex", flexShrink: 0 }}>{icone}</span>
      <Text size="sm" fw={600} c="inherit" style={{ wordBreak: "break-word" }}>
        {children}
      </Text>
    </Group>
  );
}

/**
 * La protection du poste : en vert avec le nom de l'EPP/EDR quand il tourne,
 * en orange quand il est désactivé, en rouge quand Windows n'en déclare
 * aucun. Hors de Windows l'agent n'en sait rien : on le dit, en gris.
 */
function Protection({ protection }: { protection: AssetDetail["protection"] }) {
  if (protection.state === "none") {
    return (
      <Etat couleur={RED} icone={<IconShieldOff size={16} />}>
        Aucun EPP/EDR
      </Etat>
    );
  }
  if (protection.state === "unknown") {
    return (
      <Etat couleur="dimmed" icone={<IconShieldQuestion size={16} />}>
        EPP/EDR non déclaré par l'agent
      </Etat>
    );
  }
  const nom = protection.name || protection.company || "EPP/EDR";
  return (
    <Etat
      couleur={protection.state === "active" ? "teal" : "orange"}
      icone={<ProtectionLogo protection={protection} />}
    >
      {protection.state === "active" ? nom : `${nom} (inactif)`}
    </Etat>
  );
}

/**
 * Le chiffrement du volume système : en vert avec son nom et son algorithme
 * (« FileVault 2 — XTS-AES-128 »), en rouge quand le disque ne l'est pas, en
 * gris quand l'agent ne le dit pas.
 */
function Chiffrement({
  encrypted,
  encryption,
}: {
  encrypted: boolean | null;
  encryption: AssetSummary["encryption"];
}) {
  if (encrypted === false) {
    return (
      <Etat couleur={RED} icone={<IconLockOpen size={16} />}>
        Disque non chiffré
      </Etat>
    );
  }
  if (encrypted == null) {
    return (
      <Etat couleur="dimmed" icone={<IconLock size={16} />}>
        Chiffrement non déclaré par l'agent
      </Etat>
    );
  }
  const libelle = [encryption.name || "Disque chiffré", encryption.algorithm.replace(/_/g, "-")]
    .filter(Boolean)
    .join(" — ");
  return (
    <Etat couleur="teal" icone={<IconLock size={16} />}>
      {libelle}
    </Etat>
  );
}

/**
 * Le pare-feu : en vert quand il est actif partout, en orange quand un profil
 * de Windows est éteint (on dit lequel), en rouge quand il l'est sur tous, en
 * gris quand l'agent ne le dit pas.
 */
function PareFeu({ firewall }: { firewall: AssetSummary["firewall"] }) {
  switch (firewall.state) {
    case "on":
      return (
        <Etat couleur="teal" icone={<IconWall size={16} />}>
          Pare-feu activé
        </Etat>
      );
    case "partial":
      return (
        <Etat couleur="orange" icone={<IconWall size={16} />}>
          Pare-feu désactivé sur {firewall.disabled.length > 1 ? "les profils" : "le profil"}{" "}
          {firewall.disabled.join(", ")}
        </Etat>
      );
    case "off":
      return (
        <Etat couleur={RED} icone={<IconWallOff size={16} />}>
          Pare-feu désactivé
        </Etat>
      );
    default:
      return (
        <Etat couleur="dimmed" icone={<IconWall size={16} />}>
          Pare-feu non déclaré par l'agent
        </Etat>
      );
  }
}

/** L'ordre des états de la carte Sécurité : ce qui manque d'abord. */
const GRAVITE = { rouge: 0, orange: 1, gris: 2, vert: 3 } as const;
type Gravite = keyof typeof GRAVITE;

const graviteProtection = ({ state }: AssetDetail["protection"]): Gravite =>
  state === "none"
    ? "rouge"
    : state === "inactive"
      ? "orange"
      : state === "unknown"
        ? "gris"
        : "vert";

const graviteChiffrement = (encrypted: boolean | null): Gravite =>
  encrypted === false ? "rouge" : encrypted == null ? "gris" : "vert";

const graviteParefeu = ({ state }: AssetSummary["firewall"]): Gravite =>
  state === "off"
    ? "rouge"
    : state === "partial"
      ? "orange"
      : state === "unknown"
        ? "gris"
        : "vert";

/**
 * Les trois états de la carte Sécurité, le rouge en tête, puis l'orange, le
 * gris et le vert ; à gravité égale, l'ordre EPP/EDR, chiffrement, pare-feu.
 */
const elementsSecurite = (detail: AssetDetail) =>
  [
    {
      cle: "protection",
      gravite: graviteProtection(detail.protection),
      element: <Protection protection={detail.protection} />,
    },
    {
      cle: "chiffrement",
      gravite: graviteChiffrement(detail.system_disk_encrypted),
      element: (
        <Chiffrement
          encrypted={detail.system_disk_encrypted}
          encryption={detail.summary.encryption}
        />
      ),
    },
    {
      cle: "parefeu",
      gravite: graviteParefeu(detail.summary.firewall),
      element: <PareFeu firewall={detail.summary.firewall} />,
    },
  ]
    .sort((a, b) => GRAVITE[a.gravite] - GRAVITE[b.gravite])
    .map(({ cle, element }) => <Fragment key={cle}>{element}</Fragment>);

/** Les trois points de la carte Sécurité. */
const POINTS_SECURITE = 3;

/**
 * Le score de sécurité, sur trois : un point par protection en vert — un
 * EPP/EDR actif, un disque chiffré, un pare-feu actif sur tous les profils.
 * Ce qui est désactivé, partiel ou non déclaré ne compte pas.
 */
const scoreSecurite = (detail: AssetDetail): number =>
  [
    detail.protection.state === "active",
    detail.system_disk_encrypted === true,
    detail.summary.firewall.state === "on",
  ].filter(Boolean).length;

/** Vert quand tout y est, orange à deux sur trois, rouge en dessous. */
const couleurScore = (score: number): string =>
  score === POINTS_SECURITE ? "teal" : score === POINTS_SECURITE - 1 ? "orange" : RED;

/** Le score de sécurité dans un anneau, à la taille de celui du stockage. */
function ScoreSecurite({ score }: { score: number }) {
  return (
    <RingProgress
      size={ROND}
      thickness={ANNEAU}
      rootColor={FOND_ANNEAU}
      roundCaps
      style={{ flexShrink: 0 }}
      sections={[{ value: (score / POINTS_SECURITE) * 100, color: couleurScore(score) }]}
      label={
        <Text size="sm" fw={700} ta="center">
          {score}/{POINTS_SECURITE}
        </Text>
      }
    />
  );
}

/**
 * « Ethernet — Intel(R) Ethernet I219-LM » : le type, puis le nom de la carte.
 * macOS et Windows nomment souvent l'interface d'après son type (« Wi-Fi »,
 * « Ethernet ») : le nom n'est alors pas répété.
 */
const typeConnexion = (carte: AssetSummary["networks"][number]): string => {
  const type = carte.kind === "wifi" ? "Wi-Fi" : "Ethernet";
  const nom = carte.description.trim();
  return nom && nom.toLowerCase() !== type.toLowerCase() ? `${type} — ${nom}` : type;
};

/** Un texte, ou le tiret quand l'agent ne l'a pas donné. */
export const valeur = (texte: string | null | undefined) => (
  <Text size="sm" c={texte ? undefined : "dimmed"} style={{ wordBreak: "break-word" }}>
    {texte || VIDE}
  </Text>
);

/** Une valeur qu'on recopie ailleurs : l'identifiant TeamViewer, l'adresse. */
function Copiable({ texte, libelle }: { texte: string; libelle: string }) {
  if (!texte) return valeur(null);
  return (
    <Group gap={4} wrap="nowrap">
      <Text size="sm" ff="monospace">
        {texte}
      </Text>
      <BoutonCopier texte={texte} libelle={libelle} />
    </Group>
  );
}

/**
 * Le bouton qui copie une valeur, et qui dit l'avoir fait : la coche
 * remplace l'icône, et une bulle le dit sauf quand on n'en veut pas.
 */
export function BoutonCopier({
  texte,
  libelle,
  sansBulle = false,
}: {
  texte: string;
  libelle: string;
  sansBulle?: boolean;
}) {
  return (
    <CopyButton value={texte}>
      {({ copied, copy }) => (
        <Tooltip label={copied ? "Copié" : "Copier"} withArrow disabled={sansBulle}>
          <ActionIcon variant="subtle" color="gray" size="sm" onClick={copy} aria-label={libelle}>
            {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
          </ActionIcon>
        </Tooltip>
      )}
    </CopyButton>
  );
}

export default function AssetSummaryPanel({ detail }: { detail: AssetDetail }) {
  const { summary, os, system_disk: disque } = detail;
  const occupe = diskUsage(disque);
  const ancien = joursDepuisInventaire(detail) > JOURS_SANS_INVENTAIRE;
  // Une machine virtuelle Parallels se déclare « Parallels International
  // GmbH. Parallels ARM Virtual Machine » : son nom suffit.
  const materiel = [summary.manufacturer, summary.model].filter(Boolean).join(" ");
  const fabricant = /^parallels/i.test(materiel) ? "Parallels" : materiel;
  const score = scoreSecurite(detail);
  const accesDistant = Boolean(detail.teamviewer_id);
  const cpu = summary.cpu;
  const coeurs = cpu
    ? [cpu.cores && `${cpu.cores} cœurs`, cpu.threads && `${cpu.threads} threads`]
        .filter(Boolean)
        .join(", ")
    : "";

  return (
    <>
      {/* Le titre de l'onglet, comme une catégorie du mode Accès : blanc,
          en 18. En face, la date du dernier inventaire ; un poste muet depuis
          longtemps est sans doute éteint ou perdu, elle le dit en orange. */}
      <Group justify="space-between" align="center" wrap="nowrap" mb={ESPACE_SOUS_TITRE}>
        <TitreFiche>Résumé</TitreFiche>
        <Text size="sm" c={ancien ? "orange" : "dimmed"} fw={ancien ? 600 : undefined}>
          {dayjs(detail.last_inventory).format("DD/MM/YYYY HH:mm")}
        </Text>
      </Group>
      <Grid gap="md" type="container" breakpoints={POINTS_DE_RUPTURE}>
        {/* En tête, le tag de l'asset, seul, sur toute la largeur. */}
        <Grid.Col span={12}>
          <Badge
            color="green"
            variant="filled"
            radius="sm"
            tt="uppercase"
            fullWidth
            style={TAG_ASSET}
            styles={{ root: { justifyContent: "center" }, label: { textAlign: "center" } }}
          >
            {detail.name || VIDE}
          </Badge>
        </Grid.Col>

        {/* Puis le système, sur toute la largeur aussi, avec à sa droite ce
            qui identifie la machine : son numéro de série, son matériel, la
            dernière personne connectée. */}
        <Carte titre="Système" icone={<IconDeviceLaptop size={16} />} span="full">
          {/* Deux colonnes de même largeur. */}
          <Box
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
              alignItems: "center",
              columnGap: "var(--mantine-spacing-lg)",
            }}
          >
            <Jauge
              rond={
                <RondIcone>
                  {os ? (
                    <OsLogo os={os} taille={ICONE_ROND} />
                  ) : (
                    <IconDeviceLaptop size={ICONE_ROND} />
                  )}
                </RondIcone>
              }
              valeur={os ? libelleOs(os) : null}
              sous={<FinSupport support={detail.support} />}
            />
            <Stack gap="sm" style={{ minWidth: 0 }}>
              <Group gap={8} wrap="nowrap">
                <Tooltip label="Numéro de série" withArrow>
                  <Text c="dimmed" style={{ display: "inline-flex" }}>
                    <IconBarcode size={16} />
                  </Text>
                </Tooltip>
                <Text size="sm" c={summary.serial ? undefined : "dimmed"}>
                  {numeroDeSerie(summary.serial)}
                </Text>
              </Group>
              <Group gap={8} wrap="nowrap">
                <Tooltip label="Matériel" withArrow>
                  <Text c="dimmed" style={{ display: "inline-flex" }}>
                    <IconDevicesPc size={16} />
                  </Text>
                </Tooltip>
                <Text size="sm" c={fabricant ? undefined : "dimmed"}>
                  {fabricant || VIDE}
                </Text>
              </Group>
              <Group gap={8} wrap="nowrap">
                <Tooltip label="Dernier utilisateur connecté" withArrow>
                  <Text c="dimmed" style={{ display: "inline-flex" }}>
                    <IconUser size={16} />
                  </Text>
                </Tooltip>
                <Text size="sm" c={detail.user ? undefined : "dimmed"}>
                  {detail.user || "Aucun utilisateur connu"}
                </Text>
              </Group>
            </Stack>
          </Box>
        </Carte>

        {/* Puis les trois jauges : le processeur, la mémoire, et le volume
          système avec les couleurs de la liste. */}
        <Carte titre="Processeur" icone={<IconCpu size={16} />}>
          <Jauge
            rond={
              <RondIcone bulle={summary.arch || undefined}>
                <IconCpu size={ICONE_ROND} />
              </RondIcone>
            }
            valeur={cpu ? `${cpu.count > 1 ? `${cpu.count} × ` : ""}${cpu.name}` : null}
            detail={coeurs || undefined}
          />
        </Carte>

        <Carte titre="Mémoire" icone={<IconServer size={16} />}>
          <Jauge
            rond={
              <RondIcone>
                <IconServer size={ICONE_ROND} />
              </RondIcone>
            }
            valeur={summary.memory ? taille(summary.memory) : null}
            detail="Mémoire vive"
          />
        </Carte>

        <Carte titre="Stockage" icone={<IconDatabase size={16} />}>
          <Jauge
            rond={
              occupe != null ? (
                <RingProgress
                  size={ROND}
                  thickness={ANNEAU}
                  rootColor={FOND_ANNEAU}
                  roundCaps
                  sections={[{ value: occupe, color: diskColor(occupe) }]}
                  label={
                    <Text size="sm" fw={700} ta="center">
                      {occupe} %
                    </Text>
                  }
                />
              ) : (
                <RondIcone>
                  <IconDatabase size={ICONE_ROND} />
                </RondIcone>
              )
            }
            valeur={disque ? taille(disque.free) : null}
            detail={disque ? `sur ${taille(disque.total)}` : undefined}
          />
        </Carte>

        {/* La carte qui sert : le serveur n'en garde qu'une, connectée, le
            Wi-Fi d'abord (cartesDe). Le rond prend son icône. */}
        <Carte titre="Réseau" icone={<IconNetwork size={16} />} span="half">
          <Group gap="md" wrap="nowrap">
            <RondIcone>
              {summary.networks[0]?.kind === "wifi" ? (
                <IconWifi size={ICONE_ROND} />
              ) : (
                <IconNetwork size={ICONE_ROND} />
              )}
            </RondIcone>
            {summary.networks.length === 0 ? (
              valeur(null)
            ) : (
              <Stack gap="xs" style={{ minWidth: 0 }}>
                {summary.networks.map((carte, rang) => (
                  <Stack key={rang} gap={2}>
                    {/* Chaque adresse se copie : c'est elle qu'on colle dans
                        un terminal ou un outil de prise en main. */}
                    <Group gap="xs">
                      {carte.ips.map((ip) => (
                        <Group key={ip} gap={2} wrap="nowrap">
                          <Text size="lg" fw={700}>
                            {ip}
                          </Text>
                          <BoutonCopier texte={ip} libelle={`Copier l'adresse ${ip}`} sansBulle />
                        </Group>
                      ))}
                      {/* Le VLAN du Paramétrage qui porte la carte, quand
                          son sous-réseau y est déclaré. */}
                      {carte.vlan && (
                        <Group gap={6} wrap="nowrap">
                          {carte.vlan.name && <Text size="sm">{carte.vlan.name}</Text>}
                          <Badge color="green" variant="filled" size="sm" radius="sm">
                            VLAN {carte.vlan.vlan}
                          </Badge>
                        </Group>
                      )}
                    </Group>
                    {/* Au style du nom du VLAN. */}
                    <Text size="sm" style={{ wordBreak: "break-word" }}>
                      {typeConnexion(carte)}
                    </Text>
                  </Stack>
                ))}
              </Stack>
            )}
          </Group>
        </Carte>

        <Carte titre="Sécurité" icone={<IconShieldCheck size={16} />} span="half">
          <Group gap="md" wrap="nowrap">
            <ScoreSecurite score={score} />
            <Stack gap="xs" style={{ minWidth: 0 }}>
              {elementsSecurite(detail)}
            </Stack>
          </Group>
        </Carte>

        {/* Sans TeamViewer, il n'y a rien à dire sur l'accès. */}
        {accesDistant && (
          <Carte titre="Accès distant" icone={<IconDeviceLaptop size={16} />} span="half">
            <Ligne libelle="TeamViewer">
              <Copiable texte={detail.teamviewer_id} libelle="Copier l'identifiant TeamViewer" />
            </Ligne>
          </Carte>
        )}
      </Grid>
    </>
  );
}
