import { ActionIcon, Group, Input, Select, Stack } from "@mantine/core";
import { IconChevronDown, IconTrash } from "@tabler/icons-react";
import { RELATIONS } from "@milo/shared";
import type { CardLink, Id, LinkedCard, Relation } from "@milo/shared";
import { api } from "../../api";
import classes from "../../assets/styles/CardEcheance.module.css";
import { largeurTexte } from "../../lib/largeurChamp";
import { messageErreur } from "../../lib/errors";
import { RED } from "../../themes/colors";
import AddButton from "../ui/AddButton";
import { ARRONDI, RETRAIT_NOM, styleLigne } from "../ui/LignesDuTiroir";
import ChoixDeCarte from "./ChoixDeCarte";

/**
 * Une dépendance pas encore enregistrée : sa relation est choisie, il lui
 * manque l'autre carte. Elle part au serveur dès qu'on la choisit.
 */
export interface BrouillonDependance {
  cle: number;
  relation: Relation;
}

let prochaineCle = 1;

/** Une ligne vide de plus, ouverte sur « Est bloqué par ». */
export const nouveauBrouillon = (): BrouillonDependance => ({
  cle: prochaineCle++,
  relation: "blocked_by",
});

// En tête de ligne, la relation prend sa majuscule : « Est bloqué par ».
const OPTIONS_RELATION = RELATIONS.map((r) => ({
  value: r.value,
  label: r.label.charAt(0).toUpperCase() + r.label.slice(1),
}));

// Le texte des champs commence à cet écart de leur bord, comme les dates de
// l'échéance (CardEcheance) : la ligne pose le premier à RETRAIT_NOM.
const RETRAIT_CHAMP = 5;

// Le choix de la relation prend la largeur de la plus longue, à la taille des
// champs « xs » (12 px), avec la place de son chevron : les lignes s'alignent.
const largeurRelation = () =>
  Math.max(...OPTIONS_RELATION.map((r) => largeurTexte(r.label, 12))) + RETRAIT_CHAMP + 28;

/**
 * Les dépendances d'une carte, sous la même allure que son échéance : une
 * ligne grise par dépendance — la relation à gauche, l'autre carte à droite,
 * cherchée dans le tableau puis dans les autres. Tout s'enregistre au fil des
 * gestes ; la carte d'en face montre la relation inverse.
 */
interface CardDependancesProps {
  cardId: Id;
  boardId: Id | string | null;
  links: CardLink[];
  onLinks: (links: CardLink[]) => void;
  brouillons: BrouillonDependance[];
  onBrouillons: (brouillons: BrouillonDependance[]) => void;
  onError: (message: string) => void;
  readOnly?: boolean;
}

export default function CardDependances({
  cardId,
  boardId,
  links,
  onLinks,
  brouillons,
  onBrouillons,
  onError,
  readOnly,
}: CardDependancesProps) {
  if (links.length === 0 && brouillons.length === 0) return null;

  const total = links.length + brouillons.length;

  const creer = async (brouillon: BrouillonDependance, cible: LinkedCard) => {
    try {
      const lien = await api.createCardLink(cardId, {
        relation: brouillon.relation,
        target_id: cible.id,
      });
      onBrouillons(brouillons.filter((b) => b.cle !== brouillon.cle));
      onLinks([...links, lien]);
    } catch (e) {
      onError(messageErreur(e));
    }
  };

  const modifier = async (lien: CardLink, relation: Relation, cible: Id) => {
    if (relation === lien.relation && cible === lien.card.id) return;
    try {
      const modifie = await api.updateCardLink(lien.id, cardId, { relation, target_id: cible });
      onLinks(links.map((l) => (l.id === lien.id ? modifie : l)));
    } catch (e) {
      onError(messageErreur(e));
    }
  };

  const supprimer = async (lien: CardLink) => {
    try {
      await api.deleteCardLink(lien.id, cardId);
      onLinks(links.filter((l) => l.id !== lien.id));
    } catch (e) {
      onError(messageErreur(e));
    }
  };

  /** Une ligne : la relation, l'autre carte, et de quoi la retirer. */
  const ligne = (
    rang: number,
    cle: string,
    relation: Relation,
    cible: LinkedCard | null,
    onRelation: (relation: Relation) => void,
    onCible: (cible: LinkedCard) => void,
    onRetirer: () => void,
  ) => (
    <Group
      key={cle}
      data-dependance
      gap="xs"
      wrap="nowrap"
      align="center"
      style={{ ...styleLigne(rang, total, false), paddingLeft: RETRAIT_NOM }}
    >
      <Select
        size="xs"
        radius={ARRONDI}
        data={OPTIONS_RELATION}
        value={relation}
        onChange={(v) => v && onRelation(v as Relation)}
        allowDeselect={false}
        withCheckIcon={false}
        rightSection={<IconChevronDown size={12} />}
        comboboxProps={{ withinPortal: true }}
        className={classes.champ}
        styles={{ input: { paddingInlineStart: RETRAIT_CHAMP } }}
        w={largeurRelation()}
        style={{ flexShrink: 0 }}
        aria-label="Relation"
        readOnly={readOnly}
      />
      <ChoixDeCarte
        cardId={cardId}
        boardId={boardId}
        value={cible}
        onChange={onCible}
        onError={onError}
        readOnly={readOnly}
        className={classes.champ}
        retrait={RETRAIT_CHAMP}
      />
      {!readOnly && (
        <ActionIcon
          variant="subtle"
          color={RED}
          onClick={onRetirer}
          aria-label="Supprimer la dépendance"
          title="Supprimer la dépendance"
        >
          <IconTrash size={16} />
        </ActionIcon>
      )}
    </Group>
  );

  return (
    <Input.Wrapper label="Dépendances">
      <Stack gap={1}>
        {links.map((lien, rang) =>
          ligne(
            rang,
            `lien-${lien.id}`,
            lien.relation,
            lien.card,
            (relation) => void modifier(lien, relation, lien.card.id),
            (cible) => void modifier(lien, lien.relation, cible.id),
            () => void supprimer(lien),
          ),
        )}
        {brouillons.map((brouillon, rang) =>
          ligne(
            links.length + rang,
            `brouillon-${brouillon.cle}`,
            brouillon.relation,
            null,
            (relation) =>
              onBrouillons(
                brouillons.map((b) => (b.cle === brouillon.cle ? { ...b, relation } : b)),
              ),
            (cible) => void creer(brouillon, cible),
            () => onBrouillons(brouillons.filter((b) => b.cle !== brouillon.cle)),
          ),
        )}
      </Stack>

      {!readOnly && (
        <AddButton
          label="Ajouter une dépendance"
          onClick={() => onBrouillons([...brouillons, nouveauBrouillon()])}
          mt={4}
        />
      )}
    </Input.Wrapper>
  );
}
