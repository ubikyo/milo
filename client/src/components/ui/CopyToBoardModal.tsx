import { Button, Group, Modal, Select, Stack, Text } from "@mantine/core";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { modalHeaderStyles } from "../../themes/modals";
import ErrorAlert from "./ErrorAlert";
import { messageErreur } from "../../lib/errors";
import type { Company, CopyResult, Id } from "@milo/shared";

// Copier les étiquettes — ou les catégories — d'un tableau vers un autre.
//
// Le choix de la destination n'est pas le même des deux côtés, et c'est tout
// ce qui sépare les deux usages : un tableau de tâches appartient à une
// société, on désigne donc d'abord laquelle, puis l'un de ses tableaux ; un
// tableau de projets n'appartient à personne, la liste suffit.
//
// Ce qui existe déjà dans le tableau d'accueil, au même nom, n'est pas
// redoublé. Le serveur le compte, et la boîte le dit plutôt que de laisser
// croire que tout est passé.

/** Ce qu'on copie. Les deux sont féminins : les accords du compte rendu tiennent. */
export type ChoseACopier = "labels" | "categories";

const MOTS: Record<ChoseACopier, { titre: string; une: string; plusieurs: string }> = {
  labels: { titre: "Copier les étiquettes", une: "étiquette", plusieurs: "étiquettes" },
  categories: { titre: "Copier les catégories", une: "catégorie", plusieurs: "catégories" },
};

/** Ce que la copie a donné, en une phrase. */
const compteRendu = (chose: ChoseACopier, { copied, skipped }: CopyResult): string => {
  const mots = MOTS[chose];
  const nom = (n: number) => (n > 1 ? mots.plusieurs : mots.une);

  if (copied === 0 && skipped === 0) return `Ce tableau n'a aucune ${mots.une} à copier.`;

  const copiees =
    copied === 0
      ? `Aucune ${mots.une} copiée`
      : `${copied} ${nom(copied)} copiée${copied > 1 ? "s" : ""}`;

  if (skipped === 0) return `${copiees}.`;

  const deja =
    skipped > 1
      ? `${skipped} portaient déjà ce nom là-bas`
      : `1 portait déjà ce nom là-bas`;
  return `${copiees} — ${deja}.`;
};

interface CopyToBoardModalProps {
  opened: boolean;
  onClose: () => void;
  chose: ChoseACopier;
  /** Le tableau d'origine : il n'est pas une destination. */
  sourceId: Id;
  /**
   * « tasks » quand le tableau appartient à une société — la destination se
   * cherche alors société par société ; « projects » quand il n'en a pas.
   */
  univers: "tasks" | "projects";
  /** La société du tableau d'origine : la destination s'y pose par défaut. */
  companyId?: Id | string | null;
  /** La copie à faire, une fois la destination choisie. */
  onCopy: (boardId: Id) => Promise<CopyResult>;
}

export default function CopyToBoardModal({
  opened,
  onClose,
  chose,
  sourceId,
  univers,
  companyId,
  onCopy,
}: CopyToBoardModalProps) {
  const [companies, setCompanies] = useState<Company[] | null>(null);
  const [societe, setSociete] = useState<string | null>(null);
  /** Les tableaux où l'on peut copier ; « null » tant qu'on les lit. */
  const [boards, setBoards] = useState<{ id: Id; name: string }[] | null>(null);
  const [boardId, setBoardId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /** Ce que la copie a donné. Tant qu'il est là, la boîte n'affiche plus le choix. */
  const [fait, setFait] = useState<CopyResult | null>(null);

  const parSociete = univers === "tasks";
  const mots = MOTS[chose];

  // À l'ouverture : on repart à zéro, et les sociétés se lisent si la
  // destination se cherche par elles.
  useEffect(() => {
    if (!opened) return;
    setBoardId(null);
    setError(null);
    setFait(null);
    setSociete(parSociete && companyId != null ? String(companyId) : null);
    if (!parSociete) return;

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
  }, [opened, parSociete, companyId]);

  // Les tableaux : ceux de la société retenue, ou tous ceux des projets. Une
  // réponse arrivée après un nouveau choix serait périmée : on l'abandonne.
  useEffect(() => {
    if (!opened || (parSociete && !societe)) {
      setBoards(null);
      return;
    }
    let annule = false;
    setBoards(null);
    const lecture = parSociete ? api.getBoards(societe!) : api.getProjectBoards();
    lecture
      .then((lus) => {
        if (!annule) setBoards(lus);
      })
      .catch((e) => {
        if (!annule) setError(messageErreur(e));
      });
    return () => {
      annule = true;
    };
  }, [opened, parSociete, societe]);

  // Changer de société, c'est repartir du choix du tableau : celui qu'on avait
  // retenu n'appartient pas à la nouvelle.
  const changerSociete = (valeur: string | null) => {
    setSociete(valeur);
    setBoardId(null);
  };

  // Le tableau d'origine n'est pas une destination : s'y copier ne ferait rien.
  const boardOptions = (boards ?? [])
    .filter((board) => board.id !== sourceId)
    .map((board) => ({ value: String(board.id), label: board.name }));

  const companyOptions = (companies ?? []).map((c) => ({
    value: String(c.id),
    label: c.name,
  }));

  const aucuneDestination = boards !== null && boardOptions.length === 0;

  const valider = async () => {
    if (!boardId) return;
    setSaving(true);
    setError(null);
    try {
      setFait(await onCopy(Number(boardId)));
    } catch (e) {
      setError(messageErreur(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={mots.titre}
      centered
      padding={32}
      withCloseButton={false}
      styles={modalHeaderStyles(32)}
    >
      <Stack gap="md">
        {error && <ErrorAlert onClose={() => setError(null)}>{error}</ErrorAlert>}

        {/* La copie faite, le choix n'a plus lieu d'être : reste ce qu'elle a
            donné. Il n'y a pas d'autre endroit où le dire — le tableau
            d'accueil n'est pas celui qu'on regarde. */}
        {fait ? (
          <Text size="sm">{compteRendu(chose, fait)}</Text>
        ) : (
          <>
            {/* La société précède le tableau : elle commande la liste des
                destinations possibles. */}
            {parSociete && (
              <Select
                label="Société"
                placeholder="Choisir une société"
                data={companyOptions}
                value={societe}
                onChange={changerSociete}
                allowDeselect={false}
                searchable={companyOptions.length > 8}
              />
            )}

            <Select
              label="Tableau de destination"
              placeholder={boards === null ? "Lecture des tableaux…" : "Choisir un tableau"}
              data={boardOptions}
              value={boardId}
              onChange={setBoardId}
              allowDeselect={false}
              disabled={(parSociete && !societe) || boards === null || aucuneDestination}
              searchable={boardOptions.length > 8}
            />

            {aucuneDestination && (
              <Text size="sm" c="dimmed">
                {parSociete
                  ? "Cette société n'a aucun autre tableau où copier."
                  : "Il n'y a aucun autre tableau où copier."}
              </Text>
            )}
          </>
        )}
      </Stack>

      <Group justify="flex-end" mt={32}>
        <Button variant="default" onClick={onClose}>
          Fermer
        </Button>
        {!fait && (
          <Button color="teal" onClick={valider} loading={saving} disabled={!boardId}>
            Copier
          </Button>
        )}
      </Group>
    </Modal>
  );
}
