import { Combobox, Group, InputBase, Loader, ScrollArea, Text, useCombobox } from "@mantine/core";
import { useEffect, useRef, useState } from "react";
import { taskReference } from "@milo/shared";
import type { Id, LinkCandidates, LinkedCard } from "@milo/shared";
import { api } from "../../api";
import { errorMessage } from "../../lib/errors";

type Candidate = LinkCandidates["items"][number];

/** Le nom d'une carte : sa référence, puis son titre. */
export const cardName = (card: { number: number; text: string }): string =>
  card.number > 0 ? `${taskReference(card.number)} · ${card.text}` : card.text;

// Le temps qu'on laisse à la frappe avant de chercher : chaque lettre ne
// relance pas la recherche.
const TYPING_DELAY = 250;

// La hauteur de la liste : moins que dix lignes, pour que la première page
// déborde déjà et que descendre charge la suivante.
const LIST_HEIGHT = 260;

/**
 * Le choix de l'autre carte d'une dépendance. Les cartes arrivent du serveur
 * dix par dix : celles du tableau d'abord, puis celles des autres tableaux,
 * regroupées sous leur nom. Descendre au bas de la liste charge la page
 * suivante ; taper filtre, par titre ou par référence.
 */
interface CardChoiceProps {
  cardId: Id;
  /** Le tableau de la carte : une carte d'ailleurs porte le nom du sien. */
  boardId: Id | string | null;
  value: LinkedCard | null;
  onChange: (card: LinkedCard) => void;
  onError: (message: string) => void;
  readOnly?: boolean;
  className?: string;
  /** Le retrait du texte dans le champ, aligné sur les autres champs de la ligne. */
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
  // Seule la dernière demande compte : une réponse lente à une frappe
  // ancienne n'écrase pas la liste d'une frappe plus récente.
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

  // À l'ouverture et à chaque frappe, la liste repart de la première page.
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

  // Les cartes se regroupent par tableau, dans l'ordre où elles arrivent :
  // « Ce tableau » en tête, puis chacun des autres sous son nom.
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
          // Fermé, le champ montre la carte choisie ; ouvert, ce qu'on tape.
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
