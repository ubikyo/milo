import type { ManagedDeviceAsset } from "@milo/shared";
import { DAYS_WITHOUT_INVENTORY, DISK_FULL, daysSinceInventory, diskUsage } from "../../../lib/workstation";
import { useSourceItems } from "../../../lib/sources";
import { bandDimension, labelsDimension, plainDimension } from "../dimensions";
import type { IndicatorSource } from "../types";

// What the supervised workstations give the indicators: those of the lists
// named — the open board's in its context —, counted by system or disk
// usage, and checked against the rules that say a workstation needs
// attention ("Conformité").

/** A system volume known not to be encrypted. */
const notEncrypted = (a: ManagedDeviceAsset): boolean => a.system_disk_encrypted === false;

/** A Windows workstation with no protection, or with protection disabled. */
const unprotected = (a: ManagedDeviceAsset): boolean =>
  a.protection.state === "none" || a.protection.state === "inactive";

const diskFull = (a: ManagedDeviceAsset): boolean => (diskUsage(a.system_disk) ?? 0) > DISK_FULL;

const silent = (a: ManagedDeviceAsset): boolean => daysSinceInventory(a) > DAYS_WITHOUT_INVENTORY;

/**
 * Windows 10 has had no security updates since October 14, 2025: its
 * workstations need migrating. The kernel reports "10.0" for both, so only
 * the name tells them apart.
 */
const windows10 = (a: ManagedDeviceAsset): boolean =>
  a.os?.family === "windows" && /windows\s*10\b/i.test(a.os.name);

/** The system and its version, the edition aside: "Windows 11 25H2", "macOS 15.5", "Ubuntu 24.04". */
const versionOf = (os: ManagedDeviceAsset["os"]): string => {
  if (!os || !os.name.trim()) return "";
  // On macOS, the build number in parentheses — "(24F74)" — is not a version.
  const version = (os.family === "macos" ? os.version.replace(/\s*\([^)]*\)/g, "") : os.version).trim();
  let name: string;
  if (os.family === "windows") {
    // "Windows 11 Professionnel": the name without the edition.
    name = os.name.match(/Windows\s+(Server\s+)?\d+/i)?.[0] ?? os.name;
  } else if (os.family === "macos") {
    name = "macOS";
  } else {
    // Elsewhere, the name without the version it sometimes already carries.
    name = os.name.replace(/\s+[\d.]+.*$/, "").trim() || os.name;
  }
  // macOS gives "15.5.1": the patch doesn't make up a share on its own.
  const release = os.family === "macos" ? version.split(".").slice(0, 2).join(".") : version;
  return release ? `${name} ${release}` : name;
};

/** The disk usage bands, in percent — the upper bound excluded. */
const DISK_BANDS = [
  { key: "colorDisk50", slice: "low", name: "0 à 49 %", upTo: 50, color: "green.6", what: "des disques à moins de 50 %" },
  { key: "colorDisk70", slice: "mid", name: "50 à 69 %", upTo: 70, color: "blue.6", what: "des disques de 50 à 69 %" },
  { key: "colorDisk85", slice: "high", name: "70 à 84 %", upTo: 85, color: "orange.6", what: "des disques de 70 à 84 %" },
  { key: "colorDiskFull", slice: "full", name: "85 à 100 %", upTo: Infinity, color: "red.6", what: "des disques de 85 à 100 %" },
];

export const managedDeviceAssetSource: IndicatorSource<ManagedDeviceAsset> = {
  data: "managed_device_asset",
  label: "Équipements supervisés",
  sourceType: "managed_device_asset.list",
  unit: "postes",
  none: "Aucun poste",
  useItems: ({ sources, board }) =>
    useSourceItems("managed_device_asset", sources, board.managedDeviceAssets),
  measures: [
    { value: "total", label: "Postes au total", weight: () => 1 },
    { value: "unencrypted", label: "Postes non chiffrés", weight: (a) => (notEncrypted(a) ? 1 : 0) },
    { value: "unprotected", label: "Postes sans antivirus actif", weight: (a) => (unprotected(a) ? 1 : 0) },
    { value: "disk", label: `Disques pleins à plus de ${DISK_FULL} %`, weight: (a) => (diskFull(a) ? 1 : 0) },
    {
      value: "silent",
      label: `Postes muets depuis ${DAYS_WITHOUT_INVENTORY} jours`,
      weight: (a) => (silent(a) ? 1 : 0),
    },
    { value: "windows10", label: "Postes sous Windows 10", weight: (a) => (windows10(a) ? 1 : 0) },
  ],
  dimensions: [
    plainDimension(
      "systems",
      "Systèmes",
      (a) => {
        const name = versionOf(a.os);
        return name ? [{ key: name, name }] : [];
      },
      { empty: "Inconnu" },
    ),
    // A workstation whose disk was never measured falls in no band.
    bandDimension("disks", "Disques système", DISK_BANDS, (a) => {
      const used = diskUsage(a.system_disk);
      return used == null ? null : (DISK_BANDS.find((b) => used < b.upTo)?.slice ?? null);
    }),
    labelsDimension("/managed-device-asset-labels", "managed_device_asset.list", (a) => a.labels ?? []),
  ],
  checks: [
    { key: "encryption", label: "Disque système chiffré", missing: "non chiffrés", fails: notEncrypted },
    { key: "antivirus", label: "Antivirus actif", missing: "sans antivirus", fails: unprotected },
    { key: "disk", label: `Disque système occupé à ${DISK_FULL} % au plus`, missing: "disques pleins", fails: diskFull },
    {
      key: "inventory",
      label: `Inventorié depuis moins de ${DAYS_WITHOUT_INVENTORY} jours`,
      missing: "muets",
      fails: silent,
    },
    { key: "system", label: "Système encore maintenu", missing: "sous Windows 10", fails: windows10 },
  ],
};
