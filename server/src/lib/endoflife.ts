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
const DUREE_CACHE = 24 * 60 * 60 * 1000;

/** Au-delà, le service est trop lent : la fiche attend. */
const DELAI = 5_000;

/** Une version d'un produit, telle qu'endoflife.date la décrit. */
interface Cycle {
  cycle: string;
  releaseLabel?: string;
  /** La fin des correctifs de sécurité : une date, ou un booléen sans date. */
  eol: string | boolean;
}

const caches = new Map<string, { lu: number; cycles: Cycle[] }>();
const enCours = new Map<string, Promise<Cycle[] | null>>();

/** La liste des versions d'un produit, en cache ; « null » si on ne l'a jamais eue. */
const cyclesDe = (produit: string): Promise<Cycle[] | null> => {
  const cache = caches.get(produit);
  if (cache && Date.now() - cache.lu < DUREE_CACHE) return Promise.resolve(cache.cycles);
  const deja = enCours.get(produit);
  if (deja) return deja;

  const lecture = (async () => {
    try {
      const reponse = await fetch(`${API}/${produit}.json`, {
        signal: AbortSignal.timeout(DELAI),
        headers: { Accept: "application/json", "User-Agent": "Milo (inventaire)" },
      });
      if (!reponse.ok) throw new Error(`endoflife.date a répondu ${reponse.status}`);
      const cycles = (await reponse.json()) as Cycle[];
      if (!Array.isArray(cycles)) throw new Error("Réponse inattendue");
      caches.set(produit, { lu: Date.now(), cycles });
      return cycles;
    } catch {
      // La liste d'hier vaut mieux que rien.
      return cache?.cycles ?? null;
    } finally {
      enCours.delete(produit);
    }
  })();
  enCours.set(produit, lecture);
  return lecture;
};

/**
 * Le produit et les versions à chercher, de la plus précise à la plus large.
 * Windows a une liste par édition : « e » pour Entreprise et Éducation, « w »
 * pour Famille et Professionnel, et des branches LTSC à part.
 */
const recherche = (os: NonNullable<Asset["os"]>): { produit: string; cycles: string[] } | null => {
  const nom = os.name;
  const version = os.version.trim();
  const majeure = version.split(/[.\s]/)[0] ?? "";

  switch (os.family) {
    case "windows": {
      if (/server/i.test(nom)) {
        const annee = /server\s+(\d{4})/i.exec(nom)?.[1];
        return annee ? { produit: "windows-server", cycles: [annee] } : null;
      }
      const generation = /windows\s+(10|11)\b/i.exec(nom)?.[1];
      if (!generation || !version) return null;
      const v = version.toLowerCase();
      const base = `${generation}-${v}`;
      if (/iot/i.test(nom) && /ltsc/i.test(nom)) {
        return { produit: "windows", cycles: [`${base}-iot-lts`] };
      }
      if (/ltsc|ltsb/i.test(nom)) return { produit: "windows", cycles: [`${base}-e-lts`] };
      const edition = /entreprise|enterprise|[ée]ducation/i.test(nom) ? "e" : "w";
      return { produit: "windows", cycles: [`${base}-${edition}`, base] };
    }
    case "macos":
      // Avant la 11, macOS se numérotait en 10.x : la version est « 10.15 ».
      if (majeure === "10") {
        return { produit: "macos", cycles: [version.split(".").slice(0, 2).join(".")] };
      }
      return majeure ? { produit: "macos", cycles: [majeure] } : null;
    case "ubuntu": {
      const v = /\d+\.\d+/.exec(version || nom)?.[0];
      return v ? { produit: "ubuntu", cycles: [v] } : null;
    }
    case "debian":
    case "redhat":
    case "fedora": {
      const v = majeure || /\d+/.exec(nom)?.[0];
      const produit = os.family === "redhat" ? "rhel" : os.family;
      return v ? { produit, cycles: [v] } : null;
    }
    default:
      return null;
  }
};

/** La fin de support du système d'un poste ; « null » quand on ne sait pas la dire. */
export const finDeSupport = async (os: Asset["os"]): Promise<AssetSupport | null> => {
  if (!os) return null;
  const cherche = recherche(os);
  if (!cherche) return null;

  const cycles = await cyclesDe(cherche.produit);
  if (!cycles) return null;
  const trouve = cherche.cycles
    .map((nom) => cycles.find((c) => c.cycle.toLowerCase() === nom))
    .find(Boolean);
  if (!trouve) return null;

  const eol = typeof trouve.eol === "string" ? trouve.eol : null;
  return {
    cycle: trouve.releaseLabel ?? trouve.cycle,
    eol,
    ended: eol ? new Date(eol).getTime() < Date.now() : trouve.eol === true,
  };
};
