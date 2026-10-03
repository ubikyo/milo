import { Button, Group, Modal, Select, Stack, Switch, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { modalHeaderStyles } from "../../themes/modals";
import { messageErreur, notifierErreur } from "../../lib/errors";
import type { CopyResult, Id, View } from "@milo/shared";
import BoutonFermer from "./BoutonFermer";

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
export type ChoseACopier = "labels" | "categories" | "contexts";

const MOTS: Record<
  ChoseACopier,
  { titre: string; une: string; plusieurs: string; feminin: boolean }
> = {
  labels: { titre: "Copier les étiquettes", une: "étiquette", plusieurs: "étiquettes", feminin: true },
  categories: {
    titre: "Copier les catégories",
    une: "catégorie",
    plusieurs: "catégories",
    feminin: true,
  },
  contexts: { titre: "Copier les contextes", une: "contexte", plusieurs: "contextes", feminin: false },
};

/**
 * Ce que la copie a donné, en une phrase. « ou » situe le tableau d'accueil :
 * « là-bas » depuis l'origine, « ici » quand on y colle.
 */
export const compteRendu = (
  chose: ChoseACopier,
  { copied, skipped, removed, kept }: CopyResult,
  ou = "là-bas",
): string => {
  const mots = MOTS[chose];
  const nom = (n: number) => (n > 1 ? mots.plusieurs : mots.une);
  // Les accords suivent le genre de ce qu'on copie.
  const aucun = mots.feminin ? "aucune" : "aucun";
  const copie = mots.feminin ? "copiée" : "copié";

  if (copied === 0 && skipped === 0) return `Ce tableau n'a ${aucun} ${mots.une} à copier.`;

  const copiees =
    copied === 0
      ? `${mots.feminin ? "Aucune" : "Aucun"} ${mots.une} ${copie}`
      : `${copied} ${nom(copied)} ${copie}${copied > 1 ? "s" : ""}`;

  // Ce qui a été effacé avant, quand on l'a demandé.
  const effaces = removed
    ? ` ${removed} ${nom(removed)} ${mots.feminin ? "effacée" : "effacé"}${removed > 1 ? "s" : ""} avant.`
    : "";

  // Ce que le remplacement a dû garder : des catégories qui rangent des projets.
  const gardes = kept
    ? ` ${kept} ${nom(kept)} ${mots.feminin ? "gardée" : "gardé"}${kept > 1 ? "s" : ""} : ${
        kept > 1 ? "elles rangent" : "elle range"
      } encore des projets.`
    : "";

  if (skipped === 0) return `${copiees}.${effaces}${gardes}`;

  const deja =
    skipped > 1
      ? `${skipped} portaient déjà ce nom ${ou}`
      : `1 portait déjà ce nom ${ou}`;
  return `${copiees} — ${deja}.${effaces}${gardes}`;
};

/**
 * L'interrupteur qui efface d'abord ce que l'accueil porte — les contextes
 * avec tout ce qu'ils contiennent. Les catégories n'en ont pas.
 */
const REMPLACER: Partial<Record<ChoseACopier, string>> = {
  labels: "Effacer les étiquettes existantes",
  contexts: "Effacer les contextes existants",
};

/**
 * Les contextes emportent aussi, par défaut, le libellé de « Tous les … » —
 * le sélecteur global — du tableau d'origine.
 */
const RENOMMER: Partial<Record<ChoseACopier, string>> = {
  contexts: "Renommer le sélecteur global",
};

interface CopyToBoardModalProps {
  opened: boolean;
  onClose: () => void;
  chose: ChoseACopier;
  /** Le tableau d'origine : il n'est pas une destination. */
  sourceId: Id;
  /** La vue du tableau d'origine : la destination s'y cherche d'abord. */
  viewId: Id | string | null;
  /**
   * La copie à faire, une fois la destination choisie. « remplacer » : effacer
   * d'abord ce que la destination porte (REMPLACER) ; « renommer » : lui
   * donner le libellé de « Tous les … » de l'origine (RENOMMER).
   */
  onCopy: (boardId: Id, remplacer: boolean, renommer: boolean) => Promise<CopyResult>;
}

export default function CopyToBoardModal({
  opened,
  onClose,
  chose,
  sourceId,
  viewId,
  onCopy,
}: CopyToBoardModalProps) {
  const [vues, setVues] = useState<View[] | null>(null);
  const [vue, setVue] = useState<string | null>(null);
  /** Les tableaux où l'on peut copier ; « null » tant qu'on les lit. */
  const [boards, setBoards] = useState<{ id: Id; name: string }[] | null>(null);
  const [boardId, setBoardId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [remplacer, setRemplacer] = useState(false);
  const [renommer, setRenommer] = useState(true);

  const mots = MOTS[chose];
  const remplacement = REMPLACER[chose];
  const renommage = RENOMMER[chose];

  // À l'ouverture : on repart à zéro, sur la vue du tableau d'origine.
  useEffect(() => {
    if (!opened) return;
    setBoardId(null);
    setRemplacer(false);
    setRenommer(true);
    setVue(viewId != null ? String(viewId) : null);
    let annule = false;
    api
      .getViews()
      .then((lues) => {
        if (!annule) setVues(lues);
      })
      .catch((e) => {
        if (!annule) notifierErreur(messageErreur(e));
      });
    return () => {
      annule = true;
    };
  }, [opened, viewId]);

  // Les tableaux de la vue retenue. Une réponse arrivée après un nouveau
  // choix serait périmée : on l'abandonne.
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

  // Le tableau d'origine n'est pas une destination : s'y copier ne ferait rien.
  const boardOptions = (boards ?? [])
    .filter((board) => board.id !== sourceId)
    .map((board) => ({ value: String(board.id), label: board.name }));

  const vueOptions = (vues ?? []).map((v) => ({ value: String(v.id), label: v.name }));

  const aucuneDestination = boards !== null && boardOptions.length === 0;

  const valider = async () => {
    if (!boardId) return;
    setSaving(true);
    try {
      // Le tableau d'accueil n'est pas celui qu'on regarde : la notification
      // est le seul endroit où dire ce que la copie a donné.
      const fait = await onCopy(
        Number(boardId),
        remplacement ? remplacer : false,
        renommage ? renommer : false,
      );
      notifications.show({ color: "teal", title: mots.titre, message: compteRendu(chose, fait) });
      onClose();
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
      title={mots.titre}
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
          data={vueOptions}
          value={vue}
          onChange={changerVue}
          allowDeselect={false}
          searchable={vueOptions.length > 8}
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
            Cette vue n'a aucun autre tableau où copier.
          </Text>
        )}
        {renommage && (
          <Switch
            label={renommage}
            checked={renommer}
            onChange={(e) => setRenommer(e.currentTarget.checked)}
            color="teal"
          />
        )}
        {remplacement && (
          <Switch
            label={remplacement}
            checked={remplacer}
            onChange={(e) => setRemplacer(e.currentTarget.checked)}
            color="teal"
          />
        )}
      </Stack>

      <Group justify="flex-end" mt={32}>
        <BoutonFermer onClick={onClose} />
        <Button color="teal" onClick={valider} loading={saving} disabled={!boardId}>
          Copier
        </Button>
      </Group>
    </Modal>
  );
}
