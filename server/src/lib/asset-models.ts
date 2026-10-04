// The model table of the "Assets" section of Settings: the identifier a
// workstation declares ("Mac14,6") and the name it is known by.
//
// Apple only reports that identifier, and the agent does not translate it.
// As long as Settings has recorded nothing, the table starts from the most
// common Apple-silicon Macs; once recorded, it is the one from Settings, and
// nothing is added to it by itself any more.

import type { AssetModel } from "@milo/shared";
import { readSetting, writeSetting } from "../repositories/settings.js";

const KEY = "asset_models";

/** The starting table: Apple-silicon Macs, from 2020 to 2024. */
const STARTER_TEMPLATES: AssetModel[] = [
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

/** The model table: the one from Settings, or the starting one. */
export const templates = (): AssetModel[] => {
  const saved = readSetting<AssetModel[] | null>(KEY, null);
  return Array.isArray(saved) ? saved : STARTER_TEMPLATES;
};

export const saveTemplates = (list: AssetModel[]): void => writeSetting(KEY, list);

/**
 * The name of a model from its identifier, ignoring case and spaces; empty
 * when the table does not know it.
 */
export const templateName = (identifier: string): string => {
  const search = identifier.trim().toLowerCase();
  if (!search) return "";
  return templates().find((m) => m.identifier.trim().toLowerCase() === search)?.name ?? "";
};
