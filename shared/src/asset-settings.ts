// Les réglages de la section « Assets » du Paramétrage. Ils valent pour toute
// l'application.

/**
 * Un modèle de matériel : l'identifiant que le poste déclare (« Mac14,6 »)
 * et le nom sous lequel on le connaît (« MacBook Pro 16" (2023, M2 Max) »).
 */
export interface AssetModel {
  identifier: string;
  name: string;
}

/**
 * Un sous-réseau (« 10.1.106.0/24 »), le VLAN qui le porte (106) et son nom
 * (« Wi-Fi invités »), vide quand on ne l'a pas donné.
 */
export interface AssetVlan {
  subnet: string;
  vlan: number;
  name: string;
}

export interface AssetSettings {
  /** La table des modèles, par identifiant. */
  models: AssetModel[];
  /** La table des VLAN, par sous-réseau. */
  vlans: AssetVlan[];
}

/** Au-delà, un identifiant ou un nom de modèle n'en est plus un. */
export const ASSET_MODEL_MAX = 120;

/** Les numéros de VLAN utilisables (802.1Q). */
export const VLAN_MIN = 1;
export const VLAN_MAX = 4094;

/** Au-delà, un nom de VLAN n'en est plus un. */
export const VLAN_NAME_MAX = 120;
