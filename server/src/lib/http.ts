// API errors.
//
// Each route used to answer with its own code and message, line after line
// ("return res.status(404).json({ error: "…" })"), which mixed data checking
// with response rendering and made functions return values when they have
// none to return. A route now throws, and a single place writes the response
// (middleware/errors.ts). Since better-sqlite3 is synchronous, Express
// catches the throw with nothing special.

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

/** The value, or a 404 error if it is missing. The most frequent case. */
export function orNotFound<T>(value: T | undefined | null, message: string): T {
  if (value === undefined || value === null) throw new HttpError(404, message);
  return value;
}

export const badRequest = (message: string): never => fail(400, message);
export const conflict = (message: string): never => fail(409, message);
export const forbidden = (message: string): never => fail(403, message);
export const notFound = (message: string): never => fail(404, message);

/**
 * A reference item — label, category, company, milestone type, role — cannot
 * be deleted as long as something carries it: the deletion is refused, and
 * the message says how many resources use it.
 */
export const refuseIfUsed = (name: string, uses: number): void => {
  if (uses <= 0) return;
  conflict(
    `Impossible de supprimer « ${name} » : cet élément est utilisé dans ${uses} ressource${
      uses > 1 ? "s" : ""
    }.`,
  );
};

/** A required text, stripped of its spaces. */
export const requireText = (value: unknown, message: string): string => {
  const text = String(value ?? "").trim();
  if (!text) badRequest(message);
  return text;
};

/** A list of ids received from the client, whatever the type of the values. */
export const toIds = (value: unknown): number[] =>
  Array.isArray(value) ? value.map(Number).filter(Number.isFinite) : [];
