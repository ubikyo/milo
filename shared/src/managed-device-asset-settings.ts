// Settings of a board's Asset widgets: shared by all of them, for that board
// only.

/**
 * A hardware model: the identifier the machine reports ("Mac14,6")
 * and the name it is known by ("MacBook Pro 16" (2023, M2 Max)").
 */
export interface ManagedDeviceAssetModel {
  identifier: string;
  name: string;
}

/**
 * A subnet ("10.1.106.0/24"), the VLAN that carries it (106) and its name
 * ("Wi-Fi invités"), empty when it was not given.
 */
export interface ManagedDeviceAssetVlan {
  subnet: string;
  vlan: number;
  name: string;
}

export interface ManagedDeviceAssetSettings {
  /** The model table, by identifier. */
  models: ManagedDeviceAssetModel[];
  /** The VLAN table, by subnet. */
  vlans: ManagedDeviceAssetVlan[];
}

/** Beyond this, an identifier or a model name is no longer one. */
export const MANAGED_DEVICE_ASSET_MODEL_MAX = 120;

/** The usable VLAN numbers (802.1Q). */
export const VLAN_MIN = 1;
export const VLAN_MAX = 4094;

/** Beyond this, a VLAN name is no longer one. */
export const VLAN_NAME_MAX = 120;

// --- Collectors --------------------------------------------------------------
// What feeds a workstation list: each collector names a source and the tag
// it carries. Kept in the list's configuration, under COLLECTORS:
//
//   managed_device_asset.list : { "collectors": [{ "type": "glpi_agent", "tag": "ACME" }] }
//
// The server re-reads them to file the inventories that arrive
// (server, repositories/inboxes.ts).

/** The configuration key of a workstation list's collectors. */
export const COLLECTORS = "collectors";

/** The kinds of collector: only the GLPI agent for now. */
export const COLLECTOR_TYPES = [{ value: "glpi_agent", label: "Agent GLPI" }] as const;

export type CollectorType = (typeof COLLECTOR_TYPES)[number]["value"];

/** A collector: its kind, and the tag the agent is given ("tag" option). */
export interface Collector {
  type: CollectorType;
  tag: string;
}
