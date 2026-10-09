import { transform } from "sucrase";
import { ASSET_NUMBER_FUNCTION } from "@milo/shared";
import type { AssetNumberJob, AssetNumberOutcome } from "./assetNumber.worker";

// An asset number template, run (shared, asset-number-templates.ts): its
// variables replaced by their value, as a string; its TypeScript stripped of
// its types (sucrase); then run in a worker of its own (assetNumber.worker.ts),
// stopped if it takes too long — a loop that never ends stops nothing else.

export type AssetNumberRun = AssetNumberOutcome;

/** Beyond this, the code is stopped. */
const TIMEOUT_MS = 2000;

/**
 * The code, its variables replaced: "{{label.Société}}" by the value of the
 * group "Société" — case aside —, as a string; none, an empty one.
 */
export const filledAssetNumberCode = (code: string, values: Map<string, string>): string =>
  code.replace(/\{\{\s*label\.([^{}]+?)\s*\}\}/g, (_, group: string) =>
    JSON.stringify(values.get(group.trim().toLowerCase()) ?? ""),
  );

const failed = (error: string): AssetNumberRun => ({ result: null, logs: [], error });

/** Runs a template with these values — by group, in lower case. */
export const runAssetNumberCode = async (
  code: string,
  values: Map<string, string>,
): Promise<AssetNumberRun> => {
  let js: string;
  try {
    js = transform(filledAssetNumberCode(code, values), { transforms: ["typescript"] }).code;
  } catch (e) {
    return failed(`Erreur de syntaxe : ${e instanceof Error ? e.message : String(e)}`);
  }
  return new Promise((resolve) => {
    const worker = new Worker(new URL("./assetNumber.worker.ts", import.meta.url), { type: "module" });
    const done = (run: AssetNumberRun) => {
      clearTimeout(timer);
      worker.terminate();
      resolve(run);
    };
    const timer = setTimeout(
      () => done(failed(`Le code s'exécute depuis plus de ${TIMEOUT_MS / 1000} s : il a été arrêté.`)),
      TIMEOUT_MS,
    );
    worker.onmessage = (event: MessageEvent<AssetNumberOutcome>) => done(event.data);
    worker.onerror = (event) => {
      event.preventDefault();
      done(failed(event.message || "Le code n'a pas pu s'exécuter"));
    };
    const job: AssetNumberJob = { js, name: ASSET_NUMBER_FUNCTION };
    worker.postMessage(job);
  });
};
