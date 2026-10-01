// Les réglages de la section « Développeur » du Paramétrage. Ils valent pour
// toute l'application, et non pour un compte.

export interface DeveloperSettings {
  /**
   * Debug : la sélection du texte et le menu du navigateur au clic droit
   * reviennent partout. Éteint, l'interface s'en passe — elle se manipule
   * comme une application, pas comme une page.
   */
  debug: boolean;
}
