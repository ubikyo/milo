// What the Assets widgets share: the rules saying a workstation needs
// attention. The title and the "Nom" field are the Support ones.

import { DISK_FULL, diskUsage, daysSinceInventory, DAYS_WITHOUT_INVENTORY } from "../../lib/workstation";
import type { Asset } from "@milo/shared";

export { NameField, NAME, Nothing, IndicatorTitle, IndicatorValue } from "../support/common";

/** A system volume known not to be encrypted. */
export const notEncrypted = (a: Asset): boolean => a.system_disk_encrypted === false;

/** A Windows workstation with no protection, or with protection disabled. */
export const unprotected = (a: Asset): boolean =>
  a.protection.state === "none" || a.protection.state === "inactive";

export const diskFull = (a: Asset): boolean => (diskUsage(a.system_disk) ?? 0) > DISK_FULL;

export const silent = (a: Asset): boolean => daysSinceInventory(a) > DAYS_WITHOUT_INVENTORY;

/**
 * Windows 10 has had no security updates since October 14, 2025: its
 * workstations need migrating. The kernel reports "10.0" for both, so only
 * the name tells them apart.
 */
export const windows10 = (a: Asset): boolean =>
  a.os?.family === "windows" && /windows\s*10\b/i.test(a.os.name);
