// La fin de support des systèmes, lue sur endoflife.date.
//
// L'agent dit quel système tourne sur le poste — « Windows 11 Entreprise »
// en « 25H2 », « macOS » en « 27.0 (26A428) » —, pas jusqu'à quand son
// éditeur le maintient. endoflife.date tient ces dates à jour pour chaque
// produit, sous forme d'une liste de versions (« cycles ») ; on y cherche
// celle du poste.
//
// Chaque produit est relu au plus une fois par jour, et gardé en mémoire : ouvrir
// une fiche ne sollicite pas le service. Quand il ne répond pas, la dernière
// liste lue sert encore ; sans elle, la fiche s'ouvre sans fin de support
// plutôt que d'attendre.

import type { Asset, AssetSupport } from "@milo/shared";

const API = "https://endoflife.date/api";

/** La liste d'un produit reste bonne un jour : les dates ne bougent guère. */
const CACHE_DURATION = 24 * 60 * 60 * 1000;

/** Au-delà, le service est trop lent : la fiche attend. */
const TIMEOUT = 5_000;

/** Une version d'un produit, telle qu'endoflife.date la décrit. */
interface Cycle {
  cycle: string;
  releaseLabel?: string;
  /** La fin des correctifs de sécurité : une date, ou un booléen sans date. */
  eol: string | boolean;
}

const caches = new Map<string, { readValue: number; cycles: Cycle[] }>();
const ongoing = new Map<string, Promise<Cycle[] | null>>();

/** La liste des versions d'un produit, en cache ; « null » si on ne l'a jamais eue. */
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
      // La liste d'hier vaut mieux que rien.
      return cache?.cycles ?? null;
    } finally {
      ongoing.delete(product);
    }
  })();
  ongoing.set(product, reading);
  return reading;
};

/**
 * Le produit et les versions à chercher, de la plus précise à la plus large.
 * Windows a une liste par édition : « e » pour Entreprise et Éducation, « w »
 * pour Famille et Professionnel, et des branches LTSC à part.
 */
const search = (os: NonNullable<Asset["os"]>): { product: string; cycles: string[] } | null => {
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
      // Avant la 11, macOS se numérotait en 10.x : la version est « 10.15 ».
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

/** La fin de support du système d'un poste ; « null » quand on ne sait pas la dire. */
export const endOfSupport = async (os: Asset["os"]): Promise<AssetSupport | null> => {
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
