import { Button, Group, Modal, Select, Stack, Text, TextInput } from "@mantine/core";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { useDroits } from "../../lib/droits";
import { modalHeaderStyles } from "../../themes/modals";
import type { Board, Id, TaskList, View } from "@milo/shared";
import { messageErreur, notifierErreur } from "../../lib/errors";
import BoutonFermer from "../ui/BoutonFermer";

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
const nomDeCopie = (nom: string): string => `${nom} (copie)`;

export default function MoveOrCopyListModal({
  opened,
  onClose,
  mode,
  list,
  viewId,
  onDone,
}: MoveOrCopyListModalProps) {
  const peut = useDroits();
  const [views, setViews] = useState<View[] | null>(null);
  const [vue, setVue] = useState<string | null>(null);
  /** Les tableaux de la vue retenue ; « null » tant qu'on les lit. */
  const [boards, setBoards] = useState<Board[] | null>(null);
  const [boardId, setBoardId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const copie = mode === "copy";

  // À l'ouverture : la vue du tableau courant, et pour une copie son tableau
  // — dupliquer une liste sur place ne doit rien demander de plus que son
  // nom.
  useEffect(() => {
    if (!opened) return;
    setVue(viewId === null ? null : String(viewId));
    setBoardId(copie && list ? String(list.board_id) : null);
    setName(list ? nomDeCopie(list.name) : "");

    let annule = false;
    api
      .getViews()
      .then((lues) => {
        if (!annule) setViews(lues);
      })
      .catch((e) => {
        if (!annule) notifierErreur(messageErreur(e));
      });
    return () => {
      annule = true;
    };
  }, [opened, list, copie, viewId]);

  // Les tableaux suivent la vue retenue. Une réponse arrivée après un
  // nouveau choix serait périmée : on l'abandonne.
  useEffect(() => {
    if (!opened || !vue) {
      setBoards(null);
      return;
    }
    let annule = false;
    setBoards(null);
    api
      .getBoards(vue)
      .then((lus) => {
        if (!annule) setBoards(lus);
      })
      .catch((e) => {
        if (!annule) notifierErreur(messageErreur(e));
      });
    return () => {
      annule = true;
    };
  }, [opened, vue]);

  // Changer de vue, c'est repartir du choix du tableau : celui qu'on avait
  // retenu n'appartient pas à la nouvelle.
  const changerVue = (valeur: string | null) => {
    setVue(valeur);
    setBoardId(null);
  };

  // Déplacer exclut le tableau qui porte déjà la liste ; copier l'accepte.
  const boardOptions = (boards ?? [])
    .filter((board) => copie || board.id !== list?.board_id)
    .map((board) => ({ value: String(board.id), label: board.name }));

  // Sans le droit d'ajouter des tâches, aucune vue n'accueille.
  const viewOptions = peut("tasks", "create")
    ? (views ?? []).map((v) => ({ value: String(v.id), label: v.name }))
    : [];

  const valider = async () => {
    if (!boardId || !list) return;
    setSaving(true);
    try {
      if (copie) {
        await api.copyTaskList(list.id, { board_id: Number(boardId), name: name.trim() });
      } else {
        await api.updateTaskList(list.id, { board_id: Number(boardId) });
      }
      await onDone();
      onClose();
    } catch (e) {
      notifierErreur(messageErreur(e));
    } finally {
      setSaving(false);
    }
  };

  // Une vue sans tableau d'accueil ne peut rien recevoir : on le dit au
  // lieu de laisser une liste déroulante vide.
  const aucuneDestination = boards !== null && boardOptions.length === 0;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={copie ? "Copier la liste" : "Déplacer la liste"}
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
          value={vue}
          onChange={changerVue}
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
          disabled={!vue || boards === null || aucuneDestination}
          searchable={boardOptions.length > 8}
        />

        {aucuneDestination && (
          <Text size="sm" c="dimmed">
            {copie
              ? "Cette vue n'a aucun tableau où copier cette liste."
              : "Cette vue n'a aucun autre tableau où déplacer cette liste."}
          </Text>
        )}

        {/* La copie se nomme : posée dans le tableau d'origine, elle porterait
            sinon le nom de la liste dont elle sort. */}
        {copie && (
          <TextInput
            label="Nom de la copie"
            placeholder="Nom de la copie"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") valider();
            }}
            required
          />
        )}
      </Stack>

      <Group justify="flex-end" mt={32}>
        <BoutonFermer onClick={onClose} />
        <Button
          color="teal"
          onClick={valider}
          loading={saving}
          disabled={!boardId || (copie && !name.trim())}
        >
          {copie ? "Copier" : "Déplacer"}
        </Button>
      </Group>
    </Modal>
  );
}
