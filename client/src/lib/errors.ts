import { notifications } from "@mantine/notifications";
import { RED } from "../themes/colors";

/**
 * Le message d'une erreur attrapée. `catch` donne un `unknown` : ce n'est pas
 * forcément une `Error`, et lire « .message » dessus n'est pas sûr. Une seule
 * fonction le fait, partout.
 */
export const errorMessage = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);

/**
 * Une erreur portée à l'utilisateur : une notification rouge, en bas à droite,
 * qui reste tant qu'il ne l'a pas fermée. Plus d'encart dans les fenêtres —
 * l'erreur ne se perd plus au fond d'un panneau, ni ne disparaît avec lui.
 *
 * Le message sert d'identifiant : la même erreur, répétée avant d'avoir été
 * fermée, ne s'empile pas (Mantine ignore un identifiant déjà affiché). Sa
 * priorité la fait passer devant les avis de suivi quand la pile est pleine.
 */
export const notifyError = (message: string, title = "Erreur"): void => {
  notifications.show({
    id: `erreur:${message}`,
    color: RED,
    title: title,
    message,
    autoClose: false,
    priority: 1,
  });
};
