// Settings of the "Assets" section of the Settings. They apply to the whole
// application.

/**
 * A hardware model: the identifier the machine reports ("Mac14,6")
 * and the name it is known by ("MacBook Pro 16" (2023, M2 Max)").
 */
export interface AssetModel {
  identifier: string;
  name: string;
}

/**
 * A subnet ("10.1.106.0/24"), the VLAN that carries it (106) and its name
 * ("Wi-Fi invités"), empty when it was not given.
 */
export interface AssetVlan {
  subnet: string;
  vlan: number;
  name: string;
}

export interface AssetSettings {
  /** The model table, by identifier. */
  models: AssetModel[];
  /** The VLAN table, by subnet. */
  vlans: AssetVlan[];
}

/** Beyond this, an identifier or a model name is no longer one. */
export const ASSET_MODEL_MAX = 120;

/** The usable VLAN numbers (802.1Q). */
export const VLAN_MIN = 1;
export const VLAN_MAX = 4094;

/** Beyond this, a VLAN name is no longer one. */
export const VLAN_NAME_MAX = 120;
