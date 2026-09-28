import { STRONG_TEXT } from "./colors";

// Style commun à tous les onglets de l'application (réglages, tiroir projet,
// tableaux des modes Projet et Tâche). La variante « outline » est posée une
// fois pour toutes dans le thème (main.jsx) : les onglets sont encadrés et
// l'actif se raccorde au panneau.
//
// Aucun accent coloré : le filet gris du cadre situe déjà l'onglet ouvert, qui
// se distingue seulement par un texte plus contrasté et plus gras.
export const tabStyle = (isActive) => ({
  // Pas d'anneau de focus. Les tiroirs et les modales donnent le focus au
  // premier onglet dès leur ouverture, ce qui l'entourait de bleu sans que
  // personne n'ait navigué au clavier. Le cadre et le texte plus gras
  // suffisent à situer l'onglet ouvert, y compris au clavier : les flèches
  // changent l'onglet actif, et donc son aspect.
  outline: "none",
  ...(isActive ? { color: STRONG_TEXT, fontWeight: 600 } : {}),
});
