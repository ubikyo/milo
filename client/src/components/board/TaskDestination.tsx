import { Group, Select, Text } from "@mantine/core";
import { useEffect, useState } from "react";
import { itemLink } from "@milo/shared";
import type { Board, Id, LinkTargetKind, TaskList, View } from "@milo/shared";
import { api } from "../../api";
import { errorMessage } from "../../lib/errors";

// « Créer une tâche », depuis le menu contextuel d'un projet, d'une demande de
// support, d'un poste ou d'un élément du mode Accès. La fiche de la carte
// s'ouvre vide (components/board/CardDrawer.tsx) : elle prend le nom de
// l'élément — modifiable —, et sa description porte le lien qui y ramène. On
// choisit où elle va, sur une ligne au-dessus du titre : la société (celle de
// l'élément par défaut), puis le tableau, puis la liste.

/** L'élément d'où la tâche est créée. */
export interface SourceTask {
  kind: Exclude<LinkTargetKind, "card">;
  /** Pour « access », la catégorie : c'est elle que le lien ouvre. */
  id: Id;
  title: string;
  /** Un lien du mode Accès : son adresse suit dans la description. */
  url?: string;
  /**
   * Le tableau de l'élément dans son mode — celui d'un projet, la catégorie
   * d'un accès. Son nom sert à deviner la société et le tableau de tâches.
   */
  boardName?: string;
}

/** Un nom tel qu'on le compare : sans casse, sans accents, sans ponctuation. */
const normalizeValue = (name: string): string =>
  name
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
const findClosest = <T extends { name: string }>(name: string | undefined, items: T[]): T | undefined => {
  const target = normalizeValue(name ?? "");
  if (!target) return undefined;
  const names = items.map((item) => ({ item, name: normalizeValue(item.name) })).filter((n) => n.name);
  const exact = names.find((n) => n.name === target);
  if (exact) return exact.item;
  const word = (a: string, b: string) => ` ${a} `.includes(` ${b} `);
  return names
    .filter((n) => word(n.name, target) || word(target, n.name))
    .sort((a, b) => b.name.length - a.name.length)[0]?.item;
};

const ORIGIN_LABELS: Record<SourceTask["kind"], string> = {
  project: "le projet",
  support: "la demande",
  asset: "le poste",
  access: "l'accès",
};

const escape = (text: string): string =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * La description de la carte : une ligne vide, où l'on écrit d'abord, un
 * tiret long, puis d'où elle vient : son nom, en lien vers lui.
 */
export const descriptionOf = (source: SourceTask): string => {
  const returnValue = `${window.location.origin}${window.location.pathname}${itemLink(source.kind, source.id)}`;
  const rows = [
    "<p></p>",
    "<p>—</p>",
    `<p>Créée depuis ${ORIGIN_LABELS[source.kind]} <a href="${escape(returnValue)}" target="_blank" rel="noopener noreferrer">${escape(source.title)}</a></p>`,
  ];
  if (source.url) {
    rows.push(
      `<p><a href="${escape(source.url)}" target="_blank" rel="noopener noreferrer">${escape(source.url)}</a></p>`,
    );
  }
  return rows.join("");
};

/** Où la carte ira : « null » tant que rien n'est choisi. */
export interface Destination {
  boardId: string | null;
  listId: string | null;
}

interface TaskDestinationProps {
  source: SourceTask;
  onChange: (destination: Destination) => void;
  onError: (message: string) => void;
}

/**
 * Vue, tableau, liste : trois choix en cascade, sur une même ligne. Chacun
 * retient d'office le premier de ce qu'il propose.
 */
export default function TaskDestination({ source, onChange, onError }: TaskDestinationProps) {
  const [views, setViews] = useState<View[] | null>(null);
  const [view, setView] = useState<string | null>(null);
  const [boards, setBoards] = useState<Board[] | null>(null);
  const [boardId, setBoardId] = useState<string | null>(null);
  const [lists, setLists] = useState<TaskList[] | null>(null);
  const [listId, setListId] = useState<string | null>(null);

  useEffect(() => {
    onChange({ boardId, listId });
  }, [boardId, listId]);

  // Les vues : celle des tâches est retenue d'office — celle dont le nom le
  // dit —, à défaut la première : il y a toujours un premier choix.
  useEffect(() => {
    let cancelled = false;
    api
      .getViews()
      .then((readItems) => {
        if (cancelled) return;
        setViews(readItems);
        const guessed = findClosest("Tâches", readItems) ?? readItems[0];
        setView(guessed ? String(guessed.id) : null);
      })
      .catch((e) => !cancelled && onError(errorMessage(e)));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  // Les tableaux suivent la vue : celui qui porte le nom du tableau
  // d'origine est retenu d'office, à défaut le premier.
  useEffect(() => {
    setBoards(null);
    setBoardId(null);
    if (!view) return;
    let cancelled = false;
    api
      .getBoards(view)
      .then((readItems) => {
        if (cancelled) return;
        setBoards(readItems);
        const chosen = findClosest(source.boardName, readItems) ?? readItems[0];
        setBoardId(chosen ? String(chosen.id) : null);
      })
      .catch((e) => !cancelled && onError(errorMessage(e)));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  // Les listes suivent le tableau ; la première est retenue d'office.
  useEffect(() => {
    setLists(null);
    setListId(null);
    if (!boardId) return;
    let cancelled = false;
    api
      .getTaskLists(boardId)
      .then((readItems) => {
        if (cancelled) return;
        setLists(readItems);
        setListId(readItems[0] ? String(readItems[0].id) : null);
      })
      .catch((e) => !cancelled && onError(errorMessage(e)));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId]);

  const viewChoices = (views ?? []).map((v) => ({ value: String(v.id), label: v.name }));
  const boardOptions = (boards ?? []).map((b) => ({ value: String(b.id), label: b.name }));
  const listOptions = (lists ?? []).map((l) => ({ value: String(l.id), label: l.name }));

  // Une vue sans tableau, un tableau sans liste : on le dit plutôt que de
  // laisser une liste déroulante vide.
  const withoutBoard = boards !== null && boards.length === 0;
  const withoutList = lists !== null && lists.length === 0;

  return (
    <div>
      <Group gap="md" wrap="nowrap" grow align="flex-start">
        <Select
          label="Vue"
          placeholder="Choisir"
          data={viewChoices}
          value={view}
          onChange={setView}
          allowDeselect={false}
          searchable={viewChoices.length > 8}
          comboboxProps={{ withinPortal: true }}
        />
        <Select
          label="Tableau"
          placeholder={view && boards === null ? "Lecture…" : "Choisir"}
          data={boardOptions}
          value={boardId}
          onChange={setBoardId}
          allowDeselect={false}
          disabled={!view || boards === null || withoutBoard}
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
          disabled={!boardId || lists === null || withoutList}
          searchable={listOptions.length > 8}
          comboboxProps={{ withinPortal: true }}
        />
      </Group>

      {(withoutBoard || withoutList) && (
        <Text size="sm" c="dimmed" mt="xs">
          {withoutBoard
            ? "Cette vue n'a aucun tableau où créer la tâche."
            : "Ce tableau n'a aucune liste où créer la tâche."}
        </Text>
      )}
    </div>
  );
}
