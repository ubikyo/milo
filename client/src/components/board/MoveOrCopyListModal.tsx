import { Button, Group, Modal, Select, Stack, Text, TextInput } from "@mantine/core";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { useRights } from "../../lib/droits";
import { modalHeaderStyles } from "../../themes/modals";
import type { Board, Id, TaskList, View } from "@milo/shared";
import { errorMessage, notifyError } from "../../lib/errors";
import CloseButton from "../ui/BoutonFermer";

// Déplacer ou copier une liste vers un tableau. Les deux gestes posent la même
// question — lequel ? — et la même boîte y répond, l'intitulé près.
//
// Ce qui les sépare tient en deux points. Déplacer emmène la liste ailleurs :
// son propre tableau n'est pas une destination, et son nom ne bouge pas.
// Copier la laisse où elle est : le tableau courant redevient une destination
// — c'est le cas le plus courant, dupliquer une liste sur place — et la copie
// se nomme, puisque deux listes du même nom dans la même colonne ne se
// distingueraient plus.
//
// La destination n'est pas bornée à la vue courante : un tableau appartient à
// une vue, on choisit donc d'abord laquelle. Les tableaux se lisent alors pour
// elle — l'écran n'a en mémoire que ceux qu'il affiche. Dans un autre tableau,
// les cartes prennent le premier de ses contextes.
export type ListAction = "move" | "copy";

interface MoveOrCopyListModalProps {
  opened: boolean;
  onClose: () => void;
  mode: ListAction;
  list: TaskList | null;
  /** La vue du tableau ouvert : la destination s'y cherche par défaut. */
  viewId: Id | null;
  onDone: () => void | Promise<void>;
}

/** « Ma liste » -> « Ma liste (copie) ». */
const copyName = (name: string): string => `${name} (copie)`;

export default function MoveOrCopyListModal({
  opened,
  onClose,
  mode,
  list,
  viewId,
  onDone,
}: MoveOrCopyListModalProps) {
  const can = useRights();
  const [views, setViews] = useState<View[] | null>(null);
  const [view, setView] = useState<string | null>(null);
  /** Les tableaux de la vue retenue ; « null » tant qu'on les lit. */
  const [boards, setBoards] = useState<Board[] | null>(null);
  const [boardId, setBoardId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const copy = mode === "copy";

  // À l'ouverture : la vue du tableau courant, et pour une copie son tableau
  // — dupliquer une liste sur place ne doit rien demander de plus que son
  // nom.
  useEffect(() => {
    if (!opened) return;
    setView(viewId === null ? null : String(viewId));
    setBoardId(copy && list ? String(list.board_id) : null);
    setName(list ? copyName(list.name) : "");

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
  }, [opened, list, copy, viewId]);

  // Les tableaux suivent la vue retenue. Une réponse arrivée après un
  // nouveau choix serait périmée : on l'abandonne.
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

  // Déplacer exclut le tableau qui porte déjà la liste ; copier l'accepte.
  const boardOptions = (boards ?? [])
    .filter((board) => copy || board.id !== list?.board_id)
    .map((board) => ({ value: String(board.id), label: board.name }));

  // Sans le droit d'ajouter des tâches, aucune vue n'accueille.
  const viewOptions = can("tasks", "create")
    ? (views ?? []).map((v) => ({ value: String(v.id), label: v.name }))
    : [];

  const validate = async () => {
    if (!boardId || !list) return;
    setSaving(true);
    try {
      if (copy) {
        await api.copyTaskList(list.id, { board_id: Number(boardId), name: name.trim() });
      } else {
        await api.updateTaskList(list.id, { board_id: Number(boardId) });
      }
      await onDone();
      onClose();
    } catch (e) {
      notifyError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  // Une vue sans tableau d'accueil ne peut rien recevoir : on le dit au
  // lieu de laisser une liste déroulante vide.
  const noDestination = boards !== null && boardOptions.length === 0;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={copy ? "Copier la liste" : "Déplacer la liste"}
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
          data={viewOptions}
          value={view}
          onChange={changeView}
          allowDeselect={false}
          searchable={viewOptions.length > 8}
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
            {copy
              ? "Cette vue n'a aucun tableau où copier cette liste."
              : "Cette vue n'a aucun autre tableau où déplacer cette liste."}
          </Text>
        )}

        {/* La copie se nomme : posée dans le tableau d'origine, elle porterait
            sinon le nom de la liste dont elle sort. */}
        {copy && (
          <TextInput
            label="Nom de la copie"
            placeholder="Nom de la copie"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") validate();
            }}
            required
          />
        )}
      </Stack>

      <Group justify="flex-end" mt={32}>
        <CloseButton onClick={onClose} />
        <Button
          color="teal"
          onClick={validate}
          loading={saving}
          disabled={!boardId || (copy && !name.trim())}
        >
          {copy ? "Copier" : "Déplacer"}
        </Button>
      </Group>
    </Modal>
  );
}
