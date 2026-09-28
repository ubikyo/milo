import { Button, Group, Modal, Select, Stack, Text, TextInput } from "@mantine/core";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { modalHeaderStyles } from "../../themes/modals";
import ErrorAlert from "../ui/ErrorAlert";
import type { Board, Company, Id, TaskList } from "@milo/shared";
import { messageErreur } from "../../lib/errors";

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
// La destination n'est pas bornée à la société courante : un tableau
// appartient à une société, on choisit donc d'abord laquelle. Les tableaux se
// lisent alors pour elle — l'écran n'a en mémoire que ceux qu'il affiche.
export type ListAction = "move" | "copy";

interface MoveOrCopyListModalProps {
  opened: boolean;
  onClose: () => void;
  mode: ListAction;
  list: TaskList | null;
  /** La société du tableau ouvert : la destination s'y pose par défaut. */
  companyId: Id | null;
  onDone: () => void | Promise<void>;
}

/** « Ma liste » -> « Ma liste (copie) ». */
const nomDeCopie = (nom: string): string => `${nom} (copie)`;

export default function MoveOrCopyListModal({
  opened,
  onClose,
  mode,
  list,
  companyId,
  onDone,
}: MoveOrCopyListModalProps) {
  const [companies, setCompanies] = useState<Company[] | null>(null);
  const [societe, setSociete] = useState<string | null>(null);
  /** Les tableaux de la société retenue ; « null » tant qu'on les lit. */
  const [boards, setBoards] = useState<Board[] | null>(null);
  const [boardId, setBoardId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const copie = mode === "copy";

  // À l'ouverture : la société du tableau courant, et pour une copie son
  // tableau — dupliquer une liste sur place ne doit rien demander de plus que
  // son nom.
  useEffect(() => {
    if (!opened) return;
    setSociete(companyId === null ? null : String(companyId));
    setBoardId(copie && list ? String(list.board_id) : null);
    setName(list ? nomDeCopie(list.name) : "");
    setError(null);

    let annule = false;
    api
      .getCompanies()
      .then((lues) => {
        if (!annule) setCompanies(lues);
      })
      .catch((e) => {
        if (!annule) setError(messageErreur(e));
      });
    return () => {
      annule = true;
    };
  }, [opened, list, copie, companyId]);

  // Les tableaux suivent la société retenue. Une réponse arrivée après un
  // nouveau choix serait périmée : on l'abandonne.
  useEffect(() => {
    if (!opened || !societe) {
      setBoards(null);
      return;
    }
    let annule = false;
    setBoards(null);
    api
      .getBoards(societe)
      .then((lus) => {
        if (!annule) setBoards(lus);
      })
      .catch((e) => {
        if (!annule) setError(messageErreur(e));
      });
    return () => {
      annule = true;
    };
  }, [opened, societe]);

  // Changer de société, c'est repartir du choix du tableau : celui qu'on avait
  // retenu n'appartient pas à la nouvelle.
  const changerSociete = (valeur: string | null) => {
    setSociete(valeur);
    setBoardId(null);
  };

  // Déplacer exclut le tableau qui porte déjà la liste ; copier l'accepte.
  const boardOptions = (boards ?? [])
    .filter((board) => copie || board.id !== list?.board_id)
    .map((board) => ({ value: String(board.id), label: board.name }));

  const companyOptions = (companies ?? []).map((c) => ({
    value: String(c.id),
    label: c.name,
  }));

  const valider = async () => {
    if (!boardId || !list) return;
    setSaving(true);
    setError(null);
    try {
      if (copie) {
        await api.copyTaskList(list.id, { board_id: Number(boardId), name: name.trim() });
      } else {
        await api.updateTaskList(list.id, { board_id: Number(boardId) });
      }
      await onDone();
      onClose();
    } catch (e) {
      setError(messageErreur(e));
    } finally {
      setSaving(false);
    }
  };

  // Une société sans tableau d'accueil ne peut rien recevoir : on le dit au
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
        {error && <ErrorAlert onClose={() => setError(null)}>{error}</ErrorAlert>}

        {/* La société précède le tableau : elle commande la liste des
            destinations possibles. */}
        <Select
          label="Société"
          placeholder="Choisir une société"
          data={companyOptions}
          value={societe}
          onChange={changerSociete}
          allowDeselect={false}
          searchable={companyOptions.length > 8}
        />

        <Select
          label="Tableau de destination"
          placeholder={boards === null ? "Lecture des tableaux…" : "Choisir un tableau"}
          data={boardOptions}
          value={boardId}
          onChange={setBoardId}
          allowDeselect={false}
          disabled={!societe || boards === null || aucuneDestination}
          searchable={boardOptions.length > 8}
        />

        {aucuneDestination && (
          <Text size="sm" c="dimmed">
            {copie
              ? "Cette société n'a aucun tableau où copier cette liste."
              : "Cette société n'a aucun autre tableau où déplacer cette liste."}
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
        <Button variant="default" onClick={onClose}>
          Fermer
        </Button>
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
