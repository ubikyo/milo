// The VLAN table of the "Assets" section of Settings: a subnet
// ("10.1.106.0/24"), the VLAN that carries it (106) and its name. Empty as
// long as Settings has recorded nothing.

import type { AssetVlan } from "@milo/shared";
import { readSetting, writeSetting } from "../repositories/settings.js";

const KEY = "asset_vlans";

export const vlans = (): AssetVlan[] => {
  const saved = readSetting<AssetVlan[] | null>(KEY, null);
  // VLANs recorded before they had a name get an empty one.
  return Array.isArray(saved)
    ? saved.map((v) => ({ ...v, name: v.name ?? "" }))
    : [];
};

export const saveVlans = (list: AssetVlan[]): void =>
  writeSetting(KEY, list);

/** An IPv4 address as a 32-bit number, or null if it is not one. */
const toNumber = (address: string): number | null => {
  const bytes = address.trim().split(".");
  if (bytes.length !== 4 || !bytes.every((o) => /^\d{1,3}$/.test(o) && Number(o) <= 255)) {
    return null;
  }
  return bytes.reduce((n, o) => n * 256 + Number(o), 0);
};

/**
 * The VLAN whose subnet contains the address, or null. If several contain it
 * ("10.1.0.0/16" and "10.1.106.0/24"), the most specific wins.
 */
export const vlanOf = (address: string, list: AssetVlan[]): AssetVlan | null => {
  const ip = toNumber(address);
  if (ip === null) return null;
  let found: AssetVlan | null = null;
  let precision = -1;
  for (const v of list) {
    const [network = "", bits = ""] = v.subnet.split("/");
    const start = toNumber(network);
    const length = Number(bits);
    if (start === null || !(length >= 0 && length <= 32)) continue;
    // JavaScript numbers are floats: division avoids the bit shifts, which
    // are signed on 32 bits.
    const size = 2 ** (32 - length);
    if (Math.floor(ip / size) === Math.floor(start / size) && length > precision) {
      found = v;
      precision = length;
    }
  }
  return found;
};
