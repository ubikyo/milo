// The end of support of operating systems, read from endoflife.date.
//
// The agent says which system runs on the workstation — "Windows 11
// Entreprise" at "25H2", "macOS" at "27.0 (26A428)" —, not until when its
// vendor maintains it. endoflife.date keeps these dates up to date for each
// product, as a list of versions ("cycles"); we look there for the
// workstation's.
//
// Each product is re-read at most once a day, and kept in memory: opening a
// record does not hit the service. When it does not answer, the last list
// read is still used; without one, the record opens with no end of support
// rather than waiting.

import type { ManagedDeviceAsset, ManagedDeviceAssetSupport } from "@milo/shared";

const API = "https://endoflife.date/api";

/** A product's list stays good for a day: the dates hardly move. */
const CACHE_DURATION = 24 * 60 * 60 * 1000;

/** Beyond that, the service is too slow: the record waits. */
const TIMEOUT = 5_000;

/** A version of a product, as endoflife.date describes it. */
interface Cycle {
  cycle: string;
  releaseLabel?: string;
  /** The end of security fixes: a date, or a boolean with no date. */
  eol: string | boolean;
}

const caches = new Map<string, { readValue: number; cycles: Cycle[] }>();
const ongoing = new Map<string, Promise<Cycle[] | null>>();

/** A product's version list, cached; "null" if we never had it. */
const cyclesDe = (product: string): Promise<Cycle[] | null> => {
  const cache = caches.get(product);
  if (cache && Date.now() - cache.readValue < CACHE_DURATION) return Promise.resolve(cache.cycles);
  const already = ongoing.get(product);
  if (already) return already;

  const reading = (async () => {
    try {
      const response = await fetch(`${API}/${product}.json`, {
        signal: AbortSignal.timeout(TIMEOUT),
        headers: { Accept: "application/json", "User-Agent": "Milo (inventaire)" },
      });
      if (!response.ok) throw new Error(`endoflife.date a répondu ${response.status}`);
      const cycles = (await response.json()) as Cycle[];
      if (!Array.isArray(cycles)) throw new Error("Réponse inattendue");
      caches.set(product, { readValue: Date.now(), cycles });
      return cycles;
    } catch {
      // Yesterday's list is better than nothing.
      return cache?.cycles ?? null;
    } finally {
      ongoing.delete(product);
    }
  })();
  ongoing.set(product, reading);
  return reading;
};

/**
 * The product and the versions to look for, from the most precise to the
 * broadest. Windows has a list per edition: "e" for Enterprise and Education,
 * "w" for Home and Pro, and LTSC branches apart.
 */
const search = (os: NonNullable<ManagedDeviceAsset["os"]>): { product: string; cycles: string[] } | null => {
  const name = os.name;
  const version = os.version.trim();
  const major = version.split(/[.\s]/)[0] ?? "";

  switch (os.family) {
    case "windows": {
      if (/server/i.test(name)) {
        const year = /server\s+(\d{4})/i.exec(name)?.[1];
        return year ? { product: "windows-server", cycles: [year] } : null;
      }
      const generation = /windows\s+(10|11)\b/i.exec(name)?.[1];
      if (!generation || !version) return null;
      const v = version.toLowerCase();
      const base = `${generation}-${v}`;
      if (/iot/i.test(name) && /ltsc/i.test(name)) {
        return { product: "windows", cycles: [`${base}-iot-lts`] };
      }
      if (/ltsc|ltsb/i.test(name)) return { product: "windows", cycles: [`${base}-e-lts`] };
      const editMode = /entreprise|enterprise|[ée]ducation/i.test(name) ? "e" : "w";
      return { product: "windows", cycles: [`${base}-${editMode}`, base] };
    }
    case "macos":
      // Before 11, macOS was numbered 10.x: the version is "10.15".
      if (major === "10") {
        return { product: "macos", cycles: [version.split(".").slice(0, 2).join(".")] };
      }
      return major ? { product: "macos", cycles: [major] } : null;
    case "ubuntu": {
      const v = /\d+\.\d+/.exec(version || name)?.[0];
      return v ? { product: "ubuntu", cycles: [v] } : null;
    }
    case "debian":
    case "redhat":
    case "fedora": {
      const v = major || /\d+/.exec(name)?.[0];
      const product = os.family === "redhat" ? "rhel" : os.family;
      return v ? { product, cycles: [v] } : null;
    }
    default:
      return null;
  }
};

/** The end of support of a workstation's system; "null" when we cannot tell. */
export const endOfSupport = async (os: ManagedDeviceAsset["os"]): Promise<ManagedDeviceAssetSupport | null> => {
  if (!os) return null;
  const lookup = search(os);
  if (!lookup) return null;

  const cycles = await cyclesDe(lookup.product);
  if (!cycles) return null;
  const found = lookup.cycles
    .map((name) => cycles.find((c) => c.cycle.toLowerCase() === name))
    .find(Boolean);
  if (!found) return null;

  const eol = typeof found.eol === "string" ? found.eol : null;
  return {
    cycle: found.releaseLabel ?? found.cycle,
    eol,
    ended: eol ? new Date(eol).getTime() < Date.now() : found.eol === true,
  };
};
