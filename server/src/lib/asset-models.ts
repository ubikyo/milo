// La table des modèles de la section « Assets » du Paramétrage : l'identifiant
// qu'un poste déclare (« Mac14,6 ») et le nom sous lequel on le connaît.
//
// Apple ne remonte que cet identifiant, et l'agent ne le traduit pas. Tant
// que le Paramétrage n'a rien enregistré, la table part des Mac à puce Apple
// les plus courants ; une fois enregistrée, elle est celle du Paramétrage, et
// rien ne s'y ajoute plus de lui-même.

import type { AssetModel } from "@milo/shared";
import { readSetting, writeSetting } from "../repositories/settings.js";

const KEY = "asset_models";

/** La table de départ : les Mac à puce Apple, de 2020 à 2024. */
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

/** La table des modèles : celle du Paramétrage, ou celle de départ. */
export const templates = (): AssetModel[] => {
  const saved = readSetting<AssetModel[] | null>(KEY, null);
  return Array.isArray(saved) ? saved : STARTER_TEMPLATES;
};

export const saveTemplates = (list: AssetModel[]): void => writeSetting(KEY, list);

/**
 * Le nom d'un modèle d'après son identifiant, sans égard à la casse ni aux
 * espaces ; vide quand la table ne le connaît pas.
 */
export const templateName = (identifier: string): string => {
  const search = identifier.trim().toLowerCase();
  if (!search) return "";
  return templates().find((m) => m.identifier.trim().toLowerCase() === search)?.name ?? "";
};
