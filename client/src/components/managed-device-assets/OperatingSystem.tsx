import { Grid, Group, Stack, Text } from "@mantine/core";
import {
  IconCalendarPlus,
  IconCalendarTime,
  IconClock,
  IconCpu,
  IconCpu2,
  IconDeviceLaptop,
  IconHammer,
  IconListDetails,
  IconPower,
  IconSitemap,
  IconTag,
  IconTerminal2,
  IconVersions,
  IconWorldWww,
} from "@tabler/icons-react";
import dayjs from "dayjs";
import { OsLogo } from "./ManagedDeviceAssetLogos";
import {
  Card,
  ROUND_ICON,
  BREAKPOINTS,
  CircleIcon,
  value,
} from "./ManagedDeviceAssetSummaryPanel";
import type { ReactNode } from "react";
import type {
  ManagedDeviceAssetDetail,
  ManagedDeviceAssetEntry,
  ManagedDeviceAssetSection,
} from "@milo/shared";

// The "Description" of the Système d'exploitation tab: the agent's
// OPERATINGSYSTEM section, arranged in cards like the Summary rather than as
// a field list. Each card carries the Summary circle on its left, with its
// icon — the system logo for the first one —, and no title: the circle
// says what it is about.

/**
 * The fields the cards show, or those that are dropped; the others go in
 * the last one. SSH_KEY, the SSH server's public host key, is not
 * shown: it is of little use to whoever reads the record.
 */
const SHOWN_FIELDS = new Set([
  "FULL_NAME",
  "NAME",
  "VERSION",
  "DISPLAYVERSION",
  "SERVICE_PACK",
  "ARCH",
  "KERNEL_NAME",
  "KERNEL_VERSION",
  "FQDN",
  "DNS_DOMAIN",
  "INSTALL_DATE",
  "BOOT_TIME",
  "TIMEZONE.NAME",
  "TIMEZONE.OFFSET",
  "SSH_KEY",
]);

/** The agent's "2026-09-23 10:08:46", as "23/09/2026 10:08". */
const date = (raw: string | undefined): string => {
  const d = dayjs(raw);
  return raw && d.isValid() ? d.format("DD/MM/YYYY HH:mm") : "";
};

/** The machine name, without its domain: "ARM-PC-LGE2AT" for the FQDN. */
const shortName = (fqdn: string | undefined): string => (fqdn ?? "").split(".")[0] ?? "";

/** The size of the field icons, that of the Summary rows. */
const ICON = 16;

/**
 * A card field: its icon on the left, like the rows of the Summary
 * "Système" card, then the label, discreet, and the value below it.
 */
function Field({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <Group gap={8} wrap="nowrap" align="flex-start">
      <Text c="dimmed" style={{ display: "inline-flex", paddingTop: 2 }}>
        {icon}
      </Text>
      <Stack gap={0} style={{ minWidth: 0, flex: 1 }}>
        <Text size="xs" c="dimmed">
          {label}
        </Text>
        {children}
      </Stack>
    </Group>
  );
}

/** A card without a title: the circle and its icon on the left, the fields on the right. */
function RoundCard({
  circle,
  span = "half",
  children,
}: {
  circle: ReactNode;
  span?: "half" | "full";
  children: ReactNode;
}) {
  return (
    <Card span={span}>
      {/* The circle at the top of the card, whatever its height. */}
      <Group gap="md" wrap="nowrap" align="flex-start">
        <CircleIcon>{circle}</CircleIcon>
        <Stack gap="sm" style={{ minWidth: 0, flex: 1 }}>
          {children}
        </Stack>
      </Group>
    </Card>
  );
}

function Description({ entry, os }: { entry: ManagedDeviceAssetEntry; os: ManagedDeviceAssetDetail["os"] }) {
  const others = Object.keys(entry).filter((field) => !SHOWN_FIELDS.has(field));
  return (
    <Grid gap="md" type="container" breakpoints={BREAKPOINTS}>
      <RoundCard
        circle={
          os ? <OsLogo os={os} size={ROUND_ICON} /> : <IconDeviceLaptop size={ROUND_ICON} />
        }
      >
        <Field icon={<IconTag size={ICON} />} label="Nom">
          {value(entry["FULL_NAME"] || entry["NAME"])}
        </Field>
        <Field icon={<IconVersions size={ICON} />} label="Version">
          {value(entry["DISPLAYVERSION"] || entry["VERSION"])}
        </Field>
        <Field icon={<IconHammer size={ICON} />} label="Build">
          {value(entry["SERVICE_PACK"])}
        </Field>
        <Field icon={<IconCpu2 size={ICON} />} label="Architecture">
          {value(entry["ARCH"])}
        </Field>
      </RoundCard>

      <RoundCard circle={<IconCpu size={ROUND_ICON} />}>
        <Field icon={<IconTerminal2 size={ICON} />} label="Noyau">
          {value(entry["KERNEL_NAME"])}
        </Field>
        <Field icon={<IconVersions size={ICON} />} label="Version">
          {value(entry["KERNEL_VERSION"])}
        </Field>
      </RoundCard>

      <RoundCard circle={<IconSitemap size={ROUND_ICON} />}>
        <Field icon={<IconWorldWww size={ICON} />} label="Nom">
          {value(shortName(entry["FQDN"]))}
        </Field>
        <Field icon={<IconSitemap size={ICON} />} label="Domaine">
          {value(entry["DNS_DOMAIN"])}
        </Field>
      </RoundCard>

      <RoundCard circle={<IconCalendarTime size={ROUND_ICON} />}>
        <Field icon={<IconCalendarPlus size={ICON} />} label="Installation">
          {value(date(entry["INSTALL_DATE"]))}
        </Field>
        <Field icon={<IconPower size={ICON} />} label="Démarrage">
          {value(date(entry["BOOT_TIME"]))}
        </Field>
        <Field icon={<IconClock size={ICON} />} label="Fuseau horaire">
          {value(entry["TIMEZONE.NAME"])}
        </Field>
      </RoundCard>

      {/* What else the agent provides, under its own name: nothing is lost. */}
      {others.length > 0 && (
        <RoundCard circle={<IconListDetails size={ROUND_ICON} />} span="full">
          {others.map((field) => (
            <Field key={field} icon={<IconListDetails size={ICON} />} label={field}>
              {value(entry[field])}
            </Field>
          ))}
        </RoundCard>
      )}
    </Grid>
  );
}

/** The OPERATINGSYSTEM section: a single entry, as usual. */
export default function OperatingSystem({
  section,
  os,
}: {
  section: ManagedDeviceAssetSection;
  /** The workstation's system, as the server recognized it: its logo. */
  os: ManagedDeviceAssetDetail["os"];
}) {
  return (
    <>
      {section.entries.map((entry, rank) => (
        <Description key={rank} entry={entry} os={os} />
      ))}
    </>
  );
}
