// What the workstations list and the Assets indicators read the same way.

import dayjs from "dayjs";
import type { ManagedDeviceAsset } from "@milo/shared";

/** The share of the system disk used, as a percentage; "null" without a disk. */
export const diskUsage = (disk: ManagedDeviceAsset["system_disk"]): number | null =>
  disk
    ? Math.round(Math.min(100, Math.max(0, ((disk.total - disk.free) / disk.total) * 100)))
    : null;

/** Beyond this, the system disk is almost full: the list shows it in red. */
export const DISK_FULL = 85;

/** Beyond this, a workstation that has not taken inventory is probably off or lost. */
export const DAYS_WITHOUT_INVENTORY = 30;

/** The days elapsed since the last inventory. */
export const daysSinceInventory = (workstation: ManagedDeviceAsset): number =>
  dayjs().diff(dayjs(workstation.last_inventory), "day", true);

/**
 * "Windows 11 Professionnel 23H2": the name, and the version if it does not
 * already say it. On macOS, the build number in parentheses — "(23F79)" —
 * tells the list's reader nothing: it is removed.
 */
export const osLabel = (os: NonNullable<ManagedDeviceAsset["os"]>): string => {
  const clean = (text: string) =>
    os.family === "macos" ? text.replace(/\s*\([^)]*\)/g, "").trim() : text;
  const name = clean(os.name);
  const version = clean(os.version);
  const label = version && !name.includes(version) ? `${name} ${version}`.trim() : name;
  // The "Entreprise" (or "Enterprise") edition goes without saying on a corporate
  // fleet: the name reads better without.
  return label.replace(/\s*\b(Entreprise|Enterprise)\b/gi, "").trim();
};
