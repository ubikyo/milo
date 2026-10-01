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

export interface AssetSettings {
  /** La table des modèles, par identifiant. */
  models: AssetModel[];
}

/** Au-delà, un identifiant ou un nom de modèle n'en est plus un. */
export const ASSET_MODEL_MAX = 120;
