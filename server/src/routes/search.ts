// La recherche globale : le champ de la rangée d'onglets. Elle fouille les
// projets, les cartes, les demandes de support, les postes et les éléments du
// mode Accès, et n'en rend que ce que la personne voit ailleurs — un tableau
// ou une catégorie privés restent fermés aux autres ici aussi.

import { Router } from "express";
import { REFERENCE_PREFIX, SEARCH_MIN_LENGTH, reference, supportStatusLabel } from "@milo/shared";
import type { Id, SearchResult, SupportStatus } from "@milo/shared";
import db from "../db/index.js";
import { selection } from "../db/query.js";

/** Ce que chaque sorte rend au plus : la liste reste lisible d'un coup d'œil. */
const PAR_SORTE = 6;

/**
 * Le texte tel qu'on le compare : sans balises (les descriptions sont en
 * HTML), sans accents, en minuscules. « Réseau » se trouve en tapant
 * « reseau », et « div » ne ramène pas toutes les descriptions.
 */
const plier = (valeur: unknown): string =>
  String(valeur ?? "")
    .replace(/<[^>]*>/g, " ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

// Déclarée avant les requêtes qui s'en servent : SQLite la cherche à la
// préparation.
db.function("milo_plier", { deterministic: true }, (valeur: unknown) => plier(valeur));

/** La référence « LMA-12 » d'une ligne, quand elle en porte une. */
const sesReference = (colonne: string) =>
  `(${colonne} > 0 AND ${contient(`'${REFERENCE_PREFIX}' || ${colonne}`)})`;

/** Le motif LIKE : les jokers tapés par la personne se cherchent tels quels. */
const motif = (texte: string): string => `%${texte.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

const contient = (colonne: string) => `milo_plier(${colonne}) LIKE @q ESCAPE '\\'`;

interface ProjetTrouve {
  id: Id;
  number: number;
  name: string;
  board: string;
  company: string | null;
}

const projetsTrouves = selection<ProjetTrouve>(
  `SELECT p.id, p.number, p.name, pb.name AS board, c.name AS company
     FROM projects p
     JOIN project_boards pb ON pb.id = p.board_id
     LEFT JOIN companies c ON c.id = p.company_id
    WHERE (pb.is_private = 0 OR pb.owner_id = @me)
      AND (${contient("p.name")} OR ${contient("p.description")} OR ${sesReference("p.number")})
    ORDER BY p.updated_at DESC
    LIMIT ${PAR_SORTE}`,
);

interface CarteTrouvee {
  id: Id;
  number: number;
  text: string;
  list: string;
  board: string;
  company: string;
}

const cartesTrouvees = selection<CarteTrouvee>(
  `SELECT tc.id, tc.number, tc.text, tl.name AS list, b.name AS board, c.name AS company
     FROM task_cards tc
     JOIN task_lists tl ON tl.id = tc.list_id
     JOIN boards b ON b.id = tl.board_id
     JOIN companies c ON c.id = b.company_id
    WHERE tc.kind = 'card'
      AND (b.is_private = 0 OR b.owner_id = @me)
      AND (${contient("tc.text")} OR ${contient("tc.description")} OR ${sesReference("tc.number")})
    ORDER BY tc.created_at DESC
    LIMIT ${PAR_SORTE}`,
);

interface DemandeTrouvee {
  id: Id;
  number: number;
  subject: string;
  status: SupportStatus;
  company: string;
}

const demandesTrouvees = selection<DemandeTrouvee>(
  `SELECT sr.id, sr.number, sr.subject, sr.status, c.name AS company
     FROM support_requests sr
     JOIN companies c ON c.id = sr.company_id
    WHERE ${contient("sr.subject")}
       OR ${contient("sr.sender_name")}
       OR ${contient("sr.sender_email")}
       OR ${sesReference("sr.number")}
    ORDER BY sr.created_at DESC
    LIMIT ${PAR_SORTE}`,
);

interface PosteTrouve {
  id: Id;
  name: string;
  last_user: string;
  company: string | null;
}

const postesTrouves = selection<PosteTrouve>(
  `SELECT a.id, a.name, a.last_user, c.name AS company
     FROM assets a
     LEFT JOIN companies c ON c.id = a.company_id
    WHERE ${contient("a.name")} OR ${contient("a.last_user")} OR ${contient("a.tag")}
    ORDER BY a.name
    LIMIT ${PAR_SORTE}`,
);

interface BlocVisible {
  id: Id;
  type: string;
  config: string;
  category_id: Id;
  category: string;
}

// Les éléments du mode Accès portent leur texte dans un JSON dont la forme
// dépend du widget : ils sont peu nombreux, on les lit tous et on les
// fouille ici plutôt qu'en SQL.
const blocsVisibles = selection<BlocVisible>(
  `SELECT ab.id, ab.type, ab.config, s.category_id, cat.name AS category
     FROM access_blocks ab
     JOIN access_sections s ON s.id = ab.section_id
     JOIN access_categories cat ON cat.id = s.category_id
    WHERE cat.is_private = 0 OR cat.owner_id = ?
    ORDER BY cat.position, s.position, ab.position, ab.id`,
);

const texte = (valeur: unknown): string => (typeof valeur === "string" ? valeur.trim() : "");

/** Ce qu'un élément du mode Accès montre, et donc ce qu'on y cherche. */
const lectureDuBloc = (
  type: string,
  config: Record<string, unknown>,
): { title: string; cherche: string[]; url?: string } | null => {
  switch (type) {
    case "category":
    case "subcategory": {
      const titre = texte(config.titre);
      return titre ? { title: titre, cherche: [titre] } : null;
    }
    case "link": {
      const libelle = texte(config.libelle);
      const url = texte(config.url);
      return { title: libelle || url, cherche: [libelle, url], url: url || undefined };
    }
    case "number": {
      // Les anciens éléments portaient une seule ligne, hors de « lignes ».
      const lignes = Array.isArray(config.lignes)
        ? (config.lignes as Record<string, unknown>[])
        : [{ libelle: config.libelle, numero: config.numero }];
      const morceaux = lignes.map((l) => [texte(l?.libelle), texte(l?.numero)]);
      const title = morceaux
        .map((m) => m.filter(Boolean).join(" "))
        .filter(Boolean)
        .join(" · ");
      return title ? { title, cherche: morceaux.flat() } : null;
    }
    default:
      return null;
  }
};

const accesTrouves = (userId: Id, plie: string): SearchResult[] => {
  const trouves: SearchResult[] = [];
  for (const bloc of blocsVisibles.all(userId)) {
    let config: Record<string, unknown>;
    try {
      config = JSON.parse(bloc.config) ?? {};
    } catch {
      continue;
    }
    const lu = lectureDuBloc(bloc.type, config);
    if (!lu || !lu.cherche.some((c) => plier(c).includes(plie))) continue;
    trouves.push({
      kind: "access",
      id: bloc.id,
      title: lu.title,
      context: bloc.category,
      category_id: bloc.category_id,
      url: lu.url,
    });
    if (trouves.length >= PAR_SORTE) break;
  }
  return trouves;
};

const joindre = (...morceaux: (string | null | undefined)[]): string =>
  morceaux.filter(Boolean).join(" · ");

export const searchRoutes = Router();

searchRoutes.get("/", (req, res) => {
  const plie = plier(req.query.q).trim();
  if (plie.length < SEARCH_MIN_LENGTH) return void res.json([]);

  const sansMoi = { q: motif(plie) };
  const params = { ...sansMoi, me: req.user.id };

  const resultats: SearchResult[] = [
    ...projetsTrouves.all(params).map((p) => ({
      kind: "project" as const,
      id: p.id,
      title: p.name,
      context: joindre(p.number > 0 ? reference(p.number) : null, p.company, p.board),
    })),
    ...cartesTrouvees.all(params).map((c) => ({
      kind: "card" as const,
      id: c.id,
      title: c.text,
      context: joindre(c.number > 0 ? reference(c.number) : null, c.company, c.board, c.list),
    })),
    ...demandesTrouvees.all(sansMoi).map((d) => ({
      kind: "support" as const,
      id: d.id,
      title: d.subject || "(sans objet)",
      context: joindre(
        d.number > 0 ? reference(d.number) : null,
        d.company,
        supportStatusLabel(d.status),
      ),
    })),
    ...postesTrouves.all(sansMoi).map((a) => ({
      kind: "asset" as const,
      id: a.id,
      title: a.name,
      context: joindre(a.company, a.last_user),
    })),
    ...accesTrouves(req.user.id, plie),
  ];

  res.json(resultats);
});
