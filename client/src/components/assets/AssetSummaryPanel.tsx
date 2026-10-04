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
import inset from "../../assets/styles/AccessNumber.module.css";
import { OsLogo, ProtectionLogo } from "./AssetLogos";
import RecordTitle, { SPACE_BELOW_TITLE } from "./RecordTitle";
import { CARD_BACKGROUND } from "./backgrounds";
import { diskColor } from "./AssetsList";
import { EMPTY, size } from "./InventoryTables";
import {
  DAYS_WITHOUT_INVENTORY,
  diskUsage,
  daysSinceInventory,
  osLabel,
} from "../../lib/workstation";
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
export const BREAKPOINTS = {
  xs: "360px",
  sm: "480px",
  md: "600px",
  lg: "720px",
  xl: "960px",
};

/** Une carte : son titre précédé d'une icône, puis son contenu. */
export function Card({
  title,
  icon,
  span,
  children,
}: {
  /** Le titre et son icône ; sans titre, la carte commence par son contenu. */
  title?: string;
  icon?: ReactNode;
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
        className={inset.encart}
        p="md"
        h="100%"
        style={{ backgroundColor: CARD_BACKGROUND, border: "none" }}
      >
        {title && (
          <Group gap={8} mb="sm" c="dimmed" wrap="nowrap">
            {icon}
            <Text size="xs" fw={600} tt="uppercase" c="dimmed">
              {title}
            </Text>
          </Group>
        )}
        {children}
      </Box>
    </Grid.Col>
  );
}

/** Une ligne de carte : le libellé à gauche, la valeur à droite. */
export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Group gap="sm" wrap="nowrap" align="flex-start">
      <Text size="sm" c="dimmed" w={110} style={{ flexShrink: 0 }}>
        {label}
      </Text>
      <div style={{ minWidth: 0, flex: 1 }}>{children}</div>
    </Group>
  );
}

/**
 * Le tag de l'asset, moitié plus grand que dans la liste (20 px de haut,
 * 11 px de texte, 10 px de marge) : c'est le titre de la fiche.
 */
const TAG_TITLE = {
  "--badge-height": "30px",
  "--badge-fz": "16.5px",
  "--badge-padding-x": "15px",
  maxWidth: "100%",
} as CSSProperties;

/** Le tag de l'asset, en tête du résumé : plus haut que les autres, sur toute la largeur. */
const TAG_ASSET = { ...TAG_TITLE, "--badge-height": "44px" } as CSSProperties;

/** La part libre de l'anneau : un gris neutre et clair, pas celui de Mantine qui tire sur le bleu. */
const RING_BACKGROUND = "light-dark(#e0e0e0, var(--mantine-color-dark-4))";

export { CARD_BACKGROUND };

/** Le diamètre du rond des jauges, et l'épaisseur de son anneau. */
const CIRCLE_SIZE = 96;
const RING = 10;

/**
 * Le diamètre extérieur de l'anneau tel que Mantine le trace : un rayon de
 * (taille × 0,9 − 2 × épaisseur) / 2, plus la moitié du trait de chaque côté.
 */
const RING_DIAMETER = CIRCLE_SIZE * 0.9 - RING;

/** Le diamètre de la pastille posée sur le disque. */
const DOT = 30;

/** L'icône posée dans le disque. */
export const ROUND_ICON = 32;

/**
 * Le haut d'une carte de jauge : le rond à gauche, la valeur en gros et son
 * détail à droite. Le rond est un anneau quand on connaît une occupation (le
 * disque) ; sinon, l'icône de la carte — l'agent ne dit rien de la charge du
 * processeur ni de la mémoire utilisée, et un anneau plein mentirait.
 */
function Gauge({
  circle,
  value: text,
  detail,
  subtitle,
}: {
  circle: ReactNode;
  value: string | null;
  detail?: string;
  /** Ce qui suit le détail, quand une ligne de texte ne suffit pas. */
  subtitle?: ReactNode;
}) {
  return (
    <Group gap="md" wrap="nowrap">
      {circle}
      <Stack gap={2} style={{ minWidth: 0 }}>
        <Text size="lg" fw={700} c={text ? undefined : "dimmed"} lineClamp={2}>
          {text || EMPTY}
        </Text>
        {detail && (
          <Text size="xs" c="dimmed" lineClamp={2}>
            {detail}
          </Text>
        )}
        {subtitle}
      </Stack>
    </Group>
  );
}

/**
 * Le numéro de série, ou « VM » pour une machine virtuelle Parallels : le sien
 * (« Parallels-A1 B2 C3… ») n'identifie aucun matériel.
 */
const serialNumber = (serial: string): string =>
  /^parallels/i.test(serial.trim()) ? "VM" : serial || EMPTY;

/** Moins de six mois avant la fin de support : il est temps d'y penser. */
const MONTHS_BEFORE_END = 6;

/**
 * La fin de support du système, d'après endoflife.date : en rouge quand elle
 * est passée, en orange quand elle approche, en vert sinon — et en vert aussi
 * quand l'éditeur n'en a pas encore annoncé. En gris quand on ne sait pas.
 */
function EndOfSupport({ support }: { support: AssetDetail["support"] }) {
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
  const end = dayjs(support.eol);
  const color = support.ended
    ? RED
    : end.diff(dayjs(), "month", true) < MONTHS_BEFORE_END
      ? "orange"
      : "teal";
  return (
    <Text size="sm" fw={600} c={color}>
      Fin support {end.format("DD/MM/YYYY")}
    </Text>
  );
}

/**
 * Le rond d'une jauge sans occupation connue : l'icône sur un disque du même
 * gris neutre que l'anneau du disque, pour que les trois jauges se répondent.
 */
export const CircleIcon = ({ children, bubble }: { children: ReactNode; bubble?: string }) => (
  // La boîte garde la place de l'anneau, pour que les valeurs s'alignent ;
  // le disque, lui, prend le diamètre que l'anneau dessine vraiment.
  <Box
    w={CIRCLE_SIZE}
    h={CIRCLE_SIZE}
    style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
  >
    <Box
      c="dimmed"
      w={RING_DIAMETER}
      h={RING_DIAMETER}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "50%",
        backgroundColor: RING_BACKGROUND,
        position: "relative",
      }}
    >
      {children}
      {/* Une précision dans une pastille ronde, à cheval sur le bas droit
          du disque : l'architecture du processeur. */}
      {bubble && (
        <Box
          bg="teal"
          c="white"
          w={DOT}
          h={DOT}
          style={{
            position: "absolute",
            right: -4,
            bottom: -4,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: `2px solid ${CARD_BACKGROUND}`,
          }}
        >
          <Text size="10px" fw={700} c="inherit" lh={1}>
            {bubble}
          </Text>
        </Box>
      )}
    </Box>
  </Box>
);

/** Un état de la carte Sécurité : son icône et son texte, de la même couleur. */
function State({
  color,
  icon,
  children,
}: {
  color: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <Group gap={8} wrap="nowrap" c={color}>
      <span style={{ display: "inline-flex", flexShrink: 0 }}>{icon}</span>
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
      <State color={RED} icon={<IconShieldOff size={16} />}>
        Aucun EPP/EDR
      </State>
    );
  }
  if (protection.state === "unknown") {
    return (
      <State color="dimmed" icon={<IconShieldQuestion size={16} />}>
        EPP/EDR non déclaré par l'agent
      </State>
    );
  }
  const name = protection.name || protection.company || "EPP/EDR";
  return (
    <State
      color={protection.state === "active" ? "teal" : "orange"}
      icon={<ProtectionLogo protection={protection} />}
    >
      {protection.state === "active" ? name : `${name} (inactif)`}
    </State>
  );
}

/**
 * Le chiffrement du volume système : en vert avec son nom et son algorithme
 * (« FileVault 2 — XTS-AES-128 »), en rouge quand le disque ne l'est pas, en
 * gris quand l'agent ne le dit pas.
 */
function Encryption({
  encrypted,
  encryption,
}: {
  encrypted: boolean | null;
  encryption: AssetSummary["encryption"];
}) {
  if (encrypted === false) {
    return (
      <State color={RED} icon={<IconLockOpen size={16} />}>
        Disque non chiffré
      </State>
    );
  }
  if (encrypted == null) {
    return (
      <State color="dimmed" icon={<IconLock size={16} />}>
        Chiffrement non déclaré par l'agent
      </State>
    );
  }
  const label = [encryption.name || "Disque chiffré", encryption.algorithm.replace(/_/g, "-")]
    .filter(Boolean)
    .join(" — ");
  return (
    <State color="teal" icon={<IconLock size={16} />}>
      {label}
    </State>
  );
}

/**
 * Le pare-feu : en vert quand il est actif partout, en orange quand un profil
 * de Windows est éteint (on dit lequel), en rouge quand il l'est sur tous, en
 * gris quand l'agent ne le dit pas.
 */
function Firewall({ firewall }: { firewall: AssetSummary["firewall"] }) {
  switch (firewall.state) {
    case "on":
      return (
        <State color="teal" icon={<IconWall size={16} />}>
          Pare-feu activé
        </State>
      );
    case "partial":
      return (
        <State color="orange" icon={<IconWall size={16} />}>
          Pare-feu désactivé sur {firewall.disabled.length > 1 ? "les profils" : "le profil"}{" "}
          {firewall.disabled.join(", ")}
        </State>
      );
    case "off":
      return (
        <State color={RED} icon={<IconWallOff size={16} />}>
          Pare-feu désactivé
        </State>
      );
    default:
      return (
        <State color="dimmed" icon={<IconWall size={16} />}>
          Pare-feu non déclaré par l'agent
        </State>
      );
  }
}

/** L'ordre des états de la carte Sécurité : ce qui manque d'abord. */
const SEVERITY = { rouge: 0, orange: 1, gris: 2, vert: 3 } as const;
type Severity = keyof typeof SEVERITY;

const protectionSeverity = ({ state }: AssetDetail["protection"]): Severity =>
  state === "none"
    ? "rouge"
    : state === "inactive"
      ? "orange"
      : state === "unknown"
        ? "gris"
        : "vert";

const encryptionSeverity = (encrypted: boolean | null): Severity =>
  encrypted === false ? "rouge" : encrypted == null ? "gris" : "vert";

const firewallSeverity = ({ state }: AssetSummary["firewall"]): Severity =>
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
const securityItems = (detail: AssetDetail) =>
  [
    {
      key: "protection",
      severity: protectionSeverity(detail.protection),
      element: <Protection protection={detail.protection} />,
    },
    {
      key: "chiffrement",
      severity: encryptionSeverity(detail.system_disk_encrypted),
      element: (
        <Encryption
          encrypted={detail.system_disk_encrypted}
          encryption={detail.summary.encryption}
        />
      ),
    },
    {
      key: "parefeu",
      severity: firewallSeverity(detail.summary.firewall),
      element: <Firewall firewall={detail.summary.firewall} />,
    },
  ]
    .sort((a, b) => SEVERITY[a.severity] - SEVERITY[b.severity])
    .map(({ key, element }) => <Fragment key={key}>{element}</Fragment>);

/** Les trois points de la carte Sécurité. */
const SECURITY_POINTS = 3;

/**
 * Le score de sécurité, sur trois : un point par protection en vert — un
 * EPP/EDR actif, un disque chiffré, un pare-feu actif sur tous les profils.
 * Ce qui est désactivé, partiel ou non déclaré ne compte pas.
 */
const securityScore = (detail: AssetDetail): number =>
  [
    detail.protection.state === "active",
    detail.system_disk_encrypted === true,
    detail.summary.firewall.state === "on",
  ].filter(Boolean).length;

/** Vert quand tout y est, orange à deux sur trois, rouge en dessous. */
const scoreColor = (score: number): string =>
  score === SECURITY_POINTS ? "teal" : score === SECURITY_POINTS - 1 ? "orange" : RED;

/** Le score de sécurité dans un anneau, à la taille de celui du stockage. */
function SecurityScore({ score }: { score: number }) {
  return (
    <RingProgress
      size={CIRCLE_SIZE}
      thickness={RING}
      rootColor={RING_BACKGROUND}
      roundCaps
      style={{ flexShrink: 0 }}
      sections={[{ value: (score / SECURITY_POINTS) * 100, color: scoreColor(score) }]}
      label={
        <Text size="sm" fw={700} ta="center">
          {score}/{SECURITY_POINTS}
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
const connectionType = (card: AssetSummary["networks"][number]): string => {
  const type = card.kind === "wifi" ? "Wi-Fi" : "Ethernet";
  const name = card.description.trim();
  return name && name.toLowerCase() !== type.toLowerCase() ? `${type} — ${name}` : type;
};

/** Un texte, ou le tiret quand l'agent ne l'a pas donné. */
export const value = (text: string | null | undefined) => (
  <Text size="sm" c={text ? undefined : "dimmed"} style={{ wordBreak: "break-word" }}>
    {text || EMPTY}
  </Text>
);

/** Une valeur qu'on recopie ailleurs : l'identifiant TeamViewer, l'adresse. */
function Copyable({ text, label }: { text: string; label: string }) {
  if (!text) return value(null);
  return (
    <Group gap={4} wrap="nowrap">
      <Text size="sm" ff="monospace">
        {text}
      </Text>
      <CopyValueButton text={text} label={label} />
    </Group>
  );
}

/**
 * Le bouton qui copie une valeur, et qui dit l'avoir fait : la coche
 * remplace l'icône, et une bulle le dit sauf quand on n'en veut pas.
 */
export function CopyValueButton({
  text,
  label,
  withoutBubble = false,
}: {
  text: string;
  label: string;
  withoutBubble?: boolean;
}) {
  return (
    <CopyButton value={text}>
      {({ copied, copy }) => (
        <Tooltip label={copied ? "Copié" : "Copier"} withArrow disabled={withoutBubble}>
          <ActionIcon variant="subtle" color="gray" size="sm" onClick={copy} aria-label={label}>
            {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
          </ActionIcon>
        </Tooltip>
      )}
    </CopyButton>
  );
}

export default function AssetSummaryPanel({ detail }: { detail: AssetDetail }) {
  const { summary, os, system_disk: disk } = detail;
  const occupe = diskUsage(disk);
  const old = daysSinceInventory(detail) > DAYS_WITHOUT_INVENTORY;
  // Une machine virtuelle Parallels se déclare « Parallels International
  // GmbH. Parallels ARM Virtual Machine » : son nom suffit.
  const hardware = [summary.manufacturer, summary.model].filter(Boolean).join(" ");
  const manufacturer = /^parallels/i.test(hardware) ? "Parallels" : hardware;
  const score = securityScore(detail);
  const remoteAccess = Boolean(detail.teamviewer_id);
  const cpu = summary.cpu;
  const cores = cpu
    ? [cpu.cores && `${cpu.cores} cœurs`, cpu.threads && `${cpu.threads} threads`]
        .filter(Boolean)
        .join(", ")
    : "";

  return (
    <>
      {/* Le titre de l'onglet, comme une catégorie du mode Accès : blanc,
          en 18. En face, la date du dernier inventaire ; un poste muet depuis
          longtemps est sans doute éteint ou perdu, elle le dit en orange. */}
      <Group justify="space-between" align="center" wrap="nowrap" mb={SPACE_BELOW_TITLE}>
        <RecordTitle>Résumé</RecordTitle>
        <Text size="sm" c={old ? "orange" : "dimmed"} fw={old ? 600 : undefined}>
          {dayjs(detail.last_inventory).format("DD/MM/YYYY HH:mm")}
        </Text>
      </Group>
      <Grid gap="md" type="container" breakpoints={BREAKPOINTS}>
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
            {detail.name || EMPTY}
          </Badge>
        </Grid.Col>

        {/* Puis le système, sur toute la largeur aussi, avec à sa droite ce
            qui identifie la machine : son numéro de série, son matériel, la
            dernière personne connectée. */}
        <Card title="Système" icon={<IconDeviceLaptop size={16} />} span="full">
          {/* Deux colonnes de même largeur. */}
          <Box
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
              alignItems: "center",
              columnGap: "var(--mantine-spacing-lg)",
            }}
          >
            <Gauge
              circle={
                <CircleIcon>
                  {os ? (
                    <OsLogo os={os} size={ROUND_ICON} />
                  ) : (
                    <IconDeviceLaptop size={ROUND_ICON} />
                  )}
                </CircleIcon>
              }
              value={os ? osLabel(os) : null}
              subtitle={<EndOfSupport support={detail.support} />}
            />
            <Stack gap="sm" style={{ minWidth: 0 }}>
              <Group gap={8} wrap="nowrap">
                <Tooltip label="Numéro de série" withArrow>
                  <Text c="dimmed" style={{ display: "inline-flex" }}>
                    <IconBarcode size={16} />
                  </Text>
                </Tooltip>
                <Text size="sm" c={summary.serial ? undefined : "dimmed"}>
                  {serialNumber(summary.serial)}
                </Text>
              </Group>
              <Group gap={8} wrap="nowrap">
                <Tooltip label="Matériel" withArrow>
                  <Text c="dimmed" style={{ display: "inline-flex" }}>
                    <IconDevicesPc size={16} />
                  </Text>
                </Tooltip>
                <Text size="sm" c={manufacturer ? undefined : "dimmed"}>
                  {manufacturer || EMPTY}
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
        </Card>

        {/* Puis les trois jauges : le processeur, la mémoire, et le volume
          système avec les couleurs de la liste. */}
        <Card title="Processeur" icon={<IconCpu size={16} />}>
          <Gauge
            circle={
              <CircleIcon bubble={summary.arch || undefined}>
                <IconCpu size={ROUND_ICON} />
              </CircleIcon>
            }
            value={cpu ? `${cpu.count > 1 ? `${cpu.count} × ` : ""}${cpu.name}` : null}
            detail={cores || undefined}
          />
        </Card>

        <Card title="Mémoire" icon={<IconServer size={16} />}>
          <Gauge
            circle={
              <CircleIcon>
                <IconServer size={ROUND_ICON} />
              </CircleIcon>
            }
            value={summary.memory ? size(summary.memory) : null}
            detail="Mémoire vive"
          />
        </Card>

        <Card title="Stockage" icon={<IconDatabase size={16} />}>
          <Gauge
            circle={
              occupe != null ? (
                <RingProgress
                  size={CIRCLE_SIZE}
                  thickness={RING}
                  rootColor={RING_BACKGROUND}
                  roundCaps
                  sections={[{ value: occupe, color: diskColor(occupe) }]}
                  label={
                    <Text size="sm" fw={700} ta="center">
                      {occupe} %
                    </Text>
                  }
                />
              ) : (
                <CircleIcon>
                  <IconDatabase size={ROUND_ICON} />
                </CircleIcon>
              )
            }
            value={disk ? size(disk.free) : null}
            detail={disk ? `sur ${size(disk.total)}` : undefined}
          />
        </Card>

        {/* La carte qui sert : le serveur n'en garde qu'une, connectée, le
            Wi-Fi d'abord (cartesDe). Le rond prend son icône. */}
        <Card title="Réseau" icon={<IconNetwork size={16} />} span="half">
          <Group gap="md" wrap="nowrap">
            <CircleIcon>
              {summary.networks[0]?.kind === "wifi" ? (
                <IconWifi size={ROUND_ICON} />
              ) : (
                <IconNetwork size={ROUND_ICON} />
              )}
            </CircleIcon>
            {summary.networks.length === 0 ? (
              value(null)
            ) : (
              <Stack gap="xs" style={{ minWidth: 0 }}>
                {summary.networks.map((card, rank) => (
                  <Stack key={rank} gap={2}>
                    {/* Chaque adresse se copie : c'est elle qu'on colle dans
                        un terminal ou un outil de prise en main. */}
                    <Group gap="xs">
                      {card.ips.map((ip) => (
                        <Group key={ip} gap={2} wrap="nowrap">
                          <Text size="lg" fw={700}>
                            {ip}
                          </Text>
                          <CopyValueButton text={ip} label={`Copier l'adresse ${ip}`} withoutBubble />
                        </Group>
                      ))}
                      {/* Le VLAN du Paramétrage qui porte la carte, quand
                          son sous-réseau y est déclaré. */}
                      {card.vlan && (
                        <Group gap={6} wrap="nowrap">
                          {card.vlan.name && <Text size="sm">{card.vlan.name}</Text>}
                          <Badge color="green" variant="filled" size="sm" radius="sm">
                            VLAN {card.vlan.vlan}
                          </Badge>
                        </Group>
                      )}
                    </Group>
                    {/* Au style du nom du VLAN. */}
                    <Text size="sm" style={{ wordBreak: "break-word" }}>
                      {connectionType(card)}
                    </Text>
                  </Stack>
                ))}
              </Stack>
            )}
          </Group>
        </Card>

        <Card title="Sécurité" icon={<IconShieldCheck size={16} />} span="half">
          <Group gap="md" wrap="nowrap">
            <SecurityScore score={score} />
            <Stack gap="xs" style={{ minWidth: 0 }}>
              {securityItems(detail)}
            </Stack>
          </Group>
        </Card>

        {/* Sans TeamViewer, il n'y a rien à dire sur l'accès. */}
        {remoteAccess && (
          <Card title="Accès distant" icon={<IconDeviceLaptop size={16} />} span="half">
            <Row label="TeamViewer">
              <Copyable text={detail.teamviewer_id} label="Copier l'identifiant TeamViewer" />
            </Row>
          </Card>
        )}
      </Grid>
    </>
  );
}
