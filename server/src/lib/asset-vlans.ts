// La table des VLAN de la section « Assets » du Paramétrage : un sous-réseau
// (« 10.1.106.0/24 »), le VLAN qui le porte (106) et son nom. Vide tant que
// le Paramétrage n'a rien enregistré.

import type { AssetVlan } from "@milo/shared";
import { readSetting, writeSetting } from "../repositories/settings.js";

const CLE = "asset_vlans";

export const vlans = (): AssetVlan[] => {
  const enregistres = readSetting<AssetVlan[] | null>(CLE, null);
  // Les VLAN enregistrés avant qu'ils aient un nom en reçoivent un vide.
  return Array.isArray(enregistres)
    ? enregistres.map((v) => ({ ...v, name: v.name ?? "" }))
    : [];
};

export const enregistrerVlans = (liste: AssetVlan[]): void =>
  writeSetting(CLE, liste);

/** Une adresse IPv4 en nombre sur 32 bits, ou null si ce n'en est pas une. */
const enNombre = (adresse: string): number | null => {
  const octets = adresse.trim().split(".");
  if (octets.length !== 4 || !octets.every((o) => /^\d{1,3}$/.test(o) && Number(o) <= 255)) {
    return null;
  }
  return octets.reduce((n, o) => n * 256 + Number(o), 0);
};

/**
 * Le VLAN dont le sous-réseau contient l'adresse, ou null. Si plusieurs la
 * contiennent (« 10.1.0.0/16 » et « 10.1.106.0/24 »), le plus précis gagne.
 */
export const vlanDe = (adresse: string, liste: AssetVlan[]): AssetVlan | null => {
  const ip = enNombre(adresse);
  if (ip === null) return null;
  let trouve: AssetVlan | null = null;
  let precision = -1;
  for (const v of liste) {
    const [reseau = "", bits = ""] = v.subnet.split("/");
    const debut = enNombre(reseau);
    const longueur = Number(bits);
    if (debut === null || !(longueur >= 0 && longueur <= 32)) continue;
    // Les nombres de JavaScript sont des flottants : la division évite les
    // décalages de bits, signés sur 32 bits.
    const taille = 2 ** (32 - longueur);
    if (Math.floor(ip / taille) === Math.floor(debut / taille) && longueur > precision) {
      trouve = v;
      precision = longueur;
    }
  }
  return trouve;
};
