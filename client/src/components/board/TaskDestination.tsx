import { Group, Select, Text } from "@mantine/core";
import { useEffect, useState } from "react";
import { lienElement } from "@milo/shared";
import type { Board, Company, Id, LienKind, TaskList } from "@milo/shared";
import { api } from "../../api";
import { messageErreur } from "../../lib/errors";

// « Créer une tâche », depuis le menu contextuel d'un projet, d'une demande de
// support, d'un poste ou d'un élément du mode Accès. La fiche de la carte
// s'ouvre vide (components/board/CardDrawer.tsx) : elle prend le nom de
// l'élément — modifiable —, et sa description porte le lien qui y ramène. On
// choisit où elle va, sur une ligne au-dessus du titre : la société (celle de
// l'élément par défaut), puis le tableau, puis la liste.

/** L'élément d'où la tâche est créée. */
export interface TacheSource {
  kind: Exclude<LienKind, "card">;
  /** Pour « access », la catégorie : c'est elle que le lien ouvre. */
  id: Id;
  title: string;
  /** La société de l'élément, où la destination se pose par défaut. */
  companyId: Id | null;
  /** Un lien du mode Accès : son adresse suit dans la description. */
  url?: string;
  /**
   * Le tableau de l'élément dans son mode — celui d'un projet, la catégorie
   * d'un accès. Son nom sert à deviner la société et le tableau de tâches.
   */
  boardName?: string;
}

/** Un nom tel qu'on le compare : sans casse, sans accents, sans ponctuation. */
const normaliser = (nom: string): string =>
  nom
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Ce qui porte le même nom que le tableau d'origine : le nom exact d'abord,
 * sinon celui qui contient l'autre — le plus long l'emporte, il en dit le
 * plus. Rien ne ressemble : « undefined », et le choix d'office reste.
 */
const rapprocher = <T extends { name: string }>(nom: string | undefined, items: T[]): T | undefined => {
  const cible = normaliser(nom ?? "");
  if (!cible) return undefined;
  const noms = items.map((item) => ({ item, nom: normaliser(item.name) })).filter((n) => n.nom);
  const exact = noms.find((n) => n.nom === cible);
  if (exact) return exact.item;
  const mot = (a: string, b: string) => ` ${a} `.includes(` ${b} `);
  return noms
    .filter((n) => mot(n.nom, cible) || mot(cible, n.nom))
    .sort((a, b) => b.nom.length - a.nom.length)[0]?.item;
};

const ORIGINES: Record<TacheSource["kind"], string> = {
  project: "le projet",
  support: "la demande",
  asset: "le poste",
  access: "l'accès",
};

const echapper = (texte: string): string =>
  texte
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * La description de la carte : une ligne vide, où l'on écrit d'abord, un
 * tiret long, puis d'où elle vient : son nom, en lien vers lui.
 */
export const descriptionDe = (source: TacheSource): string => {
  const retour = `${window.location.origin}${window.location.pathname}${lienElement(source.kind, source.id)}`;
  const lignes = [
    "<p></p>",
    "<p>—</p>",
    `<p>Créée depuis ${ORIGINES[source.kind]} <a href="${echapper(retour)}" target="_blank" rel="noopener noreferrer">${echapper(source.title)}</a></p>`,
  ];
  if (source.url) {
    lignes.push(
      `<p><a href="${echapper(source.url)}" target="_blank" rel="noopener noreferrer">${echapper(source.url)}</a></p>`,
    );
  }
  return lignes.join("");
};

/** Où la carte ira : « null » tant que rien n'est choisi. */
export interface Destination {
  boardId: string | null;
  listId: string | null;
}

interface TaskDestinationProps {
  source: TacheSource;
  onChange: (destination: Destination) => void;
  onError: (message: string) => void;
}

/**
 * Société, tableau, liste : trois choix en cascade, sur une même ligne. Chacun
 * retient d'office le premier de ce qu'il propose.
 */
export default function TaskDestination({ source, onChange, onError }: TaskDestinationProps) {
  const [companies, setCompanies] = useState<Company[] | null>(null);
  const [societe, setSociete] = useState<string | null>(
    source.companyId === null ? null : String(source.companyId),
  );
  const [boards, setBoards] = useState<Board[] | null>(null);
  const [boardId, setBoardId] = useState<string | null>(null);
  const [lists, setLists] = useState<TaskList[] | null>(null);
  const [listId, setListId] = useState<string | null>(null);

  useEffect(() => {
    onChange({ boardId, listId });
    // « onChange » change à chaque rendu du tiroir : seul le choix compte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId, listId]);

  useEffect(() => {
    let annule = false;
    api
      .getCompanies()
      .then((lues) => {
        if (annule) return;
        setCompanies(lues);
        // Sans société propre — un élément du mode Accès, un poste non
        // rattaché —, celle dont le nom rappelle le tableau d'origine, à
        // défaut la première : il y a toujours un premier choix.
        const devinee = rapprocher(source.boardName, lues) ?? lues[0];
        if (source.companyId === null && devinee) setSociete(String(devinee.id));
      })
      .catch((e) => !annule && onError(messageErreur(e)));
    return () => {
      annule = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  // Les tableaux suivent la société : celui qui porte le nom du tableau
  // d'origine est retenu d'office, à défaut le premier.
  useEffect(() => {
    setBoards(null);
    setBoardId(null);
    if (!societe) return;
    let annule = false;
    api
      .getBoards(societe)
      .then((lus) => {
        if (annule) return;
        setBoards(lus);
        const retenu = rapprocher(source.boardName, lus) ?? lus[0];
        setBoardId(retenu ? String(retenu.id) : null);
      })
      .catch((e) => !annule && onError(messageErreur(e)));
    return () => {
      annule = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [societe]);

  // Les listes suivent le tableau ; la première est retenue d'office.
  useEffect(() => {
    setLists(null);
    setListId(null);
    if (!boardId) return;
    let annule = false;
    api
      .getTaskLists(boardId)
      .then((lues) => {
        if (annule) return;
        setLists(lues);
        setListId(lues[0] ? String(lues[0].id) : null);
      })
      .catch((e) => !annule && onError(messageErreur(e)));
    return () => {
      annule = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId]);

  const companyOptions = (companies ?? []).map((c) => ({ value: String(c.id), label: c.name }));
  const boardOptions = (boards ?? []).map((b) => ({ value: String(b.id), label: b.name }));
  const listOptions = (lists ?? []).map((l) => ({ value: String(l.id), label: l.name }));

  // Une société sans tableau, un tableau sans liste : on le dit plutôt que de
  // laisser une liste déroulante vide.
  const sansTableau = boards !== null && boards.length === 0;
  const sansListe = lists !== null && lists.length === 0;

  return (
    <div>
      <Group gap="md" wrap="nowrap" grow align="flex-start">
        <Select
          label="Société"
          placeholder="Choisir"
          data={companyOptions}
          value={societe}
          onChange={setSociete}
          allowDeselect={false}
          searchable={companyOptions.length > 8}
          comboboxProps={{ withinPortal: true }}
        />
        <Select
          label="Tableau"
          placeholder={societe && boards === null ? "Lecture…" : "Choisir"}
          data={boardOptions}
          value={boardId}
          onChange={setBoardId}
          allowDeselect={false}
          disabled={!societe || boards === null || sansTableau}
          searchable={boardOptions.length > 8}
          comboboxProps={{ withinPortal: true }}
        />
        <Select
          label="Liste"
          placeholder={boardId && lists === null ? "Lecture…" : "Choisir"}
          data={listOptions}
          value={listId}
          onChange={setListId}
          allowDeselect={false}
          disabled={!boardId || lists === null || sansListe}
          searchable={listOptions.length > 8}
          comboboxProps={{ withinPortal: true }}
        />
      </Group>

      {(sansTableau || sansListe) && (
        <Text size="sm" c="dimmed" mt="xs">
          {sansTableau
            ? "Cette société n'a aucun tableau où créer la tâche."
            : "Ce tableau n'a aucune liste où créer la tâche."}
        </Text>
      )}
    </div>
  );
}
