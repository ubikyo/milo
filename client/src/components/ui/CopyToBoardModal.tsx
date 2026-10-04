import { Button, Group, Modal, Select, Stack, Switch, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { modalHeaderStyles } from "../../themes/modals";
import { errorMessage, notifyError } from "../../lib/errors";
import type { CopyResult, Id, View } from "@milo/shared";
import CloseButton from "./BoutonFermer";

// Copier les étiquettes, les catégories ou les contextes d'un tableau vers un
// autre.
//
// La destination se choisit en deux temps : la vue, puis l'un de ses
// tableaux. La vue du tableau d'origine est proposée d'abord.
//
// Ce qui existe déjà dans le tableau d'accueil, au même nom, n'est pas
// redoublé. Le serveur le compte, et la notification qui suit la copie le dit
// plutôt que de laisser croire que tout est passé. Les étiquettes et les
// contextes peuvent aussi remplacer ceux de l'accueil : un interrupteur
// les efface d'abord.

/** Ce qu'on copie. */
export type ItemToCopy = "labels" | "categories" | "contexts";

const WORDS: Record<
  ItemToCopy,
  { title: string; nounPhrase: string; plusieurs: string; feminine: boolean }
> = {
  labels: { title: "Copier les étiquettes", nounPhrase: "étiquette", plusieurs: "étiquettes", feminine: true },
  categories: {
    title: "Copier les catégories",
    nounPhrase: "catégorie",
    plusieurs: "catégories",
    feminine: true,
  },
  contexts: { title: "Copier les contextes", nounPhrase: "contexte", plusieurs: "contextes", feminine: false },
};

/**
 * Ce que la copie a donné, en une phrase. « ou » situe le tableau d'accueil :
 * « là-bas » depuis l'origine, « ici » quand on y colle.
 */
export const report = (
  item: ItemToCopy,
  { copied, skipped, removed, kept }: CopyResult,
  or = "là-bas",
): string => {
  const words = WORDS[item];
  const name = (n: number) => (n > 1 ? words.plusieurs : words.nounPhrase);
  // Les accords suivent le genre de ce qu'on copie.
  const none = words.feminine ? "aucune" : "aucun";
  const copy = words.feminine ? "copiée" : "copié";

  if (copied === 0 && skipped === 0) return `Ce tableau n'a ${none} ${words.nounPhrase} à copier.`;

  const copiedPhrase =
    copied === 0
      ? `${words.feminine ? "Aucune" : "Aucun"} ${words.nounPhrase} ${copy}`
      : `${copied} ${name(copied)} ${copy}${copied > 1 ? "s" : ""}`;

  // Ce qui a été effacé avant, quand on l'a demandé.
  const cleared = removed
    ? ` ${removed} ${name(removed)} ${words.feminine ? "effacée" : "effacé"}${removed > 1 ? "s" : ""} avant.`
    : "";

  // Ce que le remplacement a dû garder : des catégories qui rangent des projets.
  const keptCount = kept
    ? ` ${kept} ${name(kept)} ${words.feminine ? "gardée" : "gardé"}${kept > 1 ? "s" : ""} : ${
        kept > 1 ? "elles rangent" : "elle range"
      } encore des projets.`
    : "";

  if (skipped === 0) return `${copiedPhrase}.${cleared}${keptCount}`;

  const already =
    skipped > 1
      ? `${skipped} portaient déjà ce nom ${or}`
      : `1 portait déjà ce nom ${or}`;
  return `${copiedPhrase} — ${already}.${cleared}${keptCount}`;
};

/**
 * L'interrupteur qui efface d'abord ce que l'accueil porte — les contextes
 * avec tout ce qu'ils contiennent. Les catégories n'en ont pas.
 */
const REPLACEABLE: Partial<Record<ItemToCopy, string>> = {
  labels: "Effacer les étiquettes existantes",
  contexts: "Effacer les contextes existants",
};

/**
 * Les contextes emportent aussi, par défaut, le libellé de « Tous les … » —
 * le sélecteur global — du tableau d'origine.
 */
const RENAME: Partial<Record<ItemToCopy, string>> = {
  contexts: "Renommer le sélecteur global",
};

interface CopyToBoardModalProps {
  opened: boolean;
  onClose: () => void;
  item: ItemToCopy;
  /** Le tableau d'origine : il n'est pas une destination. */
  sourceId: Id;
  /** La vue du tableau d'origine : la destination s'y cherche d'abord. */
  viewId: Id | string | null;
  /**
   * La copie à faire, une fois la destination choisie. « remplacer » : effacer
   * d'abord ce que la destination porte (REMPLACER) ; « renommer » : lui
   * donner le libellé de « Tous les … » de l'origine (RENOMMER).
   */
  onCopy: (boardId: Id, replaceExisting: boolean, rename: boolean) => Promise<CopyResult>;
}

export default function CopyToBoardModal({
  opened,
  onClose,
  item,
  sourceId,
  viewId,
  onCopy,
}: CopyToBoardModalProps) {
  const [views, setViews] = useState<View[] | null>(null);
  const [view, setView] = useState<string | null>(null);
  /** Les tableaux où l'on peut copier ; « null » tant qu'on les lit. */
  const [boards, setBoards] = useState<{ id: Id; name: string }[] | null>(null);
  const [boardId, setBoardId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [replaceExisting, setReplace] = useState(false);
  const [rename, setRename] = useState(true);

  const words = WORDS[item];
  const replacement = REPLACEABLE[item];
  const renaming = RENAME[item];

  // À l'ouverture : on repart à zéro, sur la vue du tableau d'origine.
  useEffect(() => {
    if (!opened) return;
    setBoardId(null);
    setReplace(false);
    setRename(true);
    setView(viewId != null ? String(viewId) : null);
    let cancelled = false;
    api
      .getViews()
      .then((readItems) => {
        if (!cancelled) setViews(readItems);
      })
      .catch((e) => {
        if (!cancelled) notifyError(errorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, [opened, viewId]);

  // Les tableaux de la vue retenue. Une réponse arrivée après un nouveau
  // choix serait périmée : on l'abandonne.
  useEffect(() => {
    if (!opened || !view) {
      setBoards(null);
      return;
    }
    let cancelled = false;
    setBoards(null);
    api
      .getBoards(view)
      .then((readItems) => {
        if (!cancelled) setBoards(readItems);
      })
      .catch((e) => {
        if (!cancelled) notifyError(errorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, [opened, view]);

  // Changer de vue, c'est repartir du choix du tableau : celui qu'on avait
  // retenu n'appartient pas à la nouvelle.
  const changeView = (value: string | null) => {
    setView(value);
    setBoardId(null);
  };

  // Le tableau d'origine n'est pas une destination : s'y copier ne ferait rien.
  const boardOptions = (boards ?? [])
    .filter((board) => board.id !== sourceId)
    .map((board) => ({ value: String(board.id), label: board.name }));

  const viewChoices = (views ?? []).map((v) => ({ value: String(v.id), label: v.name }));

  const noDestination = boards !== null && boardOptions.length === 0;

  const validate = async () => {
    if (!boardId) return;
    setSaving(true);
    try {
      // Le tableau d'accueil n'est pas celui qu'on regarde : la notification
      // est le seul endroit où dire ce que la copie a donné.
      const done = await onCopy(
        Number(boardId),
        replacement ? replaceExisting : false,
        renaming ? rename : false,
      );
      notifications.show({ color: "teal", title: words.title, message: report(item, done) });
      onClose();
    } catch (e) {
      notifyError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={words.title}
      centered
      padding={32}
      withCloseButton={false}
      styles={modalHeaderStyles(32)}
    >
      <Stack gap="md">

        {/* La vue précède le tableau : elle commande la liste des
            destinations possibles. */}
        <Select
          label="Vue"
          placeholder="Choisir une vue"
          data={viewChoices}
          value={view}
          onChange={changeView}
          allowDeselect={false}
          searchable={viewChoices.length > 8}
        />

        <Select
          label="Tableau de destination"
          placeholder={boards === null ? "Lecture des tableaux…" : "Choisir un tableau"}
          data={boardOptions}
          value={boardId}
          onChange={setBoardId}
          allowDeselect={false}
          disabled={!view || boards === null || noDestination}
          searchable={boardOptions.length > 8}
        />

        {noDestination && (
          <Text size="sm" c="dimmed">
            Cette vue n'a aucun autre tableau où copier.
          </Text>
        )}
        {renaming && (
          <Switch
            label={renaming}
            checked={rename}
            onChange={(e) => setRename(e.currentTarget.checked)}
            color="teal"
          />
        )}
        {replacement && (
          <Switch
            label={replacement}
            checked={replaceExisting}
            onChange={(e) => setReplace(e.currentTarget.checked)}
            color="teal"
          />
        )}
      </Stack>

      <Group justify="flex-end" mt={32}>
        <CloseButton onClick={onClose} />
        <Button color="teal" onClick={validate} loading={saving} disabled={!boardId}>
          Copier
        </Button>
      </Group>
    </Modal>
  );
}
