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

// The "Résumé" tab of a workstation's record: what one looks for first on
// opening it, arranged in cards by theme. The detail stays in the other tabs.

dayjs.extend(relativeTime);

/**
 * The grid follows the panel width, not the window's: the drawer
 * keeps the same width on all screens. Three cards per row once the
 * panel has the width of a fully open drawer.
 */
export const BREAKPOINTS = {
  xs: "360px",
  sm: "480px",
  md: "600px",
  lg: "720px",
  xl: "960px",
};

/** A card: its title preceded by an icon, then its content. */
export function Card({
  title,
  icon,
  span,
  children,
}: {
  /** The title and its icon; without a title, the card starts with its content. */
  title?: string;
  icon?: ReactNode;
  /** Its width: a third by default, a half, two thirds, or the whole row. */
  span?: "half" | 2 | "full";
  children: ReactNode;
}) {
  // Out of twelve columns: a single card per row in a narrow panel, two
  // in a medium one, three in a wide one.
  const colSpan =
    span === "full"
      ? 12
      : span === "half"
        ? { base: 12, sm: 6 }
        : span === 2
          ? { base: 12, lg: 8 }
          : { base: 12, sm: 6, lg: 4 };
  return (
    <Grid.Col span={colSpan}>
      {/* The widgets' rounding, without a border, on a neutral gray. */}
      <Box
        className={inset.inset}
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

/** A card row: the label on the left, the value on the right. */
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
 * The asset tag, half as big again as in the list (20 px high,
 * 11 px text, 10 px margin): it is the record's title.
 */
const TAG_TITLE = {
  "--badge-height": "30px",
  "--badge-fz": "16.5px",
  "--badge-padding-x": "15px",
  maxWidth: "100%",
} as CSSProperties;

/** The asset tag, at the head of the summary: taller than the others, over the full width. */
const TAG_ASSET = { ...TAG_TITLE, "--badge-height": "44px" } as CSSProperties;

/** The ring's free part: a light neutral gray, not Mantine's, which leans blue. */
const RING_BACKGROUND = "light-dark(#e0e0e0, var(--mantine-color-dark-4))";

export { CARD_BACKGROUND };

/** The diameter of the gauges' circle, and the thickness of its ring. */
const CIRCLE_SIZE = 96;
const RING = 10;

/**
 * The ring's outer diameter as Mantine draws it: a radius of
 * (size × 0.9 − 2 × thickness) / 2, plus half the stroke on each side.
 */
const RING_DIAMETER = CIRCLE_SIZE * 0.9 - RING;

/** The diameter of the badge placed on the disc. */
const DOT = 30;

/** The icon placed in the disc. */
export const ROUND_ICON = 32;

/**
 * The top of a gauge card: the circle on the left, the value in large and its
 * detail on the right. The circle is a ring when a usage is known (the
 * disk); otherwise, the card's icon — the agent says nothing about CPU load
 * or memory used, and a full ring would lie.
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
  /** What follows the detail, when a line of text isn't enough. */
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
 * The serial number, or "VM" for a Parallels virtual machine: its own
 * ("Parallels-A1 B2 C3…") identifies no hardware.
 */
const serialNumber = (serial: string): string =>
  /^parallels/i.test(serial.trim()) ? "VM" : serial || EMPTY;

/** Less than six months before end of support: time to think about it. */
const MONTHS_BEFORE_END = 6;

/**
 * The system's end of support, according to endoflife.date: red when it
 * has passed, orange when it is near, green otherwise — and green too
 * when the vendor hasn't announced one yet. Gray when unknown.
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
 * The circle of a gauge with no known usage: the icon on a disc of the same
 * neutral gray as the disk ring, so the three gauges echo each other.
 */
export const CircleIcon = ({ children, bubble }: { children: ReactNode; bubble?: string }) => (
  // The box keeps the ring's space, so the values align;
  // the disc takes the diameter the ring actually draws.
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
      {/* A detail in a round badge, straddling the bottom right
          of the disc: the processor architecture. */}
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

/** A state of the Sécurité card: its icon and its text, in the same color. */
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
 * The workstation's protection: green with the EPP/EDR name when it is running,
 * orange when it is disabled, red when Windows declares
 * none. Outside Windows the agent knows nothing about it: we say so, in gray.
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
 * The system volume encryption: green with its name and algorithm
 * ("FileVault 2 — XTS-AES-128"), red when the disk isn't encrypted, gray
 * when the agent doesn't say.
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
 * The firewall: green when it is active everywhere, orange when a Windows
 * profile is off (we say which), red when it is off on all, gray
 * when the agent doesn't say.
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

/** The order of the Sécurité card states: what is missing first. */
const SEVERITY = { red: 0, orange: 1, gray: 2, green: 3 } as const;
type Severity = keyof typeof SEVERITY;

const protectionSeverity = ({ state }: AssetDetail["protection"]): Severity =>
  state === "none"
    ? "red"
    : state === "inactive"
      ? "orange"
      : state === "unknown"
        ? "gray"
        : "green";

const encryptionSeverity = (encrypted: boolean | null): Severity =>
  encrypted === false ? "red" : encrypted == null ? "gray" : "green";

const firewallSeverity = ({ state }: AssetSummary["firewall"]): Severity =>
  state === "off"
    ? "red"
    : state === "partial"
      ? "orange"
      : state === "unknown"
        ? "gray"
        : "green";

/**
 * The three states of the Sécurité card, red first, then orange, gray
 * and green; at equal severity, the order EPP/EDR, encryption, firewall.
 */
const securityItems = (detail: AssetDetail) =>
  [
    {
      key: "protection",
      severity: protectionSeverity(detail.protection),
      element: <Protection protection={detail.protection} />,
    },
    {
      key: "encryption",
      severity: encryptionSeverity(detail.system_disk_encrypted),
      element: (
        <Encryption
          encrypted={detail.system_disk_encrypted}
          encryption={detail.summary.encryption}
        />
      ),
    },
    {
      key: "firewall",
      severity: firewallSeverity(detail.summary.firewall),
      element: <Firewall firewall={detail.summary.firewall} />,
    },
  ]
    .sort((a, b) => SEVERITY[a.severity] - SEVERITY[b.severity])
    .map(({ key, element }) => <Fragment key={key}>{element}</Fragment>);

/** The three points of the Sécurité card. */
const SECURITY_POINTS = 3;

/**
 * The security score, out of three: one point per protection in green — an
 * active EPP/EDR, an encrypted disk, a firewall active on all profiles.
 * What is disabled, partial or undeclared doesn't count.
 */
const securityScore = (detail: AssetDetail): number =>
  [
    detail.protection.state === "active",
    detail.system_disk_encrypted === true,
    detail.summary.firewall.state === "on",
  ].filter(Boolean).length;

/** Green when all is in place, orange at two out of three, red below. */
const scoreColor = (score: number): string =>
  score === SECURITY_POINTS ? "teal" : score === SECURITY_POINTS - 1 ? "orange" : RED;

/** The security score in a ring, at the size of the storage one. */
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
 * "Ethernet — Intel(R) Ethernet I219-LM": the type, then the adapter name.
 * macOS and Windows often name the interface after its type ("Wi-Fi",
 * "Ethernet"): the name is then not repeated.
 */
const connectionType = (card: AssetSummary["networks"][number]): string => {
  const type = card.kind === "wifi" ? "Wi-Fi" : "Ethernet";
  const name = card.description.trim();
  return name && name.toLowerCase() !== type.toLowerCase() ? `${type} — ${name}` : type;
};

/** A text, or the dash when the agent didn't provide it. */
export const value = (text: string | null | undefined) => (
  <Text size="sm" c={text ? undefined : "dimmed"} style={{ wordBreak: "break-word" }}>
    {text || EMPTY}
  </Text>
);

/** A value copied elsewhere: the TeamViewer ID, the address. */
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
 * The button that copies a value, and says it did: the check mark
 * replaces the icon, and a tooltip says so except when it isn't wanted.
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
  const used = diskUsage(disk);
  const old = daysSinceInventory(detail) > DAYS_WITHOUT_INVENTORY;
  // A Parallels virtual machine declares itself "Parallels International
  // GmbH. Parallels ARM Virtual Machine": its name is enough.
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
      {/* The tab title, like a category of the Access mode: white,
          size 18. Opposite, the date of the last inventory; a workstation silent for
          a long time is probably off or lost, so it says so in orange. */}
      <Group justify="space-between" align="center" wrap="nowrap" mb={SPACE_BELOW_TITLE}>
        <RecordTitle>Résumé</RecordTitle>
        <Text size="sm" c={old ? "orange" : "dimmed"} fw={old ? 600 : undefined}>
          {dayjs(detail.last_inventory).format("DD/MM/YYYY HH:mm")}
        </Text>
      </Group>
      <Grid gap="md" type="container" breakpoints={BREAKPOINTS}>
        {/* At the head, the asset tag, alone, over the full width. */}
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

        {/* Then the system, over the full width too, with on its right what
            identifies the machine: its serial number, its hardware, the
            last person logged in. */}
        <Card title="Système" icon={<IconDeviceLaptop size={16} />} span="full">
          {/* Two columns of the same width. */}
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

        {/* Then the three gauges: the processor, the memory, and the system
          volume with the list's colors. */}
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
              used != null ? (
                <RingProgress
                  size={CIRCLE_SIZE}
                  thickness={RING}
                  rootColor={RING_BACKGROUND}
                  roundCaps
                  sections={[{ value: used, color: diskColor(used) }]}
                  label={
                    <Text size="sm" fw={700} ta="center">
                      {used} %
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

        {/* The card in use: the server keeps only one, connected, Wi-Fi
            first (cardsOf). The circle takes its icon. */}
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
                    {/* Each address is copyable: it is what gets pasted into
                        a terminal or a remote-control tool. */}
                    <Group gap="xs">
                      {card.ips.map((ip) => (
                        <Group key={ip} gap={2} wrap="nowrap">
                          <Text size="lg" fw={700}>
                            {ip}
                          </Text>
                          <CopyValueButton text={ip} label={`Copier l'adresse ${ip}`} withoutBubble />
                        </Group>
                      ))}
                      {/* The VLAN of the Paramétrage that carries the adapter, when
                          its subnet is declared there. */}
                      {card.vlan && (
                        <Group gap={6} wrap="nowrap">
                          {card.vlan.name && <Text size="sm">{card.vlan.name}</Text>}
                          <Badge color="green" variant="filled" size="sm" radius="sm">
                            VLAN {card.vlan.vlan}
                          </Badge>
                        </Group>
                      )}
                    </Group>
                    {/* In the style of the VLAN name. */}
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

        {/* Without TeamViewer, there is nothing to say about access. */}
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
