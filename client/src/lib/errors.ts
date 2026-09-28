/**
 * Le message d'une erreur attrapée. `catch` donne un `unknown` : ce n'est pas
 * forcément une `Error`, et lire « .message » dessus n'est pas sûr. Une seule
 * fonction le fait, partout.
 */
export const messageErreur = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);
