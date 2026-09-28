// Les erreurs de l'API.
//
// Chaque route répondait elle-même son code et son message, ligne après ligne
// (« return res.status(404).json({ error: "…" }) »), ce qui mêlait le contrôle
// des données au rendu de la réponse et faisait retourner des valeurs à des
// fonctions qui n'en ont pas. Une route lève désormais, et un seul endroit
// écrit la réponse (middleware/errors.ts). better-sqlite3 étant synchrone,
// Express récupère la levée sans rien de particulier.

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const fail = (status: number, message: string): never => {
  throw new HttpError(status, message);
};

/** La valeur, ou une erreur 404 si elle manque. Le cas le plus fréquent. */
export function orNotFound<T>(value: T | undefined | null, message: string): T {
  if (value === undefined || value === null) throw new HttpError(404, message);
  return value;
}

export const badRequest = (message: string): never => fail(400, message);
export const conflict = (message: string): never => fail(409, message);
export const forbidden = (message: string): never => fail(403, message);
export const notFound = (message: string): never => fail(404, message);

/** Un texte obligatoire, débarrassé de ses espaces. */
export const requireText = (valeur: unknown, message: string): string => {
  const texte = String(valeur ?? "").trim();
  if (!texte) badRequest(message);
  return texte;
};

/** Une liste d'identifiants reçue du client, quel que soit le type des valeurs. */
export const toIds = (valeur: unknown): number[] =>
  Array.isArray(valeur) ? valeur.map(Number).filter(Number.isFinite) : [];
