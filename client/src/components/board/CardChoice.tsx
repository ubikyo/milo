import { Combobox, Group, InputBase, Loader, ScrollArea, Text, useCombobox } from "@mantine/core";
import { useEffect, useRef, useState } from "react";
import { taskReference } from "@milo/shared";
import type { Id, LinkCandidates, LinkedCard } from "@milo/shared";
import { api } from "../../api";
import { errorMessage } from "../../lib/errors";

type Candidate = LinkCandidates["items"][number];

/** A card's name: its reference, then its title. */
export const cardName = (card: { number: number; text: string }): string =>
  card.number > 0 ? `${taskReference(card.number)} · ${card.text}` : card.text;

// The time allowed for typing before searching: each letter does not
// relaunch the search.
const TYPING_DELAY = 250;

// The list's height: less than ten rows, so that the first page
// already overflows and scrolling down loads the next.
const LIST_HEIGHT = 260;

/**
 * The choice of the other card of a dependency. Cards arrive from the
 * server ten at a time: those of the board first, then those of the other
 * boards, grouped under their name. Scrolling to the bottom of the list
 * loads the next page; typing filters, by title or by reference.
 */
interface CardChoiceProps {
  cardId: Id;
  /** The card's board: a card from elsewhere carries the name of its own. */
  boardId: Id | string | null;
  value: LinkedCard | null;
  onChange: (card: LinkedCard) => void;
  onError: (message: string) => void;
  readOnly?: boolean;
  className?: string;
  /** The text's inset in the field, aligned with the other fields of the row. */
  inset: number;
}

export default function CardChoice({
  cardId,
  boardId,
  value,
  onChange,
  onError,
  readOnly,
  className,
  inset,
}: CardChoiceProps) {
  const [search, setSearch] = useState("");
  const [cards, setCards] = useState<Candidate[]>([]);
  const [still, setHasMore] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // Only the last request counts: a slow response to an old keystroke
  // does not overwrite the list from a more recent one.
  const request = useRef(0);

  const combobox = useCombobox({
    onDropdownClose: () => {
      combobox.resetSelectedOption();
      setSearch("");
    },
  });
  const isOpen = combobox.dropdownOpened;

  const load = async (q: string, since: number) => {
    const phoneNumber = ++request.current;
    setLoaded(true);
    try {
      const page = await api.getLinkCandidates(cardId, q, since);
      if (phoneNumber !== request.current) return;
      setCards((already) => (since === 0 ? page.items : [...already, ...page.items]));
      setHasMore(page.more);
    } catch (e) {
      if (phoneNumber === request.current) onError(errorMessage(e));
    } finally {
      if (phoneNumber === request.current) setLoaded(false);
    }
  };

  // On open and on each keystroke, the list restarts from the first page.
  useEffect(() => {
    if (!isOpen) return;
    const timeout = window.setTimeout(() => void load(search.trim(), 0), TYPING_DELAY);
    return () => window.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, search, cardId]);

  const next = () => {
    if (still && !loaded) void load(search.trim(), cards.length);
  };

  const elsewhere = (card: LinkedCard) => String(card.board_id) !== String(boardId);
  const shown = value
    ? elsewhere(value)
      ? `${cardName(value)} — ${value.board_name}`
      : cardName(value)
    : "";

  // Cards are grouped by board, in the order they arrive:
  // "Ce tableau" first, then each of the others under its name.
  const groups: { key: string; title: string; cards: Candidate[] }[] = [];
  for (const card of cards) {
    const key = card.same_board ? "ici" : String(card.board_id);
    const last = groups[groups.length - 1];
    if (last?.key === key) last.cards.push(card);
    else groups.push({ key, title: card.same_board ? "Ce tableau" : card.board_name, cards: [card] });
  }

  return (
    <Combobox
      store={combobox}
      withinPortal
      onOptionSubmit={(id) => {
        const card = cards.find((c) => String(c.id) === id);
        if (card) onChange(card);
        combobox.closeDropdown();
      }}
    >
      <Combobox.Target>
        <InputBase
          size="xs"
          radius="xs"
          className={className}
          style={{ flex: 1, minWidth: 0 }}
          styles={{ input: { paddingInlineStart: inset } }}
          // Closed, the field shows the chosen card; open, what is typed.
          value={isOpen ? search : shown}
          placeholder={isOpen && value ? shown : "Chercher une carte"}
          onChange={(e) => {
            setSearch(e.currentTarget.value);
            combobox.openDropdown();
            combobox.updateSelectedOptionIndex();
          }}
          onClick={() => !readOnly && combobox.openDropdown()}
          onFocus={() => !readOnly && combobox.openDropdown()}
          onBlur={() => combobox.closeDropdown()}
          rightSection={loaded ? <Loader size={12} /> : null}
          rightSectionPointerEvents="none"
          readOnly={readOnly}
          aria-label="Carte reliée"
        />
      </Combobox.Target>

      <Combobox.Dropdown>
        <Combobox.Options>
          <ScrollArea.Autosize mah={LIST_HEIGHT} type="scroll" onBottomReached={next}>
            {groups.map((group) => (
              <Combobox.Group key={group.key} label={group.title}>
                {group.cards.map((card) => (
                  <Combobox.Option key={card.id} value={String(card.id)}>
                    <Text size="xs" style={{ wordBreak: "break-word" }}>
                      {cardName(card)}
                    </Text>
                  </Combobox.Option>
                ))}
              </Combobox.Group>
            ))}
            {!loaded && cards.length === 0 && <Combobox.Empty>Aucune carte</Combobox.Empty>}
            {loaded && cards.length > 0 && (
              <Group justify="center" py={4}>
                <Loader size={14} />
              </Group>
            )}
          </ScrollArea.Autosize>
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}
