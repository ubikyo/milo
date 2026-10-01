// Retrouver une société d'après un nom libre — celui d'une catégorie du mode
// Accès, par exemple. Ce n'est qu'une supposition : on ne répond que lorsqu'une
// seule société s'impose, et « null » sinon, pour laisser la place au choix
// par défaut plutôt que d'en proposer une au hasard.

import type { Company } from "@milo/shared";

/** Sans accents, sans casse, la ponctuation réduite à des espaces. */
const normaliser = (texte: string): string =>
  texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Vrai quand « partie » apparaît dans « tout » en mots entiers. */
const contient = (tout: string, partie: string): boolean =>
  ` ${tout} `.includes(` ${partie} `);

/** Ce qui ne distingue pas une société d'une autre : formes juridiques, petits mots. */
const MOTS_VIDES = new Set([
  "sa", "sas", "sasu", "sarl", "eurl", "sci", "snc", "scop", "groupe", "group",
  "de", "du", "des", "la", "le", "les", "et", "l", "d",
]);

/** Les mots qui portent le nom. */
const motsUtiles = (texte: string): string[] =>
  texte.split(" ").filter((m) => m && !MOTS_VIDES.has(m));

/** Une seule candidate, ou aucune. */
const seule = (candidates: { societe: Company }[]): Company | null =>
  candidates.length === 1 ? (candidates[0]?.societe ?? null) : null;

/**
 * La société que ce nom désigne : d'abord à l'identique, puis celle dont le
 * nom est contenu dans l'autre, dans un sens ou dans l'autre (« Arco » pour
 * « Arco Marketing », « Accès Arco » pour « Arco »), enfin celle dont les mots
 * utiles s'y retrouvent tous. Deux candidates à égalité
 * ne départagent rien : aucune n'est retenue.
 */
export function societeDuNom(nom: string, companies: Company[]): Company | null {
  const cherche = normaliser(nom);
  if (!cherche) return null;
  const noms = companies.map((c) => ({ societe: c, nom: normaliser(c.name) }));

  const exactes = noms.filter((n) => n.nom === cherche);
  if (exactes.length === 1) return seule(exactes);

  const proches = noms.filter(
    (n) => n.nom && (contient(cherche, n.nom) || contient(n.nom, cherche)),
  );
  if (proches.length > 0) {
    // Le rapprochement le plus long l'emporte : « Arco Marketing » plutôt
    // qu'« Arco » pour une catégorie « Arco Marketing Paris ».
    const longueur = Math.max(...proches.map((n) => n.nom.length));
    return seule(proches.filter((n) => n.nom.length === longueur));
  }

  // En dernier recours, sans forme juridique ni petits mots : « Dupont SA »
  // pour une catégorie « Accès Dupont ». Tous les mots utiles de la société
  // doivent s'y retrouver.
  const motsCherches = new Set(motsUtiles(cherche));
  return seule(
    noms.filter((n) => {
      const mots = motsUtiles(n.nom);
      return mots.length > 0 && mots.every((m) => motsCherches.has(m));
    }),
  );
}
