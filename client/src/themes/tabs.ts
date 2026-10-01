import { STRONG_TEXT } from "./colors";

// Style commun à tous les onglets de l'application (réglages, tiroir projet,
// tableaux des modes Projet et Tâche). La variante « outline » est posée une
// fois pour toutes dans le thème (main.jsx) : les onglets sont encadrés et
// l'actif se raccorde au panneau.
//
// Aucun accent coloré : le filet gris du cadre situe déjà l'onglet ouvert, qui
// se distingue seulement par un texte plus contrasté et plus gras.
export const tabStyle = (isActive: boolean) => ({
  // Pas d'anneau de focus. Les tiroirs et les modales donnent le focus au
  // premier onglet dès leur ouverture, ce qui l'entourait de bleu sans que
  // personne n'ait navigué au clavier. Le cadre et le texte plus gras
  // suffisent à situer l'onglet ouvert, y compris au clavier : les flèches
  // changent l'onglet actif, et donc son aspect.
  outline: "none",
  // Le gras de l'onglet actif est dessiné par un contour du texte, pas par la
  // graisse de la police : une vraie graisse élargit le libellé et décale
  // tous les onglets suivants à chaque changement d'onglet.
  ...(isActive ? { color: STRONG_TEXT, WebkitTextStroke: "0.04em currentColor" } : {}),
});

/**
 * Hauteur d'une rangée d'onglets. Ailleurs, c'est le bouton « Actions » posé au
 * bout de la rangée qui la donne : 36 pixels de bouton et 4 de marge basse. Une
 * rangée qui n'en porte pas — les statuts du mode Support — se réglerait sur
 * ses seuls onglets, six pixels plus haut que les autres modes : elle reprend
 * donc la mesure ici.
 */
export const TAB_ROW_HEIGHT = 40;
