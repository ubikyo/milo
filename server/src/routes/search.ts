// La recherche globale : le champ de la rangée d'onglets. Elle fouille les
// projets, les cartes, les tickets, les postes et les éléments du
// mode Accès, et n'en rend que ce que la personne voit ailleurs — un tableau
// ou une catégorie privés restent fermés aux autres ici aussi.

import { Router } from "express";
import type { Request } from "express";
import {
  PROJECT_REFERENCE_PREFIX,
  TASK_REFERENCE_PREFIX,
  REFERENCE_PREFIX,
  SEARCH_MIN_LENGTH,
  projectReference,
  taskReference,
  reference,
  supportStatusLabel,
} from "@milo/shared";
import type { Area, Id, SearchResult, SupportStatus } from "@milo/shared";
import db from "../db/index.js";
import { selection } from "../db/query.js";
import { CLAUSE_TABLEAUX_VISIBLES } from "../repositories/boards.js";
import { accesAuWidget, peut } from "../lib/droits.js";

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

/** La référence « HLP-12 » (ou « PRJ-12 ») d'une ligne, quand elle en porte une. */
const sesReference = (colonne: string, prefixe = REFERENCE_PREFIX) =>
  `(${colonne} > 0 AND ${contient(`'${prefixe}' || ${colonne}`)})`;

/** Le motif LIKE : les jokers tapés par la personne se cherchent tels quels. */
const motif = (texte: string): string => `%${texte.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

const contient = (colonne: string) => `milo_plier(${colonne}) LIKE @q ESCAPE '\\'`;

interface ProjetTrouve {
  id: Id;
  number: number;
  name: string;
  board: string;
  context: string | null;
}

const projetsTrouves = selection<ProjetTrouve>(
  `SELECT p.id, p.number, p.name, b.name AS board, c.name AS context
     FROM projects p
     JOIN boards b ON b.id = p.board_id
     LEFT JOIN contexts c ON c.id = p.context_id
    WHERE ${CLAUSE_TABLEAUX_VISIBLES("p.board_id")}
      AND (${contient("p.name")} OR ${contient("p.description")} OR ${sesReference("p.number", PROJECT_REFERENCE_PREFIX)})
    ORDER BY p.updated_at DESC
    LIMIT ${PAR_SORTE}`,
);

interface CarteTrouvee {
  id: Id;
  number: number;
  text: string;
  list: string;
  board: string;
  context: string | null;
}

const cartesTrouvees = selection<CarteTrouvee>(
  `SELECT tc.id, tc.number, tc.text, tl.name AS list, b.name AS board, c.name AS context
     FROM task_cards tc
     JOIN task_lists tl ON tl.id = tc.list_id
     JOIN boards b ON b.id = tl.board_id
     LEFT JOIN contexts c ON c.id = tc.context_id
    WHERE tc.kind = 'card'
      AND ${CLAUSE_TABLEAUX_VISIBLES("b.id")}
      AND (${contient("tc.text")} OR ${contient("tc.description")} OR ${sesReference("tc.number", TASK_REFERENCE_PREFIX)})
    ORDER BY tc.created_at DESC
    LIMIT ${PAR_SORTE}`,
);

interface DemandeTrouvee {
  id: Id;
  number: number;
  subject: string;
  status: SupportStatus;
  context: string | null;
  board: string;
}

const demandesTrouvees = selection<DemandeTrouvee>(
  `SELECT sr.id, sr.number, sr.subject, sr.status, c.name AS context, b.name AS board
     FROM support_requests sr
     JOIN boards b ON b.id = sr.board_id
     LEFT JOIN contexts c ON c.id = sr.context_id
    WHERE ${CLAUSE_TABLEAUX_VISIBLES("b.id")}
      AND (${contient("sr.subject")}
       OR ${contient("sr.sender_name")}
       OR ${contient("sr.sender_email")}
       OR ${sesReference("sr.number")})
    ORDER BY sr.created_at DESC
    LIMIT ${PAR_SORTE}`,
);

interface PosteTrouve {
  id: Id;
  name: string;
  last_user: string;
  context: string | null;
}

const postesTrouves = selection<PosteTrouve>(
  `SELECT a.id, a.name, a.last_user, c.name AS context
     FROM assets a
     LEFT JOIN contexts c ON c.id = a.context_id
    WHERE a.board_id IS NOT NULL AND ${CLAUSE_TABLEAUX_VISIBLES("a.board_id")}
      AND (${contient("a.name")} OR ${contient("a.last_user")} OR ${contient("a.tag")})
    ORDER BY a.name
    LIMIT ${PAR_SORTE}`,
);

interface BlocVisible {
  id: Id;
  type: string;
  config: string;
  board_id: Id;
  board: string;
}

// Les widgets communs portent leur texte dans un JSON dont la forme dépend du
// widget : ils sont peu nombreux, on les lit tous et on les fouille ici
// plutôt qu'en SQL.
const blocsVisibles = selection<BlocVisible>(
  `SELECT w.id, w.type, w.config, b.id AS board_id, b.name AS board
     FROM board_widgets w
     JOIN board_sections s ON s.id = w.section_id
     JOIN boards b ON b.id = s.board_id
    WHERE ${CLAUSE_TABLEAUX_VISIBLES("b.id")}
      AND w.type IN ('category', 'subcategory', 'link', 'number')
      -- La structure que ce compte voit : la sienne s'il en a une, sinon la
      -- publique. Un tableau privé n'a que la publique.
      AND s.owner_id IS (
        SELECT pl.user_id FROM personal_layouts pl
         WHERE pl.user_id = @me AND pl.scope = 'board:' || b.id AND b.is_private = 0
      )
    ORDER BY b.position, s.position, w.position, w.id`,
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

const accesTrouves = (req: Request, plie: string): SearchResult[] => {
  const userId = req.user.id;
  const trouves: SearchResult[] = [];
  for (const bloc of blocsVisibles.all({ me: userId })) {
    // Un élément dont le compte ne lit pas le type de widget ne se trouve pas.
    if (accesAuWidget(req, bloc.type) === "") continue;
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
      context: bloc.board,
      board_id: bloc.board_id,
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

  // Chaque sorte ne cherche que si l'on en voit le type de widget.
  const params = { q: motif(plie), me: req.user.id };
  const dans = <T>(area: Area, trouver: () => T[]): T[] => (peut(req, area, "view") ? trouver() : []);

  const resultats: SearchResult[] = [
    ...dans("projects", () => projetsTrouves.all(params)).map((p) => ({
      kind: "project" as const,
      id: p.id,
      title: p.name,
      context: joindre(p.number > 0 ? projectReference(p.number) : null, p.context, p.board),
    })),
    ...dans("tasks", () => cartesTrouvees.all(params)).map((c) => ({
      kind: "card" as const,
      id: c.id,
      title: c.text,
      context: joindre(c.number > 0 ? taskReference(c.number) : null, c.context, c.board, c.list),
    })),
    ...dans("support", () => demandesTrouvees.all(params)).map((d) => ({
      kind: "support" as const,
      id: d.id,
      title: d.subject || "(sans objet)",
      context: joindre(
        d.number > 0 ? reference(d.number) : null,
        d.context,
        d.board,
        supportStatusLabel(d.status),
      ),
    })),
    ...dans("assets", () => postesTrouves.all(params)).map((a) => ({
      kind: "asset" as const,
      id: a.id,
      title: a.name,
      context: joindre(a.context, a.last_user),
    })),
    ...(peut(req, "access", "view") ? accesTrouves(req, plie) : []),
  ];

  res.json(resultats);
});
