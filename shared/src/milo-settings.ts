// Milo's own address, set in "Paramétrage" > "Administration". It applies to
// the whole application, not to an account.

export interface MiloSettings {
  /** The address as saved; empty, `fallback` applies. */
  url: string;
  /** The address the server is started with (MILO_PUBLIC_URL), or empty. */
  fallback: string;
}
