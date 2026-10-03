import { Button, Group, Modal, Select, Stack, Text, TextInput } from "@mantine/core";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { modalHeaderStyles } from "../../themes/modals";
import type { Category, Project, ProjectBoard } from "@milo/shared";
import { messageErreur, notifierErreur } from "../../lib/errors";
import BoutonFermer from "../ui/BoutonFermer";

// Déplacer ou copier un projet vers un tableau. Les deux gestes posent la même
// question — lequel ? — et la même boîte y répond, comme pour une liste
// (MoveOrCopyListModal).
//
// Les catégories étant propres à chaque tableau, le projet en change aussi :
// on demande donc celle qui l'accueille dans le tableau visé.
//
// Ce qui les sépare : déplacer emmène le projet ailleurs, son propre tableau
// n'est donc pas une destination et son nom ne bouge pas. Copier le laisse où
// il est : le tableau courant redevient une destination — c'est le cas le plus
// courant, dupliquer un projet sur place — et la copie se nomme, deux projets
// du même nom dans le même tableau ne se distinguant plus.
export type ProjectAction = "move" | "copy";

interface MoveOrCopyProjectModalProps {
  opened: boolean;
  onClose: () => void;
  /** « move » par défaut. */
  mode?: ProjectAction;
  /**
   * Le projet visé. Son identifiant, son tableau, son nom et sa catégorie
   * suffisent : le tableau de la liste en donne un entier, le tiroir seulement
   * ceux-là.
   */
  project: Pick<Project, "id" | "board_id" | "name" | "category_id"> | null;
  boards: ProjectBoard[];
  onMoved: () => void | Promise<void>;
}

/** « Mon projet » -> « Mon projet (copie) ». */
const nomDeCopie = (nom: string): string => `${nom} (copie)`;

export default function MoveOrCopyProjectModal({
  opened,
  onClose,
  mode = "move",
  project,
  boards,
  onMoved,
}: MoveOrCopyProjectModalProps) {
  const [boardId, setBoardId] = useState<string | null>(null);
  // « null » tant que les catégories du tableau visé ne sont pas lues.
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const copie = mode === "copy";

  // À l'ouverture : pour une copie, le tableau du projet — dupliquer sur place
  // est le cas courant — et un nom tout prêt.
  useEffect(() => {
    if (!opened) return;
    setBoardId(copie && project ? String(project.board_id) : null);
    setCategories(null);
    setCategoryId(null);
    setName(project ? nomDeCopie(project.name) : "");
  }, [opened, project, copie]);

  // Les catégories du tableau visé, dès qu'il est choisi.
  useEffect(() => {
    if (!boardId) {
      setCategories(null);
      setCategoryId(null);
      return undefined;
    }

    let abandonne = false;
    setCategories(null);
    setCategoryId(null);
    api
      .getCategories(boardId)
      .then((liste) => {
        if (abandonne) return;
        setCategories(liste);
        // Dans son propre tableau, le projet garde sa catégorie ; ailleurs, la
        // première proposée, qu'on peut changer.
        const sienne = liste.find((c) => c.id === project?.category_id);
        const retenue = Number(boardId) === project?.board_id ? sienne : undefined;
        setCategoryId(String((retenue ?? liste[0])?.id ?? "") || null);
      })
      .catch((e: unknown) => {
        if (!abandonne) notifierErreur(messageErreur(e));
      });

    return () => {
      abandonne = true;
    };
  }, [boardId, project]);

  // Déplacer exclut le tableau qui porte déjà le projet ; copier l'accepte.
  const boardOptions = boards
    .filter((board) => copie || board.id !== project?.board_id)
    .map((board) => ({ value: String(board.id), label: board.name }));

  const valider = async () => {
    if (!boardId || !categoryId || !project) return;
    setSaving(true);
    try {
      if (copie) {
        await api.copyProject(project.id, {
          board_id: Number(boardId),
          category_id: Number(categoryId),
          name: name.trim(),
        });
      } else {
        await api.updateProject(project.id, {
          board_id: Number(boardId),
          category_id: Number(categoryId),
        });
      }
      await onMoved();
    } catch (e) {
      notifierErreur(messageErreur(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={copie ? "Copier le projet" : "Déplacer le projet"}
      centered
      padding={32}
      withCloseButton={false}
      styles={modalHeaderStyles(32)}
    >
      <Stack gap="md">

        {boardOptions.length === 0 ? (
          <Text size="sm" c="dimmed">
            Il n'existe aucun autre tableau où déplacer ce projet.
          </Text>
        ) : (
          <>
            <Select
              label="Tableau de destination"
              placeholder="Choisir un tableau"
              data={boardOptions}
              value={boardId}
              onChange={setBoardId}
              allowDeselect={false}
            />

            {/* Un projet porte toujours une catégorie, et celles du tableau
                d'arrivée ne sont pas celles du tableau de départ. Le tableau
                qui n'en a aucune le dit dans le champ : le déplacement reste
                alors impossible. */}
            <Select
              label="Catégorie dans ce tableau"
              placeholder={
                !boardId
                  ? "Choisissez d'abord un tableau"
                  : categories?.length === 0
                    ? "Aucune catégorie dans ce tableau"
                    : "Choisir une catégorie"
              }
              data={(categories ?? []).map((c) => ({ value: String(c.id), label: c.name }))}
              value={categoryId}
              onChange={setCategoryId}
              allowDeselect={false}
              disabled={!boardId || categories === null}
              required
            />

            {/* La copie se nomme : posée dans le tableau d'origine, elle
                porterait sinon le nom du projet dont elle sort. */}
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
          </>
        )}
      </Stack>

      <Group justify="flex-end" mt={32}>
        <BoutonFermer onClick={onClose} />
        <Button
          color="teal"
          onClick={valider}
          loading={saving}
          disabled={!boardId || !categoryId || (copie && !name.trim())}
        >
          {copie ? "Copier" : "Déplacer"}
        </Button>
      </Group>
    </Modal>
  );
}
