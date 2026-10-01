import { TAB_ROW_HEIGHT } from "./tabs";

// Les menus qui pendent d'une rangée d'onglets — « Actions », la société, le
// compte — ne flottent pas : ils se posent sur le filet qui ferme la rangée.
// Le menu paraît ainsi sortir des onglets plutôt que se poser par-dessus.

/**
 * Hauteur des commandes posées dans la rangée d'un mode. Les trois — les deux
 * boutons et la pastille du compte — la partagent, sans quoi elles ne
 * s'aligneraient pas et leurs menus tomberaient à des hauteurs différentes.
 */
export const ROW_CONTROL_HEIGHT = 30;

/**
 * Ce qui sépare le bas d'une commande du filet : la commande est centrée dans
 * la rangée, il reste donc la moitié de la différence de part et d'autre.
 * C'est cet écart que le menu comble pour venir toucher le filet.
 */
export const ROW_MENU_OFFSET = (TAB_ROW_HEIGHT - ROW_CONTROL_HEIGHT) / 2;

/**
 * Le même écart dans la rangée d'onglets d'un tiroir. Là, aucune hauteur n'est
 * imposée : c'est le bouton qui la donne, et il ne reste que la marge basse
 * qu'il se donne pour se décoller du filet.
 */
export const DRAWER_MENU_OFFSET = 4;

/**
 * Le menu vient se raccorder au filet : sa bordure haute ferait un double
 * trait, et ses angles hauts un décroché.
 */
export const TAB_MENU_STYLES = {
  dropdown: {
    borderTop: "none",
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },
} as const;
