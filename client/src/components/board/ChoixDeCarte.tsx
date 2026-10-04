import { Combobox, Group, InputBase, Loader, ScrollArea, Text, useCombobox } from "@mantine/core";
import { useEffect, useRef, useState } from "react";
import { taskReference } from "@milo/shared";
import type { Id, LinkCandidates, LinkedCard } from "@milo/shared";
import { api } from "../../api";
import { messageErreur } from "../../lib/errors";

type Candidat = LinkCandidates["items"][number];

/** Le nom d'une carte : sa référence, puis son titre. */
export const nomDeCarte = (carte: { number: number; text: string }): string =>
  carte.number > 0 ? `${taskReference(carte.number)} · ${carte.text}` : carte.text;

// Le temps qu'on laisse à la frappe avant de chercher : chaque lettre ne
// relance pas la recherche.
const ATTENTE_FRAPPE = 250;

// La hauteur de la liste : moins que dix lignes, pour que la première page
// déborde déjà et que descendre charge la suivante.
const HAUTEUR_LISTE = 260;

/**
 * Le choix de l'autre carte d'une dépendance. Les cartes arrivent du serveur
 * dix par dix : celles du tableau d'abord, puis celles des autres tableaux,
 * regroupées sous leur nom. Descendre au bas de la liste charge la page
 * suivante ; taper filtre, par titre ou par référence.
 */
interface ChoixDeCarteProps {
  cardId: Id;
  /** Le tableau de la carte : une carte d'ailleurs porte le nom du sien. */
  boardId: Id | string | null;
  value: LinkedCard | null;
  onChange: (carte: LinkedCard) => void;
  onError: (message: string) => void;
  readOnly?: boolean;
  className?: string;
  /** Le retrait du texte dans le champ, aligné sur les autres champs de la ligne. */
  retrait: number;
}

export default function ChoixDeCarte({
  cardId,
  boardId,
  value,
  onChange,
  onError,
  readOnly,
  className,
  retrait,
}: ChoixDeCarteProps) {
  const [recherche, setRecherche] = useState("");
  const [cartes, setCartes] = useState<Candidat[]>([]);
  const [encore, setEncore] = useState(false);
  const [charge, setCharge] = useState(false);
  // Seule la dernière demande compte : une réponse lente à une frappe
  // ancienne n'écrase pas la liste d'une frappe plus récente.
  const demande = useRef(0);

  const combobox = useCombobox({
    onDropdownClose: () => {
      combobox.resetSelectedOption();
      setRecherche("");
    },
  });
  const ouvert = combobox.dropdownOpened;

  const charger = async (q: string, depuis: number) => {
    const numero = ++demande.current;
    setCharge(true);
    try {
      const page = await api.getLinkCandidates(cardId, q, depuis);
      if (numero !== demande.current) return;
      setCartes((deja) => (depuis === 0 ? page.items : [...deja, ...page.items]));
      setEncore(page.more);
    } catch (e) {
      if (numero === demande.current) onError(messageErreur(e));
    } finally {
      if (numero === demande.current) setCharge(false);
    }
  };

  // À l'ouverture et à chaque frappe, la liste repart de la première page.
  useEffect(() => {
    if (!ouvert) return;
    const minuterie = window.setTimeout(() => void charger(recherche.trim(), 0), ATTENTE_FRAPPE);
    return () => window.clearTimeout(minuterie);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ouvert, recherche, cardId]);

  const suivante = () => {
    if (encore && !charge) void charger(recherche.trim(), cartes.length);
  };

  const ailleurs = (carte: LinkedCard) => String(carte.board_id) !== String(boardId);
  const affiche = value
    ? ailleurs(value)
      ? `${nomDeCarte(value)} — ${value.board_name}`
      : nomDeCarte(value)
    : "";

  // Les cartes se regroupent par tableau, dans l'ordre où elles arrivent :
  // « Ce tableau » en tête, puis chacun des autres sous son nom.
  const groupes: { cle: string; titre: string; cartes: Candidat[] }[] = [];
  for (const carte of cartes) {
    const cle = carte.same_board ? "ici" : String(carte.board_id);
    const dernier = groupes[groupes.length - 1];
    if (dernier?.cle === cle) dernier.cartes.push(carte);
    else groupes.push({ cle, titre: carte.same_board ? "Ce tableau" : carte.board_name, cartes: [carte] });
  }

  return (
    <Combobox
      store={combobox}
      withinPortal
      onOptionSubmit={(id) => {
        const carte = cartes.find((c) => String(c.id) === id);
        if (carte) onChange(carte);
        combobox.closeDropdown();
      }}
    >
      <Combobox.Target>
        <InputBase
          size="xs"
          radius="xs"
          className={className}
          style={{ flex: 1, minWidth: 0 }}
          styles={{ input: { paddingInlineStart: retrait } }}
          // Fermé, le champ montre la carte choisie ; ouvert, ce qu'on tape.
          value={ouvert ? recherche : affiche}
          placeholder={ouvert && value ? affiche : "Chercher une carte"}
          onChange={(e) => {
            setRecherche(e.currentTarget.value);
            combobox.openDropdown();
            combobox.updateSelectedOptionIndex();
          }}
          onClick={() => !readOnly && combobox.openDropdown()}
          onFocus={() => !readOnly && combobox.openDropdown()}
          onBlur={() => combobox.closeDropdown()}
          rightSection={charge ? <Loader size={12} /> : null}
          rightSectionPointerEvents="none"
          readOnly={readOnly}
          aria-label="Carte reliée"
        />
      </Combobox.Target>

      <Combobox.Dropdown>
        <Combobox.Options>
          <ScrollArea.Autosize mah={HAUTEUR_LISTE} type="scroll" onBottomReached={suivante}>
            {groupes.map((groupe) => (
              <Combobox.Group key={groupe.cle} label={groupe.titre}>
                {groupe.cartes.map((carte) => (
                  <Combobox.Option key={carte.id} value={String(carte.id)}>
                    <Text size="xs" style={{ wordBreak: "break-word" }}>
                      {nomDeCarte(carte)}
                    </Text>
                  </Combobox.Option>
                ))}
              </Combobox.Group>
            ))}
            {!charge && cartes.length === 0 && <Combobox.Empty>Aucune carte</Combobox.Empty>}
            {charge && cartes.length > 0 && (
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
