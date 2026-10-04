import { Group, Input, Select, Stack } from "@mantine/core";
import { IconChevronDown } from "@tabler/icons-react";
import { RELATIONS } from "@milo/shared";
import type { CardLink, Id, LinkedCard, Relation } from "@milo/shared";
import { api } from "../../api";
import classes from "../../assets/styles/CardDueDate.module.css";
import { textWidth } from "../../lib/fieldWidth";
import { errorMessage } from "../../lib/errors";
import {
  ROUNDING,
  NAME_INSET,
  ListFooter,
  RowCheckbox,
  rowStyle,
  useRowSelection,
} from "../ui/DrawerRows";
import CardChoice from "./CardChoice";

/**
 * A dependency not yet saved: its relation is chosen, the other card is
 * missing. It is sent to the server as soon as it is chosen.
 */
export interface DraftDependency {
  key: number;
  relation: Relation;
}

let nextKey = 1;

/** One more empty row, opened on "Est bloqué par". */
export const newDraft = (): DraftDependency => ({
  key: nextKey++,
  relation: "blocked_by",
});

// At the start of the row, the relation is capitalized: "Est bloqué par".
const OPTIONS_RELATION = RELATIONS.map((r) => ({
  value: r.value,
  label: r.label.charAt(0).toUpperCase() + r.label.slice(1),
}));

// The text of the fields starts at this distance from their edge, like the
// dates of the due date (CardDueDate): the row sets the first one at NAME_INSET.
const FIELD_INSET = 5;

// The relation picker takes the width of the longest, at the size of the
// "xs" fields (12 px), with room for its chevron: the rows line up.
const relationWidth = () =>
  Math.max(...OPTIONS_RELATION.map((r) => textWidth(r.label, 12))) + FIELD_INSET + 28;

/**
 * A card's dependencies, in the same style as its due date: one gray
 * row per dependency — the relation on the left, the other card on the
 * right, searched in the board then in the others. Everything is saved
 * as you go; the card on the other side shows the inverse relation. The
 * checked rows are deleted at once from the list's footer, without
 * confirmation.
 */
interface CardDependenciesProps {
  cardId: Id;
  boardId: Id | string | null;
  links: CardLink[];
  onLinks: (links: CardLink[]) => void;
  drafts: DraftDependency[];
  onDrafts: (drafts: DraftDependency[]) => void;
  onError: (message: string) => void;
  readOnly?: boolean;
}

export default function CardDependencies({
  cardId,
  boardId,
  links,
  onLinks,
  drafts,
  onDrafts,
  onError,
  readOnly,
}: CardDependenciesProps) {
  const selection = useRowSelection([
    ...links.map((l) => `link-${l.id}`),
    ...drafts.map((d) => `draft-${d.key}`),
  ]);
  if (links.length === 0 && drafts.length === 0) return null;

  const total = links.length + drafts.length;

  const create = async (draft: DraftDependency, target: LinkedCard) => {
    try {
      const link = await api.createCardLink(cardId, {
        relation: draft.relation,
        target_id: target.id,
      });
      onDrafts(drafts.filter((b) => b.key !== draft.key));
      onLinks([...links, link]);
    } catch (e) {
      onError(errorMessage(e));
    }
  };

  const updateStatement = async (link: CardLink, relation: Relation, target: Id) => {
    if (relation === link.relation && target === link.card.id) return;
    try {
      const modified = await api.updateCardLink(link.id, cardId, { relation, target_id: target });
      onLinks(links.map((l) => (l.id === link.id ? modified : l)));
    } catch (e) {
      onError(errorMessage(e));
    }
  };

  /**
   * Removes the checked rows: the drafts at once, the saved links on the
   * server. A link the server refused stays, checked.
   */
  const removeChecked = async () => {
    const checked = new Set(selection.checked);
    onDrafts(drafts.filter((d) => !checked.has(`draft-${d.key}`)));
    const chosen = links.filter((l) => checked.has(`link-${l.id}`));
    const results = await Promise.allSettled(
      chosen.map((link) => api.deleteCardLink(link.id, cardId)),
    );
    const deleted = new Set(
      chosen.filter((_, i) => results[i]!.status === "fulfilled").map((l) => l.id),
    );
    if (deleted.size > 0) onLinks(links.filter((l) => !deleted.has(l.id)));
    const failure = results.find((r) => r.status === "rejected");
    if (failure) onError(errorMessage(failure.reason));
    selection.reset(chosen.filter((l) => !deleted.has(l.id)).map((l) => `link-${l.id}`));
  };

  /** A row: its checkbox, the relation and the other card. */
  const row = (
    rank: number,
    key: string,
    relation: Relation,
    target: LinkedCard | null,
    onRelation: (relation: Relation) => void,
    onTarget: (target: LinkedCard) => void,
  ) => (
    <Group
      key={key}
      data-dependency
      gap="xs"
      wrap="nowrap"
      align="center"
      style={{ ...rowStyle(rank, total, false), paddingLeft: NAME_INSET }}
    >
      {!readOnly && (
        <RowCheckbox
          label={`Sélectionner la dépendance${target ? ` « ${target.text} »` : ""}`}
          checked={selection.isChecked(key)}
          onChange={(on) => selection.toggle(key, on)}
        />
      )}
      <Select
        size="xs"
        radius={ROUNDING}
        data={OPTIONS_RELATION}
        value={relation}
        onChange={(v) => v && onRelation(v as Relation)}
        allowDeselect={false}
        withCheckIcon={false}
        rightSection={<IconChevronDown size={12} />}
        comboboxProps={{ withinPortal: true }}
        className={classes.field}
        styles={{ input: { paddingInlineStart: FIELD_INSET } }}
        w={relationWidth()}
        style={{ flexShrink: 0 }}
        aria-label="Relation"
        readOnly={readOnly}
      />
      <CardChoice
        cardId={cardId}
        boardId={boardId}
        value={target}
        onChange={onTarget}
        onError={onError}
        readOnly={readOnly}
        className={classes.field}
        inset={FIELD_INSET}
      />
    </Group>
  );

  return (
    <Input.Wrapper label="Dépendances">
      <Stack gap={1}>
        {links.map((link, rank) =>
          row(
            rank,
            `link-${link.id}`,
            link.relation,
            link.card,
            (relation) => void updateStatement(link, relation, link.card.id),
            (target) => void updateStatement(link, link.relation, target.id),
          ),
        )}
        {drafts.map((draft, rank) =>
          row(
            links.length + rank,
            `draft-${draft.key}`,
            draft.relation,
            null,
            (relation) =>
              onDrafts(
                drafts.map((b) => (b.key === draft.key ? { ...b, relation } : b)),
              ),
            (target) => void create(draft, target),
          ),
        )}
      </Stack>

      <ListFooter
        addLabel={readOnly ? undefined : "Ajouter une dépendance"}
        onAdd={readOnly ? undefined : () => onDrafts([...drafts, newDraft()])}
        checkedCount={readOnly ? 0 : selection.checked.length}
        onDeleteChecked={() => void removeChecked()}
      />
    </Input.Wrapper>
  );
}
