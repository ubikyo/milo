// The model table of an Asset widget: the identifier a workstation declares
// ("Mac14,6") and the name it is known by.
//
// Apple only reports that identifier, and the agent does not translate it.
// As long as the widget has recorded nothing, the table starts from the most
// common Apple-silicon Macs; once recorded, it is the widget's, and nothing is
// added to it by itself any more.

import type { ManagedDeviceAssetModel } from "@milo/shared";
import { mutation, selection } from "../db/query.js";
import type { ListScope } from "../repositories/lists.js";

/** The starting table: Apple-silicon Macs, from 2020 to 2024. */
const STARTER_TEMPLATES: ManagedDeviceAssetModel[] = [
  { identifier: "MacBookAir10,1", name: 'MacBook Air 13" (M1, 2020)' },
  { identifier: "MacBookPro17,1", name: 'MacBook Pro 13" (M1, 2020)' },
  { identifier: "Macmini9,1", name: "Mac mini (M1, 2020)" },
  { identifier: "iMac21,1", name: 'iMac 24" (M1, 2021)' },
  { identifier: "iMac21,2", name: 'iMac 24" (M1, 2021)' },
  { identifier: "MacBookPro18,1", name: 'MacBook Pro 16" (M1 Pro, 2021)' },
  { identifier: "MacBookPro18,2", name: 'MacBook Pro 16" (M1 Max, 2021)' },
  { identifier: "MacBookPro18,3", name: 'MacBook Pro 14" (M1 Pro, 2021)' },
  { identifier: "MacBookPro18,4", name: 'MacBook Pro 14" (M1 Max, 2021)' },
  { identifier: "Mac13,1", name: "Mac Studio (M1 Max, 2022)" },
  { identifier: "Mac13,2", name: "Mac Studio (M1 Ultra, 2022)" },
  { identifier: "Mac14,2", name: 'MacBook Air 13" (M2, 2022)' },
  { identifier: "Mac14,7", name: 'MacBook Pro 13" (M2, 2022)' },
  { identifier: "Mac14,3", name: "Mac mini (M2, 2023)" },
  { identifier: "Mac14,12", name: "Mac mini (M2 Pro, 2023)" },
  { identifier: "Mac14,5", name: 'MacBook Pro 14" (M2 Max, 2023)' },
  { identifier: "Mac14,9", name: 'MacBook Pro 14" (M2 Pro, 2023)' },
  { identifier: "Mac14,6", name: 'MacBook Pro 16" (M2 Max, 2023)' },
  { identifier: "Mac14,10", name: 'MacBook Pro 16" (M2 Pro, 2023)' },
  { identifier: "Mac14,15", name: 'MacBook Air 15" (M2, 2023)' },
  { identifier: "Mac14,13", name: "Mac Studio (M2 Max, 2023)" },
  { identifier: "Mac14,14", name: "Mac Studio (M2 Ultra, 2023)" },
  { identifier: "Mac14,8", name: "Mac Pro (M2 Ultra, 2023)" },
  { identifier: "Mac15,3", name: 'MacBook Pro 14" (M3, 2023)' },
  { identifier: "Mac15,4", name: 'iMac 24" (M3, 2023)' },
  { identifier: "Mac15,5", name: 'iMac 24" (M3, 2023)' },
  { identifier: "Mac15,12", name: 'MacBook Air 13" (M3, 2024)' },
  { identifier: "Mac15,13", name: 'MacBook Air 15" (M3, 2024)' },
];

const read = selection<{ models: string | null }>(
  "SELECT models FROM board_managed_device_asset_settings WHERE board_id = ? AND list_key = ?",
);
const write = mutation(
  `INSERT INTO board_managed_device_asset_settings (board_id, list_key, models) VALUES (?, ?, ?)
   ON CONFLICT(board_id, list_key) DO UPDATE SET models = excluded.models`,
);

/**
 * The widget's model table, or the starting one. Unreadable JSON counts as
 * nothing recorded. A workstation without a widget has the starting one.
 */
export const templates = (scope: ListScope | null): ManagedDeviceAssetModel[] => {
  const saved = scope === null ? null : read.get(scope.board, scope.list)?.models;
  if (saved == null) return STARTER_TEMPLATES;
  try {
    const list = JSON.parse(saved) as unknown;
    return Array.isArray(list) ? (list as ManagedDeviceAssetModel[]) : STARTER_TEMPLATES;
  } catch {
    return STARTER_TEMPLATES;
  }
};

export const saveTemplates = (scope: ListScope, list: ManagedDeviceAssetModel[]): void => {
  write.run(scope.board, scope.list, JSON.stringify(list));
};

/**
 * The name of a model from its identifier, ignoring case and spaces; empty
 * when the table does not know it.
 */
export const templateName = (identifier: string, table: ManagedDeviceAssetModel[]): string => {
  const search = identifier.trim().toLowerCase();
  if (!search) return "";
  return table.find((m) => m.identifier.trim().toLowerCase() === search)?.name ?? "";
};
