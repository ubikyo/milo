// The worker that runs an asset number template (assetNumber.ts): the code,
// already JavaScript, declares the function that gives the number; it is
// called, and what it wrote to the console comes back with what it returned.
//
// The code is a board member's: the worker sees neither the page nor the
// session's token, and loses its ways out — fetch, sockets, storage — before
// running it.

/** What the page sends: the code, and the name of its function. */
export interface AssetNumberJob {
  js: string;
  name: string;
}

/** What comes back: what the function returned, or what went wrong. */
export interface AssetNumberOutcome {
  result: string | null;
  logs: string[];
  error: string | null;
}

const BLOCKED = [
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "WebTransport",
  "EventSource",
  "importScripts",
  "indexedDB",
  "caches",
  "BroadcastChannel",
  "Worker",
  "SharedWorker",
  "navigator",
];

// On the scope and each of its prototypes: deleted from the scope alone, they
// would still be found further up.
for (let scope: object | null = self; scope; scope = Object.getPrototypeOf(scope) as object | null) {
  for (const name of BLOCKED) {
    try {
      Object.defineProperty(scope, name, { value: undefined, configurable: false, writable: false });
    } catch {
      /* not configurable here: it is shadowed on the scope itself */
    }
  }
}

/** A value as the console writes it: a text as is, the rest as JSON. */
const shown = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
};

const reply = (outcome: AssetNumberOutcome) =>
  (self as unknown as { postMessage: (message: AssetNumberOutcome) => void }).postMessage(outcome);

self.onmessage = async (event: MessageEvent<AssetNumberJob>) => {
  const { js, name } = event.data;
  const logs: string[] = [];
  const write = (...values: unknown[]) => {
    logs.push(values.map(shown).join(" "));
  };
  const console = { log: write, info: write, warn: write, error: write, debug: write };
  try {
    const run = new Function(
      "console",
      `${js}
if (typeof ${name} !== "function") throw new Error("Le modèle ne déclare pas de fonction ${name}()");
return ${name}();`,
    ) as (sandboxConsole: typeof console) => unknown;
    const result = await run(console);
    if (typeof result !== "string") {
      throw new Error(`${name}() doit renvoyer un texte, pas ${result === null ? "null" : typeof result}`);
    }
    reply({ result, logs, error: null });
  } catch (e) {
    reply({ result: null, logs, error: shown(e) });
  }
};
