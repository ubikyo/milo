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
import { OsLogo } from "./AssetLogos";
import {
  Card,
  ROUND_ICON,
  BREAKPOINTS,
  CircleIcon,
  value,
} from "./AssetSummaryPanel";
import type { ReactNode } from "react";
import type { AssetDetail, AssetEntry, AssetSection } from "@milo/shared";

// La « Description » de l'onglet Système d'exploitation : la section
// OPERATINGSYSTEM de l'agent, rangée en cartes comme le Résumé plutôt qu'en
// liste de champs. Chaque carte porte à gauche le rond du Résumé, avec son
// icône — le logo du système pour la première —, et pas de titre : le rond
// dit de quoi elle parle.

/**
 * Les champs que les cartes montrent, ou qu'on écarte ; les autres vont dans
 * la dernière. SSH_KEY, la clé publique d'hôte du serveur SSH, n'est pas
 * montrée : elle ne sert guère à qui lit la fiche.
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

/** « 2026-09-23 10:08:46 » de l'agent, en « 23/09/2026 10:08 ». */
const date = (raw: string | undefined): string => {
  const d = dayjs(raw);
  return raw && d.isValid() ? d.format("DD/MM/YYYY HH:mm") : "";
};

/** Le nom de la machine, sans son domaine : « ARM-PC-LGE2AT » pour le FQDN. */
const shortName = (fqdn: string | undefined): string => (fqdn ?? "").split(".")[0] ?? "";

/** La taille des icônes des champs, celle des lignes du Résumé. */
const ICON = 16;

/**
 * Un champ d'une carte : son icône à gauche, comme les lignes de la carte
 * « Système » du Résumé, puis le libellé, discret, et la valeur sous lui.
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

/** Une carte sans titre : le rond et son icône à gauche, les champs à droite. */
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
      {/* Le rond en haut de la carte, quelle que soit sa hauteur. */}
      <Group gap="md" wrap="nowrap" align="flex-start">
        <CircleIcon>{circle}</CircleIcon>
        <Stack gap="sm" style={{ minWidth: 0, flex: 1 }}>
          {children}
        </Stack>
      </Group>
    </Card>
  );
}

function Description({ entry, os }: { entry: AssetEntry; os: AssetDetail["os"] }) {
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

      {/* Ce que l'agent donne d'autre, sous son nom à lui : rien ne se perd. */}
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

/** La section OPERATINGSYSTEM : une seule entrée, à l'ordinaire. */
export default function OperatingSystem({
  section,
  os,
}: {
  section: AssetSection;
  /** Le système du poste, tel que le serveur l'a reconnu : son logo. */
  os: AssetDetail["os"];
}) {
  return (
    <>
      {section.entries.map((entry, rank) => (
        <Description key={rank} entry={entry} os={os} />
      ))}
    </>
  );
}
