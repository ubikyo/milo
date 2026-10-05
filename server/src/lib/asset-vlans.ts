// The VLAN table of a board's Asset widgets: a subnet ("10.1.106.0/24"), the
// VLAN that carries it (106) and its name. Empty as long as the board has
// recorded nothing.

import type { AssetVlan, Id } from "@milo/shared";
import { mutation, selection } from "../db/query.js";

const read = selection<{ vlans: string }>(
  "SELECT vlans FROM board_asset_settings WHERE board_id = ?",
);
const write = mutation(
  `INSERT INTO board_asset_settings (board_id, vlans) VALUES (?, ?)
   ON CONFLICT(board_id) DO UPDATE SET vlans = excluded.vlans`,
);

/** The board's VLANs; none for a workstation without a board. */
export const vlans = (boardId: Id | null): AssetVlan[] => {
  const saved = boardId === null ? undefined : read.get(boardId)?.vlans;
  if (!saved) return [];
  try {
    const list = JSON.parse(saved) as unknown;
    // VLANs recorded before they had a name get an empty one.
    return Array.isArray(list)
      ? (list as AssetVlan[]).map((v) => ({ ...v, name: v.name ?? "" }))
      : [];
  } catch {
    return [];
  }
};

export const saveVlans = (boardId: Id, list: AssetVlan[]): void => {
  write.run(boardId, JSON.stringify(list));
};

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
