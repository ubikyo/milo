import { Combobox, Group, ScrollArea, Text, TextInput, useCombobox } from "@mantine/core";
import {
  IconBrandGoogle,
  IconDeviceDesktop,
  IconExternalLink,
  IconFolder,
  IconHeadset,
  IconKey,
  IconLayoutKanban,
} from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import type { ComponentType, CSSProperties } from "react";
import { SEARCH_MIN_LENGTH } from "@milo/shared";
import type { SearchKind, SearchResult } from "@milo/shared";
import { api } from "../../api";
import classes from "../../assets/styles/SearchBox.module.css";
import { ROW_CONTROL_HEIGHT, ROW_MENU_OFFSET, TAB_MENU_STYLES } from "../../themes/menus";

// La recherche, dans la rangée d'onglets : de la fin des onglets jusqu'aux
// menus et au compte, dans tous les modes (ModeBar). Un champ nu — ni bordure ni fond, son invite seule — qui fouille tout ce que
// l'application porte et ouvre l'élément choisi, où qu'il soit.

/** Le temps qu'on laisse à la frappe avant d'interroger le serveur. */
const ATTENTE = 200;

/** Les sortes, dans l'ordre où la liste les présente — celui des modes. */
const SORTES: { kind: SearchKind; label: string; icon: ComponentType<{ size?: number }> }[] = [
  { kind: "access", label: "Accès", icon: IconKey },
  { kind: "project", label: "Projets", icon: IconFolder },
  { kind: "card", label: "Tâches", icon: IconLayoutKanban },
  { kind: "support", label: "Support", icon: IconHeadset },
  { kind: "asset", label: "Assets", icon: IconDeviceDesktop },
];

const cle = (r: SearchResult) => `${r.kind}:${r.id}`;

/** Les angles bas de la liste, plus vifs que ceux des menus. */
const RAYON = 2;

/** L'option qui, faute de résultat, envoie la saisie à Google. */
const GOOGLE = "google";

export interface SearchBoxProps {
  onOpen: (resultat: SearchResult) => void;
}

export default function SearchBox({ onOpen }: SearchBoxProps) {
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  });
  const [saisie, setSaisie] = useState("");
  const [resultats, setResultats] = useState<SearchResult[] | null>(null);
  // La dernière recherche partie : une réponse plus lente qu'une frappe
  // suivante n'écrase pas ce que celle-ci a rendu.
  const derniere = useRef(0);

  useEffect(() => {
    const cherche = saisie.trim();
    if (cherche.length < SEARCH_MIN_LENGTH) {
      setResultats(null);
      return;
    }
    const numero = ++derniere.current;
    const minuterie = window.setTimeout(async () => {
      try {
        const trouves = await api.search(cherche);
        if (numero === derniere.current) setResultats(trouves);
      } catch {
        if (numero === derniere.current) setResultats([]);
      }
    }, ATTENTE);
    return () => window.clearTimeout(minuterie);
  }, [saisie]);

  // La première ligne est prête pour Entrée — le premier résultat, ou Google
  // faute de mieux. Après le rendu : avant, les options n'existent pas encore.
  useEffect(() => {
    if (resultats) combobox.selectFirstOption();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultats]);

  const choisir = (valeur: string) => {
    if (valeur === GOOGLE) {
      window.open(
        `https://www.google.com/search?q=${encodeURIComponent(saisie.trim())}`,
        "_blank",
        "noopener",
      );
      combobox.closeDropdown();
      setSaisie("");
      setResultats(null);
      return;
    }
    const resultat = resultats?.find((r) => cle(r) === valeur);
    if (!resultat) return;
    combobox.closeDropdown();
    setSaisie("");
    setResultats(null);
    onOpen(resultat);
  };

  const groupes = SORTES.map(({ kind, label, icon: Icone }) => {
    const siens = (resultats ?? []).filter((r) => r.kind === kind);
    if (siens.length === 0) return null;
    return (
      <Combobox.Group key={kind} label={label}>
        {siens.map((r) => {
          // Un lien du mode Accès s'ouvre tel quel, dans un nouvel onglet :
          // son icône le dit.
          const IconeLigne = r.url ? IconExternalLink : Icone;
          return (
            <Combobox.Option key={cle(r)} value={cle(r)}>
              <Group gap="xs" wrap="nowrap">
                <IconeLigne size={16} />
                <div style={{ minWidth: 0 }}>
                  <Text size="sm" truncate>
                    {r.title}
                  </Text>
                  {r.context && (
                    <Text size="xs" c="dimmed" truncate>
                      {r.context}
                    </Text>
                  )}
                </div>
              </Group>
            </Combobox.Option>
          );
        })}
      </Combobox.Group>
    );
  });

  return (
    <Combobox
      store={combobox}
      classNames={{ option: classes.option }}
      onOptionSubmit={choisir}
      position="bottom-start"
      offset={ROW_MENU_OFFSET}
      width={360}
      withinPortal
      styles={{
        ...TAB_MENU_STYLES,
        dropdown: {
          ...TAB_MENU_STYLES.dropdown,
          borderBottomLeftRadius: RAYON,
          borderBottomRightRadius: RAYON,
        },
      }}
    >
      <Combobox.Target>
        <TextInput
          variant="unstyled"
          placeholder="Recherche"
          aria-label="Recherche"
          value={saisie}
          h={ROW_CONTROL_HEIGHT}
          styles={{
            input: {
              height: ROW_CONTROL_HEIGHT,
              minHeight: ROW_CONTROL_HEIGHT,
              // Un gris plus sombre que celui des autres champs, dans les deux
              // thèmes.
              "--input-placeholder-color":
                "light-dark(var(--mantine-color-gray-7), var(--mantine-color-dark-4))",
            } as CSSProperties,
          }}
          onChange={(event) => {
            setSaisie(event.currentTarget.value);
            combobox.openDropdown();
          }}
          onFocus={() => combobox.openDropdown()}
          onBlur={() => combobox.closeDropdown()}
          onKeyDown={(event) => {
            // Échap vide le champ ; une seconde fois, il le quitte.
            if (event.key !== "Escape") return;
            if (saisie) setSaisie("");
            else event.currentTarget.blur();
          }}
        />
      </Combobox.Target>

      <Combobox.Dropdown hidden={resultats === null}>
        <Combobox.Options>
          {/* La barre de Mantine, comme partout ailleurs, et non celle du
              navigateur. */}
          <ScrollArea.Autosize mah={420} type="scroll" scrollbarSize={6}>
            {resultats && resultats.length === 0 ? (
              // Rien dans Milo : la saisie part sur Google, Entrée suffit.
              <Combobox.Option value={GOOGLE}>
                <Group gap="xs" wrap="nowrap">
                  <IconBrandGoogle size={16} />
                  <Text size="sm" truncate>
                    Rechercher « {saisie.trim()} » sur Google
                  </Text>
                </Group>
              </Combobox.Option>
            ) : (
              groupes
            )}
          </ScrollArea.Autosize>
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}
