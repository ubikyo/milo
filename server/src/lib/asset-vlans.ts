// La table des VLAN de la section « Assets » du Paramétrage : un sous-réseau
// (« 10.1.106.0/24 »), le VLAN qui le porte (106) et son nom. Vide tant que
// le Paramétrage n'a rien enregistré.

import type { AssetVlan } from "@milo/shared";
import { readSetting, writeSetting } from "../repositories/settings.js";

const KEY = "asset_vlans";

export const vlans = (): AssetVlan[] => {
  const saved = readSetting<AssetVlan[] | null>(KEY, null);
  // Les VLAN enregistrés avant qu'ils aient un nom en reçoivent un vide.
  return Array.isArray(saved)
    ? saved.map((v) => ({ ...v, name: v.name ?? "" }))
    : [];
};

export const saveVlans = (list: AssetVlan[]): void =>
  writeSetting(KEY, list);

/** Une adresse IPv4 en nombre sur 32 bits, ou null si ce n'en est pas une. */
const toNumber = (address: string): number | null => {
  const bytes = address.trim().split(".");
  if (bytes.length !== 4 || !bytes.every((o) => /^\d{1,3}$/.test(o) && Number(o) <= 255)) {
    return null;
  }
  return bytes.reduce((n, o) => n * 256 + Number(o), 0);
};

/**
 * Le VLAN dont le sous-réseau contient l'adresse, ou null. Si plusieurs la
 * contiennent (« 10.1.0.0/16 » et « 10.1.106.0/24 »), le plus précis gagne.
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
    // Les nombres de JavaScript sont des flottants : la division évite les
    // décalages de bits, signés sur 32 bits.
    const size = 2 ** (32 - length);
    if (Math.floor(ip / size) === Math.floor(start / size) && length > precision) {
      found = v;
      precision = length;
    }
  }
  return found;
};
