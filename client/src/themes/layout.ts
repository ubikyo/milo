// Le retrait de la page, en pixels : le même en haut et sur les côtés, et le
// même pour les deux commandes posées dans les coins du bas — le sélecteur de
// mode à gauche, le « ? » des raccourcis à droite. Une seule valeur, sinon
// elles finissent par ne plus s'aligner sur le contenu.
export const PAGE_GUTTER = 50;

/**
 * Ce qui sépare le bas du contenu du sélecteur de mode. Le contenu s'arrête
 * là : il ne passe pas derrière la commande, et n'en laisse pas non plus une
 * bande vide.
 */
export const BOTTOM_CLEARANCE = 30;

/**
 * Le haut du sélecteur de mode, compté depuis le bas de la fenêtre. Publié par
 * le sélecteur lui-même (components/ui/ModeSwitch.tsx), car lui seul connaît
 * sa hauteur — elle change avec la taille du texte et le nombre de modes. La
 * valeur de repli couvre le premier rendu, avant qu'il ait pu se mesurer :
 * le retrait de la page, plus la hauteur du sélecteur sans marge intérieure.
 */
export const MODE_SWITCH_TOP = "--milo-modeswitch-top";
export const MODE_SWITCH_TOP_FALLBACK = 78;
